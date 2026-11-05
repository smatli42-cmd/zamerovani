import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { wallsAtNode } from './floorQueries';
import { dist } from './geometry';
import { setWallLength } from './solver';
import { splitWallsAtNode } from './topology';

/** Místnost 6000 × 3000 rozdělená příčkou ve 2500 (horní stěna A–B, dolní D–C). */
function dividedRoom(measured: boolean): Floor {
  const f = createFloor('t');
  const pts: Record<string, [number, number]> = { A: [0, 0], B: [6000, 0], C: [6000, 3000], D: [0, 3000], P: [2500, 0], Q: [2500, 3000] };
  for (const [id, [x, y]] of Object.entries(pts)) f.nodes[id] = { id, x, y };
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) {
    const w = createWall(a, b);
    w.measured = measured ? Math.round(dist(f.nodes[a]!, f.nodes[b]!)) : null;
    f.walls[w.id] = w;
  }
  const pq = createWall('P', 'Q');
  f.walls[pq.id] = pq;
  splitWallsAtNode(f, 'P');
  splitWallsAtNode(f, 'Q');
  return f;
}

const wallBetween = (f: Floor, a: string, b: string) => Object.values(f.walls).find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))!;

describe('rozdělení stěny napojenou příčkou', () => {
  it('rozdělí horní i dolní stěnu na dvě samostatné stěny', () => {
    const f = dividedRoom(false);
    expect(Object.keys(f.walls)).toHaveLength(7);
    expect(wallBetween(f, 'A', 'P')).toBeTruthy();
    expect(wallBetween(f, 'P', 'B')).toBeTruthy();
    expect(wallsAtNode(f, 'P')).toHaveLength(3);
  });

  it('změřená stěna předá míry oběma částem', () => {
    const f = dividedRoom(true);
    expect(wallBetween(f, 'A', 'P').measured).toBe(2500);
    expect(wallBetween(f, 'P', 'B').measured).toBe(3500);
  });

  it('otvor přejde na část, ve které leží, a zachová polohu', () => {
    const f = createFloor('t');
    f.nodes.A = { id: 'A', x: 0, y: 0 };
    f.nodes.B = { id: 'B', x: 6000, y: 0 };
    f.nodes.P = { id: 'P', x: 2500, y: 0 };
    f.nodes.Q = { id: 'Q', x: 2500, y: 2000 };
    const ab = createWall('A', 'B');
    f.walls[ab.id] = ab;
    const op = createOpening(f, ab.id, 'window', { offset: 1000, ref: 'b', width: 1200 }); // začátek 3800 od A
    f.openings[op.id] = op;
    const pq = createWall('P', 'Q');
    f.walls[pq.id] = pq;
    splitWallsAtNode(f, 'P');
    const pb = wallBetween(f, 'P', 'B');
    expect(f.openings[op.id]!.wallId).toBe(pb.id);
    expect(f.openings[op.id]!.offset).toBe(1000); // stále 1000 od rohu B
  });
});

describe('posun bodu napojení', () => {
  it('zadání délky části posune příčku, celková délka zůstane', () => {
    const f = dividedRoom(true);
    const ap = wallBetween(f, 'A', 'P');
    setWallLength(f, ap.id, 2700, { nodeId: 'P' });
    expect(f.nodes.P).toMatchObject({ x: 2700, y: 0 });
    expect(f.nodes.Q).toMatchObject({ x: 2700, y: 3000 });
    expect(f.nodes.B).toMatchObject({ x: 6000, y: 0 });
    expect(wallBetween(f, 'P', 'B').measured).toBe(3300);
    expect(wallBetween(f, 'D', 'Q').measured).toBe(2700);
    expect(wallBetween(f, 'Q', 'C').measured).toBe(3300);
  });

  it('nepovolí posun za konec stěny', () => {
    const f = dividedRoom(true);
    const ap = wallBetween(f, 'A', 'P');
    expect(setWallLength(f, ap.id, 6000, { nodeId: 'P' })).toBe(false);
    expect(f.nodes.P).toMatchObject({ x: 2500, y: 0 });
  });

  it('v rohu místnosti se chová jako dřív (posune celou stěnu)', () => {
    const f = dividedRoom(false);
    const bc = wallBetween(f, 'B', 'C');
    setWallLength(f, bc.id, 3200, { nodeId: 'C' });
    expect(f.nodes.C).toMatchObject({ x: 6000, y: 3200 });
  });
});
