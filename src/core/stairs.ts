/**
 * Schodiště – 2D značka v půdorysu (rozhodnutí uživatele 2026-11-19: žádné 3D, vlastnosti jen v panelu).
 * Jediné místo pro geometrii a dopočty schodiště: obrys ramen a podest, čáry nášlapů, šipka výstupu,
 * popisek „N × v/š“, rozložení L / U (podesta + další rameno) a změna rozměrů kótou. Bez DOM.
 */
import type { Floor, Id, Pt, Stair, StairFlight, StairLanding } from '../model/types';
import { add, dist, dot, scale, sub } from './geometry';
import { pointInPolygon } from './wallBody';
import { flightAxis, flightEnd, flightFrame, flightLength, flightOuterRadius, flightPoints, flightPolygon, flightRadius, flightTreads, isArcFlight, leftOf, placeFlight, setFlightOuterRadius, setFlightSweep } from './stairFlight';
import { winderLines } from './stairWinders';
export { flightLength, flightRect } from './stairFlight';

export const stairsOf = (floor: Floor): Stair[] => Object.values(floor.stairs ?? {});

/** Nejmenší rozměry (mm) a počet stoupání ramene. */
export const STAIR_MIN = { width: 100, length: 100, steps: 2, maxSteps: 60 } as const;

/** Jak navazuje rameno na předchozí: L vlevo / vpravo, U vlevo / vpravo (podesta mezi nimi). */
export type StairTurn = 'left' | 'right' | 'u-left' | 'u-right';
/** Napojení včetně ručně nakresleného ramene (`free` – stojí, kde je; podesta má vlastní tvar). */
export type StairJoin = StairTurn | 'free';

/** Směr chůze na začátku ramene. */
const dir = (f: StairFlight): Pt => flightFrame(f, 0).u;

/** Je napojení U (otočka o 180°)? */
export const isUTurn = (t: StairJoin | undefined): boolean => t === 'u-left' || t === 'u-right';

/** Má podesta `i` (před ramenem i + 1) místo podesty zabíhavé stupně? (jen u napojení L / U) */
export const hasWinders = (s: Stair, i: number): boolean => !!s.landings[i]?.winders && !s.outline && (s.flights[i + 1]?.turn ?? 'left') !== 'free';

/**
 * Počet stoupání celého schodiště (ruční obrys = 1. rameno). k zabíhavých stupňů v otočce = k nášlapů oddělených
 * k − 1 čarami: přidají k − 1 stoupání (na první vede poslední stoupání předchozího ramene, z posledního první
 * stoupání dalšího ramene – jako u podesty).
 */
export const totalSteps = (s: Stair): number =>
  s.outline ? (s.flights[0]?.steps ?? 0) : s.flights.reduce((n, f) => n + f.steps, 0) + s.landings.reduce((n, l, i) => n + (hasWinders(s, i) ? l.winders! - 1 : 0), 0);

/** Výška stupně v = výška / počet stoupání (mm); null = výška nezadaná. */
export function stepHeight(s: Stair): number | null {
  const n = totalSteps(s);
  return s.height && n > 0 ? s.height / n : null;
}

/** Šířka stupně (nášlapu) ramene = délka / (N − 1) (mm); null = rameno nemá nášlap. */
export function treadDepth(s: Stair, f: StairFlight): number | null {
  if (f.steps < 2) return null;
  const len = s.outline ? axisSpan(s)?.len ?? 0 : flightLength(f);
  return len > 0 ? len / (f.steps - 1) : null;
}

/** Ruční obrys: rozsah obrysu podél osy výstupu (t od bodu a). */
function axisSpan(s: Stair): { u: Pt; o: Pt; t0: number; len: number } | null {
  const f = s.flights[0];
  if (!f || !s.outline || s.outline.length < 3) return null;
  const u = dir(f);
  const ts = s.outline.map(p => dot(sub(p, f.a), u));
  const t0 = Math.min(...ts);
  return { u, o: f.a, t0, len: Math.max(...ts) - t0 };
}

