/**
 * Tělo stěny s tloušťkou: obrys (mnohoúhelník) a čáry k vykreslení, napojení stěn v rozích a T,
 * výchozí strana těla („ven od místnosti“) a body pro přichytávání.
 *
 * Stěna je čára líce a→b (rovná nebo oblouková – `sagitta`); tělo leží na straně `side`
 * (1 = ve směru normal(tečny a→b)) v šířce `thickness`. Oblouk se kreslí jako lomená čára.
 * Napojení v rohu: konce stěn kolem rohu se seřadí podle úhlu tečny a sousední hranice se protnou
 * (jako „miter“ v Revitu) – funguje pro L, T i X a různé tloušťky. Čáry uvnitř spojů se nekreslí.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { arcGeometry } from './arc';
import { add, centroid, dist, dot, normal, scale, sub, unit } from './geometry';

/** Má stěna tělo? (rovné i obloukové stěny s tloušťkou; kruhy a čáry bez tloušťky ne) */
export const hasBody = (w: Wall): boolean => w.thickness > 0 && w.radius === undefined && w.a !== w.b;

/** Jednotkový vektor od čáry líce směrem do těla stěny (u oblouku v jeho vrcholu = kolmo k tětivě). */
export function bodyNormal(floor: Floor, w: Wall): Pt | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  return scale(normal(unit(a, b)), w.side);
}

/** Čára líce jako body s tečnami (směr a→b); rovná stěna = 2 body, oblouk = lomená čára. */
export function facePath(a: Pt, b: Pt, sagitta: number, steps = 32): { pts: Pt[]; tans: Pt[] } {
  const g = arcGeometry(a, b, sagitta);
  if (!g) {
    const u = unit(a, b);
    return { pts: [a, b], tans: [u, u] };
  }
  const pts: Pt[] = [];
  const tans: Pt[] = [];
  const sgn = Math.sign(g.sweep) || 1;
  for (let i = 0; i <= steps; i++) {
    const ang = g.start + (g.sweep * i) / steps;
    pts.push(i === 0 ? a : i === steps ? b : { x: g.center.x + g.r * Math.cos(ang), y: g.center.y + g.r * Math.sin(ang) });
    tans.push({ x: -Math.sin(ang) * sgn, y: Math.cos(ang) * sgn });
  }
  return { pts, tans };
}

/** Bod na čáře líce v poloze s (0–1) a směr do těla v tom místě. */
export function facePointAt(floor: Floor, w: Wall, s: number): { pt: Pt; into: Pt } | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  const path = facePath(a, b, w.sagitta ?? 0, 64);
  const i = Math.max(0, Math.min(path.pts.length - 1, Math.round(s * (path.pts.length - 1))));
  if (path.pts.length === 2) {
    return { pt: { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, into: scale(normal(path.tans[0]!), w.side) };
  }
  return { pt: path.pts[i]!, into: scale(normal(path.tans[i]!), w.side) };
}

export interface WallBody {
  wallId: Id;
  /** Obrys těla (pro výplň a zásah ťuknutím). */
  poly: Pt[];
  /** Čáry k vykreslení: oba líce a čela volných konců (spoje se nekreslí). */
  edges: [Pt, Pt][];
  /** Body pro přichytávání: vnější rohy konců a středy čel volných konců. */
  snaps: Pt[];
}

