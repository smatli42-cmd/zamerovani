/**
 * Geometrie jednoho ramene schodiště (core/stairs.ts): rovné rameno (osa a → b) i rameno po oblouku (střed
 * `center`, úhel `sweep` – obloukové a točité schodiště). Jediné místo, kde se počítá poloha na ose, obrys ramene,
 * čáry nášlapů a napojení dalšího ramene. Bez DOM.
 */
import type { Pt, StairFlight } from '../model/types';
import { add, dist, scale, sub } from './geometry';

/** Levá strana při chůzi po ose (osa y míří dolů). */
export const leftOf = (u: Pt): Pt => ({ x: u.y, y: -u.x });

const RAD = Math.PI / 180;

/** Je rameno po oblouku? */
export const isArcFlight = (f: StairFlight): boolean => !!f.center && !!f.sweep && Math.abs(f.sweep) > 1e-6;

/** Poloměr osy obloukového ramene (mm). */
export const flightRadius = (f: StairFlight): number => (f.center ? dist(f.a, f.center) : 0);

/** Délka osy ramene (mm) – u oblouku po oblouku osy. */
export function flightLength(f: StairFlight): number {
  if (isArcFlight(f)) return flightRadius(f) * Math.abs(f.sweep! * RAD);
  return dist(f.a, f.b);
}

/** Bod na ose a směr chůze v poměrné poloze t (0 = první stupeň, 1 = výstup). */
export function flightFrame(f: StairFlight, t: number): { p: Pt; u: Pt } {
  if (isArcFlight(f)) {
    const c = f.center!;
    const r = flightRadius(f) || 1;
    const a0 = Math.atan2(f.a.y - c.y, f.a.x - c.x);
    const ang = a0 + f.sweep! * RAD * t;
    const e = { x: Math.cos(ang), y: Math.sin(ang) };
    const sg = Math.sign(f.sweep!);
    return { p: add(c, scale(e, r)), u: { x: -e.y * sg, y: e.x * sg } };
  }
  const d = dist(f.a, f.b) || 1;
  const u = { x: (f.b.x - f.a.x) / d, y: (f.b.y - f.a.y) / d };
  return { p: add(f.a, scale(u, d * t)), u };
}

/** Okraje ramene napříč osou v poloze t: [levý, pravý]. */
export function flightAcross(f: StairFlight, t: number): [Pt, Pt] {
  const { p, u } = flightFrame(f, t);
  const l = scale(leftOf(u), f.width / 2);
  return [add(p, l), sub(p, l)];
}

/** Rohy ramene: [a vlevo, b vlevo, b vpravo, a vpravo] (i u oblouku – konce ramene). */
export function flightRect(f: StairFlight): Pt[] {
  const [al, ar] = flightAcross(f, 0);
  const [bl, br] = flightAcross(f, 1);
  return [al, bl, br, ar];
}

/** Počet úseků, kterými se oblouk ramene kreslí (po 5°). */
const arcSteps = (f: StairFlight): number => Math.max(4, Math.ceil(Math.abs(f.sweep ?? 0) / 5));

/** Obrys ramene (mnohoúhelník): rovné = obdélník, oblouk = levý okraj tam a pravý zpět. */
export function flightPolygon(f: StairFlight): Pt[] {
  if (!isArcFlight(f)) return flightRect(f);
  const m = arcSteps(f);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= m; i++) {
    const [l, r] = flightAcross(f, i / m);
    left.push(l);
    right.push(r);
  }
  // vnitřní okraj s nulovým poloměrem (točité bez vřetena) = jen střed; vnitřní je pravý okraj při kladném úhlu, levý při záporném
  const zero = Math.abs(flightRadius(f) - f.width / 2) < 1;
  if (!zero) return [...left, ...right.reverse()];
  return f.sweep! > 0 ? [...left, f.center!] : [f.center!, ...right.reverse()];
}

/** Body osy pro šipku (oblouk rozložený po 5°). */
export function flightAxis(f: StairFlight): Pt[] {
  if (!isArcFlight(f)) return [f.a, f.b];
  const m = arcSteps(f);
  return Array.from({ length: m + 1 }, (_, i) => flightFrame(f, i / m).p);
}

/** Čáry nášlapů uvnitř ramene: N stoupání = N − 1 nášlapů, N − 2 čar mezi okraji ramene (u oblouku po poloměru). */
export function flightTreads(f: StairFlight): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 1; i < f.steps - 1; i++) out.push(flightAcross(f, i / (f.steps - 1)));
  return out;
}

