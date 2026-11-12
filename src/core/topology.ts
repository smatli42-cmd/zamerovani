/**
 * Změny propojení stěn: rozdělení stěny v místě, kam se napojí jiná stěna.
 *
 * Napojená stěna (např. příčka) rozdělí původní stěnu na dvě samostatné stěny.
 * Každá část má vlastní kótu a dá se samostatně vybrat a smazat.
 */
import { newId } from '../model/factory';
import type { Floor, Id, Wall } from '../model/types';
import { nearestOnArc, splitArcSagittas } from './arc';
import { dist } from './geometry';
import { openingSpan, openingStartFromA, wallLength, wallNodes } from './floorQueries';
import { straightContinuation } from './wallBody';

/** Jak blízko (mm) musí roh ležet u stěny, aby ji rozdělil. */
const ON_WALL_TOL = 1;
/** Minimální délka části stěny po rozdělení (mm). */
const MIN_PART = 5;

/**
 * Rozdělí stěnu v rohu `nodeId` (roh musí ležet na stěně).
 * Vrací ID nových dvou stěn [A–roh, roh–B], nebo null, pokud nejde rozdělit.
 */
export function splitWallAt(floor: Floor, wallId: Id, nodeId: Id): [Id, Id] | null {
  const wall = floor.walls[wallId];
  const node = floor.nodes[nodeId];
  if (!wall || !node || wall.a === nodeId || wall.b === nodeId || wall.radius !== undefined) return null;
  const n = wallNodes(floor, wall);
  if (!n) return null;
  const [nA, nB] = n;
  const len = dist(nA, nB);
  const sag = wall.sagitta ?? 0;
  const pr = nearestOnArc(node, nA, nB, sag);
  // u oblouku se míry částí berou jako tětivy
  const lenA = dist(nA, pr.point);
  const lenB = dist(pr.point, nB);
  const at = sag ? lenA : pr.t * len;
  if (pr.distance > ON_WALL_TOL || lenA < MIN_PART || lenB < MIN_PART) return null;

  // Přesně na stěnu (bez zaokrouhlovací odchylky)
  node.x = pr.point.x;
  node.y = pr.point.y;
  const sagParts = sag ? splitArcSagittas(nA, nB, sag, pr.point) : null;
  const part = (a: Id, b: Id, partLen: number, partSag: number | null): Wall => {
    const w: Wall = {
      id: newId('w'),
      a,
      b,
      thickness: wall.thickness,
      side: wall.side,
      // Změřená stěna → obě části jsou dané změřením (celek + poloha napojení)
      measured: wall.measured === null ? null : Math.round(partLen),
      label: { ...wall.label }
    };
    if (partSag) w.sagitta = partSag;
    if (wall.style) w.style = wall.style;
    if (wall.sideLocked) w.sideLocked = true;
    if (wall.axis) w.axis = wall.axis;
    return w;
  };
  const wA = part(wall.a, nodeId, lenA, sagParts ? sagParts[0] : null);
  const wB = part(nodeId, wall.b, lenB, sagParts ? sagParts[1] : null);
  // příznak „nespojovat“ patří původním koncům; nový roh uprostřed ho nemá
  if (wall.noJoinA) wA.noJoinA = true;
  if (wall.noJoinB) wB.noJoinB = true;
  delete floor.walls[wallId];
  floor.walls[wA.id] = wA;
  floor.walls[wB.id] = wB;

  // Otvory přesunout na část, ve které leží jejich střed
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== wallId) continue;
    const start = openingStartFromA(op, len);
    const center = start + openingSpan(op) / 2;
    const inA = center <= at;
    const target = inA ? wA : wB;
    const partLen = inA ? lenA : lenB;
    const startInPart = Math.max(0, Math.min(partLen - openingSpan(op), inA ? start : start - at));
    op.wallId = target.id;
    op.offset = Math.max(0, Math.round(op.ref === 'a' ? startInPart : partLen - startInPart - openingSpan(op)));
  }
  return [wA.id, wB.id];
}

/** Rozdělí všechny stěny, na jejichž vnitřku leží roh `nodeId`. */
export function splitWallsAtNode(floor: Floor, nodeId: Id): void {
  const node = floor.nodes[nodeId];
  if (!node) return;
  for (const w of Object.values(floor.walls)) {
    if (w.a === nodeId || w.b === nodeId || w.radius !== undefined) continue;
    const n = wallNodes(floor, w);
    if (!n) continue;
    const pr = nearestOnArc(node, n[0], n[1], w.sagitta ?? 0);
    if (pr.distance <= ON_WALL_TOL) splitWallAt(floor, w.id, nodeId);
  }
}

/**
 * Sloučí stěnu `wallId` se stěnou, na jejíž volný konec v rohu `nodeId` rovně navazuje (stejná tloušťka).
 * Zůstane původní stěna (její strana těla, popisek, otvory na svém místě), prodloužená o novou;
 * roh mezi nimi zanikne (smaže ho úklid volajícího). Vrací ID výsledné stěny.
 */
export function mergeStraightAt(floor: Floor, wallId: Id, nodeId: Id): Id {
  const w = floor.walls[wallId];
  const node = floor.nodes[nodeId];
  if (!w || !node || w.sagitta || (w.a !== nodeId && w.b !== nodeId)) return wallId;
  const wFarId = w.a === nodeId ? w.b : w.a;
  const wFar = floor.nodes[wFarId];
  if (!wFar) return wallId;
  const o = straightContinuation(floor, nodeId, node, wFar, w.thickness, w.id);
  if (!o || o.axis !== w.axis) return wallId; // různá osa = dvě stěny
  const oldLen = wallLength(floor, o);
  const added = dist(node, wFar);
  const starts = Object.values(floor.openings)
    .filter(op => op.wallId === o.id)
    .map(op => ({ op, start: openingStartFromA(op, oldLen) + (o.a === nodeId ? added : 0) }));
  // otvory nakreslené na nové části (nebývají, ale pro jistotu) se přesunou na sloučenou stěnu
  const wLen = wallLength(floor, w);
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== w.id) continue;
    const s0 = openingStartFromA(op, wLen);
    // poloha od rohu nodeId podél nové části
    const fromNode = w.a === nodeId ? s0 : wLen - s0 - openingSpan(op);
    const start = o.b === nodeId ? oldLen + fromNode : added - fromNode - openingSpan(op);
    starts.push({ op, start });
    op.wallId = o.id;
  }
  // vzdálený konec nové části se stává koncem sloučené stěny – přenese se i jeho příznak
  const wFarNoJoin = w.a === nodeId ? w.noJoinB : w.noJoinA;
  if (o.a === nodeId) {
    o.a = wFarId;
    if (wFarNoJoin) o.noJoinA = true;
    else delete o.noJoinA;
  } else {
    o.b = wFarId;
    if (wFarNoJoin) o.noJoinB = true;
    else delete o.noJoinB;
  }
  o.measured = null;
  delete floor.walls[w.id];
  const newLen = oldLen + added;
  for (const { op, start } of starts) {
    const s = Math.max(0, Math.round(start));
    op.offset = op.ref === 'a' ? s : Math.max(0, Math.round(newLen - s - openingSpan(op)));
  }
  return o.id;
}
