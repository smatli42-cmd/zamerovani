/**
 * Kresba – čistě grafické prvky (KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md, KRESLENI-PREKLADU.md).
 *
 * JEDINÉ místo pravidel kresby (samostatná čára, obdélník, kruh, oblouk, dvojitá čára):
 * - kresba je v `Floor.drawings`, nikdy ve `Floor.walls` → nikdy se nestane stěnou ani výstupkem
 *   (kód stěn a výstupků kresbu vůbec nevidí) a nikdy se nevyplní šedou (tělo stěny má jen `Wall`);
 * - co je uzavřený tvar a jde mu zapnout šrafu: `isClosedDrawing` / `canHatch`;
 * - geometrie pro kreslení, výběr, přichytávání a úpravy (úseky, obrys, zásah, úchyty, posun, otočení).
 * Přichycení při kreslení je jen pomůcka – kresba si nepamatuje stěnu, roh ani jinou kresbu.
 * Bez DOM (testovatelné); kreslení na plátno: canvas/drawDrawings.ts.
 */
import type { DrawColor, Drawing, DrawPt, Floor, HatchKind, Id, Pt } from '../model/types';
import { arcGeometry, arcPolyline, circlePolyline } from './arc';
import { add, dist, dot, normal, projectToSegment, scale, sub } from './geometry';
import { pointInPolygon } from './wallBody';

/** Barvy kresby (pro plátno i budoucí export). */
export const DRAW_COLORS: Record<DrawColor, string> = {
  black: '#0f172a',
  gray: '#71717a',
  red: '#dc2626',
  blue: '#1d4ed8',
  green: '#15803d'
};

export const DRAW_COLOR_LABELS: { v: DrawColor; label: string }[] = [
  { v: 'black', label: 'Černá' },
  { v: 'gray', label: 'Šedá' },
  { v: 'red', label: 'Červená' },
  { v: 'blue', label: 'Modrá' },
  { v: 'green', label: 'Zelená' }
];

export const HATCH_LABELS: { v: HatchKind; label: string }[] = [
  { v: 'diag', label: 'Šikmá' },
  { v: 'cross', label: 'Křížová' },
  { v: 'dots', label: 'Tečky' },
  { v: 'solid', label: 'Plná' }
];

/** Výchozí vzdálenost čar dvojité čáry (mm). */
export const DEFAULT_DOUBLE_WIDTH = 250;

/** Úsek kresby: úsečka nebo oblouk (vzepětí `s`, 0 = rovný). */
export interface DrawSeg {
  a: Pt;
  b: Pt;
  s: number;
}

export const drawingsOf = (floor: Floor): Drawing[] => Object.values(floor.drawings ?? {});

const P = (p: Pt): Pt => ({ x: p.x, y: p.y });

/** Druhá čára dvojité čáry (posun první o šířku na stranu `side`). */
export function doubleOffset(d: Drawing): [Pt, Pt] | null {
  const a = d.pts[0];
  const b = d.pts[1];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  const n = normal(scale(sub(b, a), 1 / dist(a, b)));
  const k = (d.side ?? 1) * (d.width ?? DEFAULT_DOUBLE_WIDTH);
  return [add(a, scale(n, k)), add(b, scale(n, k))];
}

/** Je kresba uzavřený tvar? (obdélník, kruh, lomená čára s koncem v počátku, dvojitá čára s uzavřenými konci) */
export function isClosedDrawing(d: Drawing): boolean {
  switch (d.shape) {
    case 'rect':
    case 'circle':
      return true;
    case 'line':
      return !!d.closed && (d.pts.length >= 3 || (d.pts.length === 2 && d.pts.some(p => p.s)));
    case 'double':
      return !!d.closedEnds;
    case 'arc':
      return false;
  }
}

/** Šrafa jde zapnout jen u uzavřeného tvaru. */
export const canHatch = isClosedDrawing;

/** Šrafa, která se opravdu kreslí (u otevřeného tvaru se uložená šrafa nekreslí). */
export const activeHatch = (d: Drawing): HatchKind | null => (d.hatch && canHatch(d) ? d.hatch : null);

