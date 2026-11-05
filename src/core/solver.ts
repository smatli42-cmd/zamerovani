/**
 * Řešič délek stěn („gumička“).
 *
 * Při zadání změřené délky stěny posune jeden (nebo oba) rohy ve směru stěny tak, aby:
 * - volné větve stěn napojené na posouvaný roh se posunuly celé,
 * - sousední kolmé stěny zůstaly kolmé (posune se i jejich druhý roh),
 *   pokud tento roh nedrží jiná už ZMĚŘENÁ stěna ve směru posunu.
 *
 * Pracuje přímo nad (měnitelnou) kopií podlaží – volá se uvnitř store.edit().
 */
import type { Floor, Id, Node } from '../model/types';
import { dist, dot, unit } from './geometry';
import { otherEnd, wallsAtNode } from './floorQueries';

/** Který roh se posune: konkrétní roh stěny, nebo oba (od středu). */
export type MoveTarget = { nodeId: Id } | 'both';

/** Úhlová tolerance „kolmosti“ – cca 20° od kolmice. */
const PERPENDICULAR_DOT = 0.35;
/** Tolerance „rovnoběžnosti“ – cca 60° od směru posunu. */
const PARALLEL_DOT = 0.5;

export function setWallLength(floor: Floor, wallId: Id, length: number, target: MoveTarget): boolean {
  const wall = floor.walls[wallId];
  if (!wall || !Number.isFinite(length) || length < 10) return false;
  const nA = floor.nodes[wall.a];
  const nB = floor.nodes[wall.b];
  if (!nA || !nB) return false;

  wall.measured = Math.round(length);
  const current = dist(nA, nB);
  const delta = length - current;
  if (Math.abs(delta) < 0.05) return true;

  if (target === 'both') {
    const u = unit(nA, nB);
    moveNodeWithRubberBand(floor, nB, nA, u.x * (delta / 2), u.y * (delta / 2));
    moveNodeWithRubberBand(floor, nA, nB, -u.x * (delta / 2), -u.y * (delta / 2));
  } else {
    const moving = target.nodeId === nA.id ? nA : nB;
    const fixed = moving === nA ? nB : nA;
    const u = unit(fixed, moving);
    moveNodeWithRubberBand(floor, moving, fixed, u.x * delta, u.y * delta);
  }
  return true;
}

/** Uzly dosažitelné z `startId` po stěnách, aniž bychom prošli přes `blockedId`. */
export function reachableWithout(floor: Floor, startId: Id, blockedId: Id): Set<Id> {
  const visited = new Set<Id>([startId]);
  const queue: Id[] = [startId];
  const walls = Object.values(floor.walls);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const w of walls) {
      const next = w.a === cur ? w.b : w.b === cur ? w.a : null;
      if (next && next !== blockedId && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

function hasMeasuredWallAlong(floor: Floor, node: Node, excludeWallId: Id, dir: { x: number; y: number }): boolean {
  for (const w of wallsAtNode(floor, node.id)) {
    if (w.id === excludeWallId || w.measured === null) continue;
    const other = floor.nodes[otherEnd(w, node.id)];
    if (!other || dist(node, other) < 1) continue;
    if (Math.abs(dot(dir, unit(node, other))) > PARALLEL_DOT) return true;
  }
  return false;
}

export function moveNodeWithRubberBand(floor: Floor, moving: Node, fixed: Node, dx: number, dy: number): void {
  const toMove = new Set<Id>([moving.id]);

  // 1) Volné větve: uzly, ke kterým se od pevného rohu nedá dojít jinak než přes posouvaný roh.
  const reachable = reachableWithout(floor, fixed.id, moving.id);
  for (const id of Object.keys(floor.nodes)) {
    if (!reachable.has(id)) toMove.add(id);
  }

  // 2) Sousední kolmé stěny v uzavřené místnosti.
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) {
    const dir = { x: dx / len, y: dy / len };
    for (const w of wallsAtNode(floor, moving.id)) {
      const neighbor = floor.nodes[otherEnd(w, moving.id)];
      if (!neighbor || neighbor.id === fixed.id || toMove.has(neighbor.id)) continue;
      if (dist(moving, neighbor) < 1) continue;
      const isPerpendicular = Math.abs(dot(dir, unit(moving, neighbor))) < PERPENDICULAR_DOT;
      if (isPerpendicular && !hasMeasuredWallAlong(floor, neighbor, w.id, dir)) {
        toMove.add(neighbor.id);
      }
    }
  }

  for (const id of toMove) {
    const n = floor.nodes[id];
    if (!n) continue;
    n.x = round1(n.x + dx);
    n.y = round1(n.y + dy);
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
