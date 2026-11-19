/**
 * Oříznout / Prodloužit čáru kresby ťuknutím (požadavek uživatele 2026-11-19, jako Trim / Extend ve Fusion 360).
 *
 * - Oříznout: ťuknutý kus rovného úseku čáry mezi nejbližšími průsečíky s jinými čarami (kresba, líce a čela stěn,
 *   čáry stěn bez tloušťky, obrysy schodišť) zmizí; bez průsečíku zmizí celý úsek (k vrcholům čáry).
 *   Otevřená čára se může rozpadnout na dvě, uzavřená (i obdélník) se otevře.
 * - Prodloužit: ťuknutý koncový úsek otevřené čáry se prodlouží od bližšího konce k nejbližší čáře v jeho směru.
 *
 * Mění jen kresbu (Floor.drawings) – stěny, otvory ani schodiště nikdy. Jen lomená čára a obdélník; oblouky v čáře,
 * kruh, oblouk a dvojitá čára se neořezávají (hlášení). Bez DOM.
 */
import type { DimEnd, Drawing, DrawPt, Floor, Id, Pt } from '../model/types';
import { drawSeg, drawSegCount } from './dimRefs';
import { drawingPolylines, drawingsOf } from './drawing';
import { add, dist, projectToSegment, scale, sub } from './geometry';
import { stairOutlines, stairsOf } from './stairs';
import { wallBodies } from './wallBody';
import { arcPolyline } from './arc';

/** Body blíž než toto (mm) jsou jeden bod (vrchol čáry nepočítá jako průsečík). */
const EPS = 1;

export type TrimFail = 'notLine' | 'arcSeg' | 'notEnd' | 'closed' | 'none' | 'blocked';

export const TRIM_FAIL_TEXT: Record<TrimFail, string> = {
  notLine: 'Ořezat a prodloužit jde jen čáru a obdélník kresby.',
  arcSeg: 'Oblouk v čáře se neořezává – ťukni na rovný úsek.',
  notEnd: 'Prodloužit jde jen koncový úsek otevřené čáry – ťukni blízko konce.',
  closed: 'Uzavřená čára nemá volný konec k prodloužení.',
  none: 'V tomto směru není žádná čára, ke které prodloužit.',
  blocked: 'Úpravě brání zamčená kóta (viz hlášení nahoře).'
};

/** Ořezávací hrany: úsečky všech čar výkresu (kresba, stěny, schodiště); `owner` = kresba, ke které úsečka patří. */
export function cutEdges(floor: Floor): { owner: Id | null; a: Pt; b: Pt }[] {
  // výkres je po úpravě zmrazený (immer) – hrany se počítají jednou na verzi výkresu (náhled při každém pohybu pera)
  const cached = edgeCache.get(floor);
  if (cached) return cached;
  const out: { owner: Id | null; a: Pt; b: Pt }[] = [];
  const poly = (owner: Id | null, pts: readonly Pt[], closed: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) out.push({ owner, a: pts[i]!, b: pts[i + 1]! });
    if (closed && pts.length > 2) out.push({ owner, a: pts[pts.length - 1]!, b: pts[0]! });
  };
  for (const d of drawingsOf(floor)) for (const pl of drawingPolylines(d)) poly(d.id, pl, false);
  for (const b of wallBodies(floor).values()) for (const [p, q] of b.edges) out.push({ owner: null, a: p, b: q });
  for (const w of Object.values(floor.walls)) {
    if (w.thickness > 0 || w.a === w.b) continue; // čára stěny bez tloušťky
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (a && b) poly(null, w.sagitta ? arcPolyline(a, b, w.sagitta, 32) : [a, b], false);
  }
  for (const s of stairsOf(floor)) for (const pl of stairOutlines(s)) poly(null, pl, true);
  if (Object.isFrozen(floor)) edgeCache.set(floor, out);
  return out;
}

const edgeCache = new WeakMap<Floor, { owner: Id | null; a: Pt; b: Pt }[]>();

/** Průsečík úsečky p→q (parametr t) s úsečkou a–b; null mimo / rovnoběžně. */
function hit(p: Pt, q: Pt, a: Pt, b: Pt, ray = false): number | null {
  const d = sub(q, p);
  const e = sub(b, a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9 * Math.hypot(d.x, d.y) * Math.hypot(e.x, e.y)) return null;
  const w = sub(a, p);
  const t = (w.x * e.y - w.y * e.x) / den;
  const u = (w.x * d.y - w.y * d.x) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  if (!ray && (t < -1e-9 || t > 1 + 1e-9)) return null;
  return t;
}

