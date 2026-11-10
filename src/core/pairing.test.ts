import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import { applyPartition } from '../store/actions';
import { partitionThickness, partitionWalls, thicknessTarget, toPrimary, twinOffset } from './pairing';

/** Dvě rovnoběžné stěny (horní a dolní) a mezi nimi spárovaná příčka tloušťky 100. */
function setup() {
  const f = createFloor('t');
  for (const [id, x, y] of [['a', 0, 0], ['b', 4000, 0], ['c', 0, 3000], ['d', 4000, 3000]] as const) f.nodes[id] = { id, x, y };
  for (const [a, b] of [['a', 'b'], ['c', 'd']] as const) {
    const w = createWall(a, b);
    f.walls[w.id] = w;
  }
  applyPartition(f, { x: 2000, y: 0 }, null, { x: 2000, y: 3000 }, null, 100, 1, true);
  return f;
}

describe('spárovaná příčka', () => {
  it('vzniknou dvě čáry se společným id a tloušťkou 100', () => {
    const f = setup();
    const line1 = Object.values(f.walls).filter(w => w.part?.line === 1);
    const line2 = Object.values(f.walls).filter(w => w.part?.line === 2);
    expect(line1).toHaveLength(1);
    expect(line2).toHaveLength(1);
    expect(line1[0]!.part!.id).toBe(line2[0]!.part!.id);
    expect(partitionWalls(f, line1[0]!)).toHaveLength(2);
    expect(partitionThickness(f, line1[0]!)).toBe(100);
    // konce opřené o stěny: uzavírají je úseky rozdělených stěn (bez tagu), cíl tloušťky existuje
    const t = thicknessTarget(f, line1[0]!);
    expect(t).not.toBeNull();
    expect(f.walls[t!.wallId]!.part).toBeUndefined();
  });

  it('otvor z druhé čáry se přepočte na první čáru', () => {
    const f = setup();
    const line1 = Object.values(f.walls).find(w => w.part?.line === 1)!;
    const line2 = Object.values(f.walls).find(w => w.part?.line === 2)!;
    const off = twinOffset(f, line1)!;
    expect(Math.hypot(off.x, off.y)).toBeCloseTo(100);
    const n2 = [f.nodes[line2.a]!, f.nodes[line2.b]!] as [{ x: number; y: number }, { x: number; y: number }];
    const mid2 = { x: (n2[0].x + n2[1].x) / 2, y: (n2[0].y + n2[1].y) / 2 };
    const prim = toPrimary(f, line2, mid2)!;
    expect(prim.wall.id).toBe(line1.id);
    expect(prim.t).toBeCloseTo(0.5);
    expect(toPrimary(f, line1, mid2)).toBeNull();
  });
});
