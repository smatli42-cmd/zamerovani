/**
 * F7 – otvor blízko rohu: upozornění, ne zákaz. Osa Y dolů. Stěna S z a (0,0) do b (4000,0), tloušťka 300,
 * tělo nahoru (−y, side −1) = ven z místnosti, která leží v +y. Stěna L z a (0,0) do d (0,3000) navazuje v rohu a.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { openingCornerOverlap, openingCornerWarning } from './openingCorner';

function room(lInside: boolean) {
  const f: Floor = createFloor('t');
  f.nodes.a = { id: 'a', x: 0, y: 0 };
  f.nodes.b = { id: 'b', x: 4000, y: 0 };
  f.nodes.d = { id: 'd', x: 0, y: 3000 };
  const S = createWall('a', 'b', 0, 300, -1);
  // L: směr +y, normal = (−1, 0) → side 1 = tělo ven (−x); side −1 = tělo dovnitř místnosti (+x)
  const L = createWall('a', 'd', 0, 300, lInside ? -1 : 1);
  f.walls[S.id] = S;
  f.walls[L.id] = L;
  const add = (fields: Parameters<typeof createOpening>[3]) => {
    const op = createOpening(f, S.id, 'window', { width: 900, ...fields });
    f.openings[op.id] = op;
    return op.id;
  };
  return { f, S, L, add };
}

describe('F7: otvor blízko rohu', () => {
  it('těla ven z místnosti: otvor hned u vnitřního rohu nezasahuje do rohu', () => {
    const { f, add } = room(false);
    const id = add({ offset: 0, ref: 'a' });
    expect(openingCornerOverlap(f, id)).toEqual({ a: 0, b: 0, mid: 0 });
    expect(openingCornerWarning(f, id)).toBeNull();
  });

  it('tělo napojené stěny uvnitř místnosti: otvor u rohu se s ním překrývá o jeho tloušťku', () => {
    const { f, add } = room(true);
    const id = add({ offset: 0, ref: 'a' });
    expect(openingCornerOverlap(f, id)).toEqual({ a: 300, b: 0, mid: 0 });
    expect(openingCornerWarning(f, id)).toContain('do rohu A o 300 mm');
  });

  it('otvor dál od rohu (za tělem napojené stěny) je v pořádku', () => {
    const { f, add } = room(true);
    expect(openingCornerOverlap(f, add({ offset: 300, ref: 'a' }))).toEqual({ a: 0, b: 0, mid: 0 });
    expect(openingCornerOverlap(f, add({ offset: 200, ref: 'a' }))).toEqual({ a: 100, b: 0, mid: 0 });
  });

  it('volný konec B: otvor až ke konci stěny je v pořádku', () => {
    const { f, add } = room(true);
    expect(openingCornerOverlap(f, add({ offset: 0, ref: 'b' }))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('roh u konce B: přesah se hlásí u B', () => {
    const { f, S, add } = room(false);
    // stěna z b dolů do místnosti s tělem dovnitř (+... −x od b, tj. do místnosti)
    f.nodes.c = { id: 'c', x: 4000, y: 3000 };
    const R = createWall('b', 'c', 0, 250, 1); // směr +y, normal (−1,0) → side 1 = tělo −x = dovnitř
    f.walls[R.id] = R;
    const id = add({ offset: 100, ref: 'b' });
    expect(f.openings[id]!.wallId).toBe(S.id);
    expect(openingCornerOverlap(f, id)).toEqual({ a: 0, b: 150, mid: 0 });
    expect(openingCornerWarning(f, id)).toContain('do rohu B o 150 mm');
  });

  it('stěna bez tloušťky a neexistující otvor: nehlídá se', () => {
    const { f, S, add } = room(true);
    const id = add({ offset: 0, ref: 'a' });
    f.walls[S.id]!.thickness = 0;
    expect(openingCornerOverlap(f, id)).toBeNull();
    expect(openingCornerOverlap(f, 'nic')).toBeNull();
  });

  it('osa uprostřed: přesah je polovina tloušťky napojené stěny', () => {
    const { f, S, L, add } = room(true);
    f.walls[S.id]!.axis = 'center';
    f.walls[L.id]!.axis = 'center';
    expect(openingCornerOverlap(f, add({ offset: 0, ref: 'a' }))).toEqual({ a: 150, b: 0, mid: 0 });
  });

  it('příčka napojená doprostřed stěny (T): otvor přes ni zasahuje do jejího těla, vedle ní ne', () => {
    const { f, S, add } = room(false);
    // příčka z (2000, 0) do místnosti (+y), tloušťka 100, tělo x ∈ [1900, 2000]; napojená na S bez dělení
    f.nodes.m = { id: 'm', x: 2000, y: 0, host: S.id };
    f.nodes.e = { id: 'e', x: 2000, y: 2000 };
    const P = createWall('m', 'e', 0, 100, 1);
    f.walls[P.id] = P;
    const over = add({ offset: 1500, ref: 'a' }); // 1500–2400
    expect(openingCornerOverlap(f, over)).toEqual({ a: 0, b: 0, mid: 100 });
    expect(openingCornerWarning(f, over)).toContain('do napojené příčky o 100 mm');
    expect(openingCornerOverlap(f, add({ offset: 500, ref: 'a' }))).toEqual({ a: 0, b: 0, mid: 0 });
  });
});