/** Uzavřené obrysy schodiště (ramena, podesty, ruční obrys) – kreslení, výběr. */
export function stairOutlines(s: Stair): Pt[][] {
  if (s.outline) return [s.outline];
  return [...s.flights.map(flightPolygon), ...s.landings.map(l => l.pts).filter(p => p.length >= 3)];
}

/** Úsečky přes polygon kolmo k ose v poloze t (ruční obrys) – části uvnitř obrysu. */
function clipAcross(poly: readonly Pt[], o: Pt, u: Pt, t: number): [Pt, Pt][] {
  const n = leftOf(u);
  const base = add(o, scale(u, t));
  const ks: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dp = dot(sub(p, base), u);
    const dq = dot(sub(q, base), u);
    if ((dp < 0) === (dq < 0) || dp === dq) continue;
    const r = dp / (dp - dq);
    ks.push(dot(sub(add(p, scale(sub(q, p), r)), base), n));
  }
  ks.sort((x, y) => x - y);
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < ks.length; i += 2) out.push([add(base, scale(n, ks[i]!)), add(base, scale(n, ks[i + 1]!))]);
  return out;
}

/** Čáry nášlapů (hrany stupňů uvnitř ramen): rameno s N stoupáními má N − 1 nášlapů. */
export function treadLines(s: Stair): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  if (s.outline) {
    const f = s.flights[0];
    const span = axisSpan(s);
    if (!f || !span || s.manualTreads || f.steps < 3) return out;
    const k = span.len / (f.steps - 1);
    for (let i = 1; i < f.steps - 1; i++) out.push(...clipAcross(s.outline, span.o, span.u, span.t0 + i * k));
    return out;
  }
  for (const f of s.flights) out.push(...flightTreads(f));
  s.landings.forEach((l, i) => {
    const t = hasWinders(s, i) ? turnPoints(s, i + 1) : null;
    if (t) out.push(...winderLines(l.pts, t.c, t.s, t.e, l.winders!));
  });
  return out;
}

/**
 * Otočka před ramenem i (napojení L / U): vnitřní bod `c` (vnitřní roh L, bod mezi rameny u U), `s` = vnější kraj
 * konce předchozího ramene, `e` = vnější kraj začátku ramene i; null = ručně nakreslené rameno.
 */
function turnPoints(s: Stair, i: number): { c: Pt; s: Pt; e: Pt; side: Pt; pe: { p: Pt; u: Pt }; depth: number } | null {
  const prev = s.flights[i - 1];
  const f = s.flights[i];
  const turn = f?.turn ?? 'left';
  if (!prev || !f || turn === 'free') return null;
  const pe = flightEnd(prev);
  const side = turn === 'left' || turn === 'u-left' ? leftOf(pe.u) : scale(leftOf(pe.u), -1);
  const pw = prev.width / 2;
  const depth = f.depth ?? f.width;
  const c = add(pe.p, scale(side, pw));
  const e = isUTurn(turn) ? add(pe.p, scale(side, pw + f.width)) : add(c, scale(pe.u, depth));
  return { c, s: sub(pe.p, scale(side, pw)), e, side, pe, depth };
}

/** Šipka výstupu: lomená čára po osách ramen od prvního stupně k výstupu (hrot na konci). */
export function arrowPath(s: Stair): Pt[] {
  const pts = arrowForward(s);
  return s.reverse ? pts.reverse() : pts;
}

function arrowForward(s: Stair): Pt[] {
  if (s.outline) {
    const f = s.flights[0];
    const span = axisSpan(s);
    if (!f || !span) return [];
    // kousek od krajů obrysu (na samém kraji úsečka přes obrys nevznikne)
    const e = Math.min(span.len * 0.05, 100);
    return [span.t0 + e, span.t0 + span.len - e].map(t => add(span.o, scale(span.u, t))).map(p => midAcross(s.outline!, p, span.u) ?? p);
  }
  // přes podestu: v polovině její hloubky (u L roh, u U příčná čára mezi rameny); u ručně nakresleného ramene přes těžiště podesty
  const pts: Pt[] = [];
  s.flights.forEach((f, i) => {
    const prev = i > 0 ? s.flights[i - 1] : undefined;
    if (prev && f.turn === 'free') {
      const l = s.landings[i - 1]?.pts ?? [];
      if (l.length >= 3) pts.push(scale(l.reduce((v, p) => add(v, p), { x: 0, y: 0 }), 1 / l.length));
    } else if (prev) {
      const half = (f.depth ?? f.width) / 2;
      const pe = flightEnd(prev);
      const q1 = add(pe.p, scale(pe.u, half));
      const q2 = sub(f.a, scale(dir(f), half));
      pts.push(q1);
      if (dist(q1, q2) > 1) pts.push(q2);
    }
    pts.push(...flightAxis(f));
  });
  return pts;
}

