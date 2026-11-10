/**
 * Tělo stěny s tloušťkou: obrys (mnohoúhelník) a čáry k vykreslení, napojení stěn v rozích a T,
 * výchozí strana těla („ven od místnosti“) a body pro přichytávání.
 *
 * Stěna je čára líce a→b; tělo leží na straně `side` (1 = ve směru normal(a→b)) v šířce `thickness`.
 * Napojení v rohu: konce stěn kolem rohu se seřadí podle úhlu a sousední hranice se protnou
 * (jako „miter“ v Revitu) – funguje pro L, T i X a různé tloušťky. Čáry uvnitř spojů se nekreslí.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, centroid, dist, dot, normal, scale, sub, unit } from './geometry';

/** Má stěna tělo? (zatím jen rovné stěny s tloušťkou; oblouky a kruhy jsou čáry) */
export const hasBody = (w: Wall): boolean => w.thickness > 0 && w.radius === undefined && !w.sagitta && w.a !== w.b;

/** Jednotkový vektor od čáry líce směrem do těla stěny. */
export function bodyNormal(floor: Floor, w: Wall): Pt | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  return scale(normal(unit(a, b)), w.side);
}

export interface WallBody {
  wallId: Id;
  /** Obrys těla (pro výplň a zásah ťuknutím). */
  poly: Pt[];
  /** Čáry k vykreslení: oba líce a čela volných konců (spoje se nekreslí). */
  edges: [Pt, Pt][];
}

interface End {
  wall: Wall;
  atA: boolean;
  node: Pt;
  /** Směr od rohu podél stěny. */
  d: Pt;
  /** normal(d) */
  n: Pt;
  /** Hranice těla jako posun podél n (jedna z nich je líc = 0). */
  lo: number;
  hi: number;
  ang: number;
  loPt?: Pt;
  hiPt?: Pt;
  free?: boolean;
}

/** Průsečík přímek p + s·d a q + t·e (null u rovnoběžných). */
function intersectLines(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < 1e-9) return null;
  const w = sub(q, p);
  const t = (w.x * e.y - w.y * e.x) / cross;
  return add(p, scale(d, t));
}

/** Obrysy těl všech stěn s tloušťkou. */
export function wallBodies(floor: Floor): Map<Id, WallBody> {
  const byNode = new Map<Id, End[]>();
  const pairs: [End, End][] = [];
  for (const w of Object.values(floor.walls)) {
    if (!hasBody(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b || dist(a, b) < 1) continue;
    const dA = unit(a, b);
    const mk = (atA: boolean): End => {
      const d = atA ? dA : scale(dA, -1);
      const n = normal(d);
      const off = w.thickness * w.side * (atA ? 1 : -1);
      return { wall: w, atA, node: atA ? a : b, d, n, lo: Math.min(0, off), hi: Math.max(0, off), ang: Math.atan2(d.y, d.x) };
    };
    const eA = mk(true);
    const eB = mk(false);
    pairs.push([eA, eB]);
    for (const [id, e] of [[w.a, eA], [w.b, eB]] as const) (byNode.get(id) ?? byNode.set(id, []).get(id)!).push(e);
  }

  for (const ends of byNode.values()) {
    const node = ends[0]!.node;
    if (ends.length === 1) {
      const e = ends[0]!;
      e.loPt = add(node, scale(e.n, e.lo));
      e.hiPt = add(node, scale(e.n, e.hi));
      e.free = true;
      continue;
    }
    ends.sort((p, q) => p.ang - q.ang);
    const limit = 4 * Math.max(...ends.map(e => e.wall.thickness));
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i]!;
      const next = ends[(i + 1) % ends.length]!;
      const p = add(node, scale(e.n, e.hi));
      const q = add(node, scale(next.n, next.lo));
      const x = intersectLines(p, e.d, q, next.d);
      if (x && dist(x, node) <= limit) {
        e.hiPt = x;
        next.loPt = x;
      } else {
        e.hiPt = p;
        next.loPt = q;
      }
    }
  }

  const out = new Map<Id, WallBody>();
  for (const [eA, eB] of pairs) {
    const A = { lo: eA.loPt!, hi: eA.hiPt! };
    const B = { lo: eB.loPt!, hi: eB.hiPt! };
    const edges: [Pt, Pt][] = [
      [A.lo, B.hi],
      [B.lo, A.hi]
    ];
    if (eA.free) edges.push([A.hi, A.lo]);
    if (eB.free) edges.push([B.hi, B.lo]);
    // u napojeného konce vede obrys přes roh – jinak by u T zůstal mezi šikmým řezem a příčkou nevyplněný klín
    const poly = [A.lo, B.hi, ...(eB.free ? [] : [eB.node]), B.lo, A.hi, ...(eA.free ? [] : [eA.node])];
    out.set(eA.wall.id, { wallId: eA.wall.id, poly, edges });
  }
  return out;
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Stěna, do jejíhož těla padne bod (null = žádná). */
export function findBodyAt(floor: Floor, p: Pt): Wall | null {
  for (const body of wallBodies(floor).values()) {
    if (pointInPolygon(p, body.poly)) return floor.walls[body.wallId] ?? null;
  }
  return null;
}

