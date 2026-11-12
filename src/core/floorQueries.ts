/**
 * Dotazy nad půdorysem (podlažím) – čtení bez změn.
 */
import type { Floor, Id, Node, Opening, Wall } from '../model/types';
import { arcGeometry, nearestOnArc, nearestOnCircle } from './arc';
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

/** Napojené rohy na stěně seřazené od konce a, s polohou t (u oblouku podél oblouku). */
export function hostedOn(floor: Floor, wallId: Id): { id: Id; t: number }[] {
  const w = floor.walls[wallId];
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  if (!w || !a || !b) return [];
  const e = { x: b.x - a.x, y: b.y - a.y };
  const len2 = e.x * e.x + e.y * e.y || 1;
  return Object.values(floor.nodes)
    .filter(n => n.host === wallId && n.id !== w.a && n.id !== w.b)
    .map(n => ({ id: n.id, t: w.sagitta ? nearestOnArc(n, a, b, w.sagitta).t : ((n.x - a.x) * e.x + (n.y - a.y) * e.y) / len2 }))
    .sort((p, q) => p.t - q.t);
}

/** Křížení dvou stěn s tloušťkou (C1.5): bod, kde se jejich osy protnou uvnitř obou (ne u konců). */
export interface Crossing {
  id: Id;
  pt: Pt;
  walls: [Id, Id];
}

/** Stěna s tělem pro křížení (bez závislosti na wallBody – kruhový import). */
const crossable = (w: Wall) => w.thickness > 0 && w.radius === undefined && w.a !== w.b;

/** Průsečíky přímky p + s·d (s ∈ [0,1] pro úsečku) s kružnicí. */
function segCircle(p: Pt, q: Pt, c: Pt, r: number): Pt[] {
  const d = { x: q.x - p.x, y: q.y - p.y };
  const f = { x: p.x - c.x, y: p.y - c.y };
  const A = d.x * d.x + d.y * d.y;
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - r * r;
  const disc = B * B - 4 * A * C;
  if (A < 1e-9 || disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].filter(s => s >= 0 && s <= 1).map(s => ({ x: p.x + d.x * s, y: p.y + d.y * s }));
}

/**
 * Všechna křížení stěn s tloušťkou (rovné i oblouky): průsečík os ve vnitřku obou stěn, dál než 5 mm
 * od jejich konců (konec na stěně je T-napojení – Node.host). Spoj se počítá z geometrie, stěny se nedělí.
 */
export function wallCrossings(floor: Floor): Crossing[] {
  const cached = Object.isFrozen(floor) ? crossingCache.get(floor) : undefined;
  if (cached) return cached;
  const items: { w: Wall; a: Pt; b: Pt; g: ReturnType<typeof arcGeometry> }[] = [];
  for (const w of Object.values(floor.walls)) {
    if (!crossable(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (a && b && dist(a, b) > 1) items.push({ w, a, b, g: arcGeometry(a, b, w.sagitta ?? 0) });
  }
  const out: Crossing[] = [];
  const onArc = (p: Pt, it: (typeof items)[number]) => !it.g || nearestOnArc(p, it.a, it.b, it.w.sagitta ?? 0).distance < 0.01;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const P = items[i]!;
      const Q = items[j]!;
      // sdílený roh = napojení v rohu, ne křížení
      if (P.w.a === Q.w.a || P.w.a === Q.w.b || P.w.b === Q.w.a || P.w.b === Q.w.b) continue;
      let pts: Pt[] = [];
      if (!P.g && !Q.g) {
        const d1 = { x: P.b.x - P.a.x, y: P.b.y - P.a.y };
        const d2 = { x: Q.b.x - Q.a.x, y: Q.b.y - Q.a.y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-9) continue;
        const w0 = { x: Q.a.x - P.a.x, y: Q.a.y - P.a.y };
        const s = (w0.x * d2.y - w0.y * d2.x) / den;
        const t = (w0.x * d1.y - w0.y * d1.x) / den;
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) pts = [{ x: P.a.x + d1.x * s, y: P.a.y + d1.y * s }];
      } else if (!P.g || !Q.g) {
        const S = P.g ? Q : P;
        const R = P.g ? P : Q;
        pts = segCircle(S.a, S.b, R.g!.center, R.g!.r).filter(p => onArc(p, R));
      } else {
        const c1 = P.g.center;
        const c2 = Q.g!.center;
        const r1 = P.g.r;
        const r2 = Q.g!.r;
        const dd = dist(c1, c2);
        if (dd < 1e-6 || dd > r1 + r2 || dd < Math.abs(r1 - r2)) continue;
        const m = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
        const h = Math.sqrt(Math.max(0, r1 * r1 - m * m));
        const u = { x: (c2.x - c1.x) / dd, y: (c2.y - c1.y) / dd };
        const base = { x: c1.x + u.x * m, y: c1.y + u.y * m };
        pts = [1, -1].map(k => ({ x: base.x - u.y * h * k, y: base.y + u.x * h * k })).filter(p => onArc(p, P) && onArc(p, Q));
      }
      pts.forEach((pt, k) => {
        // konec přímo v průsečíku, nebo konec napojený na druhou stěnu (T) = napojení, ne křížení
        if ([P.a, P.b, Q.a, Q.b].some(e => dist(e, pt) <= 0.5)) return;
        const hostedTo = (ends: Node[], other: Id) => ends.some(e => e.host === other && dist(e, pt) <= 5);
        if (hostedTo([P.a as Node, P.b as Node], Q.w.id) || hostedTo([Q.a as Node, Q.b as Node], P.w.id)) return;
        out.push({ id: `x:${P.w.id}|${Q.w.id}|${k}`, pt, walls: [P.w.id, Q.w.id] });
      });
    }
  }
  if (Object.isFrozen(floor)) crossingCache.set(floor, out);
  return out;
}