/** Souvislé tahy kresby jako úseky (úsečky a oblouky). */
export function drawingPaths(d: Drawing): DrawSeg[][] {
  const pts = d.pts;
  switch (d.shape) {
    case 'circle': {
      const c = pts[0];
      const r = d.r ?? 0;
      if (!c || r <= 0) return [];
      const e = { x: c.x + r, y: c.y };
      const w = { x: c.x - r, y: c.y };
      return [[{ a: e, b: w, s: r }, { a: w, b: e, s: r }]];
    }
    case 'double': {
      const o = doubleOffset(d);
      if (!o) return [];
      const a = P(pts[0]!);
      const b = P(pts[1]!);
      if (d.closedEnds) return [[{ a, b, s: 0 }, { a: b, b: o[1], s: 0 }, { a: o[1], b: o[0], s: 0 }, { a: o[0], b: a, s: 0 }]];
      return [[{ a, b, s: 0 }], [{ a: o[0], b: o[1], s: 0 }]];
    }
    default: {
      const segs: DrawSeg[] = [];
      for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: P(pts[i]!), b: P(pts[i + 1]!), s: pts[i]!.s ?? 0 });
      const closed = d.shape === 'rect' || (d.shape === 'line' && d.closed);
      if (closed && pts.length >= 2) segs.push({ a: P(pts[pts.length - 1]!), b: P(pts[0]!), s: pts[pts.length - 1]!.s ?? 0 });
      return segs.length ? [segs] : [];
    }
  }
}

/** Tahy jako lomené čáry (oblouky rozložené na krátké úsečky) – kreslení, výběr, šrafa. */
export function drawingPolylines(d: Drawing): Pt[][] {
  if (d.shape === 'circle' && d.pts[0] && (d.r ?? 0) > 0) return [circlePolyline(d.pts[0], d.r!)];
  return drawingPaths(d).map(path => {
    const out: Pt[] = [];
    for (const sg of path) {
      const q = sg.s ? arcPolyline(sg.a, sg.b, sg.s, 32) : [sg.a, sg.b];
      out.push(...(out.length ? q.slice(1) : q));
    }
    return out;
  });
}

/** Obrys uzavřeného tvaru (mnohoúhelník) pro šrafu a výběr ťuknutím dovnitř; otevřená kresba = null. */
export function drawingOutline(d: Drawing): Pt[] | null {
  if (!isClosedDrawing(d)) return null;
  const pl = drawingPolylines(d)[0];
  if (!pl || pl.length < 3) return null;
  return dist(pl[0]!, pl[pl.length - 1]!) < 1e-6 ? pl.slice(0, -1) : pl;
}

/** Zásah kresby: u čáry (`edge`), uvnitř šrafovaného tvaru (`inside`), nebo nic. */
export function hitDrawing(d: Drawing, p: Pt, tol: number): 'edge' | 'inside' | null {
  for (const pl of drawingPolylines(d)) for (let i = 0; i + 1 < pl.length; i++) if (projectToSegment(p, pl[i]!, pl[i + 1]!).distance <= tol) return 'edge';
  const o = activeHatch(d) ? drawingOutline(d) : null;
  return o && pointInPolygon(p, o) ? 'inside' : null;
}

/** Nejvýše položená kresba pod bodem; `edgeOnly` = jen čára (vnitřek šrafy ne). */
export function pickDrawing(floor: Floor, p: Pt, tol: number, edgeOnly: boolean): Id | null {
  const all = drawingsOf(floor);
  for (let i = all.length - 1; i >= 0; i--) {
    const h = hitDrawing(all[i]!, p, tol);
    if (h === 'edge' || (h === 'inside' && !edgeOnly)) return all[i]!.id;
  }
  return null;
}

