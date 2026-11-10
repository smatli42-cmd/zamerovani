import { describe, expect, it } from 'vitest';
import { doorLayout, openingThickness } from '../core/doorLayout';
import { openingStartFromA } from '../core/floorQueries';
import { createProject } from '../model/factory';
import { addOpening, addWall, applyNumpadValue, setRevealEnabled } from './actions';
import { store } from './store';

/** Jedna stěna 4000 mm s tloušťkou 300 (tělo na straně side). */
function wallWithBody(): string {
  store.openProject(createProject({ name: 't' }));
  return addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
}

describe('otvory ve stěně s tloušťkou', () => {
  it('tloušťka otvoru = tloušťka stěny; ve stěně bez tloušťky null', () => {
    const wId = wallWithBody();
    const opId = addOpening(wId, 'door', 0.5)!;
    const f = store.floor()!;
    expect(openingThickness(f, f.openings[opId]!)).toBe(300);
    const lineId = addWall({ x: 0, y: 2000 }, null, { x: 4000, y: 2000 }, null, false)!;
    const op2 = addOpening(lineId, 'door', 0.5)!;
    expect(openingThickness(store.floor()!, store.floor()!.openings[op2]!)).toBeNull();
  });

  it('výchozí strany: nika na vnitřním líci (do těla), dveře do místnosti (od těla)', () => {
    const wId = wallWithBody();
    const side = store.floor()!.walls[wId]!.side;
    const niche = addOpening(wId, 'niche', 0.2)!;
    const door = addOpening(wId, 'door', 0.7)!;
    const f = store.floor()!;
    expect(f.openings[niche]!.swing).toBe(side);
    expect(f.openings[door]!.swing).toBe(-side);
  });

  it('okno bez ostění u vnitřního líce; zapnutí ostění nechá rám na místě, hloubka zvenku se dopočítá', () => {
    const wId = wallWithBody();
    const id = addOpening(wId, 'window', 0.5)!;
    let op = store.floor()!.openings[id]!;
    expect(doorLayout(op, 300).fo).toBe(0);
    setRevealEnabled(id, true);
    op = store.floor()!.openings[id]!;
    const lay = doorLayout(op, 300);
    expect(lay.fo).toBe(0);
    expect(lay.dB).toBe(250); // 300 − rám 50
  });

  it('NumPad: tloušťka stěny se zadá kótou', () => {
    const wId = wallWithBody();
    expect(applyNumpadValue({ kind: 'wall-thickness', wallId: wId }, 450)).toBe(true);
    expect(store.floor()!.walls[wId]!.thickness).toBe(450);
  });
});

describe('strana zvolená při kreslení', () => {
  it('se uloží a uzavření místnosti ji nepřeklopí', () => {
    store.openProject(createProject({ name: 't' }));
    const o = { thickness: 300 };
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { ...o, side: 1 }); // tělo dovnitř (+y)
    const f0 = store.floor()!;
    const n = (x: number, y: number) => Object.values(f0.nodes).find(q => q.x === x && q.y === y)?.id ?? null;
    addWall({ x: 4000, y: 0 }, n(4000, 0), { x: 4000, y: 3000 }, null, false, o);
    addWall({ x: 4000, y: 3000 }, n(4000, 3000), { x: 0, y: 3000 }, null, false, o);
    addWall({ x: 0, y: 3000 }, n(0, 3000), { x: 0, y: 0 }, n(0, 0), false, o);
    const top = Object.values(store.floor()!.walls).find(w => store.floor()!.nodes[w.a]!.y === 0 && store.floor()!.nodes[w.b]!.y === 0)!;
    expect(top.side).toBe(1);
    expect(top.sideLocked).toBe(true);
  });
});

describe('rovné pokračování stěny', () => {
  const nodeAt = (x: number, y: number) => Object.values(store.floor()!.nodes).find(n => n.x === x && n.y === y)?.id ?? null;

  it('navázání na volný konec stejnou tloušťkou a stejným směrem = jedna stěna, otvor zůstane na místě', () => {
    store.openProject(createProject({ name: 't' }));
    const w1 = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const door = addOpening(w1, 'door', 0.5)!;
    const before = store.floor()!.openings[door]!;
    const startBefore = openingStartFromA(before, 2000);
    addWall({ x: 2000, y: 0 }, nodeAt(2000, 0), { x: 3500, y: 0 }, null, false, { thickness: 300 });
    const f = store.floor()!;
    const walls = Object.values(f.walls);
    expect(walls).toHaveLength(1);
    const w = walls[0]!;
    expect(Math.abs(f.nodes[w.b]!.x - f.nodes[w.a]!.x)).toBe(3500);
    expect(w.side).toBe(-1);
    expect(f.nodes[nodeAt(2000, 0) ?? ''] ).toBeUndefined();
    const op = f.openings[door]!;
    expect(op.wallId).toBe(w.id);
    expect(openingStartFromA(op, 3500)).toBe(startBefore);
  });

  it('zalomení nebo jiná tloušťka se neslučuje', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300 });
    addWall({ x: 2000, y: 0 }, nodeAt(2000, 0), { x: 2000, y: 1500 }, null, false, { thickness: 300 });
    expect(Object.keys(store.floor()!.walls)).toHaveLength(2);
    addWall({ x: 0, y: 0 }, nodeAt(0, 0), { x: -1000, y: 0 }, null, false, { thickness: 150 });
    expect(Object.keys(store.floor()!.walls)).toHaveLength(3);
  });

  it('kreslení proti směru ke konci stěny se také sloučí', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 200 });
    addWall({ x: -1500, y: 0 }, null, { x: 0, y: 0 }, nodeAt(0, 0), false, { thickness: 200 });
    const walls = Object.values(store.floor()!.walls);
    expect(walls).toHaveLength(1);
  });
});
