/**
 * Výstupek / vybrání stěny (KATALOG-STEN.md, sekce I): geometrie v souřadnicích stěny, rozpoznání obrysu
 * nakresleného čarou s oběma konci na líci, kóty (šířka, hloubka, odstupy) a jejich změna.
 *
 * Souřadnice obrysu: u = mm podél osy stěny od rohu A, v = mm kolmo od líce (kladně ven od těla).
 * Líc `side` leží na posunu `faceOffset` podél normal(a→b) (stejně jako `bodyRange`).
 */
import type { Floor, Id, ProfilePt, Protrusion, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { bodyRange, hasBody } from './wallBody';

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
  return f ? p.pts.map(q => profileToWorld(f, w, p.side, q)) : null;
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
  const us = p.pts.map(q => q.u);
  return { u0: Math.min(...us), u1: Math.max(...us), depth: Math.max(...p.pts.map(q => Math.abs(q.v))) };
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
    p.pts = p.pts.map(q => ({ u: r1(u0 + (q.u - u0) * k), v: q.v }));
  } else if (dim === 'depth') {
    if (value < 1 || depth < 1e-6 || (p.mode === 'subtract' && value > w.thickness)) return false;
    const k = value / depth;
    p.pts = p.pts.map(q => ({ u: q.u, v: r1(q.v * k) }));
  } else {
    if (value < 0) return false;
    const shift = dim === 'before' ? value - cur.before : cur.after - value;
    p.pts = p.pts.map(q => ({ u: r1(q.u + shift), v: q.v }));
  }
  // výstupek musí zůstat na stěně a nepřekrýt souseda (odstupy ≥ 0)
  const ext = protrusionExtent(p);
  const overlaps = protrusionsOf(floor).some(o => {
    if (o.id === p.id || o.wallId !== p.wallId || o.side !== p.side) return false;
    const e = protrusionExtent(o);
    return e.u0 < ext.u1 - 0.5 && e.u1 > ext.u0 + 0.5;
  });
  if (overlaps || ext.u0 < -0.5 || ext.u1 > wallFrame(floor, w)!.len + 0.5) {
    p.pts = before;
    return false;
  }
  return true;
}

/**
 * Přenese výstupky stěny `fromId` na stěnu `toId` (sloučení, rozdělení): nová poloha podél stěny `mapU`,
 * `flip` = stěny mají opačný směr (líc se přehodí). `filter` vybere jen některé výstupky.
 */
export function moveProtrusions(floor: Floor, fromId: Id, toId: Id, mapU: (u: number) => number, flip = false, filter: (p: Protrusion) => boolean = () => true): void {
  for (const p of protrusionsOf(floor)) {
    if (p.wallId !== fromId || !filter(p)) continue;
    p.wallId = toId;
    p.pts = p.pts.map(q => ({ u: r1(mapU(q.u)), v: q.v }));
    if (flip) p.side = p.side === 1 ? -1 : 1;
  }
}
