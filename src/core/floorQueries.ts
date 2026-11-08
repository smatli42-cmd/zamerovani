/**
 * Dotazy nad půdorysem (podlažím) – čtení bez změn.
 */
import type { Floor, Id, Node, Opening, Wall } from '../model/types';
import { nearestOnArc, nearestOnCircle } from './arc';
import { dist, unit } from './geometry';
import type { Pt } from '../model/types';

export function wallNodes(floor: Floor, wall: Wall): [Node, Node] | null {
  const a = floor.nodes[wall.a];
  const b = floor.nodes[wall.b];
  return a && b ? [a, b] : null;
}

/** Je stěna kruh? */
export const isCircle = (wall: Wall): boolean => wall.radius !== undefined;

/** Je stěna zakřivená (oblouk nebo kruh)? Na zakřivené stěny zatím nejdou dveře a okna. */
export const isCurved = (wall: Wall): boolean => isCircle(wall) || Math.abs(wall.sagitta ?? 0) >= 0.5;

/** Nejbližší bod na stěně (úsečka, oblouk i kruh). */
export function nearestOnWall(wall: Wall, n: [Node, Node], p: Pt) {
  return wall.radius !== undefined ? nearestOnCircle(p, n[0], wall.radius) : nearestOnArc(p, n[0], n[1], wall.sagitta ?? 0);
}

export function wallLength(floor: Floor, wall: Wall): number {
  const n = wallNodes(floor, wall);
  return n ? dist(n[0], n[1]) : 0;
}

/** Stěny napojené na roh. */
export function wallsAtNode(floor: Floor, nodeId: Id): Wall[] {
  return Object.values(floor.walls).filter(w => w.a === nodeId || w.b === nodeId);
}

export function otherEnd(wall: Wall, nodeId: Id): Id {
  return wall.a === nodeId ? wall.b : wall.a;
}

export function findWallBetween(floor: Floor, n1: Id, n2: Id): Wall | null {
  return (
    Object.values(floor.walls).find(w => (w.a === n1 && w.b === n2) || (w.a === n2 && w.b === n1)) ?? null
  );
}

/** Nejbližší roh do vzdálenosti maxDist (mm). */
export function findNodeNear(floor: Floor, p: Pt, maxDist: number, excludeId?: Id): Node | null {
  let best: Node | null = null;
  let bestD = maxDist;
  for (const n of Object.values(floor.nodes)) {
    if (n.id === excludeId) continue;
    const d = dist(p, n);
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export interface WallHit {
  wall: Wall;
  t: number;
  point: Pt;
  distance: number;
}

/** Nejbližší stěna do vzdálenosti maxDist (mm). */
export function findWallNear(floor: Floor, p: Pt, maxDist: number, excludeWallId?: Id): WallHit | null {
  let best: WallHit | null = null;
  for (const w of Object.values(floor.walls)) {
    if (w.id === excludeWallId) continue;
    const n = wallNodes(floor, w);
    if (!n) continue;
    const pr = nearestOnWall(w, n, p);
    if (pr.distance <= maxDist && (!best || pr.distance < best.distance)) {
      best = { wall: w, t: pr.t, point: pr.point, distance: pr.distance };
    }
  }
  return best;
}

/** Otvory na stěně seřazené od rohu A, včetně jejich polohy (vzdálenost od A). */
export interface PlacedOpening {
  op: Opening;
  start: number;
  end: number;
}

export function openingStartFromA(op: Opening, wallLen: number): number {
  return op.ref === 'a' ? op.offset : wallLen - op.offset - op.width;
}

export function openingsOnWall(floor: Floor, wall: Wall): PlacedOpening[] {
  const len = wallLength(floor, wall);
  return Object.values(floor.openings)
    .filter(o => o.wallId === wall.id)
    .map(op => {
      const start = openingStartFromA(op, len);
      return { op, start, end: start + op.width };
    })
    .sort((p, q) => p.start - q.start);
}

/**
 * Najde uzavřenou smyčku stěn, která pokračuje ze stěny `wallId` (pro „Další stěna“ v NumPadu).
 * Vrací další stěnu napojenou na koncový roh (preferuje nezměřenou).
 */
export function nextWallInChain(floor: Floor, wallId: Id, fromNodeId: Id): { wall: Wall; nodeId: Id } | null {
  const candidates = wallsAtNode(floor, fromNodeId).filter(w => w.id !== wallId);
  if (candidates.length === 0) return null;
  const current = floor.walls[wallId];
  if (current && candidates.length > 1) {
    // Při rozvětvení zvolíme stěnu s nejmenší odchylkou směru „doprava“ (obcházení místnosti).
    const cn = wallNodes(floor, current);
    if (cn) {
      const from = cn[0].id === fromNodeId ? cn[1] : cn[0];
      const at = floor.nodes[fromNodeId]!;
      const dirIn = unit(from, at);
      let best = candidates[0]!;
      let bestScore = Infinity;
      for (const w of candidates) {
        const other = floor.nodes[otherEnd(w, fromNodeId)];
        if (!other) continue;
        const dOut = unit(at, other);
        // Úhel otočení (−π..π); preferujeme nezměřené stěny.
        const turn = Math.atan2(dirIn.x * dOut.y - dirIn.y * dOut.x, dirIn.x * dOut.x + dirIn.y * dOut.y);
        const score = -turn + (w.measured === null ? 0 : 10);
        if (score < bestScore) {
          bestScore = score;
          best = w;
        }
      }
      return { wall: best, nodeId: otherEnd(best, fromNodeId) };
    }
  }
  const w = candidates.find(c => c.measured === null) ?? candidates[0]!;
  return { wall: w, nodeId: otherEnd(w, fromNodeId) };
}
