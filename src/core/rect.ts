/**
 * Obdélník výběru a jeho dotazy (sdílí výběr obdélníkem stěn i volných prvků).
 */
import type { Pt } from '../model/types';

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const normRect = (a: Pt, b: Pt): Rect => ({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) });
export const inRect = (r: Rect, p: Pt): boolean => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;

/** Protíná úsečka p–q obdélník? (Liang–Barsky) */
export function segHitsRect(r: Rect, p: Pt, q: Pt): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, p.x - r.x1) && clip(dx, r.x2 - p.x) && clip(-dy, p.y - r.y1) && clip(dy, r.y2 - p.y);
}

/** Lomené čáry v obdélníku: okno = všechny body uvnitř, křížení = dotyk kterékoli čáry. */
export function polylinesInRect(r: Rect, lines: readonly (readonly Pt[])[], crossing: boolean): boolean {
  if (crossing) return lines.some(pl => pl.some((p, i) => inRect(r, p) || (i > 0 && segHitsRect(r, pl[i - 1]!, p))));
  const pts = lines.flat();
  return pts.length > 0 && pts.every(p => inRect(r, p));
}
