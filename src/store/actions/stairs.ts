/**
 * Akce: schodiště (2D značka; geometrie a dopočty v core/stairs.ts, ramena v core/stairFlight.ts, vznik částí
 * v core/stairCreate.ts).
 */
import { canHatch, drawingPolylines } from '../../core/drawing';
import { addStairTee, addStairTurn, canAppendFlight, canWind, defaultSteps, flightFromCorners, flightLength, flipStair, isLTurn, isTee, isUTurn, relayoutStair, removeLastFlight, STAIR_MIN, stairFromOutline, turnOutlineAxis, type StairJoin, type StairTurn } from '../../core/stairs';
import { bendFlight, mirrorFlightArc, straightenFlight } from '../../core/stairFlight';
import { bridgeLanding, landingForPolygon, orientFreeFlight, sizedFlight, spiralFlight } from '../../core/stairCreate';
import { defaultWinders, WINDERS } from '../../core/stairWinders';
import { newId } from '../../model/factory';
import type { Drawing, Id, Pt, Stair, StairFlight } from '../../model/types';
import { store } from '../store';

const P = (v: Pt): Pt => ({ x: Math.round(v.x), y: Math.round(v.y) });

/** Vloží nové schodiště s jedním ramenem a vybere ho. */
function insertStair(f: StairFlight): Id {
  const s: Stair = { id: newId('st'), flights: [f], landings: [] };
  store.edit(floor => void ((floor.stairs ??= {})[s.id] = s), { selection: { kind: 'stair', id: s.id }, numpad: null });
  return s.id;
}

/** Nové přímé schodiště (jedno rameno) ze dvou protějších rohů; vybere se. */
export function addStair(p: Pt, q: Pt): Id | null {
  const f = flightFromCorners(newId('sf'), P(p), P(q), 2);
  if (flightLength(f) < STAIR_MIN.length || f.width < STAIR_MIN.width) return null;
  f.steps = defaultSteps(flightLength(f));
  return insertStair(f);
}

/** Nové přímé schodiště zadaných rozměrů: roh u prvního stupně `p`, směr k bodu `q`. */
export function addSizedStair(p: Pt, q: Pt, width: number, length: number): Id | null {
  const f = sizedFlight(newId('sf'), P(p), q, width, length);
  return f ? insertStair(f) : null;
}

/** Nové točité schodiště: střed `c`, bod `p` na vnějším okraji u prvního stupně. */
export function addSpiralStair(c: Pt, p: Pt): Id | null {
  const f = spiralFlight(newId('sf'), P(c), P(p));
  return f ? insertStair(f) : null;
}

/**
 * Ručně nakreslené další rameno (dva protější rohy) k schodišti `id`: stojí, kde je nakreslené, podesta mezi
 * rameny vyplní mezeru (dá se nahradit kresbou – `drawingToLanding`).
 */
export function appendDrawnFlight(id: Id, p: Pt, q: Pt, size?: { width: number; length: number }): boolean {
  // zadané rozměry: roh u prvního stupně + směr (jako nové schodiště), jinak protější rohy
  const f = size ? sizedFlight(newId('sf'), P(p), q, size.width, size.length) : flightFromCorners(newId('sf'), P(p), P(q), 2);
  if (!f || flightLength(f) < STAIR_MIN.length || f.width < STAIR_MIN.width) return false;
  if (!size) f.steps = defaultSteps(flightLength(f));
  let ok = false;
  store.edit(
    floor => {
      const s = floor.stairs?.[id];
      const prev = s?.flights[s.flights.length - 1];
      if (!s || !prev || !canAppendFlight(s)) return false;
      orientFreeFlight(prev, f);
      s.flights.push(f);
      s.landings.push({ id: newId('sl'), pts: bridgeLanding(prev, f) });
      ok = true;
      return true;
    },
    { selection: { kind: 'stair', id }, numpad: null }
  );
  return ok;
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

/**
 * Počet stoupání ramene (nejméně 2). Atypické T: rameno L a větev T vedou do stejné výšky – počet se mění u obou
 * zároveň (výška stupně a popisek platí pro obě větve).
 */
export function setFlightSteps(id: Id, flightId: Id, steps: number): void {
  if (!Number.isFinite(steps)) return;
  const n = Math.max(STAIR_MIN.steps, Math.min(STAIR_MIN.maxSteps, Math.round(steps)));
  store.edit(floor => {
    const fl = floor.stairs?.[id]?.flights ?? [];
    const i = fl.findIndex((x: StairFlight) => x.id === flightId);
    if (i < 0) return false;
    fl[i]!.steps = n;
    const pair = isTee(fl[i]) ? fl[i - 1] : isTee(fl[i + 1]) ? fl[i + 1] : undefined;
    if (pair) pair.steps = n;
    return true;
  });
}

/** Atypické T: podesta a dvě ramena z jejích boků (L vlevo + větev T vpravo). */
export function addStairTeeFlights(id: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? addStairTee(s, { flight: newId('sf'), landing: newId('sl'), tee: newId('sf'), teeLanding: newId('sl') }) : false;
  });
}

/** Přidá podestu a další rameno (L / U / rovně). */
export function addStairFlight(id: Id, turn: StairTurn): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? addStairTurn(s, turn, { flight: newId('sf'), landing: newId('sl') }) : false;
  });
}

