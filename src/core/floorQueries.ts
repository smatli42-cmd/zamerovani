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

/** Uzly pod bodem: nejbližší a všechny ostatní na stejném místě (oddělený roh, C1.13), seřazené podle ID. */
export function nodesAt(floor: Floor, p: Pt, maxDist: number): Node[] {
  const near = findNodeNear(floor, p, maxDist);
  if (!near) return [];
  return Object.values(floor.nodes)
    .filter(n => dist(n, near) < 1)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Uzel pod perem s ohledem na výběr (D14): už vybraný uzel zůstává (aby šel táhnout), jinak má přednost
 * konec vybrané stěny; bez výběru nejbližší uzel jako dřív.
 */
export function chooseNodeAt(floor: Floor, p: Pt, maxDist: number, prefer: NodePrefer): Node | null {
  const cands = nodesAt(floor, p, maxDist);
  if (cands.length < 2) return cands[0] ?? null;
  const keep = cands.find(n => prefer.nodeIds?.includes(n.id));
  if (keep) return keep;
  const ends = new Set((prefer.wallIds ?? []).flatMap(id => (floor.walls[id] ? [floor.walls[id]!.a, floor.walls[id]!.b] : [])));
  return cands.find(n => ends.has(n.id)) ?? findNodeNear(floor, p, maxDist);
}

/** Čemu dát přednost u překrývajících se rohů: vybrané rohy, konce vybraných stěn (D14). */
export interface NodePrefer {
  nodeIds?: Id[];
  wallIds?: Id[];
}

/** Opakované ťuknutí na překrývající se konce (D14): další uzel po `currentId`; null = na místě je jen jeden. */
export function nextNodeAt(floor: Floor, p: Pt, maxDist: number, currentId: Id): Node | null {
  const cands = nodesAt(floor, p, maxDist);
  const i = cands.findIndex(n => n.id === currentId);
  if (cands.length < 2 || i < 0) return null;
  return cands[(i + 1) % cands.length]!;
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

/** Celková šířka otvoru ve stěně: okno + ostění vlevo a vpravo. */
export const openingSpan = (op: Opening): number => op.width + (op.frame ? op.frame.width * 2 : 0) + (op.reveal ? op.reveal.left + op.reveal.right : 0);

export function openingStartFromA(op: Opening, wallLen: number): number {
  return op.ref === 'a' ? op.offset : wallLen - op.offset - openingSpan(op);
}

export function openingsOnWall(floor: Floor, wall: Wall): PlacedOpening[] {
  const len = wallLength(floor, wall);
  return Object.values(floor.openings)
    .filter(o => o.wallId === wall.id)
    .map(op => {
      const start = openingStartFromA(op, len);
      return { op, start, end: start + openingSpan(op) };
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

/** Napojené rohy na stěně seřazené od konce a, s polohou t. */
export function hostedOn(floor: Floor, wallId: Id): { id: Id; t: number }[] {
  const w = floor.walls[wallId];
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  if (!w || !a || !b) return [];
  const e = { x: b.x - a.x, y: b.y - a.y };
  const len2 = e.x * e.x + e.y * e.y || 1;
  return Object.values(floor.nodes)
    .filter(n => n.host === wallId && n.id !== w.a && n.id !== w.b)
    .map(n => ({ id: n.id, t: ((n.x - a.x) * e.x + (n.y - a.y) * e.y) / len2 }))
    .sort((p, q) => p.t - q.t);
}

/**
 * Úseky stěn pro graf (skupiny, místnosti): průběžná stěna se v napojených rozích rozdělí jen virtuálně.
 * Každý úsek nese skutečnou stěnu.
 */
export function wallSegments(floor: Floor): { wall: Wall; from: Id; to: Id }[] {
  const out: { wall: Wall; from: Id; to: Id }[] = [];
  // jeden průchod rohy: stěna → napojené rohy (místo hledání pro každou stěnu zvlášť)
  const byHost = new Map<Id, Node[]>();
  for (const n of Object.values(floor.nodes)) if (n.host) (byHost.get(n.host) ?? byHost.set(n.host, []).get(n.host)!).push(n);
  for (const w of Object.values(floor.walls)) {
    const list = byHost.get(w.id);
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    let mids: Id[] = [];
    if (list && a && b) {
      const e = { x: b.x - a.x, y: b.y - a.y };
      mids = list
        .filter(n => n.id !== w.a && n.id !== w.b)
        .map(n => ({ id: n.id, t: (n.x - a.x) * e.x + (n.y - a.y) * e.y }))
        .sort((p, q) => p.t - q.t)
        .map(h => h.id);
    }
    const chain = [w.a, ...mids, w.b];
    for (let i = 0; i + 1 < chain.length; i++) out.push({ wall: w, from: chain[i]!, to: chain[i + 1]! });
  }
  return out;
}

