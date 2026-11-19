/**
 * Konce volné kóty na obloucích (rozhodnutí uživatele 2026-11-19): bod na oblouku (líc obloukové stěny, oblouk kresby;
 * vrchol přednostně) a střed oblouku. Měří se k bodu (od rovné hrany kolmo). Část `core/dimRefs.ts` (geometrie a
 * hledání konců kót) – nový druh oblouku pro kótování přidat sem.
 */
import type { DimEnd, Drawing, Floor, Id, Pt, Wall } from '../model/types';
import { dist } from './geometry';
import { faceOffset } from './protrusion';
import { hasBody } from './wallFace';
import { drawingPaths } from './drawing';
import { arcGeometry, nearestOnArc, type ArcGeometry } from './arc';

/** Posun líce `side` od osy (0 = osa / čára stěny bez tloušťky). */
export const offOf = (w: Wall, side: 1 | -1 | 0) => (side === 0 || !hasBody(w) ? 0 : faceOffset(w, side));

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Oblouk pro kóty: tětiva a→b + vzepětí; `off` = posun líce od osy (u stěny), kladně na normal(tečny). */
export interface ArcRef {
  a: Pt;
  b: Pt;
  s: number;
  off: number;
}

/** Oblouková stěna (ne kruh, ne rovná), líc `side`. */
export function wallArc(floor: Floor, w: Wall | undefined, side: 1 | -1 | 0): ArcRef | null {
  if (!w || !w.sagitta || w.radius !== undefined) return null;
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  return a && b && dist(a, b) >= 1 ? { a, b, s: w.sagitta, off: offOf(w, side) } : null;
}

/** Obloukový úsek `i` kresby (úseky jako `drawingPaths`, kruh = 2 půlkruhy); null = úsek není oblouk. */
export function drawArc(dr: Drawing | undefined, i: number): ArcRef | null {
  const sg = dr ? drawingPaths(dr).flat()[i] : undefined;
  return sg && sg.s && dist(sg.a, sg.b) >= 1 ? { a: sg.a, b: sg.b, s: sg.s, off: 0 } : null;
}

export const drawArcCount = (dr: Drawing): number => drawingPaths(dr).flat().length;

/** Poloměr líce (soustředný s osou); null = líc by prošel středem. */
export function faceRadius(g: ArcGeometry, off: number): number | null {
  const r = g.r - Math.sign(g.sweep) * off;
  return r > 1 ? r : null;
}

/** Bod líce oblouku `at` mm po ose od začátku; null = mimo oblouk (± 0,5 mm). */
export function arcPointAt(arc: ArcRef, at: number): Pt | null {
  const g = arcGeometry(arc.a, arc.b, arc.s);
  const rf = g && faceRadius(g, arc.off);
  if (!g || !rf) return null;
  const len = g.r * Math.abs(g.sweep);
  if (at < -0.5 || at > len + 0.5) return null;
  const ang = g.start + Math.sign(g.sweep) * (Math.max(0, Math.min(len, at)) / g.r);
  return { x: g.center.x + rf * Math.cos(ang), y: g.center.y + rf * Math.sin(ang) };
}

/** Nejbližší bod líce oblouku k p: poloha `at` (mm po ose), bod, vzdálenost; vrchol = `apex`. */
export function nearestOnArcRef(arc: ArcRef, p: Pt): { at: number; point: Pt; distance: number; apex: Pt } | null {
  const g = arcGeometry(arc.a, arc.b, arc.s);
  if (!g || !faceRadius(g, arc.off)) return null;
  const len = g.r * Math.abs(g.sweep);
  const at = nearestOnArc(p, arc.a, arc.b, arc.s).t * len; // soustředné – úhel je pro osu i líc stejný
  const point = arcPointAt(arc, at);
  const apex = arcPointAt(arc, len / 2);
  return point && apex ? { at, point, distance: dist(p, point), apex } : null;
}

/** Střed oblouku konce `center` (stěna, nebo úsek `i` kresby). */
export function centerOf(floor: Floor, e: { center: Id; i?: number }): Pt | null {
  const arc = e.i === undefined ? wallArc(floor, floor.walls[e.center], 0) : drawArc(floor.drawings?.[e.center], e.i);
  return (arc && arcGeometry(arc.a, arc.b, arc.s)?.center) ?? null;
}

/** Všechny oblouky výkresu pro kóty: konec kóty k bodu na oblouku + jeho střed. */
export function arcsOf(floor: Floor): { arc: ArcRef; end: (at: number) => DimEnd; center: DimEnd }[] {
  const out: { arc: ArcRef; end: (at: number) => DimEnd; center: DimEnd }[] = [];
  for (const w of Object.values(floor.walls)) {
    const sides: (1 | -1 | 0)[] = hasBody(w) ? [1, -1] : [0];
    for (const side of sides) {
      const arc = wallArc(floor, w, side);
      if (arc) out.push({ arc, end: at => ({ arcWall: w.id, side, at }), center: { center: w.id } });
    }
  }
  for (const dr of Object.values(floor.drawings ?? {})) {
    for (let i = 0; i < drawArcCount(dr); i++) {
      const arc = drawArc(dr, i);
      // střed kruhu je bod kresby (pts[0]) – vlastní konec `center` jen u oblouku
      if (arc) out.push({ arc, end: at => ({ arcSeg: dr.id, i, at }), center: dr.shape === 'circle' ? { drawing: dr.id, i: 0 } : { center: dr.id, i } });
    }
  }
  return out;
}

