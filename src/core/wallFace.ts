/**
 * Tvar a líce stěny: má tělo, rozsah těla kolmo k ose, směr do těla, čára líce (rovná / oblouk)
 * a délka líce. Tělo stěny počítá core/wallBody.ts.
 */
import type { Floor, Pt, Wall } from '../model/types';
import { arcGeometry } from './arc';
import { dist, dot, normal, scale, sub, unit } from './geometry';

/** Má stěna tělo? (rovné i obloukové stěny s tloušťkou; kruhy a čáry bez tloušťky ne) */
export const hasBody = (w: Wall): boolean => w.thickness > 0 && w.radius === undefined && w.a !== w.b;

/**
 * Rozsah těla kolmo k ose stěny jako posun podél normal(a→b): líc side 1 = [0, t], side −1 = [−t, 0],
 * osa uprostřed = [−t/2, t/2].
 */
export function bodyRange(w: Wall): [number, number] {
  const t = w.thickness;
  if (w.axis === 'center') return [-t / 2, t / 2];
  return w.side === 1 ? [0, t] : [-t, 0];
}

/** Kde začíná tělo měřeno od osy podél `bodyNormal` (líc = 0, osa uprostřed = −t/2); tělo je [start, start + t]. */
export const bodyStart = (w: Wall): number => (w.axis === 'center' ? -w.thickness / 2 : 0);

/** Jednotkový vektor od čáry líce směrem do těla stěny (u oblouku v jeho vrcholu = kolmo k tětivě). */
export function bodyNormal(floor: Floor, w: Wall): Pt | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  return scale(normal(unit(a, b)), w.side);
}

/** Čára líce jako body s tečnami (směr a→b); rovná stěna = 2 body, oblouk = lomená čára. */
export function facePath(a: Pt, b: Pt, sagitta: number, steps = 64): { pts: Pt[]; tans: Pt[] } {
  const g = arcGeometry(a, b, sagitta);
  if (!g) {
    const u = unit(a, b);
    return { pts: [a, b], tans: [u, u] };
  }
  const pts: Pt[] = [];
  const tans: Pt[] = [];
  const sgn = Math.sign(g.sweep) || 1;
  for (let i = 0; i <= steps; i++) {
    const ang = g.start + (g.sweep * i) / steps;
    pts.push(i === 0 ? a : i === steps ? b : { x: g.center.x + g.r * Math.cos(ang), y: g.center.y + g.r * Math.sin(ang) });
    tans.push({ x: -Math.sin(ang) * sgn, y: Math.cos(ang) * sgn });
  }
  return { pts, tans };
}

/** Bod na čáře líce v poloze s (0–1) a směr do těla v tom místě. */
export function facePointAt(floor: Floor, w: Wall, s: number): { pt: Pt; into: Pt } | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  const path = facePath(a, b, w.sagitta ?? 0, 64);
  const i = Math.max(0, Math.min(path.pts.length - 1, Math.round(s * (path.pts.length - 1))));
  if (path.pts.length === 2) {
    return { pt: { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, into: scale(normal(path.tans[0]!), w.side) };
  }
  return { pt: path.pts[i]!, into: scale(normal(path.tans[i]!), w.side) };
}

/** Délka lomené čáry. */
export const polylineLength = (pts: readonly Pt[]): number => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1]!, p) : 0), 0);

/**
 * Délka líce ve směru a→b: u rovné stěny se znaménkem (průmět na osu) – líc „přetočený“ napojením
 * (sousední stěny ho celý překryjí) vyjde ≤ 0; u oblouku délka lomené čáry.
 */
export function faceSpan(w: Wall, a: Pt, b: Pt, pts: readonly Pt[]): number {
  if (w.sagitta || pts.length < 2) return polylineLength(pts);
  return dot(sub(pts[pts.length - 1]!, pts[0]!), unit(a, b));
}
