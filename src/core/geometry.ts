/**
 * Čistá geometrie (bez stavu aplikace, bez plátna) – snadno testovatelná.
 */
import type { Pt } from '../model/types';

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Jednotkový vektor z a do b (při nulové délce [1, 0]). */
export function unit(a: Pt, b: Pt): Pt {
  const len = dist(a, b);
  return len < 1e-9 ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** Normála (otočení o 90° doleva v souřadnicích obrazovky). */
export const normal = (u: Pt): Pt => ({ x: -u.y, y: u.x });

export interface SegmentProjection {
  /** Parametr podél úsečky (0 = a, 1 = b), oříznutý do <0, 1>. */
  t: number;
  /** Nejbližší bod na úsečce. */
  point: Pt;
  /** Vzdálenost bodu od úsečky. */
  distance: number;
}

export function projectToSegment(p: Pt, a: Pt, b: Pt): SegmentProjection {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  let t = len2 < 1e-9 ? 0 : dot(sub(p, a), ab) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = lerp(a, b, t);
  return { t, point, distance: dist(p, point) };
}

/** Úhel mezi dvěma směry (0–90°), bez ohledu na orientaci. */
export function angleBetweenDeg(u: Pt, v: Pt): number {
  const c = Math.abs(dot(u, v)) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/** Zaokrouhlení na krok (např. 10 mm). */
export const roundTo = (v: number, step: number): number => Math.round(v / step) * step;

/** Plocha mnohoúhelníku (kladná pro libovolnou orientaci). */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** Těžiště bodů (prostý průměr). */
export function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * Vyhodnotí jednoduchý výraz z NumPadu: čísla, + a − (např. "1200+800-50").
 * Vrací null, pokud výraz není platný.
 */
export function evaluateExpression(expr: string): number | null {
  const clean = expr.replace(/\s+/g, '').replace(/,/g, '.').replace(/−/g, '-');
  if (!/^-?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(clean)) return null;
  const parts = clean.match(/[+-]?\d+(\.\d+)?/g);
  if (!parts) return null;
  return parts.reduce((s, p) => s + Number(p), 0);
}
