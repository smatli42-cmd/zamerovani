/**
 * Kóty a úpravy rozměrů výstupku / vybrání (KATALOG-STEN.md, sekce I): úchyty a vzepětí oblouků obrysu,
 * sousedé na líci, šířka, hloubka a odstupy a jejich změna, kontrola, že výstupek leží na stěně.
 * Geometrie výstupku: core/protrusion.ts.
 */
import type { Floor, Id, ProfilePt, Protrusion, Pt } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { cornersOf, faceOffset, protrusionExtent, protrusionsOf, r1, wallFrame } from './protrusion';
import { wallOverlap } from './wallSpans';

/** Úchyty vzepětí: vrchol (střed) každého úseku obrysu, který neleží na líci; `seg` = index úseku. */
export function protrusionArcHandles(floor: Floor, p: Protrusion): { seg: number; at: Pt; chordMid: Pt }[] {
  const c = cornersOf(floor, p);
  if (!c) return [];
  const out: { seg: number; at: Pt; chordMid: Pt }[] = [];
  for (let i = 0; i + 1 < p.pts.length; i++) {
    if (Math.abs(p.pts[i]!.v) < 0.5 && Math.abs(p.pts[i + 1]!.v) < 0.5) continue; // úsek po líci
    const A = c.pts[i]!;
    const B = c.pts[i + 1]!;
    if (dist(A, B) < 1) continue;
    const mid = scale(add(A, B), 0.5);
    out.push({ seg: i, at: add(mid, scale(normal(unit(A, B)), (p.pts[i]!.s ?? 0) * p.side)), chordMid: mid });
  }
  return out;
}

/** Vzepětí úseku `seg` podle bodu výkresu (vzdálenost od tětivy se znaménkem, po 10 mm; < 10 mm = rovný). */
export function sagittaFromPoint(floor: Floor, p: Protrusion, seg: number, at: Pt): number | null {
  const c = cornersOf(floor, p);
  const A = c?.pts[seg];
  const B = c?.pts[seg + 1];
  if (!c || !A || !B) return null;
  const len = dist(A, B) || 1;
  const h = dot(sub(at, scale(add(A, B), 0.5)), normal(unit(A, B))) * p.side;
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
  const c = cornersOf(floor, p);
  const half = c ? dist(c.pts[seg]!, c.pts[seg + 1]!) / 2 : Math.hypot(b.u - a.u, b.v - a.v) / 2;
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
  // šířka a odstupy po líci, ke kterému výstupek patří (I1.8; u oblouku jiná délka než po ose)
  const k = f.faceScale(faceOffset(w, p.side));
  return { width: (u1 - u0) * k, depth, before: (u0 - start) * k, after: (end - u1) * k };
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
  // zadané míry po líci → souřadnice u po ose
  const k = wallFrame(floor, w)?.faceScale(faceOffset(w, p.side)) ?? 1;
  if (dim === 'width') {
    if (value < 10 || cur.width < 1e-6) return false;
    const kw = value / cur.width;
    p.pts = rescaleArcs(before, before.map(q => ({ ...q, u: r1(u0 + (q.u - u0) * kw) })));
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
    const shift = (dim === 'before' ? value - cur.before : cur.after - value) / k;
    p.pts = before.map(q => ({ ...q, u: r1(q.u + shift) }));
  }
  if (!protrusionFits(floor, p)) {
    p.pts = before;
    return false;
  }
  return true;
}

/** Vzepětí oblouků úměrně změně délky jejich tětivy, nejvýš půlkruh. */
export function rescaleArcs(old: ProfilePt[], pts: ProfilePt[]): ProfilePt[] {
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
  // překryv s jiným výstupkem (na stěně, na konci stěny, v rohu) – jediné místo pravidla: core/wallSpans.ts
  if (wallOverlap(floor, p.wallId, p.id) > 0 || ext.u0 < -0.5 || ext.u1 > f.len + 0.5) return false;
  return !(p.mode === 'subtract' && ext.depth > w.thickness + 0.5);
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