/** Konec osy (výstup) a směr chůze v něm – na něj navazuje podesta a další rameno. */
export const flightEnd = (f: StairFlight): { p: Pt; u: Pt } => flightFrame(f, 1);

/**
 * Položí rameno tak, aby začínalo v bodě `a` se směrem chůze `u`; délka, šířka, poloměr a úhel oblouku zůstanou.
 */
export function placeFlight(f: StairFlight, a: Pt, u: Pt): void {
  if (isArcFlight(f)) {
    const r = flightRadius(f);
    // levá strana chůze míří u oblouku po směru hodinových ručiček ven od středu
    const e = scale(leftOf(u), Math.sign(f.sweep!));
    f.a = a;
    f.center = sub(a, scale(e, r));
    f.b = flightEnd(f).p;
    return;
  }
  const len = flightLength(f);
  f.a = a;
  f.b = add(a, scale(u, len));
}

/** Rovné rameno → po oblouku (úhel `sweep`, délka osy i začátek a směr zůstanou). */
export function bendFlight(f: StairFlight, sweep: number): boolean {
  if (isArcFlight(f) || Math.abs(sweep) < 1) return false;
  const len = flightLength(f);
  const { u } = flightFrame(f, 0);
  const r = len / Math.abs(sweep * RAD);
  if (r < f.width / 2) return false; // vnitřní okraj by přešel přes střed
  f.sweep = sweep;
  f.center = sub(f.a, scale(scale(leftOf(u), Math.sign(sweep)), r));
  f.b = flightEnd(f).p;
  return true;
}

/** Rameno po oblouku → rovné (délka osy, začátek a směr zůstanou). */
export function straightenFlight(f: StairFlight): boolean {
  if (!isArcFlight(f)) return false;
  const len = flightLength(f);
  const { u } = flightFrame(f, 0);
  delete f.center;
  delete f.sweep;
  f.b = add(f.a, scale(u, len));
  return true;
}

/** Nový úhel oblouku (stupně se znaménkem): poloměr, začátek a směr zůstanou. */
export function setFlightSweep(f: StairFlight, sweep: number): boolean {
  if (!isArcFlight(f) || Math.abs(sweep) < 1 || Math.abs(sweep) > 1080) return false;
  f.sweep = sweep;
  f.b = flightEnd(f).p;
  return true;
}

/**
 * Nový vnější poloměr oblouku (osa = vnější − šířka / 2): u `keepCenter` stojí střed (točité schodiště), jinak
 * začátek ramene a směr chůze (rameno navazující na podestu).
 */
export function setFlightOuterRadius(f: StairFlight, outer: number, keepCenter: boolean): boolean {
  if (!isArcFlight(f)) return false;
  const r = outer - f.width / 2;
  if (r < f.width / 2 - 0.5 || r < 1) return false;
  if (keepCenter) {
    const e = scale(sub(f.a, f.center!), 1 / (flightRadius(f) || 1));
    f.a = add(f.center!, scale(e, r));
  } else {
    const { u } = flightFrame(f, 0);
    f.center = sub(f.a, scale(scale(leftOf(u), Math.sign(f.sweep!)), r));
  }
  f.b = flightEnd(f).p;
  return true;
}

/**
 * Oblouk zahne na druhou stranu: začátek, poloměr a úhel zůstanou. `keepCenter` (točité schodiště) = stojí i střed,
 * otočí se jen smysl otáčení; jinak stojí směr chůze na začátku a střed přejde na druhou stranu.
 */
export function mirrorFlightArc(f: StairFlight, keepCenter = false): boolean {
  if (!isArcFlight(f)) return false;
  const r = flightRadius(f);
  const { u } = flightFrame(f, 0);
  f.sweep = -f.sweep!;
  if (!keepCenter) f.center = sub(f.a, scale(scale(leftOf(u), Math.sign(f.sweep)), r));
  f.b = flightEnd(f).p;
  return true;
}

/** Vnější poloměr obloukového ramene (mm). */
export const flightOuterRadius = (f: StairFlight): number => flightRadius(f) + f.width / 2;

/** Body ramene, které se mění posunem / otočením / kopií. */
export const flightPoints = (f: StairFlight): Pt[] => [f.a, f.b, ...(f.center ? [f.center] : [])];
