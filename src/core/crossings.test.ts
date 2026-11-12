/**
 * C1.5 křížení (připomínka uživatele 2026-11-12: „stěny nakreslené přes sebe se mají spojit, i když
 * stávající stěnu protáhnu přes oblouk“). Křížení se počítá z geometrie, obě stěny zůstanou celé.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { componentNodes } from './components';
import { wallCrossings } from './floorQueries';
import { bodyNormal, findBodyAt, wallBodies } from './wallBody';
import { addWall, applyWallLength, moveNode } from '../store/actions';
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

describe('křížení – nálezy revieweru', () => {
  function walls(spec: [string, [number, number], [number, number], number][]): Floor {
    const f = createFloor('t');
    spec.forEach(([id, p, q, t], i) => {
      f.nodes[`${id}1`] = { id: `${id}1`, x: p[0], y: p[1] };
      f.nodes[`${id}2`] = { id: `${id}2`, x: q[0], y: q[1] };
      f.walls[id] = { ...createWall(`${id}1`, `${id}2`, 0, t, i % 2 ? 1 : -1), id };
    });
    return f;
  }

  it('tři stěny křížící se v jednom bodě: žádná čára uvnitř', () => {
    const r = 1500;
    const f = walls([0, 60, 120].map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return [`w${i}`, [-r * Math.cos(a), -r * Math.sin(a)], [r * Math.cos(a), r * Math.sin(a)], 200] as [string, [number, number], [number, number], number];
    }));
    expect(lineInside(f)).toBe(false);
  });

  it('T přímo na kříži (příčka napojená do bodu křížení dvou stěn): žádná čára uvnitř', () => {
    const f = walls([['A', [-2000, 0], [2000, 0], 300], ['B', [0, -2000], [0, 2000], 200]]);
    f.nodes.m = { id: 'm', x: 0, y: 0, host: 'A' };
    f.nodes.p = { id: 'p', x: 1500, y: 1500 };
    f.walls.T = { ...createWall('m', 'p', 0, 100, 1), id: 'T' };
    expect(lineInside(f)).toBe(false);
  });

  it('ostré křížení (10°): žádná čára uvnitř', () => {
    const a = (10 * Math.PI) / 180;
    const f = walls([['A', [-3000, 0], [3000, 0], 300], ['B', [-3000 * Math.cos(a), -3000 * Math.sin(a)], [3000 * Math.cos(a), 3000 * Math.sin(a)], 300]]);
    expect(lineInside(f)).toBe(false);
  });

  it('řešič: větev visící na posouvaném rohu, která kříží samostatnou stěnu, ji neposune', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 200 })!;
    addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 200 });
    const Z = addWall({ x: 3000, y: 1500 }, null, { x: 5000, y: 1500 }, null, false, { thickness: 200 })!;
    const z0 = JSON.stringify([store.floor()!.nodes[store.floor()!.walls[Z]!.a], store.floor()!.nodes[store.floor()!.walls[Z]!.b]]);
    applyWallLength(A, 5000, { nodeId: store.floor()!.walls[A]!.b });
    const f = store.floor()!;
    expect(JSON.stringify([f.nodes[f.walls[Z]!.a], f.nodes[f.walls[Z]!.b]])).toBe(z0);
  });

  it('místnost uzavřená stěnou, která přesahuje přes obě sousední: těla ven', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 200 });
    addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 200 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 200 });
    // uzavírací stěna dole přesahuje přes obě boční stěny (kříží je)
    const C = addWall({ x: -1000, y: 2500 }, null, { x: 5000, y: 2500 }, null, false, { thickness: 200 })!;
    const f = store.floor()!;
    expect(bodyNormal(f, f.walls[C]!)!.y).toBeGreaterThan(0); // tělo ven z místnosti (+y)
  });
  it('oblouk protnutý rovnou stěnou dvakrát blízko vrcholu: žádná čára uvnitř', () => {
    const f = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['b', 4000, 0], ['p', -500, 650], ['q', 4500, 650]] as const) f.nodes[id] = { id, x, y };
    f.walls.R = { ...createWall('a', 'b', 800, 300, -1), id: 'R' };
    f.walls.S = { ...createWall('p', 'q', 0, 200, 1), id: 'S' };
    expect(wallCrossings(f)).toHaveLength(2);
    expect(lineInside(f)).toBe(false);
  });
});
