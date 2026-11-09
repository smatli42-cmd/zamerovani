import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import { selectInRect } from './rectSelect';

describe('výběr obdélníkem', () => {
  it('okno bere jen celé stěny, křížení i dotčené', () => {
    const f = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 1000, y: 0 };
    f.nodes.c = { id: 'c', x: 5000, y: 0 };
    const w1 = createWall('a', 'b');
    const w2 = createWall('b', 'c');
    f.walls[w1.id] = w1;
    f.walls[w2.id] = w2;
    const r = { x1: -100, y1: -100, x2: 2000, y2: 100 };
    expect(selectInRect(f, r, false).map(i => i.id)).toEqual([w1.id]);
    expect(selectInRect(f, r, true).map(i => i.id).sort()).toEqual([w1.id, w2.id].sort());
  });
});
