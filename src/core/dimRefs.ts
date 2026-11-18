/**
 * Body a hrany, ke kterým se přichytí volná kóta (rozhodnutí uživatele 2026-11-18: „ke všem prvkům – obě strany
 * stěny, čáry, okna, dveře“, kóta rovnoběžná jako v CAD). Jediné místo, kde se konce kót hledají a počítají –
 * **nový druh prvku pro kótování přidat jen sem** (`refGeom`, `refAt`, `refSegment`).
 *
 * Bod: roh stěny, bod kresby (vrchol, střed kruhu), pevný bod. Hrana (nekonečná přímka pro výpočet, úsečka pro
 * zvýraznění): líc rovné stěny (u stěny bez tloušťky její čára), rovný úsek čáry kresby (i obdélníku a dvojité čáry
 * – první čára), okraj otvoru (dveře, okno, průchod, nika) napříč stěnou.
 */
import type { DimEnd, Drawing, Floor, Opening, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, projectToSegment, scale, sub, unit } from './geometry';
import { faceOffset } from './protrusion';
import { bodyRange, hasBody } from './wallFace';
import { openingSpan, openingStartFromA } from './floorQueries';

export type RefGeom = { kind: 'point'; p: Pt } | { kind: 'line'; p: Pt; d: Pt };

/** Rovná stěna: počátek, směr a→b, normála, délka; null = oblouk, kruh, nulová délka. */
function straight(floor: Floor, w: Wall | undefined): { a: Pt; d: Pt; n: Pt; len: number } | null {
  if (!w || w.sagitta || w.radius !== undefined) return null;
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1) return null;
  const d = unit(a, b);
  return { a, d, n: normal(d), len: dist(a, b) };
}

/** Posun líce `side` od osy (0 = osa / čára stěny bez tloušťky). */
const offOf = (w: Wall, side: 1 | -1 | 0) => (side === 0 || !hasBody(w) ? 0 : faceOffset(w, side));

/** Rovný úsek `i` kresby (body úseku); null = oblouk, kruh, neexistuje. */
function drawSeg(dr: Drawing | undefined, i: number): [Pt, Pt] | null {
  if (!dr || dr.shape === 'circle' || dr.shape === 'arc') return null;
  const n = dr.pts.length;
  const closed = dr.shape === 'rect' || !!dr.closed;
  const p = dr.pts[i];
  const q = dr.pts[i + 1] ?? (closed && i === n - 1 ? dr.pts[0] : undefined);
  if (!p || !q || p.s || dist(p, q) < 1) return null;
  return [p, q];
}

/** Okraj otvoru: poloha po ose od rohu A. */
function openingEdgeU(op: Opening, edge: 'start' | 'end', len: number): number {
  const s = openingStartFromA(op, len);
  return edge === 'start' ? s : s + openingSpan(op);
}

/** Geometrie konce kóty: bod, nebo přímka (bod dosednutí + směr); null = prvek zanikl / už není rovný. */
export function refGeom(floor: Floor, e: DimEnd): RefGeom | null {
  if ('node' in e) {
    const n = floor.nodes[e.node];
    return n ? { kind: 'point', p: { x: n.x, y: n.y } } : null;
  }
  if ('drawing' in e) {
    const q = floor.drawings?.[e.drawing]?.pts[e.i];
    return q ? { kind: 'point', p: { x: q.x, y: q.y } } : null;
  }
  if ('wall' in e) {
    const w = floor.walls[e.wall];
    const s = straight(floor, w);
    if (!w || !s) return null;
    return { kind: 'line', p: add(add(s.a, scale(s.d, e.at)), scale(s.n, offOf(w, e.side))), d: s.d };
  }
  if ('seg' in e) {
    const sg = drawSeg(floor.drawings?.[e.seg], e.i);
    if (!sg) return null;
    const d = unit(sg[0], sg[1]);
    return { kind: 'line', p: add(sg[0], scale(d, e.at)), d };
  }
  if ('opening' in e) {
    const op = floor.openings[e.opening];
    const s = straight(floor, op && floor.walls[op.wallId]);
    if (!op || !s) return null;
    const u = openingEdgeU(op, e.edge, s.len);
    return { kind: 'line', p: add(add(s.a, scale(s.d, u)), scale(s.n, e.at)), d: s.n };
  }
  return { kind: 'point', p: { x: e.x, y: e.y } };
}