interface End {
  wall: Wall;
  atA: boolean;
  node: Pt;
  /** Směr od rohu podél stěny (tečna). */
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
  const items: { eA: End; eB: End; path: { pts: Pt[]; tans: Pt[] } }[] = [];
  for (const w of Object.values(floor.walls)) {
    if (!hasBody(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b || dist(a, b) < 1) continue;
    const path = facePath(a, b, w.sagitta ?? 0);
    const tA = path.tans[0]!;
    const tB = path.tans[path.tans.length - 1]!;
    const mk = (atA: boolean): End => {
      const d = atA ? tA : scale(tB, -1);
      const n = normal(d);
      const off = w.thickness * w.side * (atA ? 1 : -1);
      return { wall: w, atA, node: atA ? a : b, d, n, lo: Math.min(0, off), hi: Math.max(0, off), ang: Math.atan2(d.y, d.x) };
    };
    const eA = mk(true);
    const eB = mk(false);
    items.push({ eA, eB, path });
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
  for (const { eA, eB, path } of items) {
    const A = { lo: eA.loPt!, hi: eA.hiPt! };
    const B = { lo: eB.loPt!, hi: eB.hiPt! };
    // vnitřní body obou hranic (u oblouku), v rámci konce A: hranice „lo“ vede k B.hi, „hi“ od B.lo
    const mids = path.pts.slice(1, -1);
    const midT = path.tans.slice(1, -1);
    const loCurve = mids.map((p, i) => add(p, scale(normal(midT[i]!), eA.lo)));
    const hiCurve = mids.map((p, i) => add(p, scale(normal(midT[i]!), eA.hi)));
    const loLine = [A.lo, ...loCurve, B.hi];
    const hiLine = [B.lo, ...[...hiCurve].reverse(), A.hi];
    const edges: [Pt, Pt][] = [];
    for (const line of [loLine, hiLine]) for (let i = 0; i + 1 < line.length; i++) edges.push([line[i]!, line[i + 1]!]);
    if (eA.free) edges.push([A.hi, A.lo]);
    if (eB.free) edges.push([B.hi, B.lo]);
    // u napojeného konce vede obrys přes roh – jinak by u T zůstal mezi šikmým řezem a příčkou nevyplněný klín
    const poly = [...loLine, ...(eB.free ? [] : [eB.node]), ...hiLine, ...(eA.free ? [] : [eA.node])];
    const snaps: Pt[] = [];
    for (const [e, pts] of [
      [eA, [A.lo, A.hi]],
      [eB, [B.lo, B.hi]]
    ] as const) {
      for (const p of pts) if (dist(p, e.node) >= 1) snaps.push(p);
      if (e.free) snaps.push({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
    }
    out.set(eA.wall.id, { wallId: eA.wall.id, poly, edges, snaps });
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

/** Body těl pro přichytávání: vnější rohy konců (mimo rohy líce) a středy čel volných konců. */
export function bodySnapPoints(floor: Floor): Pt[] {
  const out: Pt[] = [];
  for (const body of wallBodies(floor).values()) {
    for (const p of body.snaps) if (!out.some(q => dist(q, p) < 1)) out.push(p);
  }
  return out;
}

/**
 * Výchozí strana těla nové stěny: navazuje-li stěna na konec jediné jiné stěny, pokračuje na stejné straně
 * (tělo se drží „venku“ podél celého tahu); jinak ven od středu ostatních rohů.
 */
export function initialSide(floor: Floor, wall: Wall): 1 | -1 {
  const a = floor.nodes[wall.a];
  const b = floor.nodes[wall.b];
  if (!a || !b) return 1;
  return initialSideAt(floor, a, b, wall.a, wall.b, wall.id);
}

/**
 * Výchozí strana těla pro stěnu z bodu `a` do `b` (i pro stěnu, která se teprve kreslí):
 * `aId`/`bId` = rohy, na které se konce napojují (null = nový roh).
 */
export function initialSideAt(floor: Floor, a: Pt, b: Pt, aId: Id | null, bId: Id | null, excludeWallId?: Id): 1 | -1 {
  const others = Object.values(floor.walls).filter(w => w.id !== excludeWallId && hasBody(w));
  for (const [id, atStart] of [[aId, true], [bId, false]] as const) {
    if (!id) continue;
    const at = others.filter(w => w.a === id || w.b === id);
    if (at.length !== 1) continue;
    const w = at[0]!;
    // tah p→q→r: stejná strana; protisměrně opačná
    const sameDir = (atStart && w.b === id) || (!atStart && w.a === id);
    return sameDir ? w.side : w.side === 1 ? -1 : 1;
  }
  const rest = Object.values(floor.nodes).filter(n => n.id !== aId && n.id !== bId && dist(n, a) > 1 && dist(n, b) > 1);
  if (rest.length === 0 || dist(a, b) < 1) return 1;
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
    if (pointInPolygon(probe, poly)) {
      w.side = w.side === 1 ? -1 : 1;
      if (w.sagitta) w.sagitta = -w.sagitta;
    }
  }
  return true;
}

/**
 * Strana těla podle polohy pera při kreslení: když se pero odchýlí od (přichycené) čáry stěny
 * o víc než `threshold` (mm), tělo se překlopí na stranu pera; jinak zůstane `current` (null = automaticky).
 */
export function sideFromPen(start: Pt, end: Pt, pen: Pt, threshold: number, current: 1 | -1 | null): 1 | -1 | null {
  if (dist(start, end) < 1) return current;
  const off = dot(sub(pen, end), normal(unit(start, end)));
  if (Math.abs(off) <= threshold) return current;
  return off > 0 ? 1 : -1;
}

/**
 * Navazuje kreslená stěna `from`→`to` rovně na volný konec existující stěny se stejnou tloušťkou
 * v rohu `nodeId` (pokračování stejným směrem)? Vrací tu stěnu – kreslená se s ní sloučí do jedné.
 */
export function straightContinuation(floor: Floor, nodeId: Id | null, from: Pt, to: Pt, thickness: number, excludeWallId?: Id): Wall | null {
  if (!nodeId || thickness <= 0 || dist(from, to) < 1) return null;
  const at = Object.values(floor.walls).filter(w => w.id !== excludeWallId && (w.a === nodeId || w.b === nodeId));
  if (at.length !== 1) return null;
  const o = at[0]!;
  if (!hasBody(o) || o.thickness !== thickness || o.sagitta) return null;
  const far = floor.nodes[o.a === nodeId ? o.b : o.a];
  if (!far) return null;
  const d1 = unit(from, to);
  const d2 = unit(from, far);
  // opačné směry od rohu = rovné pokračování
  return d1.x * d2.y - d1.y * d2.x < 0.002 && d1.x * d2.y - d1.y * d2.x > -0.002 && dot(d1, d2) < -0.999 ? o : null;
}
