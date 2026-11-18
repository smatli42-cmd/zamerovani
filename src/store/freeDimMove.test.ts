/**
 * Volná kóta: výchozí posouvaný konec (chyba od uživatele 2026-11-18): kóta od okna (1. ťuknutí) k líci spodní stěny
 * (2. ťuknutí) – zadáním délky se má posunout okno, ne spodní stěna (ta by změnila nesouvisející zamčenou kótu).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { defaultFreeDimMove, freeDimValue } from '../core/freeDim';
import { dist } from '../core/geometry';
import { openingStartFromA, wallLength } from '../core/floorQueries';
import { addDrawRect, addFreeDim, addOpening, addWall, applyNumpadValue, setDimLock, setRevealEnabled } from './actions';
import { chainEdge } from '../core/openingChain';
import { openTarget } from './numpadController';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1)!;
const wallBy = (p: Pt, q: Pt) => Object.values(f().walls).find(w => [w.a, w.b].includes(nodeAt(p).id) && [w.a, w.b].includes(nodeAt(q).id))!;
const C: Pt[] = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }];

/** Místnost, okno s ostěním na pravé stěně, obdélník kresby se zamčenou kótou ke spodní stěně. */
function setup() {
  store.openProject(createProject({ name: 't' }));
  for (let i = 0; i < 4; i++) addWall(C[i]!, null, C[(i + 1) % 4]!, null, false, { thickness: 300, side: -1 });
  const op = addOpening(wallBy(C[1]!, C[2]!).id, 'window', 0.5)!;
  setRevealEnabled(op, true);
  const bottom = wallBy(C[2]!, C[3]!);
  const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
  const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
  setDimLock({ kind: 'free-dim', dimId: lk, move: 'b' }, true);
  const startOf = () => {
    const o = f().openings[op]!;
    return openingStartFromA(o, wallLength(f(), f().walls[o.wallId]!));
  };
  return { op, bottom, lk, startOf };
}

describe('volná kóta: výchozí posouvaný konec', () => {
  it('okno jako 1. bod, líc stěny jako 2.: NumPad posune okno, zamčená kóta se nezmění', () => {
    const { op, bottom, lk, startOf } = setup();
    const id = addFreeDim({ opening: op, edge: 'end', at: 0 }, { wall: bottom.id, side: 1, at: 4900 })!;
    openTarget({ kind: 'free-dim', dimId: id, move: 'b' });
    const t = store.get().numpad!.target;
    expect(t).toMatchObject({ kind: 'free-dim', move: 'a' });
    const s0 = startOf();
    const v0 = freeDimValue(f(), id)!;
    const lk0 = freeDimValue(f(), lk)!;
    expect(applyNumpadValue(t, Math.round(v0) + 300)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(Math.round(v0) + 300, 0);
    expect(Math.abs(startOf() - s0)).toBeCloseTo(300, 0);
    expect(freeDimValue(f(), lk)).toBeCloseTo(lk0, 6);
  });

  it('okno jako 2. bod: posune se okno (2.)', () => {
    const { op, bottom } = setup();
    const id = addFreeDim({ wall: bottom.id, side: 1, at: 4900 }, { opening: op, edge: 'end', at: 0 })!;
    expect(defaultFreeDimMove(f().dims![id]!)).toBe('b');
  });

  it('roh × kresba / pevný bod: posune se kresba / pevný bod, ne roh', () => {
    const { bottom } = setup();
    const r = addDrawRect({ x: 3000, y: 1000 }, { x: 3500, y: 1500 });
    const id1 = addFreeDim({ drawing: r, i: 0 }, { node: nodeAt(C[0]!).id })!;
    const id2 = addFreeDim({ x: 1000, y: 1000 }, { wall: bottom.id, side: 1, at: 1000 })!;
    expect(defaultFreeDimMove(f().dims![id1]!)).toBe('a');
    expect(defaultFreeDimMove(f().dims![id2]!)).toBe('a');
  });

  it('dvě stěny / dva rohy: dál 2. bod', () => {
    setup();
    const id = addFreeDim({ node: nodeAt(C[0]!).id }, { node: nodeAt(C[2]!).id })!;
    expect(defaultFreeDimMove(f().dims![id]!)).toBe('b');
  });

  it('automatická kóta okna k rohu B (obrázek uživatele): posune okno, zamčená kóta kresby se nezmění', () => {
    const { op, lk, startOf } = setup();
    const o = () => f().openings[op]!;
    const toB = chainEdge(f(), o(), 'b')!;
    const s0 = startOf();
    const lk0 = freeDimValue(f(), lk)!;
    const len0 = wallLength(f(), f().walls[o().wallId]!);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: op, ref: 'b' }, Math.round(toB) + 300)).toBe(true);
    expect(store.get().lockBlock).toBeNull();
    expect(chainEdge(f(), o(), 'b')).toBeCloseTo(Math.round(toB) + 300, 0);
    expect(s0 - startOf()).toBeCloseTo(300, 0);
    expect(wallLength(f(), f().walls[o().wallId]!)).toBeCloseTo(len0, 6);
    expect(freeDimValue(f(), lk)).toBeCloseTo(lk0, 6);
  });
});