/** Střed úsečky přes obrys v místě p kolmo k ose (aby šipka ručního obrysu vedla středem). */
function midAcross(poly: readonly Pt[], p: Pt, u: Pt): Pt | null {
  const segs = clipAcross(poly, p, u, 0);
  if (!segs.length) return null;
  // úsek, ve kterém bod leží (u nekonvexního obrysu jich může být víc), jinak nejbližší
  const n = leftOf(u);
  const k = (q: Pt) => dot(sub(q, p), n);
  const [a, b] = segs.find(([x, y]) => k(x) * k(y) <= 0) ?? segs.reduce((m, sg) => (Math.min(Math.abs(k(sg[0])), Math.abs(k(sg[1]))) < Math.min(Math.abs(k(m[0])), Math.abs(k(m[1]))) ? sg : m));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}


/** Popisek „N × v/š“ (např. 14 × 175/270); bez výšky „N st. / š“; různé šířky ramen = bez š. */
export function stairLabel(s: Stair): string {
  const n = totalSteps(s);
  const v = stepHeight(s);
  const ds = (s.outline ? s.flights.slice(0, 1) : s.flights).map(f => treadDepth(s, f)).filter((d): d is number => d !== null).map(d => Math.round(d));
  const sameD = ds.length > 0 && ds.every(d => d === ds[0]) ? ds[0]! : null;
  if (v !== null) return `${n} × ${Math.round(v)}${sameD !== null ? `/${sameD}` : ''}`;
  return `${n} st.${sameD !== null ? ` / ${sameD}` : ''}`;
}

/** Je bod uvnitř schodiště (nebo do `tol` od jeho obrysu)? */
export function stairHit(s: Stair, p: Pt, tol: number): boolean {
  for (const poly of stairOutlines(s)) {
    if (poly.length >= 3 && pointInPolygon(p, poly)) return true;
    for (let i = 0; i < poly.length; i++) if (segDist(p, poly[i]!, poly[(i + 1) % poly.length]!) <= tol) return true;
  }
  return false;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const d = sub(b, a);
  const l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return dist(p, add(a, scale(d, t)));
}

/**
 * Rameno ze dvou protějších rohů obdélníku (strany rovnoběžné s osami): osa vede podél delší strany,
 * první stupeň je na straně prvního bodu.
 */
export function flightFromCorners(id: Id, p: Pt, q: Pt, steps: number): StairFlight {
  const w = Math.abs(q.x - p.x);
  const h = Math.abs(q.y - p.y);
  if (w >= h) {
    const y = (p.y + q.y) / 2;
    return { id, a: { x: p.x, y }, b: { x: q.x, y }, width: h, steps };
  }
  const x = (p.x + q.x) / 2;
  return { id, a: { x, y: p.y }, b: { x, y: q.y }, width: w, steps };
}

/** Výchozí počet stoupání ramene podle délky (šířka stupně cca 270 mm). */
export const defaultSteps = (length: number): number => Math.max(STAIR_MIN.steps, Math.min(STAIR_MIN.maxSteps, Math.round(length / 270) + 1));

/**
 * Rozložení navazujících ramen a podest: rameno i > 0 se napojí na konec ramene i − 1 přes podestu i − 1
 * podle svého `turn` (L / U); poloha a podesta se dopočítají, délka, šířka a počet stoupání zůstávají.
 * Podesta má hloubku `depth` (podél předchozího ramene; chybí = šířka nového ramene). Id se zachovají.
 */
