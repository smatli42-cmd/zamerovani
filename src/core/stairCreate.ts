/**
 * Vznik schodiště a jeho částí (nástroj Schodiště, panel, kresba → podesta): rameno zadanými rozměry, točité
 * schodiště, ručně nakreslené další rameno s podestou, podesta z kresby. Geometrie ramen v core/stairFlight.ts,
 * rozložení a dopočty v core/stairs.ts. Bez DOM.
 */
import type { Id, Pt, Stair, StairFlight } from '../model/types';
import { add, centroid, dist, polygonArea, scale, sub } from './geometry';
import { flightAcross, flightEnd, flightLength } from './stairFlight';
import { defaultSteps, STAIR_MIN, stairsOf } from './stairs';
import { pointInPolygon } from './wallBody';
import type { Floor } from '../model/types';

/**
 * Rameno zadaných rozměrů (šířka × délka z klávesnice): roh u prvního stupně v `p`, rameno leží směrem k bodu `q`
 * (kvadrant), délka podél osy, ke které má `q` blíž (strany rovnoběžné s osami výkresu).
 */
export function sizedFlight(id: Id, p: Pt, q: Pt, width: number, length: number): StairFlight | null {
  if (width < STAIR_MIN.width || length < STAIR_MIN.length) return null;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const steps = defaultSteps(length);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const y = p.y + (sy * width) / 2;
    return { id, a: { x: p.x, y }, b: { x: p.x + sx * length, y }, width, steps };
  }
  const x = p.x + (sx * width) / 2;
  return { id, a: { x, y: p.y }, b: { x, y: p.y + sy * length }, width, steps };
}

/** Nejmenší vnější poloměr točitého schodiště (mm). */
export const SPIRAL_MIN_RADIUS = 300;

/**
 * Točité schodiště: střed `c`, bod `p` na vnějším okraji u prvního stupně. Vřeteno (vnitřní poloměr) 150 mm
 * (u malého schodiště 1/5 poloměru), otočení o 360° po směru hodinových ručiček, stupně podle délky osy.
 */
export function spiralFlight(id: Id, c: Pt, p: Pt): StairFlight | null {
  const R = dist(c, p);
  if (R < SPIRAL_MIN_RADIUS) return null;
  const inner = Math.min(150, R / 5);
  const e = scale(sub(p, c), 1 / R);
  const r = (R + inner) / 2;
  const a = add(c, scale(e, r));
  const f: StairFlight = { id, a, b: { ...a }, width: R - inner, steps: 2, center: { x: c.x, y: c.y }, sweep: 360 };
  f.steps = defaultSteps(flightLength(f));
  return f;
}

/** Mnohoúhelník podesty mezi koncem ramene `prev` a začátkem ramene `f` (dotýkají-li se, prázdný). */
export function bridgeLanding(prev: StairFlight, f: StairFlight): Pt[] {
  const [pl, pr] = flightAcross(prev, 1);
  const [al, ar] = flightAcross(f, 0);
  const quads = [
    [pl, pr, ar, al],
    [pl, pr, al, ar]
  ];
  const best = quads.reduce((m, q) => (Math.abs(polygonArea(q)) > Math.abs(polygonArea(m)) ? q : m));
  return Math.abs(polygonArea(best)) < 100 * 100 ? [] : best.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** Ručně nakreslené další rameno: první stupeň na konci blíž k výstupu předchozího ramene. */
export function orientFreeFlight(prev: StairFlight, f: StairFlight): void {
  const end = flightEnd(prev).p;
  if (dist(f.b, end) < dist(f.a, end)) [f.a, f.b] = [f.b, f.a];
  f.turn = 'free';
}

/**
 * Podesta, kterou nahradí kresba `poly` (uzavřený tvar): napojení (rameno i ≥ 1), jehož podesta / místo mezi
 * rameny leží v kresbě nebo nejblíž jejímu těžišti (do 1 m). null = žádné schodiště poblíž.
 */
export function landingForPolygon(floor: Floor, poly: Pt[]): { stair: Stair; index: number } | null {
  const c = centroid(poly);
  let best: { stair: Stair; index: number } | null = null;
  let bestD = 1000;
  for (const s of stairsOf(floor)) {
    if (s.outline) continue;
    for (let i = 1; i < s.flights.length; i++) {
      const l = s.landings[i - 1]?.pts ?? [];
      const at = l.length >= 3 ? centroid(l) : scale(add(flightEnd(s.flights[i - 1]!).p, s.flights[i]!.a), 0.5);
      // podesta uvnitř kresby má přednost (mezi nimi ta blíž těžišti)
      const d = pointInPolygon(at, poly) ? dist(at, c) * 1e-3 : dist(at, c);
      if (d < bestD) {
        best = { stair: s, index: i };
        bestD = d;
      }
    }
  }
  return best;
}