/** Body čáry jako lomená čára s uzavřením (obdélník = uzavřená čára). */
function linePts(d: Drawing): { pts: DrawPt[]; closed: boolean } | null {
  if (d.shape === 'rect') return { pts: d.pts.map(p => ({ x: p.x, y: p.y })), closed: true };
  if (d.shape === 'line') return { pts: d.pts.map(p => ({ ...p })), closed: !!d.closed };
  return null;
}

/** Úsek čáry nejblíž bodu p (index i = od bodu i k bodu i + 1, u uzavřené i poslední k prvnímu). */
function nearestSeg(pts: readonly DrawPt[], closed: boolean, p: Pt): number {
  const n = closed ? pts.length : pts.length - 1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = projectToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!).distance;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Plán oříznutí: úsek i, mizí kus mezi parametry t0 < t1 (body `from` → `to`). */
export interface TrimPiece {
  i: number;
  t0: number;
  t1: number;
  from: Pt;
  to: Pt;
}

export function trimPiece(floor: Floor, d: Drawing, p: Pt): TrimPiece | TrimFail {
  const lp = linePts(d);
  if (!lp || lp.pts.length < 2) return 'notLine';
  const { pts, closed } = lp;
  const i = nearestSeg(pts, closed, p);
  const a = pts[i]!;
  const b = pts[(i + 1) % pts.length]!;
  if (a.s) return 'arcSeg';
  const len = dist(a, b);
  if (len < EPS) return 'notLine';
  const tp = projectToSegment(p, a, b).t;
  let t0 = 0;
  let t1 = 1;
  for (const e of cutEdges(floor)) {
    // úsek sám sebe neřeže (vlastní úseky kresby se porovnají podle polohy)
    if (e.owner === d.id && projectToSegment(e.a, a, b).distance < 1e-6 && projectToSegment(e.b, a, b).distance < 1e-6) continue;
    const t = hit(a, b, e.a, e.b);
    if (t === null || t * len < EPS || (1 - t) * len < EPS) continue;
    if (t < tp && t > t0) t0 = t;
    if (t > tp && t < t1) t1 = t;
  }
  const at = (t: number): Pt => add(a, scale(sub(b, a), t));
  return { i, t0, t1, from: at(t0), to: at(t1) };
}

/**
 * Oříznutí čáry: vrací nové body kresby (jedna nebo dvě otevřené čáry); prázdné pole = kresba zmizí celá.
 * Bod u nového konce nemá vzepětí (úsek za ním je rovný kus ořezaného úseku).
 */
export function applyTrim(d: Drawing, piece: TrimPiece): DrawPt[][] {
  const lp = linePts(d)!;
  const { pts, closed } = lp;
  const { i, t0, t1, from, to } = piece;
  const P = (q: Pt): DrawPt => ({ x: q.x, y: q.y });
  const tidy = (line: DrawPt[]): DrawPt[] | null => {
    const out: DrawPt[] = [];
    for (const q of line) if (!out.length || dist(out[out.length - 1]!, q) >= EPS) out.push(q);
    if (out.length < 2) return null;
    delete out[out.length - 1]!.s;
    return out;
  };
  if (closed) {
    // otevře se: začíná za ořezaným kusem, vede kolem dokola a končí před ním
    const n = pts.length;
    const ring: DrawPt[] = [];
    if (t1 < 1) ring.push(P(to));
    for (let k = 1; k <= n; k++) ring.push({ ...pts[(i + k) % n]! });
    const last = ring[ring.length - 1]!; // = pts[i]
    if (t0 > 0) {
      delete last.s;
      ring.push(P(from));
    }
    const r = tidy(ring);
    return r ? [r] : [];
  }
  const left = pts.slice(0, i + 1).map(q => ({ ...q }));
  if (t0 > 0) {
    delete left[left.length - 1]!.s;
    left.push(P(from));
  }
  const right = pts.slice(i + 1).map(q => ({ ...q }));
  if (t1 < 1) right.unshift(P(to));
  return [tidy(left), tidy(right)].filter((x): x is DrawPt[] => !!x);
}