/** Bod na oblouku nejblíž k p (do `tol`) – i pro znovunapojení kóty po úpravě (core/freeDim.ts). */
export function arcEndAt(floor: Floor, p: Pt, tol: number): DimEnd | null {
  let best: DimEnd | null = null;
  let bestD = tol;
  for (const { arc, end } of arcsOf(floor)) {
    const h = nearestOnArcRef(arc, p);
    if (h && h.distance <= bestD) {
      best = end(r1(h.at));
      bestD = h.distance;
    }
  }
  return best;
}

/** Střed oblouku v místě p (do `tol`) – znovunapojení kóty po úpravě (core/freeDim.ts). */
export function centerEndAt(floor: Floor, p: Pt, tol: number): DimEnd | null {
  for (const { arc, center } of arcsOf(floor)) {
    const g = arcGeometry(arc.a, arc.b, arc.s);
    if (g && dist(g.center, p) <= tol) return center;
  }
  return null;
}

/** Oblouk konce kóty (bod na oblouku stěny / kresby, střed); null = prvek zanikl nebo už není oblouk. */
function arcOfEnd(floor: Floor, e: DimEnd): ArcRef | null {
  if ('arcWall' in e) return wallArc(floor, floor.walls[e.arcWall], e.side);
  if ('arcSeg' in e) return drawArc(floor.drawings?.[e.arcSeg], e.i);
  if ('center' in e) return e.i === undefined ? wallArc(floor, floor.walls[e.center], 0) : drawArc(floor.drawings?.[e.center], e.i);
  return null;
}

const samePt = (p: Pt, q: Pt) => dist(p, q) <= 0.5;
const sameArc = (x: ArcRef, y: ArcRef) => samePt(x.a, y.a) && samePt(x.b, y.b) && Math.abs(x.s - y.s) <= 0.5;
const arcLen = (g: ArcGeometry) => g.r * Math.abs(g.sweep);

/**
 * Znovunapojení konce na oblouku po úpravě `before` → `after` (volá `rescueFreeDims` v core/freeDim.ts); null = beze
 * změny (nebo nic – konec, který nejde spočítat, kóta zanikne úklidem):
 * - kresba: úsek se přečísloval (přidaný / smazaný vrchol) → úsek se stejnými body,
 * - oblouk se jen zkrátil / rozdělil (stejný střed a poloměr): bod zůstane na místě; když je teď na jiném oblouku
 *   (druhá část po dělení) → ten oblouk,
 * - oblouk změnil tvar (vzepětí, posun rohu): bod se posune úměrně po délce oblouku,
 * - stěna se narovnala: líc rovné stěny (úměrně po tětivě),
 * - střed: střed oblouku ve stejném místě.
 */
export function rescueArcEnd(before: Floor, after: Floor, e: DimEnd): DimEnd | null {
  const oldArc = arcOfEnd(before, e);
  const oldG = oldArc && arcGeometry(oldArc.a, oldArc.b, oldArc.s);
  if (!oldArc || !oldG) return null;
  let cur = e;
  // úsek kresby se stejnými body pod jiným číslem
  const drId = 'arcSeg' in e ? e.arcSeg : 'center' in e && e.i !== undefined ? e.center : null;
  const dr = drId ? after.drawings?.[drId] : undefined;
  if (dr && 'i' in e && e.i !== undefined) {
    const now = drawArc(dr, e.i);
    if (!now || !sameArc(now, oldArc)) {
      for (let j = 0; j < drawArcCount(dr); j++) {
        const c = drawArc(dr, j);
        if (c && sameArc(c, oldArc)) {
          cur = { ...e, i: j } as DimEnd;
          break;
        }
      }
    }
  }
  if ('center' in cur) {
    if (arcOfEnd(after, cur)) return cur === e ? null : cur;
    return centerEndAt(after, oldG.center, 0.5);
  }
  if (!('arcWall' in cur) && !('arcSeg' in cur)) return null;
  const at = cur.at;
  const oldPt = arcPointAt(oldArc, at);
  if (!oldPt) return null;
  const changed = (x: DimEnd) => (x === e ? null : x);
  const newArc = arcOfEnd(after, cur);
  const newG = newArc && arcGeometry(newArc.a, newArc.b, newArc.s);
  if (newArc && newG) {
    if (samePt(newG.center, oldG.center) && Math.abs(newG.r - oldG.r) <= 0.5) {
      const h = nearestOnArcRef(newArc, oldPt);
      if (h && h.distance <= 0.5) return Math.abs(h.at - at) > 0.05 ? { ...cur, at: r1(h.at) } : changed(cur);
      return arcEndAt(after, oldPt, 0.5);
    }
    const k = arcLen(oldG) > 0 ? at / arcLen(oldG) : 0;
    const nat = r1(k * arcLen(newG));
    return Math.abs(nat - at) > 0.05 ? { ...cur, at: nat } : changed(cur);
  }
  if ('arcWall' in cur) {
    const w = after.walls[cur.arcWall];
    const a = w && after.nodes[w.a];
    const b = w && after.nodes[w.b];
    // narovnaná stěna → líc rovné stěny (bod úměrně po tětivě)
    if (w && a && b && !w.sagitta && w.radius === undefined) return { wall: w.id, side: cur.side, at: r1((at / arcLen(oldG)) * dist(a, b)) };
  }
  return arcEndAt(after, oldPt, 0.5);
}
