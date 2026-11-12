/**
 * B1 / B4 / B10: osa stěny (líc / střed) – akce setWallAxis, kreslení s osou uprostřed, dělení a slučování.
 * Souřadnice jako v C2/1: vnitřní roh (0,0), A podél +x, B podél −y (osa Y dolů).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallBodies } from '../core/wallBody';
import { addWall, setWallAxis } from './actions';
import { store } from './store';

function lRoom() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const B = addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300, side: -1 })!;
  return { A, B };
}

const yRange = (wallId: string) => {
  const poly = wallBodies(store.floor()!).get(wallId)!.poly;
  return [Math.min(...poly.map(p => p.y)), Math.max(...poly.map(p => p.y))];
};

describe('setWallAxis (B4)', () => {
  it('líc → střed: rohy se nehýbou, tělo se posune na obě strany osy', () => {
    const { A } = lRoom();
    const nodes = JSON.stringify(store.floor()!.nodes);
    setWallAxis(A, 'center');
    expect(store.floor()!.walls[A]!.axis).toBe('center');
    expect(JSON.stringify(store.floor()!.nodes)).toBe(nodes);
    const [lo, hi] = yRange(A);
    expect(lo).toBeCloseTo(-150, 2);
    expect(hi).toBeCloseTo(150, 2);
  });

  it('střed → líc vrátí původní stranu těla (i když byla přehozená)', () => {
    const { A } = lRoom();
    const side = store.floor()!.walls[A]!.side;
    setWallAxis(A, 'center');
    setWallAxis(A, 'face');
    const w = store.floor()!.walls[A]!;
    expect(w.axis).toBeUndefined();
    expect(w.side).toBe(side);
    const [lo, hi] = yRange(A);
    expect(lo).toBeCloseTo(0, 2);
    expect(hi).toBeCloseTo(300, 2);
  });

  it('jde vrátit Zpět', () => {
    const { A } = lRoom();
    setWallAxis(A, 'center');
    store.undo();
    expect(store.floor()!.walls[A]!.axis).toBeUndefined();
  });
});

describe('kreslení s osou uprostřed (B10)', () => {
  it('nová stěna s volbou osa = střed má osu uprostřed', () => {
    store.openProject(createProject({ name: 't' }));
    const id = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 200, axis: 'center' })!;
    expect(store.floor()!.walls[id]!.axis).toBe('center');
    const [lo, hi] = yRange(id);
    expect(lo).toBeCloseTo(-100, 2);
    expect(hi).toBeCloseTo(100, 2);
  });

  it('napojení do středu stěny s osou uprostřed ji rozdělí a obě části si osu ponechají', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, axis: 'center' });
    addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -1500 }, null, false, { thickness: 100, axis: 'center' });
    const walls = Object.values(store.floor()!.walls);
    expect(walls).toHaveLength(3);
    expect(walls.every(w => w.axis === 'center')).toBe(true);
  });

  it('rovné pokračování se slučuje jen při stejné ose', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 1000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 1000, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, side: 1, axis: 'center' });
    expect(Object.keys(store.floor()!.walls)).toHaveLength(2);
    addWall({ x: 2000, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1, axis: 'center' });
    expect(Object.keys(store.floor()!.walls)).toHaveLength(2); // druhá a třetí se sloučily
  });
});