/** Body kresby pro přichytávání (vrcholy, středy úseků, vrcholy oblouků, střed a kvadranty kruhu, rohy dvojité čáry). */
export function drawingSnapPoints(d: Drawing): Pt[] {
  if (d.shape === 'circle') {
    const c = d.pts[0];
    const r = d.r ?? 0;
    return c ? [P(c), { x: c.x + r, y: c.y }, { x: c.x - r, y: c.y }, { x: c.x, y: c.y + r }, { x: c.x, y: c.y - r }] : [];
  }
  const out: Pt[] = [];
  for (const path of drawingPaths(d))
    for (const sg of path) {
      out.push(sg.a, sg.b);
      const g = sg.s ? arcGeometry(sg.a, sg.b, sg.s) : null;
      out.push(g ? g.apex : scale(add(sg.a, sg.b), 0.5));
    }
  return out;
}

/** Nejbližší bod kresby (pro přichycení) do vzdálenosti `tol`; `skip` = kresba, kterou právě upravujeme. */
export function findDrawingPointNear(floor: Floor, p: Pt, tol: number, skip?: Id): Pt | null {
  let best: Pt | null = null;
  let bestD = tol;
  for (const d of drawingsOf(floor)) {
    if (d.id === skip) continue;
    for (const q of drawingSnapPoints(d)) {
      const dd = dist(p, q);
      if (dd <= bestD) {
        best = q;
        bestD = dd;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- úchyty vybrané kresby

export type DrawHandle =
  /** Vrchol (u dvojité čáry 0/1 = konce první čáry). */
  | { kind: 'vertex'; i: number; at: Pt }
  /** Úchyt vzepětí úseku `seg` (lomená čára, oblouk). */
  | { kind: 'bulge'; seg: number; at: Pt }
  /** Bod na obvodu kruhu (poloměr). */
  | { kind: 'radius'; at: Pt }
  /** Střed druhé čáry dvojité čáry (vzdálenost čar). */
  | { kind: 'width'; at: Pt };

export function drawingHandles(d: Drawing): DrawHandle[] {
  if (d.shape === 'circle') {
    const c = d.pts[0];
    return c ? [{ kind: 'radius', at: { x: c.x + (d.r ?? 0), y: c.y } }] : [];
  }
  const out: DrawHandle[] = d.pts.map((p, i) => ({ kind: 'vertex' as const, i, at: P(p) }));
  if (d.shape === 'double') {
    const o = doubleOffset(d);
    if (o) out.push({ kind: 'width', at: scale(add(o[0], o[1]), 0.5) });
    return out;
  }
  if (d.shape === 'rect') return out;
  const segs = drawingPaths(d)[0] ?? [];
  segs.forEach((sg, seg) => {
    const g = sg.s ? arcGeometry(sg.a, sg.b, sg.s) : null;
    out.push({ kind: 'bulge', seg, at: g ? g.apex : scale(add(sg.a, sg.b), 0.5) });
  });
  return out;
}

/** Vzepětí úseku a→b, jehož vrchol má ležet u bodu p (se znaménkem, po 10 mm). */
export function sagittaTowards(a: Pt, b: Pt, p: Pt): number {
  const len = dist(a, b) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const h = Math.round(dot(sub(p, scale(add(a, b), 0.5)), n) / 10) * 10;
  // nejvýše půlkruh
  return Math.max(-len / 2, Math.min(len / 2, h));
}

/** Rozměry obdélníku (šířka = strana 0→1, výška = strana 1→2), nebo null, když už to není obdélník. */
export function rectSize(d: Drawing): { w: number; h: number } | null {
  if (d.shape !== 'rect' || d.pts.length !== 4) return null;
  const [p0, p1, p2, p3] = d.pts as [Pt, Pt, Pt, Pt];
  const e1 = sub(p1, p0);
  const e2 = sub(p3, p0);
  const w = Math.hypot(e1.x, e1.y);
  const h = Math.hypot(e2.x, e2.y);
  if (w < 1e-6 || h < 1e-6 || Math.abs(dot(e1, e2)) / (w * h) > 1e-3 || dist(add(p0, add(e1, e2)), p2) > 0.5) return null;
  return { w, h };
}

/** Rámec obdélníku: počátek p0 a jednotkové směry stran 0→1 a 0→3. */
function rectFrame(d: Drawing): { o: Pt; e1: Pt; e2: Pt } | null {
  const [p0, p1, , p3] = d.pts;
  if (!p0 || !p1 || !p3 || dist(p0, p1) < 1e-6 || dist(p0, p3) < 1e-6) return null;
  return { o: P(p0), e1: scale(sub(p1, p0), 1 / dist(p0, p1)), e2: scale(sub(p3, p0), 1 / dist(p0, p3)) };
}

/**
 * Posun vrcholu `i` do bodu p (mění data `d`). Obdélník zůstane obdélníkem (protější roh stojí, sousední se
 * dopočítají), ostatní tvary posunou jen ten vrchol.
 */
export function moveDrawingVertex(d: Drawing, i: number, p: Pt): void {
  const v = d.pts[i];
  if (!v) return;
  const f = d.shape === 'rect' && d.pts.length === 4 ? rectFrame(d) : null;
  if (f) {
    const loc = (q: Pt) => ({ u: dot(sub(q, f.o), f.e1), v: dot(sub(q, f.o), f.e2) });
    const world = (u: number, w: number) => add(f.o, add(scale(f.e1, u), scale(f.e2, w)));
    const old = d.pts.map(loc);
    const opp = old[(i + 2) % 4]!;
    const q = loc(p);
    for (const k of [(i + 1) % 4, (i + 3) % 4]) {
      // soused sdílí s posouvaným rohem jednu souřadnici (u nebo v), druhou s protějším
      const sharesU = Math.abs(old[k]!.u - old[i]!.u) < Math.abs(old[k]!.v - old[i]!.v);
      const np = sharesU ? world(q.u, opp.v) : world(opp.u, q.v);
      Object.assign(d.pts[k]!, { x: np.x, y: np.y });
    }
  }
  v.x = p.x;
  v.y = p.y;
}

/** Nastaví rozměry obdélníku (roh 0 stojí, směry stran zůstanou). */
export function setRectSize(d: Drawing, w: number, h: number): boolean {
  const f = rectFrame(d);
  if (!f || w <= 0 || h <= 0) return false;
  const pts = [f.o, add(f.o, scale(f.e1, w)), add(f.o, add(scale(f.e1, w), scale(f.e2, h))), add(f.o, scale(f.e2, h))];
  pts.forEach((q, k) => Object.assign(d.pts[k]!, { x: q.x, y: q.y }));
  return true;
}

/** Vzdálenost čar dvojité čáry podle bodu p (kolmo od první čáry; strana podle toho, kde p leží). */
export function doubleWidthTowards(d: Drawing, p: Pt): { width: number; side: 1 | -1 } | null {
  const a = d.pts[0];
  const b = d.pts[1];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  const n = normal(scale(sub(b, a), 1 / dist(a, b)));
  const k = Math.round(dot(sub(p, a), n) / 10) * 10;
  if (Math.abs(k) < 10) return null;
  return { width: Math.abs(k), side: k > 0 ? 1 : -1 };
}

/** Posun kresby o (dx, dy) od výchozích bodů `from` (mění data `d`). */
export function placeDrawing(d: Drawing, from: readonly Pt[], dx: number, dy: number): void {
  from.forEach((p, k) => {
    if (d.pts[k]) Object.assign(d.pts[k]!, { x: p.x + dx, y: p.y + dy });
  });
}

/** Otočení kresby kolem bodu c (mění data `d`); vzepětí oblouků se otočením nemění. */
export function rotateDrawing(d: Drawing, rot: (p: Pt) => Pt): void {
  for (const p of d.pts) Object.assign(p, rot(p));
}

/** Konce otevřené lomené čáry (pro navázání dalšího úseku). */
export function openLineEnds(d: Drawing): [DrawPt, DrawPt] | null {
  if (d.shape !== 'line' || d.closed || d.pts.length < 2) return null;
  return [d.pts[0]!, d.pts[d.pts.length - 1]!];
}

/** Body kresby pro výběr obdélníkem / střed otočení. */
export const drawingExtentPoints = (d: Drawing): Pt[] => drawingPolylines(d).flat();