export function relayoutStair(s: Stair): void {
  if (s.outline) return;
  for (let i = 1; i < s.flights.length; i++) {
    const prev = s.flights[i - 1]!;
    const f = s.flights[i]!;
    const t = turnPoints(s, i);
    if (!t) continue; // ručně nakreslené rameno stojí, podesta má vlastní tvar
    const { side, depth } = t;
    const { p: e0, u } = t.pe;
    const pw = prev.width / 2;
    let pts: Pt[];
    if (!isUTurn(f.turn)) {
      // L: čtvercová (obdélníková) podesta za koncem ramene, nové rameno vychází z jejího boku
      const c = add(e0, scale(u, depth / 2));
      placeFlight(f, add(c, scale(side, pw)), side);
      pts = [add(e0, scale(side, -pw)), add(e0, scale(side, pw)), add(add(e0, scale(side, pw)), scale(u, depth)), add(add(e0, scale(side, -pw)), scale(u, depth))];
    } else {
      // U: podesta přes obě ramena, nové rameno vedle předchozího opačným směrem
      placeFlight(f, add(e0, scale(side, pw + f.width / 2)), scale(u, -1));
      const far = pw + f.width;
      pts = [add(e0, scale(side, -pw)), add(e0, scale(side, far)), add(add(e0, scale(side, far)), scale(u, depth)), add(add(e0, scale(side, -pw)), scale(u, depth))];
    }
    const land = s.landings[i - 1];
    if (land) land.pts = pts;
  }
}

/** Přidá podestu a další rameno (L / U); nové rameno má šířku a počet stoupání posledního. */
export function addStairTurn(s: Stair, turn: StairTurn, ids: { flight: Id; landing: Id }): boolean {
  const last = s.flights[s.flights.length - 1];
  if (!last || s.outline) return false;
  const len = flightLength(last);
  const pe = flightEnd(last);
  s.flights.push({ id: ids.flight, a: pe.p, b: add(pe.p, scale(pe.u, len)), width: last.width, steps: last.steps, turn });
  s.landings.push({ id: ids.landing, pts: [] } as StairLanding);
  relayoutStair(s);
  return true;
}

/** Odebere poslední rameno i s podestou před ním. */
export function removeLastFlight(s: Stair): boolean {
  if (s.flights.length < 2) return false;
  s.flights.pop();
  s.landings.splice(s.flights.length - 1);
  return true;
}

/**
 * Kóty schodiště, které jde zadat (NumPad): délka a šířka ramene, hloubka podesty; u ramene po oblouku i vnější
 * poloměr a úhel (stupně).
 */
export type StairDim = 'length' | 'width' | 'depth' | 'radius' | 'sweep';

/** Názvy kót schodiště (NumPad, hlášení zámku). */
export const STAIR_DIM_LABEL: Record<StairDim, string> = { length: 'délka ramene', width: 'šířka ramene', depth: 'hloubka podesty', radius: 'vnější poloměr', sweep: 'úhel oblouku' };

export function stairDimValue(s: Stair, flightId: Id, d: StairDim): number | null {
  const f = s.flights.find(x => x.id === flightId);
  if (!f) return null;
  if (d === 'length') return flightLength(f);
  if (d === 'width') return f.width;
  if (d === 'radius') return isArcFlight(f) ? flightOuterRadius(f) : null;
  if (d === 'sweep') return isArcFlight(f) ? Math.abs(f.sweep!) : null;
  return s.flights.indexOf(f) > 0 && !s.outline && f.turn !== 'free' ? (f.depth ?? f.width) : null;
}

/**
 * Změna rozměru ramene / podesty (mění jen schodiště): délka = posun konce `b` po ose (bod `a` stojí – i při
 * obráceném výstupu `reverse`), šířka = symetricky kolem osy, hloubka podesty před ramenem.
 * U podesty L musí být hloubka aspoň šířka navazujícího ramene (rameno by přečnívalo). Navazující ramena a podesty se dorovnají.
 */
