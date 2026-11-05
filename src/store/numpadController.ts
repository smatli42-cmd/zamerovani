/**
 * Logika číselné klávesnice (nezávislá na vzhledu) – používá ji panel NumPad i fyzická klávesnice.
 */
import { evaluateExpression } from '../core/geometry';
import { nextWallInChain, openingsOnWall } from '../core/floorQueries';
import type { Id } from '../model/types';
import { applyNumpadValue, numpadInitialValue, unlockWall } from './actions';
import { store, type NumPadTarget } from './store';

export type NumKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '+' | '-' | 'BACK' | 'CLEAR' | 'ENTER' | 'NEXT' | 'ESC';

export function numpadValue(): number | null {
  const np = store.get().numpad;
  return np ? evaluateExpression(np.buffer) : null;
}

export function openTarget(target: NumPadTarget): void {
  const floor = store.floor();
  if (!floor) return;
  const v = numpadInitialValue(floor, target);
  const selection =
    target.kind === 'wall-length'
      ? ({ kind: 'wall', id: target.wallId } as const)
      : ({ kind: 'opening', id: target.kind === 'opening-gap' ? target.secondId : target.openingId } as const);
  store.set({ numpad: { target, buffer: v === null ? '' : String(v), fresh: true }, selection });
}

export function pressKey(key: NumKey): void {
  const np = store.get().numpad;
  if (!np) return;
  let buffer = np.buffer;
  let fresh = np.fresh;

  switch (key) {
    case 'ESC':
      store.set({ numpad: null });
      return;
    case 'ENTER':
      commit();
      store.set({ numpad: null });
      return;
    case 'NEXT':
      commitAndNext();
      return;
    case 'BACK':
      buffer = fresh ? '' : buffer.slice(0, -1);
      fresh = false;
      break;
    case 'CLEAR':
      buffer = '';
      fresh = false;
      break;
    case '+':
    case '-':
      if (buffer === '' && key === '-') break;
      buffer = /[+-]$/.test(buffer) ? buffer.slice(0, -1) + key : buffer + key;
      fresh = false;
      break;
    default:
      buffer = (fresh ? '' : buffer) + key;
      if (buffer.length > 18) buffer = buffer.slice(0, 18);
      fresh = false;
  }
  store.set({ numpad: { ...np, buffer, fresh } });
}

function commit(): boolean {
  const np = store.get().numpad;
  if (!np) return false;
  const v = evaluateExpression(np.buffer);
  if (v === null) return false;
  return applyNumpadValue(np.target, Math.round(v));
}

/** Přepne roh, který se posune při změně délky stěny. */
export function setMoveTarget(move: { nodeId: Id } | 'both'): void {
  const np = store.get().numpad;
  if (!np || np.target.kind !== 'wall-length') return;
  store.set({ numpad: { ...np, target: { ...np.target, move } } });
}

export function unlockCurrentWall(): void {
  const np = store.get().numpad;
  if (!np || np.target.kind !== 'wall-length') return;
  unlockWall(np.target.wallId);
  store.set({ numpad: null });
}

/** Pořadí kót na stěně: ostění A → otvor → mezera → … → ostění B → celá stěna. */
function wallSequence(wallId: Id): NumPadTarget[] {
  const floor = store.floor();
  const wall = floor?.walls[wallId];
  if (!floor || !wall) return [];
  const placed = openingsOnWall(floor, wall);
  const seq: NumPadTarget[] = [];
  placed.forEach((po, i) => {
    const prev = placed[i - 1];
    seq.push(prev ? { kind: 'opening-gap', firstId: prev.op.id, secondId: po.op.id } : { kind: 'opening-offset', openingId: po.op.id, ref: 'a' });
    seq.push({ kind: 'opening-width', openingId: po.op.id });
  });
  if (placed.length) seq.push({ kind: 'opening-offset', openingId: placed[placed.length - 1]!.op.id, ref: 'b' });
  return seq;
}

function sameTarget(a: NumPadTarget, b: NumPadTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function commitAndNext(): void {
  const np = store.get().numpad;
  if (!np) return;
  commit();
  const floor = store.floor();
  if (!floor) return;
  const t = np.target;

  if (t.kind === 'wall-length') {
    const wall = floor.walls[t.wallId];
    if (!wall) return store.set({ numpad: null });
    const fromNode = t.move === 'both' ? wall.b : t.move.nodeId;
    const next = nextWallInChain(floor, wall.id, fromNode);
    if (!next) return store.set({ numpad: null });
    // Kóty otvorů na další stěně jdou před její celkovou délkou
    const seq = wallSequence(next.wall.id);
    if (seq.length) return openTarget(seq[0]!);
    return openTarget({ kind: 'wall-length', wallId: next.wall.id, move: { nodeId: next.nodeId } });
  }

  // Kóty otvorů: další v řadě, na konci celková délka stěny
  const opId = t.kind === 'opening-gap' ? t.secondId : t.openingId;
  const wallId = floor.openings[opId]?.wallId;
  if (!wallId) return store.set({ numpad: null });
  const seq = wallSequence(wallId);
  const idx = seq.findIndex(s => sameTarget(s, t));
  const nextT = seq[idx + 1];
  if (nextT) return openTarget(nextT);
  const wall = floor.walls[wallId]!;
  openTarget({ kind: 'wall-length', wallId, move: { nodeId: wall.b } });
}