/** Plán prodloužení: konec `end` (0 = první bod, 1 = poslední) se posune do bodu `to`. */
export interface ExtendPlan {
  end: 0 | 1;
  from: Pt;
  to: Pt;
}

export function extendPlan(floor: Floor, d: Drawing, p: Pt): ExtendPlan | TrimFail {
  const lp = linePts(d);
  if (!lp || lp.pts.length < 2) return 'notLine';
  if (lp.closed) return 'closed';
  const { pts } = lp;
  const n = pts.length;
  const i = nearestSeg(pts, false, p);
  let end: 0 | 1;
  if (n === 2) end = dist(p, pts[0]!) < dist(p, pts[1]!) ? 0 : 1;
  else if (i === 0) end = 0;
  else if (i === n - 2) end = 1;
  else return 'notEnd';
  const e = end ? pts[n - 1]! : pts[0]!;
  const prev = end ? pts[n - 2]! : pts[1]!;
  if ((end ? prev : e).s) return 'arcSeg';
  const len = dist(prev, e);
  if (len < EPS) return 'none';
  let best = Infinity;
  for (const c of cutEdges(floor)) {
    const t = hit(prev, e, c.a, c.b, true); // parametr na přímce prev → e (1 = konec)
    if (t === null) continue;
    const beyond = (t - 1) * len;
    if (beyond > EPS && beyond < best) best = beyond;
  }
  if (!Number.isFinite(best)) return 'none';
  return { end, from: { x: e.x, y: e.y }, to: add(e, scale(sub(e, prev), best / len)) };
}

/**
 * Volné kóty navázané na ořezanou kresbu `old` (Floor.dims), která se nahradila kresbami `parts` (nová id – obecné
 * znovunapojení kót v store.edit je tak nechá být): bod kresby → vrchol ve stejném místě; úsek → úsek na stejné
 * přímce, na kterém dál leží místo dosednutí kóty (`at` se přepočítá). Jinak kóta zanikne (místo zmizelo s ořezaným
 * kusem) – nikdy nepřeskočí na jinou hranu. Zamčená kóta zaniknout nesmí → false (oříznutí se neprovede).
 */
export function remapTrimDims(floor: Floor, old: Drawing, parts: readonly Drawing[]): boolean {
  if (!floor.dims) return true;
  const findPoint = (p: Pt): DimEnd | null => {
    for (const d of parts) {
      const i = d.pts.findIndex(q => dist(q, p) <= 0.5);
      if (i >= 0) return { drawing: d.id, i };
    }
    return null;
  };
  const findSeg = (p0: Pt, p1: Pt, at: number): DimEnd | null => {
    const len = dist(p0, p1);
    if (len <= 0) return null;
    const anchor = add(p0, scale(sub(p1, p0), at / len));
    const onLine = (q: Pt) => Math.abs((p1.x - p0.x) * (q.y - p0.y) - (p1.y - p0.y) * (q.x - p0.x)) / len <= 0.5;
    for (const d of parts) {
      for (let i = 0; i < drawSegCount(d); i++) {
        const sq = drawSeg(d, i);
        if (!sq || !onLine(sq[0]) || !onLine(sq[1])) continue;
        const pr = projectToSegment(anchor, sq[0], sq[1]);
        if (pr.distance <= 0.5) return { seg: d.id, i, at: Math.round(dist(sq[0], pr.point) * 10) / 10 };
      }
    }
    return null;
  };
  for (const dim of Object.values(floor.dims)) {
    for (const k of ['a', 'b'] as const) {
      const e = dim[k];
      let next: DimEnd | null | undefined;
      if ('drawing' in e && e.drawing === old.id) {
        const p = old.pts[e.i];
        next = p ? findPoint(p) : null;
      } else if ('seg' in e && e.seg === old.id) {
        const sg = drawSeg(old, e.i);
        next = sg ? findSeg(sg[0], sg[1], e.at) : null;
      }
      if (next === undefined) continue;
      if (next) dim[k] = next;
      else {
        if (floor.dimLocks?.[`free-dim:${dim.id}`]) return false; // klíč jako dimKey({ kind: 'free-dim' })
        delete floor.dims[dim.id];
        break;
      }
    }
  }
  return true;
}
