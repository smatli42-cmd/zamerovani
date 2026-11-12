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
import { otherEnd, wallsAtNode, wallSegments } from './floorQueries';

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

  const current = dist(nA, nB);
  const delta = length - current;

  // Posun bodu napojení po rovné stěně (stěna rozdělená příčkou)
  if (target !== 'both' && Math.abs(delta) >= 0.05) {
    const moving = target.nodeId === nA.id ? nA : nB;
    const fixed = moving === nA ? nB : nA;
    const junction = shiftJunction(floor, wallId, moving, fixed, delta);
    if (junction === 'invalid') return false;
    if (junction === 'done') {
      wall.measured = Math.round(length);
      return true;
    }
  }

  wall.measured = Math.round(length);
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
  // úseky stěn: napojený roh (T bez dělení) je spojený s průběžnou stěnou
  const segs = wallSegments(floor);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const w of segs) {
      const next = w.from === cur ? w.to : w.to === cur ? w.from : null;
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
  // Jen to, co visí na posouvaném rohu – samostatné skupiny stěn (jiná místnost) se nehýbou
  // (chyba nahlášená uživatelem 2026-11-12: dřív se posunulo vše, k čemu se nedalo dojít od pevného rohu).
  const reachable = reachableWithout(floor, fixed.id, moving.id);
  for (const id of reachableWithout(floor, moving.id, fixed.id)) {
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
    // roh napojený doprostřed průběžné stěny (T bez dělení): kolmý posun posune celou průběžnou stěnu
    // (dřív ji tvořily dvě kolmé části v tomto rohu)
    const host = moving.host ? floor.walls[moving.host] : undefined;
    if (host) {
      for (const endId of [host.a, host.b]) {
        const end = floor.nodes[endId];
        if (!end || end.id === fixed.id || toMove.has(end.id) || dist(moving, end) < 1) continue;
        if (Math.abs(dot(dir, unit(moving, end))) < PERPENDICULAR_DOT && !hasMeasuredWallAlong(floor, end, host.id, dir)) toMove.add(end.id);
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

/**
 * Pokud posouvaný roh leží uprostřed rovné stěny (za ním pokračuje stěna stejným směrem),
 * jde o bod napojení příčky: posune se jen tento bod a příčka s ním, celková délka zůstane.
 * Navazující část se zkrátí/prodlouží (a pokud byla změřená, její míra se přepočítá).
 */
function shiftJunction(floor: Floor, wallId: Id, moving: Node, fixed: Node, delta: number): 'done' | 'none' | 'invalid' {
  const u = unit(fixed, moving);
  const continuation = wallsAtNode(floor, moving.id).filter(w => {
    if (w.id === wallId) return false;
    const other = floor.nodes[otherEnd(w, moving.id)];
    return other !== undefined && dot(u, unit(moving, other)) > 0.9995;
  });
  if (continuation.length !== 1) return 'none';
  const cont = continuation[0]!;
  const contEnd = floor.nodes[otherEnd(cont, moving.id)]!;
  const newContLen = dist(moving, contEnd) - delta;
  if (newContLen < 10) return 'invalid';

  const dx = u.x * delta;
  const dy = u.y * delta;
  moving.x = round1(moving.x + dx);
  moving.y = round1(moving.y + dy);
  // Napojené příčky se posunou rovnoběžně (jejich druhý konec o stejný vektor)
  for (const w of wallsAtNode(floor, moving.id)) {
    if (w.id === wallId || w.id === cont.id) continue;
    const far = floor.nodes[otherEnd(w, moving.id)];
    if (!far || far.id === fixed.id || far.id === contEnd.id) continue;
    far.x = round1(far.x + dx);
    far.y = round1(far.y + dy);
    // Druhý konec příčky sedí na protější stěně → přepočítat míry jejích částí (celek se nemění)
    for (const ow of wallsAtNode(floor, far.id)) {
      if (ow.id === w.id || ow.measured === null) continue;
      const o = floor.nodes[otherEnd(ow, far.id)];
      if (o && Math.abs(dot(u, unit(far, o))) > 0.9995) ow.measured = Math.round(dist(far, o));
    }
  }
  if (cont.measured !== null) cont.measured = Math.round(newContLen);
  return 'done';
}