/**
 * Změní napojení ramene (L / U, vlevo / vpravo, rovně, nebo „volně“ = rameno i podesta zůstanou, kde jsou).
 * Zabíhavé stupně zůstanou jen u L / U (počet se u změny L ↔ U nastaví na výchozí). Atypické T: větev T napojení
 * nemění, rameno L, ze kterého vychází, jde jen přepnout L vlevo ↔ L vpravo (větev T se přehodí na druhou stranu).
 */
export function setStairTurn(id: Id, flightId: Id, turn: StairJoin): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    const f = s?.flights.find(x => x.id === flightId);
    const i = s && f ? s.flights.indexOf(f) : -1;
    if (!s || !f || i < 1 || isTee(f) || turn === 'tee') return false;
    if (isTee(s.flights[i + 1]) && !isLTurn(turn)) return false;
    const land = s.landings[i - 1];
    const wasU = isUTurn(f.turn);
    f.turn = turn;
    // L: podesta nesmí být mělčí než šířka ramene (z Rovně / U mohla zůstat menší hloubka) → výchozí = šířka ramene
    if (isLTurn(turn) && f.depth !== undefined && f.depth < f.width - 0.5) delete f.depth;
    if (land?.winders) {
      if (!canWind(s, i)) delete land.winders;
      else if (isUTurn(turn) !== wasU) land.winders = defaultWinders(isUTurn(turn));
    }
    relayoutStair(s);
    return true;
  });
}

/** Podesta před ramenem `flightId` → zabíhavé stupně (`count`), nebo zpět podesta (`null`). */
export function setLandingWinders(id: Id, flightId: Id, count: number | null): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    const f = s?.flights.find(x => x.id === flightId);
    const i = s && f ? s.flights.indexOf(f) : -1;
    const land = s && i > 0 ? s.landings[i - 1] : undefined;
    if (!s || !f || !land || (count !== null && !canWind(s, i))) return false;
    if (count === null) delete land.winders;
    else land.winders = Math.max(WINDERS.min, Math.min(WINDERS.max, Math.round(count === 0 ? defaultWinders(isUTurn(f.turn)) : count)));
    return true;
  });
}

/** Tvar ramene: rovné ↔ po oblouku (výchozí úhel 90°); navazující ramena se dorovnají. */
export function setFlightArc(id: Id, flightId: Id, arc: boolean): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    const f = s?.flights.find(x => x.id === flightId);
    if (!s || !f || s.outline) return false;
    const ok = arc ? bendFlight(f, 90) : straightenFlight(f);
    if (ok) relayoutStair(s);
    return ok;
  });
}

/** Oblouk ramene zahne na druhou stranu. */
export function mirrorStairArc(id: Id, flightId: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    const f = s?.flights.find(x => x.id === flightId);
    // točité (1. rameno přes půl otáčky): střed stojí, otočí se smysl otáčení
    const spiral = s?.flights[0] === f && !!f?.sweep && Math.abs(f.sweep) >= 180;
    if (!s || !f || !mirrorFlightArc(f, spiral)) return false;
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

/** Obrys uzavřeného tvaru kresby (bez opakovaného posledního bodu); null = tvar není uzavřený. */
function closedOutline(d: Drawing | undefined): Pt[] | null {
  if (!d || !canHatch(d) || d.shape === 'double') return null;
  const outline = drawingPolylines(d)[0];
  if (!outline || outline.length < 3) return null;
  // uzavřená lomená čára má poslední bod shodný s prvním – obrys bez opakování
  return outline.length > 3 && Math.hypot(outline[0]!.x - outline[outline.length - 1]!.x, outline[0]!.y - outline[outline.length - 1]!.y) < 0.5 ? outline.slice(0, -1) : outline;
}

/** Uzavřený tvar kresby se označí jako schodiště (ruční obrys); kresba se nahradí schodištěm. */
export function drawingToStair(drawingId: Id): Id | null {
  const pts = closedOutline(store.floor()?.drawings?.[drawingId]);
  if (!pts) return null;
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

/**
 * Uzavřený tvar kresby se stane podestou schodiště, které má podestu (nebo místo mezi rameny) v kresbě nebo
 * nejblíž (do 1 m). Navazující rameno pak stojí, kde je („volně“), zabíhavé stupně se zruší. Kresba zmizí.
 * Vrací id schodiště; null = tvar není uzavřený / žádné schodiště poblíž (hlášení).
 */
export function drawingToLanding(drawingId: Id): Id | null {
  const floor0 = store.floor();
  const pts = closedOutline(floor0?.drawings?.[drawingId]);
  const hit = floor0 && pts ? landingForPolygon(floor0, pts) : null;
  if (!pts || !hit) {
    store.set({ lockBlock: { key: '', text: 'Podesta: u kresby není žádné schodiště se dvěma rameny (podesta musí ležet v kresbě nebo do 1 m od ní).' } });
    return null;
  }
  const { stair, index } = hit;
  store.edit(
    floor => {
      const s = floor.stairs?.[stair.id];
      const f = s?.flights[index];
      const land = s?.landings[index - 1];
      if (!s || !f || !land) return false;
      land.pts = pts.map(P);
      delete land.winders;
      delete f.depth;
      f.turn = 'free';
      if (floor.drawings) delete floor.drawings[drawingId];
      return true;
    },
    { selection: { kind: 'stair', id: stair.id }, numpad: null }
  );
  return stair.id;
}

/** Ruční obrys: osa výstupu o 90° (podél druhé strany obrysu). */
export function turnStairAxis(id: Id): void {
  store.edit(floor => {
    const s = floor.stairs?.[id];
    return s ? turnOutlineAxis(s) : false;
  });
}
