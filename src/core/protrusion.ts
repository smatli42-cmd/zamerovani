/**
 * Výstupek / vybrání stěny (KATALOG-STEN.md, sekce I): geometrie v souřadnicích stěny, rozpoznání obrysu
 * nakresleného čarou s oběma konci na líci, kóty (šířka, hloubka, odstupy) a jejich změna.
 *
 * Souřadnice obrysu: u = mm podél osy stěny od rohu A, v = mm kolmo od líce (kladně ven od těla).
 * Líc `side` leží na posunu `faceOffset` podél normal(a→b) (stejně jako `bodyRange`).
 */
import type { Floor, Id, ProfilePt, Protrusion, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { bodyRange, facePath, hasBody } from './wallBody';

/** Výstupky podlaží (pole chybí u starších dat v testech). */
export const protrusionsOf = (floor: Floor): Protrusion[] => Object.values(floor.protrusions ?? {});

/** Stěna, na kterou jde výstupek: rovná s tělem. */
export const takesProtrusion = (w: Wall | undefined): w is Wall => !!w && hasBody(w) && !w.sagitta;

/** Posun líce `side` od osy podél normal(a→b). */
export function faceOffset(w: Wall, side: 1 | -1): number {
  const [r0, r1] = bodyRange(w);
  return side === 1 ? r1 : r0;
}

interface Frame {
  a: Pt;
  d: Pt;
  n: Pt;
  len: number;
}

export function wallFrame(floor: Floor, w: Wall): Frame | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b) return null;
  const len = dist(a, b);
  if (len < 1) return null;
  const d = unit(a, b);
  return { a, d, n: normal(d), len };
}

/** Bod obrysu → souřadnice výkresu. */
export function profileToWorld(f: Frame, w: Wall, side: 1 | -1, q: ProfilePt): Pt {
  return add(add(f.a, scale(f.d, q.u)), scale(f.n, faceOffset(w, side) + side * q.v));
}

/** Bod výkresu → souřadnice stěny vůči líci `side`. */
export function worldToProfile(f: Frame, w: Wall, side: 1 | -1, p: Pt): ProfilePt {
  const r = sub(p, f.a);
  return { u: dot(r, f.d), v: side * (dot(r, f.n) - faceOffset(w, side)) };
}

/** Obrys výstupku ve výkresu (otevřená lomená čára; uzavírá se po líci). null = stěna chybí nebo nejde. */
export function protrusionOutline(floor: Floor, p: Protrusion): Pt[] | null {
  const w = floor.walls[p.wallId];
  if (!takesProtrusion(w)) return null;
  const f = wallFrame(floor, w);
  return f ? profilePolyline(p).map(q => profileToWorld(f, w, p.side, q)) : null;
}

/** Obrys v souřadnicích stěny s rozloženými oblouky (úseky s `s`) na lomenou čáru. */
export function profilePolyline(p: Protrusion, steps = 24): ProfilePt[] {
  const out: ProfilePt[] = [{ u: p.pts[0]!.u, v: p.pts[0]!.v }];
  for (let i = 0; i + 1 < p.pts.length; i++) {
    const a = p.pts[i]!;
    const b = p.pts[i + 1]!;
    if (!a.s) {
      out.push({ u: b.u, v: b.v });
      continue;
    }
    const path = facePath({ x: a.u, y: a.v }, { x: b.u, y: b.v }, a.s, steps);
    for (const q of path.pts.slice(1)) out.push({ u: q.x, v: q.y });
  }
  return out;
}

