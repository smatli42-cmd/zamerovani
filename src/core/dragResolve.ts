/**
 * Tažení s držením směru (KRESLENI-EDITACE-KONCU.md, katalog D11, D12, D13, C2/16).
 *
 * Bod se při tažení zachytí na pomocné čáře (původní směr stěny, kolmice k jiné stěně, vodorovně/svisle…),
 * drží se jí (hystereze: uvolní se až za větším poloměrem) a délka podél ní je volná, s přichycením
 * na „zarážky“ (průsečík s jinou stěnou, pata kolmice). Čistá geometrie bez DOM, vzdálenosti v mm.
 */
import type { Floor, Id, Pt } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { isCurved } from './floorQueries';
import { arcGeometry, nearestOnArc } from './arc';

export interface DragLine {
  id: string;
  /** Bod, kterým čára prochází (pevný konec stěny / místo uchopení). */
  origin: Pt;
  /** Jednotkový směr. */
  dir: Pt;
  /** Násobek poloměru zachycení (původní směr 1,5×). */
  weight: number;
  /** Kolmice k jiné stěně – při zachycení se ukáže ikona ⊥ (D13). */
  perpTo?: Id;
  /** Úsečka stěny, ke které je kolmice (pro výběr podle blízkosti kurzoru). */
  perpSeg?: [Pt, Pt];
  /** Body na čáře, ke kterým se délka přichytí (průsečíky se stěnami, pata kolmice). */
  stops?: Pt[];
}

export interface DragParams {
  /** Poloměr zachycení (mm, příčně od čáry). */
  capture: number;
  /** Poloměr uvolnění (mm), typicky 2× zachycení. */
  release: number;
}

export interface DragResult {
  point: Pt;
  /** Zachycená čára (null = volný pohyb). */
  line: DragLine | null;
}

/** Výchozí parametry z poloměru zachycení v px a zoomu (KRESLENI-EDITACE-KONCU.md: ~10 px pero, ~16 px prst, uvolnění 2×). */
export function dragParams(capturePx: number, zoom: number): DragParams {
  const capture = capturePx / zoom;
  return { capture, release: 2 * capture };
}

const across = (p: Pt, l: DragLine) => Math.abs(dot(sub(p, l.origin), normal(l.dir)));
const collinear = (l: DragLine, m: DragLine) => Math.abs(l.dir.x * m.dir.y - l.dir.y * m.dir.x) < 1e-9 && across(m.origin, l) < 1e-6;
const project = (p: Pt, l: DragLine) => add(l.origin, scale(l.dir, dot(sub(p, l.origin), l.dir)));

/**
 * Výsledná poloha taženého bodu. `locked` = id čáry zachycené v minulém kroku (hystereze):
 * drží se, dokud je kurzor blíž než `release × weight`; jinak se hledá nejbližší čára do `capture × weight`.
 */
export function resolveDragPoint(cursor: Pt, lines: readonly DragLine[], locked: string | null, params: DragParams): DragResult {
  let line: DragLine | null = null;
  const held = locked ? lines.find(l => l.id === locked) : undefined;
  if (held && across(cursor, held) <= params.release * held.weight) line = held;
  else {
    let best = Infinity;
    for (const l of lines) {
      const d = across(cursor, l) / l.weight;
      // při shodě (totožné čáry) má přednost kolmice ke stěně
      if (d <= params.capture && (d < best - 1e-9 || (Math.abs(d - best) <= 1e-9 && l.perpTo && !line?.perpTo))) {
        best = d;
        line = l;
      }
    }
  }
  if (!line) return { point: cursor, line: null };
  // totožné čáry (stejný bod, rovnoběžné): zachycená převezme příznak kolmice ⊥ a zarážky ostatních
  const twins = lines.filter(l => l !== line && collinear(l, line!));
  if (twins.length) {
    const perp = twins.find(l => l.perpTo);
    line = { ...line, ...(line.perpTo || !perp ? {} : { perpTo: perp.perpTo }), stops: [...(line.stops ?? []), ...twins.flatMap(l => l.stops ?? [])] };
  }
  let point = project(cursor, line);
  // délka podél čáry je volná, ale blízká zarážka (průsečík se stěnou, pata kolmice) ji přichytí
  let bestStop = params.capture;
  for (const s of line.stops ?? []) {
    const d = dist(point, s);
    if (d <= bestStop) {
      bestStop = d;
      point = s;
    }
  }
  return { point, line };
}