export function setStairDim(s: Stair, flightId: Id, d: StairDim, value: number): boolean {
  const f = s.flights.find(x => x.id === flightId);
  if (!f || s.outline || !Number.isFinite(value)) return false;
  const arc = isArcFlight(f);
  if (d === 'length') {
    if (value < STAIR_MIN.length) return false;
    if (arc) {
      if (!setFlightSweep(f, (Math.sign(f.sweep!) * value) / flightRadius(f) / (Math.PI / 180))) return false;
    } else f.b = add(f.a, scale(dir(f), value));
  } else if (d === 'width') {
    if (value < STAIR_MIN.width || overhangsLanding(f, f.depth, value)) return false;
    if (arc && value / 2 > flightRadius(f) + 0.5) return false; // vnitřní okraj by přešel přes střed
    f.width = value;
  } else if (d === 'radius') {
    // 1. rameno (točité schodiště): střed stojí; navazující rameno: začátek stojí
    if (!arc || !setFlightOuterRadius(f, value, s.flights.indexOf(f) === 0)) return false;
  } else if (d === 'sweep') {
    if (!arc || !setFlightSweep(f, Math.sign(f.sweep!) * value)) return false;
  } else {
    if (s.flights.indexOf(f) < 1 || f.turn === 'free' || value < STAIR_MIN.width || overhangsLanding(f, value, f.width)) return false;
    f.depth = value;
  }
  relayoutStair(s);
  return true;
}

/** Podesta L by byla mělčí než šířka navazujícího ramene? */
const overhangsLanding = (f: StairFlight, depth: number | undefined, width: number): boolean =>
  (f.turn === 'left' || f.turn === 'right') && depth !== undefined && depth < width - 0.5;

/** Přepne směr výstupu (šipka od druhého konce); rozložení ramen a podest se nemění. */
export function flipStair(s: Stair): void {
  if (s.reverse) delete s.reverse;
  else s.reverse = true;
}

/** Osa výstupu ručního obrysu ve směru `u`: od kraje k protějšímu kraji obrysu, středem jeho šířky napříč. */
function outlineAxis(outline: readonly Pt[], u: Pt): { a: Pt; b: Pt; width: number } {
  const n = leftOf(u);
  const ts = outline.map(p => dot(p, u));
  const ks = outline.map(p => dot(p, n));
  const [t0, t1, k0, k1] = [Math.min(...ts), Math.max(...ts), Math.min(...ks), Math.max(...ks)];
  const at = (t: number, k: number): Pt => add(scale(u, t), scale(n, k));
  const k = (k0 + k1) / 2;
  return { a: at(t0, k), b: at(t1, k), width: k1 - k0 };
}

/** Ruční obrys z uzavřeného tvaru: osa výstupu podél nejdelší hrany obrysu (funguje i u pootočeného tvaru). */
export function stairFromOutline(id: Id, flightId: Id, outline: Pt[], steps: number): Stair {
  let u: Pt = { x: 1, y: 0 };
  let best = -1;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    const d = dist(p, q);
    if (d > best + 1e-6) {
      best = d;
      u = scale(sub(q, p), 1 / (d || 1));
    }
  });
  // první stupeň vlevo / nahoře (směr se přepíná šipkou)
  if (u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0)) u = scale(u, -1);
  return { id, flights: [{ id: flightId, ...outlineAxis(outline, u), steps }], landings: [], outline: outline.map(p => ({ x: p.x, y: p.y })) };
}

/** Ruční obrys: otočí osu výstupu o 90° (podél druhé strany obrysu). */
export function turnOutlineAxis(s: Stair): boolean {
  const f = s.flights[0];
  if (!s.outline || !f) return false;
  Object.assign(f, outlineAxis(s.outline, scale(leftOf(dir(f)), -1)));
  return true;
}

/** Všechny body schodiště (posun, otočení, kopie – mění se jen tyto body, rozměry zůstanou). */
export function stairPoints(s: Stair): Pt[] {
  return [...s.flights.flatMap(flightPoints), ...s.landings.flatMap(l => l.pts), ...(s.outline ?? [])];
}
