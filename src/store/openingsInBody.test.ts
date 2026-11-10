import { describe, expect, it } from 'vitest';
import { doorLayout, openingThickness } from '../core/doorLayout';
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