/** Úsečka hrany pro zvýraznění pod perem (body nic). */
export function refSegment(floor: Floor, e: DimEnd): [Pt, Pt] | null {
  if ('wall' in e) {
    const w = floor.walls[e.wall];
    const s = straight(floor, w);
    if (!w || !s) return null;
    const o = scale(s.n, offOf(w, e.side));
    return [add(s.a, o), add(add(s.a, scale(s.d, s.len)), o)];
  }
  if ('seg' in e) return drawSeg(floor.drawings?.[e.seg], e.i);
  if ('opening' in e) {
    const op = floor.openings[e.opening];
    const w = op && floor.walls[op.wallId];
    const s = straight(floor, w);
    if (!op || !w || !s) return null;
    const base = add(s.a, scale(s.d, openingEdgeU(op, e.edge, s.len)));
    const [r0, r1] = hasBody(w) ? bodyRange(w) : [-50, 50];
    return [add(base, scale(s.n, r0)), add(base, scale(s.n, r1))];
  }
  return null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Bod nebo hrana pod perem: bod (roh, bod kresby) do `tolPt`, jinak nejbližší hrana do `tolLine` (líc stěny, úsek
 * kresby, okraj otvoru). null = nic (kóta pak začne v pevném bodě).
 */
export function refAt(floor: Floor, p: Pt, tolPt: number, tolLine: number): DimEnd | null {
  let pt: DimEnd | null = null;
  let best = tolPt;
  for (const n of Object.values(floor.nodes)) {
    const dd = dist(n, p);
    if (dd <= best) {
      pt = { node: n.id };
      best = dd;
    }
  }
  for (const dr of Object.values(floor.drawings ?? {})) {
    dr.pts.forEach((q, i) => {
      const dd = dist(q, p);
      if (dd <= best) {
        pt = { drawing: dr.id, i };
        best = dd;
      }
    });
  }
  if (pt) return pt;
  let line: DimEnd | null = null;
  best = tolLine;
  const take = (e: DimEnd, dd: number) => {
    if (dd <= best) {
      line = e;
      best = dd;
    }
  };
  // okraje otvorů (napříč stěnou)
  for (const op of Object.values(floor.openings)) {
    const w = floor.walls[op.wallId];
    const s = straight(floor, w);
    if (!w || !s) continue;
    const [lo, hi] = hasBody(w) ? bodyRange(w) : [-50, 50];
    for (const edge of ['start', 'end'] as const) {
      const base = add(s.a, scale(s.d, openingEdgeU(op, edge, s.len)));
      const h = projectToSegment(p, add(base, scale(s.n, lo)), add(base, scale(s.n, hi)));
      take({ opening: op.id, edge, at: r1(Math.max(lo, Math.min(hi, dot(sub(p, base), s.n)))) }, h.distance);
    }
  }
  // líce rovných stěn (stěna bez tloušťky = její čára)
  for (const w of Object.values(floor.walls)) {
    const s = straight(floor, w);
    if (!s) continue;
    const u = dot(sub(p, s.a), s.d);
    const across = dot(sub(p, s.a), s.n);
    const ext = w.thickness; // líc u rohu přesahuje osu až o tloušťku
    if (u < -ext - tolLine || u > s.len + ext + tolLine) continue;
    const at = r1(Math.max(-ext, Math.min(s.len + ext, u)));
    if (hasBody(w)) for (const side of [1, -1] as const) take({ wall: w.id, side, at }, Math.abs(across - faceOffset(w, side)));
    else take({ wall: w.id, side: 0, at }, Math.abs(across));
  }
  // rovné úseky kresby
  for (const dr of Object.values(floor.drawings ?? {})) {
    for (let i = 0; i < dr.pts.length; i++) {
      const sg = drawSeg(dr, i);
      if (!sg) continue;
      const h = projectToSegment(p, sg[0], sg[1]);
      take({ seg: dr.id, i, at: r1(dist(sg[0], h.point)) }, h.distance);
    }
  }
  return line;
}

/** Jsou dvě hrany rovnoběžné (do ~1°)? */
export const parallel = (d1: Pt, d2: Pt): boolean => Math.abs(d1.x * d2.y - d1.y * d2.x) < 0.0175;

/** Pata kolmice z bodu p na přímku (bod q, směr d). */
export const foot = (p: Pt, q: Pt, d: Pt): Pt => add(q, scale(d, dot(sub(p, q), d)));

/**
 * Body, mezi kterými kóta měří: bod–bod přímo; hrana–bod a hrana–rovnoběžná hrana kolmo (od místa dosednutí na
 * první hraně). Nerovnoběžné hrany: null (taková kóta nevznikne; když se hrany pootočí, kóta se nekreslí).
 */
export function measurePoints(g1: RefGeom, g2: RefGeom): [Pt, Pt] | null {
  if (g1.kind === 'point' && g2.kind === 'point') return [g1.p, g2.p];
  if (g1.kind === 'line' && g2.kind === 'point') return [foot(g2.p, g1.p, g1.d), g2.p];
  if (g1.kind === 'point' && g2.kind === 'line') return [g1.p, foot(g1.p, g2.p, g2.d)];
  if (g1.kind === 'line' && g2.kind === 'line') return parallel(g1.d, g2.d) ? [g1.p, foot(g1.p, g2.p, g2.d)] : null;
  return null;
}

/** Popis konce (panel, NumPad). */
export function refLabel(e: DimEnd): string {
  if ('node' in e) return 'roh stěny';
  if ('drawing' in e) return 'bod kresby';
  if ('wall' in e) return e.side === 0 ? 'stěna' : 'líc stěny';
  if ('seg' in e) return 'čára kresby';
  if ('opening' in e) return 'okraj otvoru';
  return 'bod výkresu';
}
