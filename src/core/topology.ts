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
import { openingStartFromA, wallNodes } from './floorQueries';

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
      // Změřená stěna → obě části jsou dané změřením (celek + poloha napojení)
      measured: wall.measured === null ? null : Math.round(partLen),
      label: { ...wall.label }
    };
    if (partSag) w.sagitta = partSag;
    if (wall.style) w.style = wall.style;
    return w;
  };
  const wA = part(wall.a, nodeId, lenA, sagParts ? sagParts[0] : null);
  const wB = part(nodeId, wall.b, lenB, sagParts ? sagParts[1] : null);
  delete floor.walls[wallId];
  floor.walls[wA.id] = wA;
  floor.walls[wB.id] = wB;

  // Otvory přesunout na část, ve které leží jejich střed
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== wallId) continue;
    const start = openingStartFromA(op, len);
    const center = start + op.width / 2;
    const inA = center <= at;
    const target = inA ? wA : wB;
    const partLen = inA ? lenA : lenB;
    const startInPart = Math.max(0, Math.min(partLen - op.width, inA ? start : start - at));
    op.wallId = target.id;
    op.offset = Math.max(0, Math.round(op.ref === 'a' ? startInPart : partLen - startInPart - op.width));
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