/** Mezipaměť pro hotové (zmrazené) výkresy – výpočet se za snímek volá mnohokrát. */
const crossingCache = new WeakMap<Floor, Crossing[]>();
const junctionCache = new WeakMap<Floor, Junction[]>();

/** Bod uprostřed stěn: napojený roh a / nebo křížení (sloučené podle polohy do 1 mm). */
export interface Junction {
  key: Id;
  pt: Pt;
  walls: Id[];
}

/**
 * Body uprostřed stěn, kde se stěny spojují: napojené rohy (Node.host) a křížení (C1.5). Body ve stejném
 * místě se sloučí pod jeden klíč (přednost má ID rohu), takže tři stěny v bodě nebo T na kříži tvoří jeden spoj.
 */
export function junctionPoints(floor: Floor, crossings?: Crossing[]): Junction[] {
  const useCache = !crossings && Object.isFrozen(floor);
  const cached = useCache ? junctionCache.get(floor) : undefined;
  if (cached) return cached;
  const out: Junction[] = [];
  const addJ = (key: Id, pt: Pt, wallId: Id) => {
    let j = out.find(o => dist(o.pt, pt) < 1);
    if (!j) {
      j = { key, pt, walls: [] };
      out.push(j);
    }
    if (!j.walls.includes(wallId)) j.walls.push(wallId);
  };
  for (const n of Object.values(floor.nodes)) if (n.host) addJ(n.id, n, n.host);
  for (const c of crossings ?? wallCrossings(floor)) for (const w of c.walls) addJ(c.id, c.pt, w);
  if (useCache) junctionCache.set(floor, out);
  return out;
}

/** Poloha bodu podél stěny (0 = a, 1 = b; u oblouku po oblouku) – pro řazení napojení a křížení. */
export function paramOnWall(w: Wall, a: Pt, b: Pt, p: Pt): number {
  if (w.sagitta) return nearestOnArc(p, a, b, w.sagitta).t;
  const e = { x: b.x - a.x, y: b.y - a.y };
  return ((p.x - a.x) * e.x + (p.y - a.y) * e.y) / (e.x * e.x + e.y * e.y || 1);
}

/** Úsek grafu stěn: skutečná stěna mezi dvěma body (roh, napojený roh nebo křížení). */
export interface WallSegment {
  wall: Wall;
  from: Id;
  to: Id;
  fromPt: Pt;
  toPt: Pt;
}

/**
 * Úseky stěn pro graf (skupiny, místnosti, řešič): průběžná stěna se v napojených rozích (T bez dělení)
 * a v kříženích (C1.5) rozdělí jen virtuálně. Křížení mají ID „x:…“ (nejsou v floor.nodes).
 */
export function wallSegments(floor: Floor, crossings?: Crossing[]): WallSegment[] {
  const out: WallSegment[] = [];
  // jeden průchod společnými body: stěna → body uprostřed ní (napojené rohy, křížení sloučené podle polohy)
  const mids = new Map<Id, { id: Id; pt: Pt }[]>();
  const add = (wallId: Id, id: Id, pt: Pt) => (mids.get(wallId) ?? mids.set(wallId, []).get(wallId)!).push({ id, pt });
  for (const j of junctionPoints(floor, crossings)) for (const w of j.walls) add(w, j.key, j.pt);
  for (const w of Object.values(floor.walls)) {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    const inner = (mids.get(w.id) ?? [])
      .filter(m => m.id !== w.a && m.id !== w.b)
      .map(m => ({ ...m, t: paramOnWall(w, a, b, m.pt) }))
      .sort((p, q) => p.t - q.t);
    const chain = [{ id: w.a, pt: a as Pt }, ...inner, { id: w.b, pt: b as Pt }];
    for (let i = 0; i + 1 < chain.length; i++) out.push({ wall: w, from: chain[i]!.id, to: chain[i + 1]!.id, fromPt: chain[i]!.pt, toPt: chain[i + 1]!.pt });
  }
  return out;
}
