/**
 * Zabíhavé stupně schodiště (místo podesty v rohu L nebo v otočce U, `StairLanding.winders`): čáry stupňů
 * vycházejí z vnitřního bodu otočky (vnitřní roh L / bod mezi rameny u U) pod stejnými úhly k vnějšímu okraji.
 * Jediné místo této geometrie (core/stairs.ts ji jen používá). Bez DOM.
 */
import type { Pt } from '../model/types';
import { add, scale, sub } from './geometry';

/** Nejmenší a největší počet zabíhavých stupňů. */
export const WINDERS = { min: 2, max: 9 } as const;

/** Výchozí počet zabíhavých stupňů: L = 3, U = 6. */
export const defaultWinders = (u: boolean): number => (u ? 6 : 3);

const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;

/** Nejvzdálenější průsečík paprsku z `c` ve směru `d` s obrysem `poly` (vnější okraj otočky). */
function rayExit(poly: readonly Pt[], c: Pt, d: Pt): Pt | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const e = sub(q, p);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-9) continue;
    const w = sub(p, c);
    const t = cross(w, e) / den;
    const s = cross(w, d) / den;
    if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t > best)) best = t;
  }
  return best === null ? null : add(c, scale(d, best));
}

/**
 * Čáry zabíhavých stupňů v otočce `poly`: `k` stupňů = k − 1 čar z bodu `c`, mezi paprskem k bodu `s` (konec
 * předchozího ramene) a paprskem k bodu `e` (začátek dalšího ramene), otáčení přes vnitřek otočky.
 */
export function winderLines(poly: readonly Pt[], c: Pt, s: Pt, e: Pt, k: number): [Pt, Pt][] {
  if (poly.length < 3 || k < 2) return [];
  const mid = scale(poly.reduce((v, p) => add(v, p), { x: 0, y: 0 }), 1 / poly.length);
  const a0 = Math.atan2(s.y - c.y, s.x - c.x);
  const a1 = Math.atan2(e.y - c.y, e.x - c.x);
  // směr otáčení: k vnitřku otočky (těžiště)
  const sign = cross(sub(s, c), sub(mid, c)) >= 0 ? 1 : -1;
  let delta = (a1 - a0) * sign;
  while (delta <= 1e-9) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;
  const out: [Pt, Pt][] = [];
  for (let i = 1; i < k; i++) {
    const ang = a0 + sign * delta * (i / k);
    const q = rayExit(poly, c, { x: Math.cos(ang), y: Math.sin(ang) });
    if (q) out.push([c, q]);
  }
  return out;
}
