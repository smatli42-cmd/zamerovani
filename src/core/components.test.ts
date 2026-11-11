import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { componentGap, visibleComponentGap } from './components';
import { pickAny } from '../tools/pick';
const DEFAULT_CAMERA = { x: 0, y: 0, zoom: 0.15 };

/** L-roh A podél +x, B podél −y; po odpojení má B vlastní uzel c2 na stejných souřadnicích. */
function corner(separated: boolean): { f: Floor; A: string; B: string } {
  const f = createFloor('t');
  for (const [id, x, y] of [['c', 0, 0], ['ax', 3000, 0], ['by', 0, -3000]] as const) f.nodes[id] = { id, x, y };
  const A = createWall('c', 'ax', 0, 300, 1);
  const B = createWall('c', 'by', 0, 300, -1);
  f.walls[A.id] = A;
  f.walls[B.id] = B;
  if (separated) {
    f.nodes.c2 = { id: 'c2', x: 0, y: 0 };
    B.a = 'c2';
    B.noJoinA = true;
  }
  return { f, A: A.id, B: B.id };
}

describe('odstup skupiny (kóta) u odděleného konce', () => {
  it('oddělené stěny: kóta odstupu se nenabízí ani u jedné, i když se dotýkají (dnes by byla 0)', () => {
    const { f, A, B } = corner(true);
    expect(componentGap(f, B, 'bottom')?.value).toBe(0); // surový odstup existuje…
    for (const w of [A, B]) for (const s of ['left', 'right', 'top', 'bottom'] as const) expect(visibleComponentGap(f, w, s)).toBeNull();
  });

  it('samostatný předmět s nenulovým odstupem kótu dál má', () => {
    const { f, B } = corner(true);
    f.nodes.c2!.y = 0;
    f.nodes.by!.y = -3000;
    // příčka 500 mm pod stěnou A, bez oddělených konců
    f.nodes.p1 = { id: 'p1', x: 1000, y: 800 };
    f.nodes.p2 = { id: 'p2', x: 2000, y: 800 };
    const P = createWall('p1', 'p2', 0, 100, 1);
    f.walls[P.id] = P;
    expect(visibleComponentGap(f, P.id, 'top')?.value).toBe(800);
    void B;
  });
});

describe('ťuknutí na roh', () => {
  it('u odděleného rohu vybere uzel (ne kótu ani stěnu)', () => {
    const { f } = corner(true);
    const hit = pickAny(f, { x: 2, y: 2 }, DEFAULT_CAMERA);
    expect(hit?.kind).toBe('node');
  });
});
