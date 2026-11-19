/**
 * Akce: schodiště (2D značka; geometrie a dopočty v core/stairs.ts).
 */
import { canHatch, drawingPolylines } from '../../core/drawing';
import { addStairTurn, defaultSteps, flightFromCorners, flightLength, flipStair, relayoutStair, removeLastFlight, STAIR_MIN, stairFromOutline, turnOutlineAxis, type StairTurn } from '../../core/stairs';
import { newId } from '../../model/factory';
import type { Id, Pt, Stair, StairFlight } from '../../model/types';
import { store } from '../store';

/** Nové přímé schodiště (jedno rameno) ze dvou protějších rohů; vybere se. */
export function addStair(p: Pt, q: Pt): Id | null {
  const P = (v: Pt): Pt => ({ x: Math.round(v.x), y: Math.round(v.y) });
  const f = flightFromCorners(newId('sf'), P(p), P(q), 2);
  if (flightLength(f) < STAIR_MIN.length || f.width < STAIR_MIN.width) return null;
  f.steps = defaultSteps(flightLength(f));
  const s: Stair = { id: newId('st'), flights: [f], landings: [] };
  store.edit(floor => void ((floor.stairs ??= {})[s.id] = s), { selection: { kind: 'stair', id: s.id }, numpad: null });
  return s.id;
}

/** Změna vlastností schodiště (výška, popisek, ruční nášlapy). */
export function updateStair(id: Id, patch: Partial<Pick<Stair, 'height' | 'noLabel' | 'manualTreads'>>): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    if (!s) return;
    for (const [k, v] of Object.entries(patch) as [keyof typeof patch, unknown][]) {
      if (v === undefined || v === false || v === 0) delete s[k];
      else (s as unknown as Record<string, unknown>)[k] = v;
    }
  });
}

/** Počet stoupání ramene (nejméně 2). */
export function setFlightSteps(id: Id, flightId: Id, steps: number): void {
  if (!Number.isFinite(steps)) return;
  const n = Math.max(STAIR_MIN.steps, Math.min(STAIR_MIN.maxSteps, Math.round(steps)));
  store.edit(floor => {
    const f = floor.stairs?.[id]?.flights.find((x: StairFlight) => x.id === flightId);
    if (f) f.steps = n;
  });
}

/** Přidá podestu a další rameno (L / U). */
export function addStairFlight(id: Id, turn: StairTurn): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? addStairTurn(s, turn, { flight: newId('sf'), landing: newId('sl') }) : false;
  });
}

/** Změní napojení posledního ramene (L / U, vlevo / vpravo). */
export function setStairTurn(id: Id, flightId: Id, turn: StairTurn): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    const f = s?.flights.find(x => x.id === flightId);
    if (!s || !f || s.flights.indexOf(f) < 1) return false;
    f.turn = turn;
    relayoutStair(s);
    return true;
  });
}

export function removeStairFlight(id: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? removeLastFlight(s) : false;
  });
}

/** Přepne směr výstupu (šipka). */
export function flipStairDirection(id: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    if (s) flipStair(s);
  });
}

/** Uzavřený tvar kresby se označí jako schodiště (ruční obrys); kresba se nahradí schodištěm. */
export function drawingToStair(drawingId: Id): Id | null {
  const d = store.floor()?.drawings?.[drawingId];
  if (!d || !canHatch(d) || d.shape === 'double') return null;
  const outline = drawingPolylines(d)[0];
  if (!outline || outline.length < 3) return null;
  // uzavřená lomená čára má poslední bod shodný s prvním – obrys bez opakování
  const pts = outline.length > 3 && Math.hypot(outline[0]!.x - outline[outline.length - 1]!.x, outline[0]!.y - outline[outline.length - 1]!.y) < 0.5 ? outline.slice(0, -1) : outline;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const s = stairFromOutline(newId('st'), newId('sf'), pts, 2);
  s.flights[0]!.steps = defaultSteps(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  store.edit(
    floor => {
      if (floor.drawings) delete floor.drawings[drawingId];
      (floor.stairs ??= {})[s.id] = s;
    },
    { selection: { kind: 'stair', id: s.id }, numpad: null }
  );
  return s.id;
}

/** Ruční obrys: osa výstupu o 90° (podél druhé strany obrysu). */
export function turnStairAxis(id: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? turnOutlineAxis(s) : false;
  });
}
