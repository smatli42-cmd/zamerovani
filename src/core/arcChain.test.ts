import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import { splitArcSagittas, arcGeometry } from './arc';
import { arcChain, setChainSagitta } from './arcChain';

describe('řetěz oblouků', () => {
  it('rozdělený oblouk se mění jako celek a zůstává na jedné kružnici', () => {
    const f = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 2000, y: 0 };
    const g = arcGeometry(f.nodes.a, f.nodes.b, 400)!;
    // rozdělení ve vrcholu
    const [s1, s2] = splitArcSagittas(f.nodes.a, f.nodes.b, 400, g.apex)!;
    f.nodes.m = { id: 'm', ...g.apex };
    const w1 = createWall('a', 'm', s1);
    const w2 = createWall('m', 'b', s2);
    f.walls[w1.id] = w1;
    f.walls[w2.id] = w2;

    const ch = arcChain(f, w1.id)!;
    expect(ch.pieces).toHaveLength(2);
    expect(Math.abs(ch.sagitta)).toBeCloseTo(400, 0);

    expect(setChainSagitta(f, w1.id, ch.sagitta * 0.5)).toBe(true);
    const ch2 = arcChain(f, w2.id)!;
    expect(ch2.pieces).toHaveLength(2);
    expect(Math.abs(ch2.sagitta)).toBeCloseTo(200, 0);
    const m = f.nodes.m!;
    expect(Math.hypot(m.x - 1000, m.y - -200) < 1 || Math.hypot(m.x - 1000, m.y - 200) < 1).toBe(true);
  });
});