/** Průsečík přímky (o, d) s úsečkou a–b; null mimo úsečku nebo u rovnoběžek. */
function lineSegment(o: Pt, d: Pt, a: Pt, b: Pt): Pt | null {
  const e = sub(b, a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(a, o);
  const s = (w.x * d.y - w.y * d.x) / den; // poloha na úsečce
  if (s < -1e-6 || s > 1 + 1e-6) return null;
  return add(a, scale(e, s));
}

/** Rovné stěny kromě vyloučených (pro kolmice a zarážky). */
function straightWalls(floor: Floor, exclude: Set<Id>) {
  const out: { id: Id; a: Pt; b: Pt }[] = [];
  for (const w of Object.values(floor.walls)) {
    if (exclude.has(w.id) || isCurved(w) || w.radius !== undefined) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (a && b && dist(a, b) > 1) out.push({ id: w.id, a, b });
  }
  return out;
}

/** Oblouky (ne kruhy) kromě vyloučených – pro zarážky. */
function arcWalls(floor: Floor, exclude: Set<Id>) {
  const out: { a: Pt; b: Pt; sagitta: number }[] = [];
  for (const w of Object.values(floor.walls)) {
    if (exclude.has(w.id) || !w.sagitta || w.radius !== undefined) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (a && b && dist(a, b) > 1) out.push({ a, b, sagitta: w.sagitta });
  }
  return out;
}

/** Zarážky na čáře: průsečíky s ostatními rovnými stěnami a s oblouky. */
function stopsOn(o: Pt, d: Pt, walls: { a: Pt; b: Pt }[], arcs: { a: Pt; b: Pt; sagitta: number }[] = []): Pt[] {
  const out: Pt[] = [];
  for (const w of walls) {
    const x = lineSegment(o, d, w.a, w.b);
    if (x) out.push(x);
  }
  for (const w of arcs) {
    const g = arcGeometry(w.a, w.b, w.sagitta);
    if (!g) continue;
    const f = sub(o, g.center);
    const bb = dot(f, d);
    const disc = bb * bb - (dot(f, f) - g.r * g.r);
    if (disc < 0) continue;
    for (const sgn of [-1, 1]) {
      const p = add(o, scale(d, -bb + sgn * Math.sqrt(disc)));
      if (nearestOnArc(p, w.a, w.b, w.sagitta).distance < 0.01) out.push(p);
    }
  }
  return out;
}

/** Vzdálenost bodu od úsečky. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const e = sub(b, a);
  const len2 = dot(e, e);
  const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / len2)) : 0;
  return dist(p, add(a, scale(e, t)));
}

/**
 * Pomocné čáry pro tažení rohu `nodeId` (D11, D13): pro každou napojenou rovnou stěnu její původní směr
 * přes pevný (vzdálený) konec – u rohu více stěn se směr vybere tažením po příslušné čáře, ostatní stěny
 * se otáčejí kolem svých vzdálených konců; u jediné stěny navíc kolmo na původní směr a vodorovně / svisle;
 * kolmice ke stěnám v blízkosti kurzoru (`near`, mm) s ikonou ⊥.
 */
export function nodeDragLines(floor: Floor, nodeId: Id, cursor?: Pt, near = Infinity): DragLine[] {
  const all = allNodeDragLines(floor, nodeId);
  return cursor ? linesNear(all, cursor, near) : all;
}

/** Kolmice ke stěnám jen u stěn blíž než `near` od kurzoru; ostatní čáry beze změny. */
export function linesNear(lines: readonly DragLine[], cursor: Pt, near: number): DragLine[] {
  return lines.filter(l => !l.perpSeg || l.id.startsWith('orig:') || segDist(cursor, l.perpSeg[0], l.perpSeg[1]) <= near);
}

function allNodeDragLines(floor: Floor, nodeId: Id): DragLine[] {
  const node = floor.nodes[nodeId];
  if (!node) return [];
  const own = Object.values(floor.walls).filter(w => (w.a === nodeId || w.b === nodeId) && w.a !== w.b && w.radius === undefined && !isCurved(w));
  const ownIds = new Set(Object.values(floor.walls).filter(w => w.a === nodeId || w.b === nodeId).map(w => w.id));
  const others = straightWalls(floor, ownIds);
  const arcs = arcWalls(floor, ownIds);
  const lines: DragLine[] = [];
  for (const w of own) {
    const far = floor.nodes[w.a === nodeId ? w.b : w.a];
    if (!far || dist(far, node) < 1) continue;
    const d = unit(far, node);
    lines.push({ id: `orig:${w.id}`, origin: far, dir: d, weight: 1.5, stops: stopsOn(far, d, others, arcs) });
    if (own.length === 1) {
      const n = normal(d);
      lines.push({ id: `perp:${w.id}`, origin: far, dir: n, weight: 1, stops: stopsOn(far, n, others, arcs) });
      for (const ax of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
        if (Math.abs(dot(ax, d)) > 0.999 || Math.abs(dot(ax, n)) > 0.999) continue; // splývá s původním směrem / kolmicí
        lines.push({ id: `axis:${w.id}:${ax.x}`, origin: far, dir: ax, weight: 1, stops: stopsOn(far, ax, others, arcs) });
      }
    }
    // kolmice k jiné stěně, ke které se konec blíží (D13) – výběr podle blízkosti dělá linesNear
    for (const o of others) {
      const n = normal(unit(o.a, o.b));
      const foot = lineSegment(far, n, o.a, o.b);
      // může splývat s jinou čárou (vodorovně, původní směr, kolmice k rovnoběžné stěně) – sloučí se až
      // v resolveDragPoint mezi čarami poblíž pera
      lines.push({ id: `wperp:${w.id}:${o.id}`, origin: far, dir: n, weight: 1, perpTo: o.id, perpSeg: [o.a, o.b], stops: foot ? [foot] : [] });
    }
  }
  return lines;
}

/**
 * Pomocné čáry pro posun celé stěny (D12): přes místo uchopení ve směru stěny (posun podél) a kolmo na ni
 * (rovnoběžné odsunutí); posun je jinak volný.
 */
export function wallMoveLines(floor: Floor, wallId: Id, grab: Pt): DragLine[] {
  const w = floor.walls[wallId];
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  if (!w || !a || !b || dist(a, b) < 1) return [];
  const d = unit(a, b);
  return [
    { id: 'along', origin: grab, dir: d, weight: 1.5 },
    { id: 'offset', origin: grab, dir: normal(d), weight: 1.5 }
  ];
}

/**
 * Pomocné čáry pro kreslení nové stěny z bodu `start` (stejná mechanika jako tažení konce, D11/D13):
 * vodorovně a svisle (zachycení 1,5×), u začátku v rohu pokračování a kolmice napojených rovných stěn,
 * kolmice k blízkým stěnám (⊥); zarážky na průsečících se stěnami i oblouky. Jinak se kreslí libovolným směrem.
 */
export function drawLinesFrom(floor: Floor, start: Pt, startNodeId: Id | null): DragLine[] {
  const own = startNodeId ? Object.values(floor.walls).filter(w => (w.a === startNodeId || w.b === startNodeId) && w.a !== w.b && w.radius === undefined && !isCurved(w)) : [];
  const ownIds = new Set(own.map(w => w.id));
  const others = straightWalls(floor, ownIds);
  const arcs = arcWalls(floor, ownIds);
  const lines: DragLine[] = [];
  const push = (id: string, dir: Pt, weight: number, extra: Partial<DragLine> = {}) =>
    lines.push({ id, origin: start, dir, weight, stops: stopsOn(start, dir, others, arcs), ...extra });
  push('axis:x', { x: 1, y: 0 }, 1.5);
  push('axis:y', { x: 0, y: 1 }, 1.5);
  for (const w of own) {
    const far = floor.nodes[w.a === startNodeId ? w.b : w.a];
    if (!far || dist(far, start) < 1) continue;
    const d = unit(far, start);
    push(`cont:${w.id}`, d, 1.2);
    push(`perp:${w.id}`, normal(d), 1.2);
  }
  for (const o of others) {
    const n = normal(unit(o.a, o.b));
    const foot = lineSegment(start, n, o.a, o.b);
    lines.push({ id: `wperp:${o.id}`, origin: start, dir: n, weight: 1, perpTo: o.id, perpSeg: [o.a, o.b], stops: foot ? [foot] : [] });
  }
  return lines;
}
