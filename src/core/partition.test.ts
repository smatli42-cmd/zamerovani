import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { applyPartition } from '../store/actions';
import { wallLength, wallsAtNode } from './floorQueries';
import { setWallLength } from './solver';

/** Místnost 6000 × 3000 (A vlevo nahoře, po směru hodin). */
function room(): Floor {
  const f = createFloor('t');
  const pts: Record<string, [number, number]> = { A: [0, 0], B: [6000, 0], C: [6000, 3000], D: [0, 3000] };
  for (const [id, [x, y]] of Object.entries(pts)) f.nodes[id] = { id, x, y };
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) {
    const w = createWall(a, b);
    f.walls[w.id] = w;
  }
  return f;
}

const lengths = (f: Floor) =>
  Object.values(f.walls)
    .map(w => Math.round(wallLength(f, w)))
    .sort((x, y) => x - y);

describe('příčka dvěma čarami', () => {
  it('od stěny ke stěně rozdělí obě stěny na tři úseky a vzniknou dvě rovnoběžné stěny', () => {
    const f = room();
    // shora dolů v x = 2500; side = 1 = vlevo od směru kreslení = na obrazovce doprava
    applyPartition(f, { x: 2500, y: 0 }, null, { x: 2500, y: 3000 }, null, 100, 1);
    // 4 původní stěny → horní i dolní rozdělené na 3 (+4) a dvě nové svislé stěny
    expect(Object.keys(f.walls)).toHaveLength(4 + 2 + 2 + 2);
    const L = lengths(f);
    expect(L.filter(v => v === 3000)).toHaveLength(4); // pravá + levá + dvě příčky
    expect(L.filter(v => v === 100)).toHaveLength(2); // tloušťka příčky v horní i dolní stěně
  });

  it('druhá čára leží ve vzdálenosti tloušťky a obě mají stejnou délku', () => {
    const f = room();
    applyPartition(f, { x: 2500, y: 0 }, null, { x: 2500, y: 3000 }, null, 120, 1);
    const xs = [...new Set(Object.values(f.nodes).map(n => Math.round(n.x)).filter(x => x !== 0 && x !== 6000))].sort((p, q) => p - q);
    expect(xs).toEqual([2500, 2620]);
  });

  it('volný konec se uzavře krátkou stěnou o tloušťce', () => {
    const f = room();
    applyPartition(f, { x: 2500, y: 0 }, null, { x: 2500, y: 1500 }, null, 100, 1);
    // dole končí volně: 2 nové svislé stěny + uzavírací stěna + horní stěna rozdělená na 3
    expect(Object.keys(f.walls)).toHaveLength(4 + 2 + 2 + 1);
    expect(lengths(f).filter(v => v === 100)).toHaveLength(2); // tloušťka nahoře + uzavření dole
  });

  it('změna délky úseku s tloušťkou změní tloušťku příčky a celková délka stěny zůstane', () => {
    const f = room();
    applyPartition(f, { x: 2500, y: 0 }, null, { x: 2500, y: 3000 }, null, 100, 1);
    const thick = Object.values(f.walls).filter(w => Math.round(wallLength(f, w)) === 100);
    expect(thick).toHaveLength(2);
    const top = thick.find(w => f.nodes[w.a]!.y === 0 && f.nodes[w.b]!.y === 0)!;
    // posouváme ten uzel úseku, na který navazuje další úsek stěny (ne ten, kam dosedá příčka z druhé strany)
    const cand = [top.a, top.b].map(id => ({ id, ws: wallsAtNode(f, id) }));
    const mover = cand.find(c => c.ws.length === 3)!;
    expect(setWallLength(f, top.id, 150, { nodeId: mover.id })).toBe(true);
    expect(f.nodes.B).toMatchObject({ x: 6000, y: 0 });
    expect(f.nodes.A).toMatchObject({ x: 0, y: 0 });
    // druhá čára příčky se posunula rovnoběžně, takže tloušťka je i dole 150
    const bottom = Object.values(f.walls).filter(w => f.nodes[w.a]!.y === 3000 && f.nodes[w.b]!.y === 3000 && Math.round(wallLength(f, w)) === 150);
    expect(bottom).toHaveLength(1);
  });
});
