/**
 * Výstupek přes volný konec stěny (KATALOG-STEN.md I1.11; rozhodnutí uživatele 2026-11-15: čárami z líce kolem čela
 * na protější líc, drží se konce stěny).
 *
 * Souřadnice konce: E = roh na konci stěny, e1 = směr od čela dovnitř stěny; líc f (0 = začáteční `side`,
 * 1 = protější) má počátek E + normal(a→b)·faceOffset a směr ven n_f. Bod p = O_f + s·e1 + v·n_f.
 * Konec musí být volný (nenapojuje se na něj jiná stěna) a stěna rovná s tělem – jinak se výstupek nekreslí.
 */
import type { EndProtrusion, EndPt, Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { faceOffset, findFaceNear, wallFrame } from './protrusion';
import { hasBody } from './wallFace';
import { findBodyAt } from './wallBody';

/** Výstupky na konci stěny (pole chybí u starších dat). */
export const endProtrusionsOf = (floor: Floor): EndProtrusion[] => Object.values(floor.endProtrusions ?? {});

export interface EndFrame {
  /** Roh na konci stěny. */
  E: Pt;
  /** Směr od čela dovnitř stěny. */
  e1: Pt;
  /** Počátek a směr ven obou líců: [0] = začáteční (side), [1] = protější. */
  O: [Pt, Pt];
  n: [Pt, Pt];
}

/** Je konec `end` stěny volný (v rohu není jiná stěna, roh není napojený doprostřed jiné stěny)? */
function freeEnd(floor: Floor, w: Wall, end: 'a' | 'b'): boolean {
  const id = end === 'a' ? w.a : w.b;
  const node = floor.nodes[id];
  if (!node || node.host) return false;
  // roh jiné stěny ve stejném místě (oddělený konec C1.13 dosedající na sousední stěnu) – konec není volný
  return !Object.values(floor.walls).some(o => o.id !== w.id && [o.a, o.b].some(n => n === id || (floor.nodes[n] && dist(floor.nodes[n]!, node) < 1)));
}

/** Souřadnice konce; null = stěna není rovná s tělem nebo konec není volný (výstupek se nekreslí). */
export function endFrame(floor: Floor, ep: Pick<EndProtrusion, 'wallId' | 'end' | 'side'>): EndFrame | null {
  const w = floor.walls[ep.wallId];
  if (!w || !hasBody(w) || w.sagitta || !freeEnd(floor, w, ep.end)) return null;
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1) return null;
  const ab = unit(a, b);
  const E = ep.end === 'a' ? a : b;
  const e1 = ep.end === 'a' ? ab : scale(ab, -1);
  const nm = normal(ab);
  const sides = [ep.side, ep.side === 1 ? -1 : 1] as const;
  const O = sides.map(s => add(E, scale(nm, faceOffset(w, s)))) as [Pt, Pt];
  const n = sides.map(s => scale(nm, s)) as [Pt, Pt];
  return { E: { x: E.x, y: E.y }, e1, O, n };
}

export const endToWorld = (f: EndFrame, q: EndPt): Pt => add(f.O[q.f], add(scale(f.e1, q.s), scale(f.n[q.f], q.v)));

/** Bod výkresu → souřadnice vůči líci `fi`. */
const toFace = (f: EndFrame, p: Pt, fi: 0 | 1): EndPt => ({ s: dot(sub(p, f.O[fi]), f.e1), v: dot(sub(p, f.O[fi]), f.n[fi]), f: fi });

/** Obrys ve výkresu; null = konec už není volný / stěna se změnila (výstupek se nekreslí). */
export function endOutline(floor: Floor, ep: EndProtrusion): Pt[] | null {
  const f = endFrame(floor, ep);
  return f ? ep.pts.map(q => endToWorld(f, q)) : null;
}

/** Hloubka obrysu od čela podél stěny dovnitř (nejvzdálenější bod na lících) – rozsah na stěně od konce. */
export const endReach = (ep: EndProtrusion): number => Math.max(0, ...ep.pts.map(q => q.s));

/**
 * Lomená čára z líce stěny kolem jejího volného konce na protější líc, vedená mimo tělo → výstupek na konci stěny.
 * Jinak null.
 */
