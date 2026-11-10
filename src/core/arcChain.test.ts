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

describe('úchyty oblouků', () => {
  it('úchyt je uprostřed každého oblouku, i nevybraného; rozdělený oblouk má jeden', async () => {
    const { arcHandles } = await import('./arcChain');
    const f = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 2000, y: 0 };
    f.nodes.c = { id: 'c', x: 0, y: 3000 };
    f.nodes.d = { id: 'd', x: 2000, y: 3000 };
    const arc1 = createWall('a', 'b', 400, 300, 1);
    const arc2 = createWall('c', 'd', -300);
    const line = createWall('a', 'c');
    for (const w of [arc1, arc2, line]) f.walls[w.id] = w;
    const hs = arcHandles(f, null);
    expect(hs).toHaveLength(2);
    expect(hs.some(h => Math.abs(h.at.x - 1000) < 1 && Math.abs(h.at.y - 400) < 1)).toBe(true);
    expect(arcHandles(f, arc1.id).find(h => h.wallId === arc1.id)!.selected).toBe(true);
  });
});

describe('řetěz – přesný půlkruh', () => {
  it('rozdělený půlkruh má vrchol na správné straně (obě strany mají týž střed)', async () => {
    const { arcChain } = await import('./arcChain');
    const { splitWallAt } = await import('./topology');
    const f = createFloor('t');
    f.nodes.L = { id: 'L', x: -1000, y: 0 };
    f.nodes.R = { id: 'R', x: 1000, y: 0 };
    const w = createWall('L', 'R', -1000); // vyklenutí nahoru (−y)
    f.walls[w.id] = w;
    f.nodes.M = { id: 'M', x: 1000 * Math.SQRT1_2, y: -1000 * Math.SQRT1_2 };
    const [p1] = splitWallAt(f, w.id, 'M')!;
    const ch = arcChain(f, p1)!;
    expect(ch.geom.apex.y).toBeCloseTo(-1000, 0);
  });
});