/** Úchyty vzepětí: vrchol (střed) každého úseku obrysu, který neleží na líci; `seg` = index úseku. */
export function protrusionArcHandles(floor: Floor, p: Protrusion): { seg: number; at: Pt; chordMid: Pt }[] {
  const w = floor.walls[p.wallId];
  const f = takesProtrusion(w) ? wallFrame(floor, w) : null;
  if (!w || !f) return [];
  const out: { seg: number; at: Pt; chordMid: Pt }[] = [];
  for (let i = 0; i + 1 < p.pts.length; i++) {
    const a = p.pts[i]!;
    const b = p.pts[i + 1]!;
    if (Math.abs(a.v) < 0.5 && Math.abs(b.v) < 0.5) continue; // úsek po líci
    const len = Math.hypot(b.u - a.u, b.v - a.v);
    if (len < 1) continue;
    const mid = { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
    const nu = -(b.v - a.v) / len;
    const nv = (b.u - a.u) / len;
    const s = a.s ?? 0;
    out.push({ seg: i, at: profileToWorld(f, w, p.side, { u: mid.u + nu * s, v: mid.v + nv * s }), chordMid: profileToWorld(f, w, p.side, mid) });
  }
  return out;
}

/** Vzepětí úseku `seg` podle bodu výkresu (vzdálenost od tětivy se znaménkem, po 10 mm; < 10 mm = rovný). */
export function sagittaFromPoint(floor: Floor, p: Protrusion, seg: number, at: Pt): number | null {
  const w = floor.walls[p.wallId];
  const f = takesProtrusion(w) ? wallFrame(floor, w) : null;
  const a = p.pts[seg];
  const b = p.pts[seg + 1];
  if (!w || !f || !a || !b) return null;
  const q = worldToProfile(f, w, p.side, at);
  const len = Math.hypot(b.u - a.u, b.v - a.v) || 1;
  const h = ((q.u - (a.u + b.u) / 2) * -(b.v - a.v) + (q.v - (a.v + b.v) / 2) * (b.u - a.u)) / len;
  const r = Math.round(h / 10) * 10;
  // nejvýš půlkruh
  return Math.max(-len / 2, Math.min(len / 2, r));
}

/** Nastaví vzepětí úseku `seg` (0 = rovný). */
export function setProtrusionSagitta(floor: Floor, id: Id, seg: number, s: number): boolean {
  const p = floor.protrusions?.[id];
  const a = p?.pts[seg];
  const b = p?.pts[seg + 1];
  if (!p || !a || !b || !Number.isFinite(s)) return false;
  if (Math.abs(a.v) < 0.5 && Math.abs(b.v) < 0.5) return false;
  const half = Math.hypot(b.u - a.u, b.v - a.v) / 2;
  if (Math.abs(s) > half + 0.5) return false;
  const old = a.s;
  if (Math.abs(s) < 1) delete a.s;
  else a.s = r1(s);
  if (!protrusionFits(floor, p)) {
    if (old === undefined) delete a.s;
    else a.s = old;
    return false;
  }
  return true;
}

/** Líc stěny u bodu: rovná stěna s tělem, `u` podél osy (v rozsahu stěny), vzdálenost od líce ≤ tol. */
export interface FaceHit {
  wall: Wall;
  side: 1 | -1;
  u: number;
  /** Bod přesně na líci. */
  point: Pt;
  distance: number;
}

export function findFaceNear(floor: Floor, p: Pt, tol: number, onlyWall?: Id): FaceHit | null {
  let best: FaceHit | null = null;
  for (const w of Object.values(floor.walls)) {
    if ((onlyWall && w.id !== onlyWall) || !takesProtrusion(w)) continue;
    const f = wallFrame(floor, w);
    if (!f) continue;
    const r = sub(p, f.a);
    const u = dot(r, f.d);
    if (u < -tol || u > f.len + tol) continue;
    const across = dot(r, f.n);
    for (const side of [1, -1] as const) {
      const off = faceOffset(w, side);
      const distance = Math.abs(across - off);
      if (distance > tol || (best && distance >= best.distance)) continue;
      const uc = Math.max(0, Math.min(f.len, u));
      best = { wall: w, side, u: uc, point: add(add(f.a, scale(f.d, uc)), scale(f.n, off)), distance };
    }
  }
  return best;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Obrys nakreslený čarou (body ve výkresu): leží-li oba konce na stejném líci téže stěny a celý obrys na jedné
 * straně líce, vrátí výstupek (ven od těla) nebo vybrání (do těla, nejvýš přes celou tloušťku). Jinak null.
 */
export function profileFromPolyline(floor: Floor, pts: readonly Pt[], tol = 1.5): Omit<Protrusion, 'id' | 'name' | 'material' | 'note'> | null {
  if (pts.length < 3) return null;
  const s = findFaceNear(floor, pts[0]!, tol);
  if (!s) return null;
  const e = findFaceNear(floor, pts[pts.length - 1]!, tol, s.wall.id);
  if (!e || e.side !== s.side) return null;
  const w = s.wall;
  const f = wallFrame(floor, w)!;
  const prof = pts.map(p => worldToProfile(f, w, s.side, p));
  prof[0] = { u: prof[0]!.u, v: 0 };
  prof[prof.length - 1] = { u: prof[prof.length - 1]!.u, v: 0 };
  if (Math.abs(prof[0]!.u - prof[prof.length - 1]!.u) < 1) return null;
  // obrys přes konec stěny zůstane čarou (výstupek přes roh / konec je až později, I1.11)
  if (prof.some(q => q.u < -tol || q.u > f.len + tol)) return null;
  const inner = prof.slice(1, -1).map(q => q.v);
  const max = Math.max(...inner);
  const min = Math.min(...inner);
  let mode: Protrusion['mode'];
  if (min >= -tol && max > tol) mode = 'add';
  else if (max <= tol && min < -tol && min >= -w.thickness - tol) mode = 'subtract';
  else return null;
  // body těsně u líce na líc (v = 0), vybrání nejvýš přes celou tloušťku
  const clean = prof.map(q => ({ u: r1(q.u), v: r1(mode === 'add' ? Math.max(0, q.v) : Math.max(-w.thickness, Math.min(0, q.v))) }));
  return { wallId: w.id, side: s.side, mode, pts: clean };
}

/** Rozsah výstupku: u0 < u1 podél stěny (konce na líci), hloubka = největší |v|. */
export function protrusionExtent(p: Protrusion): { u0: number; u1: number; depth: number } {
  // rozsah podél stěny i hloubka včetně vyklenutí oblouků
  const all = p.pts.some(q => q.s) ? profilePolyline(p) : p.pts;
  const us = all.map(q => q.u);
  return { u0: Math.min(...us), u1: Math.max(...us), depth: Math.max(...all.map(q => Math.abs(q.v))) };
}

/** Sousední výstupky na stejném líci téže stěny (před = směrem k A, za = směrem k B). */
export function protrusionNeighbors(floor: Floor, p: Protrusion): { before: Protrusion | null; after: Protrusion | null } {
  const { u0, u1 } = protrusionExtent(p);
  let before: Protrusion | null = null;
  let after: Protrusion | null = null;
  for (const o of protrusionsOf(floor)) {
    if (o.id === p.id || o.wallId !== p.wallId || o.side !== p.side) continue;
    const e = protrusionExtent(o);
    if (e.u1 <= u0 + 1e-6 && (!before || e.u1 > protrusionExtent(before).u1)) before = o;
    if (e.u0 >= u1 - 1e-6 && (!after || e.u0 < protrusionExtent(after).u0)) after = o;
  }
  return { before, after };
}

export type ProtrusionDim = 'width' | 'depth' | 'before' | 'after';

/** Hodnoty kót výstupku: šířka, hloubka, odstup od souseda (nebo konce stěny) před a za. */
export function protrusionDims(floor: Floor, p: Protrusion): Record<ProtrusionDim, number> | null {
  const w = floor.walls[p.wallId];
  const f = w && wallFrame(floor, w);
  if (!f) return null;
  const { u0, u1, depth } = protrusionExtent(p);
  const nb = protrusionNeighbors(floor, p);
  const start = nb.before ? protrusionExtent(nb.before).u1 : 0;
  const end = nb.after ? protrusionExtent(nb.after).u0 : f.len;
  return { width: u1 - u0, depth, before: u0 - start, after: end - u1 };
}

/**
 * Změní kótu výstupku (mění se jen výstupek, ne stěna): šířka od okraje u A, hloubka úměrně,
 * odstup posune výstupek podél stěny. Vrací false u nesmyslné hodnoty.
 */
export function setProtrusionDim(floor: Floor, id: Id, dim: ProtrusionDim, value: number): boolean {
  const p = floor.protrusions?.[id];
  const w = p && floor.walls[p.wallId];
  const cur = p && protrusionDims(floor, p);
  if (!p || !w || !cur || !Number.isFinite(value)) return false;
  const { u0, depth } = protrusionExtent(p);
  const before = p.pts;
  if (dim === 'width') {
    if (value < 10 || cur.width < 1e-6) return false;
    const k = value / cur.width;
    p.pts = rescaleArcs(before, before.map(q => ({ ...q, u: r1(u0 + (q.u - u0) * k) })));
  } else if (dim === 'depth') {
    if (value < 1 || depth < 1e-6 || (p.mode === 'subtract' && value > w.thickness)) return false;
    // body se zvětší úměrně; oblouky se mění s délkou své tětivy – hloubka i s vyklenutím se dorovná na zadanou
    let k = value / depth;
    for (let i = 0; i < 12; i++) {
      p.pts = rescaleArcs(before, before.map(q => ({ ...q, v: q.v * k })));
      const d = protrusionExtent(p).depth;
      if (Math.abs(d - value) < 0.05 || d < 1e-6) break;
      k *= value / d;
    }
    p.pts = p.pts.map(q => ({ ...q, v: r1(q.v) }));
  } else {
    if (value < 0) return false;
    const shift = dim === 'before' ? value - cur.before : cur.after - value;
    p.pts = before.map(q => ({ ...q, u: r1(q.u + shift) }));
  }
  if (!protrusionFits(floor, p)) {
    p.pts = before;
    return false;
  }
  return true;
}

/** Vzepětí oblouků úměrně změně délky jejich tětivy, nejvýš půlkruh. */
function rescaleArcs(old: ProfilePt[], pts: ProfilePt[]): ProfilePt[] {
  return pts.map((q, i) => {
    if (!q.s || i + 1 >= pts.length) return q;
    const chord = (a: ProfilePt, b: ProfilePt) => Math.hypot(b.u - a.u, b.v - a.v);
    const c0 = chord(old[i]!, old[i + 1]!);
    const c1 = chord(q, pts[i + 1]!);
    const s = c0 > 1e-6 ? (q.s * c1) / c0 : q.s;
    return { ...q, s: r1(Math.max(-c1 / 2, Math.min(c1 / 2, s))) };
  });
}

/**
 * Výstupek leží na stěně (i s oblouky), nepřekrývá souseda na stejném líci a vybrání nejde přes celou tloušťku.
 */
export function protrusionFits(floor: Floor, p: Protrusion): boolean {
  const w = floor.walls[p.wallId];
  const f = w && wallFrame(floor, w);
  if (!w || !f) return false;
  const ext = protrusionExtent(p);
  const overlaps = protrusionsOf(floor).some(o => {
    if (o.id === p.id || o.wallId !== p.wallId || o.side !== p.side) return false;
    const e = protrusionExtent(o);
    return e.u0 < ext.u1 - 0.5 && e.u1 > ext.u0 + 0.5;
  });
  if (overlaps || ext.u0 < -0.5 || ext.u1 > f.len + 0.5) return false;
  return !(p.mode === 'subtract' && ext.depth > w.thickness + 0.5);
}

/**
 * Přenese výstupky stěny `fromId` na stěnu `toId` (sloučení, rozdělení): nová poloha podél stěny `mapU`,
 * `flip` = stěny mají opačný směr (líc se přehodí). `filter` vybere jen některé výstupky.
 */
export function moveProtrusions(floor: Floor, fromId: Id, toId: Id, mapU: (u: number) => number, flip = false, filter: (p: Protrusion) => boolean = () => true): void {
  for (const p of protrusionsOf(floor)) {
    if (p.wallId !== fromId || !filter(p)) continue;
    p.wallId = toId;
    // obrácený směr stěny = zrcadlení v souřadnicích u, v → vzepětí oblouků opačně
    p.pts = p.pts.map(q => ({ ...q, u: r1(mapU(q.u)), ...(flip && q.s ? { s: -q.s } : {}) }));
    if (flip) p.side = p.side === 1 ? -1 : 1;
  }
}

/** Strana vyklenutí nového oblouku na úseku `seg`: ven od plochy výstupku (od středu obrysu). */
export function defaultArcSign(floor: Floor, id: Id, seg: number): 1 | -1 {
  const p = floor.protrusions?.[id];
  const a = p?.pts[seg];
  const b = p?.pts[seg + 1];
  if (!p || !a || !b) return 1;
  const cu = p.pts.reduce((s, q) => s + q.u, 0) / p.pts.length;
  const cv = p.pts.reduce((s, q) => s + q.v, 0) / p.pts.length;
  const h = ((a.u + b.u) / 2 - cu) * -(b.v - a.v) + ((a.v + b.v) / 2 - cv) * (b.u - a.u);
  return h >= 0 ? 1 : -1;
}
