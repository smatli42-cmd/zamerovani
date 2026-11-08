/**
 * Geometrie obloukové stěny: tětiva a–b + vzepětí (sagita). Čisté funkce bez DOM.
 * Znaménko vzepětí určuje stranu vyklenutí od směru a→b (osa Y míří dolů).
 */
import type { Pt } from '../model/types';
import { dist, projectToSegment } from './geometry';

const TWO_PI = Math.PI * 2;
const mod = (v: number) => ((v % TWO_PI) + TWO_PI) % TWO_PI;

export interface ArcGeometry {
  center: Pt;
  r: number;
  /** Úhly krajních bodů (rad) a směr kreslení pro canvas (true = proti směru hodin). */
  start: number;
  end: number;
  anticlockwise: boolean;
  /** Nejvzdálenější bod oblouku od tětivy. */
  apex: Pt;
  /** Úhel oblouku se znaménkem (rad): kladný = po směru rostoucího úhlu. */
  sweep: number;
}

/** Střed, poloměr a úhly oblouku; null = prakticky rovná čára. */
export function arcGeometry(a: Pt, b: Pt, sagitta: number): ArcGeometry | null {
  const chord = dist(a, b);
  if (chord < 1e-6 || Math.abs(sagitta) < 0.5) return null;
  const ux = (b.x - a.x) / chord;
  const uy = (b.y - a.y) / chord;
  const nx = -uy;
  const ny = ux;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const sign = Math.sign(sagitta);
  const h = Math.abs(sagitta);
  const r = (chord * chord) / 4 / (2 * h) + h / 2;
  const apex = { x: mid.x + nx * sagitta, y: mid.y + ny * sagitta };
  const center = { x: apex.x - nx * sign * r, y: apex.y - ny * sign * r };
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  const end = Math.atan2(b.y - center.y, b.x - center.x);
  const apexAngle = Math.atan2(apex.y - center.y, apex.x - center.x);
  // po směru rostoucího úhlu od začátku ke konci: prochází vrcholem?
  const anticlockwise = mod(apexAngle - start) > mod(end - start);
  let sweep = mod(end - start);
  if (anticlockwise) sweep -= TWO_PI;
  return { center, r, start, end, anticlockwise, apex, sweep };
}

/** Bod oblouku v úhlu `ang`. */
const onCircle = (g: ArcGeometry, ang: number): Pt => ({ x: g.center.x + g.r * Math.cos(ang), y: g.center.y + g.r * Math.sin(ang) });

/** Oblouk jako lomená čára (pro vykreslení / měření přibližně). */
export function arcPolyline(a: Pt, b: Pt, sagitta: number, steps = 48): Pt[] {
  const g = arcGeometry(a, b, sagitta);
  if (!g) return [a, b];
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) pts.push(onCircle(g, g.start + (g.sweep * i) / steps));
  return pts;
}

export interface NearestOnArc {
  point: Pt;
  distance: number;
  /** Poloha podél oblouku 0–1 (podle úhlu). */
  t: number;
}

/** Nejbližší bod na oblouku (přesně, ne po lomené čáře). */
export function nearestOnArc(p: Pt, a: Pt, b: Pt, sagitta: number): NearestOnArc {
  const g = arcGeometry(a, b, sagitta);
  if (!g) {
    const pr = projectToSegment(p, a, b);
    return { point: pr.point, distance: pr.distance, t: pr.t };
  }
  const ang = Math.atan2(p.y - g.center.y, p.x - g.center.x);
  const rel = g.sweep >= 0 ? mod(ang - g.start) : mod(g.start - ang);
  const span = Math.abs(g.sweep);
  if (rel <= span) {
    const point = onCircle(g, ang);
    return { point, distance: Math.abs(dist(p, g.center) - g.r), t: span > 0 ? rel / span : 0 };
  }
  // mimo oblouk: bližší z krajních bodů
  return dist(p, a) <= dist(p, b) ? { point: a, distance: dist(p, a), t: 0 } : { point: b, distance: dist(p, b), t: 1 };
}

/** Vzepětí oblouku o daném úhlu (rad, kladné číslo) a poloměru. */
const sagittaOf = (r: number, sweepAbs: number) => r * (1 - Math.cos(sweepAbs / 2));

/**
 * Rozdělení oblouku v bodě `pt` (leží na oblouku): vzepětí obou částí [a→pt, pt→b].
 * Obě části mají stejný střed a poloměr jako původní oblouk.
 */
export function splitArcSagittas(a: Pt, b: Pt, sagitta: number, pt: Pt): [number, number] | null {
  const g = arcGeometry(a, b, sagitta);
  if (!g) return null;
  const ang = Math.atan2(pt.y - g.center.y, pt.x - g.center.x);
  const first = g.sweep >= 0 ? mod(ang - g.start) : -mod(g.start - ang);
  const second = g.sweep - first;
  const s = Math.sign(sagitta);
  return [s * sagittaOf(g.r, Math.abs(first)), s * sagittaOf(g.r, Math.abs(second))];
}

/** Obálka oblouku (včetně vrcholu) – body pro výpočet obálky. */
export function arcExtentPoints(a: Pt, b: Pt, sagitta: number): Pt[] {
  return arcPolyline(a, b, sagitta, 64);
}

/** Nejbližší bod na kružnici (střed c, poloměr r). */
export function nearestOnCircle(p: Pt, c: Pt, r: number): NearestOnArc {
  const ang = Math.atan2(p.y - c.y, p.x - c.x);
  return { point: { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) }, distance: Math.abs(dist(p, c) - r), t: mod(ang) / TWO_PI };
}

/** Kružnice jako lomená čára. */
export function circlePolyline(c: Pt, r: number, steps = 64): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) pts.push({ x: c.x + r * Math.cos((TWO_PI * i) / steps), y: c.y + r * Math.sin((TWO_PI * i) / steps) });
  return pts;
}
