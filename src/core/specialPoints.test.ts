import { describe, expect, it } from 'vitest';
import { createCircleWall, createFloor, createWall } from '../model/factory';
import { snapPoint } from './snapping';
import { specialPoints } from './specialPoints';

const opts = { ortho: false, snap: true, nodeTol: 150, alignTol: 100 };

describe('zvláštní body tvarů', () => {
  it('kruh má 4 kvadranty a přichytí se na ně i s rozdělením stěny', () => {
    const f = createFloor('t');
    f.nodes.c = { id: 'c', x: 1000, y: 1000 };
    const w = createCircleWall('c', 500);
    f.walls[w.id] = w;
    expect(specialPoints(f)).toHaveLength(4);
    const s = snapPoint(f, { x: 1490, y: 1030 }, opts);
    expect(s.special).toBe(true);
    expect(s.pt).toEqual({ x: 1500, y: 1000 });
    expect(s.wallHit?.wall.id).toBe(w.id);
  });

  it('rovná stěna má střed, oblouk vrchol a střed', () => {
    const f = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 1000, y: 0 };
    const w = createWall('a', 'b');
    f.walls[w.id] = w;
    expect(specialPoints(f)).toEqual([{ x: 500, y: 0, onWall: true }]);
    w.sagitta = 200;
    const pts = specialPoints(f);
    expect(pts.some(p => !p.onWall)).toBe(true);
    expect(pts.some(p => p.onWall && Math.abs(p.x - 500) < 1 && Math.abs(Math.abs(p.y) - 200) < 1)).toBe(true);
  });
});
