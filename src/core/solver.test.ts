import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { setWallLength } from './solver';
import { dist, evaluateExpression } from './geometry';

/** Obdélníková místnost A(0,0) B(4000,0) C(4000,3000) D(0,3000). */
function rectRoom(): { floor: Floor; w: Record<'ab' | 'bc' | 'cd' | 'da', string> } {
  const floor = createFloor('test');
  const pts = { A: [0, 0], B: [4000, 0], C: [4000, 3000], D: [0, 3000] } as const;
  for (const [id, [x, y]] of Object.entries(pts)) floor.nodes[id] = { id, x, y };
  const mk = (a: string, b: string) => {
    const wall = createWall(a, b);
    floor.walls[wall.id] = wall;
    return wall.id;
  };
  return { floor, w: { ab: mk('A', 'B'), bc: mk('B', 'C'), cd: mk('C', 'D'), da: mk('D', 'A') } };
}

const len = (f: Floor, id: string) => {
  const w = f.walls[id]!;
  return dist(f.nodes[w.a]!, f.nodes[w.b]!);
};

describe('setWallLength', () => {
  it('prodlouží stěnu a zachová obdélník (posune i sousední roh)', () => {
    const { floor, w } = rectRoom();
    setWallLength(floor, w.ab, 4500, { nodeId: 'B' });
    expect(len(floor, w.ab)).toBeCloseTo(4500);
    expect(floor.nodes.C).toMatchObject({ x: 4500, y: 3000 });
    expect(len(floor, w.bc)).toBeCloseTo(3000);
    expect(floor.walls[w.ab]!.measured).toBe(4500);
  });

  it('pevný roh zůstane na místě', () => {
    const { floor, w } = rectRoom();
    setWallLength(floor, w.ab, 3800, { nodeId: 'A' });
    expect(floor.nodes.B).toMatchObject({ x: 4000, y: 0 });
    expect(floor.nodes.A).toMatchObject({ x: 200, y: 0 });
    expect(floor.nodes.D).toMatchObject({ x: 200, y: 3000 });
  });

  it('změřená protější stěna drží roh – vznikne šikmá stěna', () => {
    const { floor, w } = rectRoom();
    setWallLength(floor, w.cd, 4000, { nodeId: 'C' }); // CD změřena, beze změny
    setWallLength(floor, w.ab, 4100, { nodeId: 'B' });
    expect(floor.nodes.C).toMatchObject({ x: 4000, y: 3000 });
    expect(floor.nodes.B).toMatchObject({ x: 4100, y: 0 });
  });

  it('od středu posune oba rohy o polovinu', () => {
    const { floor, w } = rectRoom();
    setWallLength(floor, w.ab, 5000, 'both');
    expect(floor.nodes.A!.x).toBeCloseTo(-500);
    expect(floor.nodes.B!.x).toBeCloseTo(4500);
  });

  it('volná větev se posune celá', () => {
    const floor = createFloor('t');
    floor.nodes.A = { id: 'A', x: 0, y: 0 };
    floor.nodes.B = { id: 'B', x: 1000, y: 0 };
    floor.nodes.C = { id: 'C', x: 2000, y: 500 };
    const ab = createWall('A', 'B');
    const bc = createWall('B', 'C');
    floor.walls[ab.id] = ab;
    floor.walls[bc.id] = bc;
    setWallLength(floor, ab.id, 1500, { nodeId: 'B' });
    expect(floor.nodes.C).toMatchObject({ x: 2500, y: 500 });
  });

  it('odmítne nesmyslnou délku', () => {
    const { floor, w } = rectRoom();
    expect(setWallLength(floor, w.ab, 0, { nodeId: 'B' })).toBe(false);
    expect(setWallLength(floor, w.ab, Number.NaN, { nodeId: 'B' })).toBe(false);
  });
});

describe('evaluateExpression', () => {
  it('sčítá a odčítá', () => {
    expect(evaluateExpression('1200+800')).toBe(2000);
    expect(evaluateExpression('3000-150')).toBe(2850);
    expect(evaluateExpression('2500')).toBe(2500);
    expect(evaluateExpression('12,5')).toBe(12.5);
  });
  it('vrátí null pro neplatný výraz', () => {
    expect(evaluateExpression('')).toBeNull();
    expect(evaluateExpression('12++3')).toBeNull();
    expect(evaluateExpression('abc')).toBeNull();
  });
});