export function endFromPolyline(floor: Floor, pts: readonly Pt[], tol = 1.5): Omit<EndProtrusion, 'id' | 'name' | 'material' | 'note'> | null {
  if (pts.length < 3) return null;
  const s = findFaceNear(floor, pts[0]!, tol);
  const e = findFaceNear(floor, pts[pts.length - 1]!, tol);
  if (!s || !e || s.wall.id !== e.wall.id || s.side === e.side) return null;
  const w = s.wall;
  const fr = wallFrame(floor, w);
  if (!fr || w.sagitta) return null;
  // konec, kolem jehož čela čára vede: některý bod leží za ním
  const us = pts.map(p => fr.project(p).u);
  const end: 'a' | 'b' | null = us.some(u => u < -tol) ? 'a' : us.some(u => u > fr.len + tol) ? 'b' : null;
  if (!end || (end === 'a' && us.some(u => u > fr.len + tol)) || (end === 'b' && us.some(u => u < -tol))) return null;
  const base = { wallId: w.id, end, side: s.side };
  const f = endFrame(floor, base);
  if (!f) return null;
  // čára mimo tělo: vnitřní body i středy úseků
  for (let i = 0; i + 1 < pts.length; i++) {
    if (findBodyAt(floor, scale(add(pts[i]!, pts[i + 1]!), 0.5))) return null;
    if (i > 0 && findBodyAt(floor, pts[i]!)) return null;
  }
  const T = Math.abs(faceOffset(w, 1) - faceOffset(w, -1));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const q = pts.map((p, i): EndPt => {
    if (i === 0) return { ...toFace(f, p, 0), v: 0 };
    if (i === pts.length - 1) return { ...toFace(f, p, 1), v: 0 };
    // bod patří líci, ke kterému má blíž (po změně tloušťky jede s ním)
    const v0 = toFace(f, p, 0).v;
    return v0 >= -T / 2 ? toFace(f, p, 0) : toFace(f, p, 1);
  });
  if (q[0]!.s < 10 || q[q.length - 1]!.s < 10) return null;
  return { ...base, pts: q.map(p => ({ s: r1(p.s), v: r1(p.v), f: p.f })) };
}

/** O kolik mm by obrys sahal za druhý konec stěny (pravidlo prvků nesených stěnou při změně délky). */
export function endOverhang(floor: Floor, wallId: Id): number {
  const fr = floor.walls[wallId] && wallFrame(floor, floor.walls[wallId]!);
  if (!fr) return 0;
  return Math.max(0, ...endProtrusionsOf(floor).filter(ep => ep.wallId === wallId).map(ep => endReach(ep) - fr.len));
}

/** Rozsah výstupku na konci podél stěny (mm od rohu A po ose). */
export function endSpan(floor: Floor, ep: EndProtrusion): [number, number] | null {
  const fr = floor.walls[ep.wallId] && wallFrame(floor, floor.walls[ep.wallId]!);
  if (!fr) return null;
  const r = endReach(ep);
  return ep.end === 'a' ? [0, r] : [fr.len - r, fr.len];
}


/** Kóty výstupku na konci: podél líce 0 / 1 (od čela dovnitř), přesah za čelo, hloubka od líce 0 / 1. */
export type EndDim = 'along0' | 'along1' | 'over' | 'depth0' | 'depth1';

/** Hodnoty kót výstupku na konci stěny (rozměry obrysu v souřadnicích konce; 0 = kóta není). */
export function endDims(ep: EndProtrusion): Record<EndDim, number> {
  const depth = (fi: 0 | 1) => Math.max(0, ...ep.pts.filter(q => q.f === fi).map(q => q.v));
  return {
    along0: Math.max(0, ep.pts[0]!.s),
    along1: Math.max(0, ep.pts[ep.pts.length - 1]!.s),
    over: Math.max(0, ...ep.pts.map(q => -q.s)),
    depth0: depth(0),
    depth1: depth(1)
  };
}

/**
 * Změní kótu výstupku na konci (mění se jen výstupek): body na dané straně rozměru se zvětší v poměru – podél líce
 * kladné `s` bodů toho líce, přesah záporné `s` všech bodů, hloubka kladné `v` bodů toho líce. false = nesmyslná hodnota.
 */
export function setEndDim(floor: Floor, id: Id, dim: EndDim, value: number): boolean {
  const ep = floor.endProtrusions?.[id];
  if (!ep || !Number.isFinite(value) || value < (dim === 'over' ? 1 : 10)) return false;
  const cur = endDims(ep)[dim];
  if (cur < 1e-6) return false;
  const k = value / cur;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const fi = dim.endsWith('0') ? 0 : 1;
  ep.pts = ep.pts.map(q => {
    if (dim === 'over') return q.s < 0 ? { ...q, s: r1(q.s * k) } : q;
    if (q.f !== fi) return q;
    if (dim === 'along0' || dim === 'along1') return q.s > 0 ? { ...q, s: r1(q.s * k) } : q;
    return q.v > 0 ? { ...q, v: r1(q.v * k) } : q;
  });
  return true;
}
