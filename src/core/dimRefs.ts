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
import { doubleOffset } from './drawing';
import { cornerOutline, cornerProtrusionsOf } from './cornerProtrusion';
import { endOutline, endProtrusionsOf } from './endProtrusion';
import { cornersOf, protrusionsOf } from './protrusion';
import { wallBodies, type WallBody } from './wallBody';
import type { CornerProtrusion, EndProtrusion, Id, Protrusion } from '../model/types';

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

/** Počet úseků kresby pro kótu (`drawSeg` může u některých vrátit null – oblouk, chybějící uzavřený konec). */
export function drawSegCount(dr: Drawing): number {
  if (dr.shape === 'double') return 4;
  return dr.shape === 'rect' || dr.closed ? dr.pts.length : dr.pts.length - 1;
}

/**
 * Rovný úsek `i` kresby (body úseku); null = oblouk, kruh, neexistuje. Dvojitá čára má pevné číslování:
 * 0 = první čára (pts), 1 = druhá čára, 2 = uzavřený konec u bodu 1, 3 = uzavřený konec u bodu 0.
 */
export function drawSeg(dr: Drawing | undefined, i: number): [Pt, Pt] | null {
  if (!dr || dr.shape === 'circle' || dr.shape === 'arc') return null;
  if (dr.shape === 'double') {
    const a = dr.pts[0];
    const b = dr.pts[1];
    const o = doubleOffset(dr);
    if (!a || !b || !o) return null;
    const P = (p: Pt): Pt => ({ x: p.x, y: p.y });
    if (i === 0) return [P(a), P(b)];
    if (i === 1) return o;
    if (!dr.closedEnds) return null;
    if (i === 2) return [P(b), o[1]];
    if (i === 3) return [o[0], P(a)];
    return null;
  }
  const n = dr.pts.length;
  const closed = dr.shape === 'rect' || !!dr.closed;
  const p = dr.pts[i];
  const q = dr.pts[i + 1] ?? (closed && i === n - 1 ? dr.pts[0] : undefined);
  if (!p || !q || p.s || dist(p, q) < 1) return null;
  return [p, q];
}

// --- hrany výstupků a vybrání (na stěně, v rohu, na konci stěny); posun v core/protrusionDimMove.ts ---
export type ProtKind = { kind: 'wall'; p: Protrusion } | { kind: 'corner'; p: CornerProtrusion } | { kind: 'end'; p: EndProtrusion };

/** Výstupek podle id (hledá se ve všech třech seznamech). */
export function protById(floor: Floor, id: Id): ProtKind | null {
  const p = floor.protrusions?.[id];
  if (p) return { kind: 'wall', p };
  const c = floor.cornerProtrusions?.[id];
  if (c) return { kind: 'corner', p: c };
  const e = floor.endProtrusions?.[id];
  return e ? { kind: 'end', p: e } : null;
}

/** Body obrysu výstupku ve výkresu (rohy obrysu, bez rozložení oblouků); null = nekreslí se. */
function outlinePts(floor: Floor, k: ProtKind, bodies?: Map<Id, WallBody>): Pt[] | null {
  if (k.kind === 'wall') {
    const c = cornersOf(floor, k.p);
    return c && !c.w.sagitta ? c.pts : null;
  }
  return k.kind === 'corner' ? cornerOutline(floor, k.p, bodies) : endOutline(floor, k.p);
}

/** Rovné úseky obrysu ve výkresu (obrys se počítá jednou); null v seznamu = oblouk / příliš krátký. */
export function protSegs(floor: Floor, id: Id, bodies?: Map<Id, WallBody>): ([Pt, Pt] | null)[] {
  const k = protById(floor, id);
  const pts = k && outlinePts(floor, k, bodies);
  if (!k || !pts) return [];
  const out: ([Pt, Pt] | null)[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const arc = k.kind === 'wall' && !!k.p.pts[i]?.s;
    out.push(!arc && dist(pts[i]!, pts[i + 1]!) >= 1 ? [pts[i]!, pts[i + 1]!] : null);
  }
  return out;
}

/** Rovný úsek `i` obrysu ve výkresu; null = oblouk, neexistuje, výstupek se nekreslí. */
export function protSeg(floor: Floor, id: Id, i: number): [Pt, Pt] | null {
  return protSegs(floor, id)[i] ?? null;
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
  if ('prot' in e) {
    const sg = protSeg(floor, e.prot, e.i);
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
  if ('prot' in e) return protSeg(floor, e.prot, e.i);
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
  // hrany výstupků a vybrání (na stěně, v rohu, na konci stěny) – mají přednost před lícem, na kterém leží
  // těla stěn (platnost výstupku v rohu) jen jednou pro všechny výstupky
  const bodies = cornerProtrusionsOf(floor).length ? wallBodies(floor) : undefined;
  for (const id of [...protrusionsOf(floor), ...cornerProtrusionsOf(floor), ...endProtrusionsOf(floor)].map(p => p.id)) {
    protSegs(floor, id, bodies).forEach((sg, i) => {
      if (!sg) return;
      const h = projectToSegment(p, sg[0], sg[1]);
      // o kousek bližší než líc stejné vzdálenosti (hrana na líci stěny)
      take({ prot: id, i, at: r1(dist(sg[0], h.point)) }, Math.max(0, h.distance - 0.01));
    });
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
    for (let i = 0; i < drawSegCount(dr); i++) {
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
  if ('prot' in e) return 'hrana výstupku / vybrání';
  return 'bod výkresu';
}

/** Nová id kopírovaných prvků (kopie výběru, store/actions/copy.ts); výstupky všech tří druhů v `prots`. */
export interface CopyMaps {
  nodes: ReadonlyMap<Id, Id>;
  walls: ReadonlyMap<Id, Id>;
  openings: ReadonlyMap<Id, Id>;
  drawings: ReadonlyMap<Id, Id>;
  prots: ReadonlyMap<Id, Id>;
}

/**
 * Konec kopírované kóty: konec na kopírovaném prvku se přepojí na kopii; konec na prvku, který se nekopíruje
 * (a pevný bod), se v kopii stane pevným bodem `fallback` (měřený bod originálu posunutý jako kopie). Jediné místo pro všechny druhy konců – nový druh konce doplnit i sem.
 */
export function copyDimEnd(e: DimEnd, maps: CopyMaps, fallback: Pt): DimEnd {
  const fixed = { x: fallback.x, y: fallback.y }; // bez zaokrouhlení – kopie měří přesně jako originál
  if ('node' in e) {
    const n = maps.nodes.get(e.node);
    return n ? { node: n } : fixed;
  }
  if ('drawing' in e) {
    const n = maps.drawings.get(e.drawing);
    return n ? { drawing: n, i: e.i } : fixed;
  }
  if ('wall' in e) {
    const n = maps.walls.get(e.wall);
    return n ? { ...e, wall: n } : fixed;
  }
  if ('seg' in e) {
    const n = maps.drawings.get(e.seg);
    return n ? { ...e, seg: n } : fixed;
  }
  if ('opening' in e) {
    const n = maps.openings.get(e.opening);
    return n ? { ...e, opening: n } : fixed;
  }
  if ('prot' in e) {
    const n = maps.prots.get(e.prot);
    return n ? { ...e, prot: n } : fixed;
  }
  return fixed;
}
