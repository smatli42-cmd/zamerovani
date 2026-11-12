/**
 * C1.5 křížení (připomínka uživatele 2026-11-12: „stěny nakreslené přes sebe se mají spojit, i když
 * stávající stěnu protáhnu přes oblouk“). Křížení se počítá z geometrie, obě stěny zůstanou celé.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { componentNodes } from './components';
import { wallCrossings } from './floorQueries';
import { findBodyAt, wallBodies } from './wallBody';
import { addWall, moveNode } from '../store/actions';
import { store } from '../store/store';

/** Leží nějaká kreslená hrana uvnitř sjednocených těl (čára uvnitř)? – jako v katalogových testech. */
function lineInside(f: Floor): boolean {
  for (const body of wallBodies(f).values()) {
    for (const [a, b] of body.edges) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const p = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
        if (findBodyAt(f, { x: p.x + nx * 0.5, y: p.y + ny * 0.5 }) && findBodyAt(f, { x: p.x - nx * 0.5, y: p.y - ny * 0.5 })) return true;
      }
    }
  }
  return false;
}

describe('křížení stěn (C1.5)', () => {
  it('rovná stěna přes oblouk: jedno křížení, žádná čára uvnitř, obě stěny celé', () => {
    const f = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['b', 4000, 0], ['p', 2000, -2000], ['q', 2000, 2000]] as const) f.nodes[id] = { id, x, y };
    const R = createWall('a', 'b', 800, 300, -1);
    const S = createWall('p', 'q', 0, 200, 1);
    f.walls[R.id] = R;
    f.walls[S.id] = S;
    const cs = wallCrossings(f);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.pt.x).toBeCloseTo(2000, 6);
    expect(cs[0]!.pt.y).toBeCloseTo(800, 6);
    expect(Object.keys(f.walls)).toHaveLength(2);
    expect(lineInside(f)).toBe(false);
  });

  it('dvě rovné stěny přes sebe: spojené do jedné skupiny (žádné kóty odstupu mezi nimi)', () => {
    const f = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['b', 2000, 0], ['p', 1000, -1000], ['q', 1000, 1000]] as const) f.nodes[id] = { id, x, y };
    const A = createWall('a', 'b', 0, 200, 1);
    const B = createWall('p', 'q', 0, 200, 1);
    f.walls[A.id] = A;
    f.walls[B.id] = B;
    expect(componentNodes(f, A.id).has('p')).toBe(true);
  });

  it('konec stávající stěny protažený přes oblouk: křížení vznikne samo, bez čáry uvnitř', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1, sagitta: 800 });
    const S = addWall({ x: 2000, y: -2000 }, null, { x: 2000, y: -500 }, null, false, { thickness: 200 })!;
    moveNode(store.floor()!.walls[S]!.b, { x: 2000, y: 1500 });
    const f = store.floor()!;
    expect(wallCrossings(f)).toHaveLength(1);
    expect(lineInside(f)).toBe(false);
  });

  it('čára bez tloušťky přes stěnu se nespojuje (jen stěny s tloušťkou)', () => {
    const f = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['b', 2000, 0], ['p', 1000, -1000], ['q', 1000, 1000]] as const) f.nodes[id] = { id, x, y };
    f.walls.A = { ...createWall('a', 'b', 0, 200, 1), id: 'A' };
    f.walls.L = { ...createWall('p', 'q', 0, 0, 1), id: 'L' };
    expect(wallCrossings(f)).toHaveLength(0);
  });
});