/** Body těl pro přichytávání: vnější rohy (body obrysu mimo rohy líce) a středy čel volných konců. */
export function bodySnapPoints(floor: Floor): Pt[] {
  const out: Pt[] = [];
  const near = (p: Pt) => Object.values(floor.nodes).some(n => dist(n, p) < 1);
  for (const body of wallBodies(floor).values()) {
    for (const p of body.poly) if (!near(p) && !out.some(q => dist(q, p) < 1)) out.push(p);
  }
  // středy čel volných konců
  const deg = new Map<Id, number>();
  for (const w of Object.values(floor.walls)) {
    if (!hasBody(w)) continue;
    deg.set(w.a, (deg.get(w.a) ?? 0) + 1);
    deg.set(w.b, (deg.get(w.b) ?? 0) + 1);
  }
  for (const w of Object.values(floor.walls)) {
    const bn = hasBody(w) ? bodyNormal(floor, w) : null;
    if (!bn) continue;
    for (const id of [w.a, w.b]) {
      const n = floor.nodes[id];
      if (n && deg.get(id) === 1) out.push(add(n, scale(bn, w.thickness / 2)));
    }
  }
  return out;
}

/**
 * Výchozí strana těla nové stěny: navazuje-li stěna na konec jediné jiné stěny, pokračuje na stejné straně
 * (tělo se drží „venku“ podél celého tahu); jinak ven od středu ostatních rohů.
 */
export function initialSide(floor: Floor, wall: Wall): 1 | -1 {
  const others = Object.values(floor.walls).filter(w => w.id !== wall.id && hasBody(w));
  for (const id of [wall.a, wall.b]) {
    const at = others.filter(w => w.a === id || w.b === id);
    if (at.length !== 1) continue;
    const w = at[0]!;
    // tah p→q→r: stejná strana; protisměrně opačná
    const sameDir = (id === wall.a && w.b === id) || (id === wall.b && w.a === id);
    return sameDir ? w.side : w.side === 1 ? -1 : 1;
  }
  const a = floor.nodes[wall.a];
  const b = floor.nodes[wall.b];
  const rest = Object.values(floor.nodes).filter(n => n.id !== wall.a && n.id !== wall.b);
  if (!a || !b || rest.length === 0) return 1;
  const c = centroid(rest);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return dot(sub(mid, c), normal(unit(a, b))) >= 0 ? 1 : -1;
}

/**
 * Uzavřela stěna místnost (smyčku stěn s tloušťkou)? Pak se těla všech stěn smyčky natočí ven z ní
 * (kromě stěn s ručně přehozenou stranou). Vrací true, pokud smyčku našla.
 */
export function orientLoopOutward(floor: Floor, wallId: Id): boolean {
  const start = floor.walls[wallId];
  if (!start || !hasBody(start)) return false;
  const adj = new Map<Id, { wall: Wall; to: Id }[]>();
  for (const w of Object.values(floor.walls)) {
    if (w.id === wallId || !hasBody(w)) continue;
    (adj.get(w.a) ?? adj.set(w.a, []).get(w.a)!).push({ wall: w, to: w.b });
    (adj.get(w.b) ?? adj.set(w.b, []).get(w.b)!).push({ wall: w, to: w.a });
  }
  // nejkratší cesta b → a (bez nové stěny)
  const prev = new Map<Id, { from: Id; wall: Wall }>();
  const queue = [start.b];
  const seen = new Set([start.b]);
  while (queue.length && !seen.has(start.a)) {
    const id = queue.shift()!;
    for (const e of adj.get(id) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, { from: id, wall: e.wall });
      queue.push(e.to);
    }
  }
  if (!seen.has(start.a)) return false;
  const loopWalls: Wall[] = [start];
  const polyIds: Id[] = [start.a];
  for (let id = start.a; id !== start.b; ) {
    const p = prev.get(id)!;
    loopWalls.push(p.wall);
    polyIds.push(p.from);
    id = p.from;
  }
  const poly = polyIds.map(id => floor.nodes[id]!).filter(Boolean);
  if (poly.length < 3) return false;
  for (const w of loopWalls) {
    if (w.sideLocked) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    const bn = bodyNormal(floor, w);
    if (!a || !b || !bn) continue;
    const probe = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, bn);
    if (pointInPolygon(probe, poly)) w.side = w.side === 1 ? -1 : 1;
  }
  return true;
}
