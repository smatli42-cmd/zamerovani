/**
 * Ruční tah perem (zadání Vrstvy, krok 2) – JEDINÉ místo pravidel ručního tahu.
 *
 * - Vektor: vyhlazená lomená čára v mm (ne bitmapa) → jde do PDF i DXF (hladina = název vrstvy).
 * - Tloušťka v mm výkresu (se zoomem se mění stejně jako zbytek výkresu), předvolby `STROKE_WIDTHS`.
 * - Barva = barva vrstvy (core/layers.ts); vrstva nového tahu = aktivní vrstva.
 * - Nechytá se (žádné přichytávání ani kóty k tahu), není to strukturovaný prvek pro BIM / IFC.
 * - Guma maže celé tahy jen v aktivní vrstvě (viditelné, odemčené) – `strokesToErase`.
 * Výběr, posun, kopie, mazání a výběr obdélníkem jdou přes core/looseElements.ts (volný prvek).
 */
import type { Floor, Id, Pt, Stroke } from '../model/types';
import { dist, projectToSegment } from './geometry';
import { isSelectable, elementLayer } from './layers';
import type { Project } from '../model/types';

/** Předvolby tloušťky tahu (mm výkresu). */
export const STROKE_WIDTHS = [10, 25, 50, 100] as const;
export const DEFAULT_STROKE_WIDTH = 25;

export function strokesOf(floor: Floor): Stroke[] {
  return Object.values(floor.strokes ?? {});
}

/** Kolmá vzdálenost bodu od úsečky (pro zjednodušení). */
function segDist(p: Pt, a: Pt, b: Pt): number {
  return projectToSegment(p, a, b).distance;
}

/** Ramer–Douglas–Peucker: vynechá body, které od lomené čáry neodbočí víc než `tol`. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k]!, pts[i]!, pts[j]!);
      if (d > bestD) {
        best = k;
        bestD = d;
      }
    }
    if (best >= 0) {
      keep[best] = true;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Vyhlazení surového tahu (body pera v mm): vynechá body blíž než `step`, jednou vyhladí (Chaikin, konce zůstanou),
 * pak zjednoduší s tolerancí `tol`; souřadnice na 0,1 mm. `step` a `tol` podle zoomu (≈ 1 px a 0,5 px).
 */
export function smoothStroke(raw: Pt[], step: number, tol: number): Pt[] {
  const thin: Pt[] = [];
  for (const p of raw) if (!thin.length || dist(thin[thin.length - 1]!, p) >= step) thin.push({ x: p.x, y: p.y });
  const last = raw[raw.length - 1];
  if (last && thin.length && dist(thin[thin.length - 1]!, last) > 1e-9) thin.push({ x: last.x, y: last.y });
  let pts = thin;
  if (pts.length >= 3) {
    const out: Pt[] = [pts[0]!];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (i > 0) out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      if (i + 2 < pts.length) out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    out.push(pts[pts.length - 1]!);
    pts = out;
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  return simplify(pts, tol).map(p => ({ x: r(p.x), y: r(p.y) }));
}

/** Leží bod na tahu (do poloviny tloušťky + `tol` mm)? Tah z jednoho bodu = tečka. */
export function strokeHit(s: Stroke, p: Pt, tol: number): boolean {
  const reach = s.width / 2 + tol;
  if (s.pts.length === 1) return dist(s.pts[0]!, p) <= reach;
  for (let i = 0; i + 1 < s.pts.length; i++) if (segDist(p, s.pts[i]!, s.pts[i + 1]!) <= reach) return true;
  return false;
}

/** Tah pod bodem (naposledy nakreslený má přednost). */
export function pickStroke(floor: Floor, p: Pt, tol: number): Id | null {
  const all = strokesOf(floor);
  for (let i = all.length - 1; i >= 0; i--) if (strokeHit(all[i]!, p, tol)) return all[i]!.id;
  return null;
}

/**
 * Guma: celé tahy pod bodem, jen v aktivní vrstvě a jen viditelné a odemčené (skrytou ani zamčenou vrstvu guma
 * nemaže; aktivní vrstva skrýt nejde, zamčená je možná).
 */
export function strokesToErase(p: Pick<Project, 'layers' | 'activeLayer'> | null, floor: Floor, at: Pt, tol: number): Id[] {
  const active = p?.activeLayer;
  return strokesOf(floor)
    .filter(s => elementLayer(floor, 'stroke', s.id) === active && isSelectable(p, floor, 'stroke', s.id) && strokeHit(s, at, tol))
    .map(s => s.id);
}
