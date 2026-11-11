/**
 * C1.6 / C1.13 / C2/10: nespojený konec je i fyzicky oddělený (vlastní roh na stejných souřadnicích).
 * Souřadnice jako v C2/1: vnitřní roh (0,0), A podél +x, B podél −y (osa Y dolů).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallBodies } from '../core/wallBody';
import { addWall, mergeNodeIfCoincident, moveNode, setWallNoJoin } from './actions';
import { store } from './store';

function lRoom() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const B = addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300, side: -1 })!;
  return { A, B };
}

describe('C1.13: fyzicky oddělený konec', () => {
  it('zapnutí dá stěně vlastní roh, tažení za něj nehýbe druhou stěnou', () => {
    const { A, B } = lRoom();
    const f0 = store.floor()!;
    expect(f0.walls[A]!.a).toBe(f0.walls[B]!.a); // dosud sdílený roh
    setWallNoJoin(B, 'a', true);
    const f = store.floor()!;
    expect(f.walls[B]!.noJoinA).toBe(true);
    expect(f.walls[B]!.a).not.toBe(f.walls[A]!.a);
    expect(f.nodes[f.walls[B]!.a]).toMatchObject({ x: 0, y: 0 });
    moveNode(f.walls[B]!.a, { x: 0, y: -500 });
    const g = store.floor()!;
    expect(g.nodes[g.walls[A]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('sloučení rohů při shodě souřadnic označený konec samo nespojí', () => {
    const { A, B } = lRoom();
    setWallNoJoin(B, 'a', true);
    const nb = store.floor()!.walls[B]!.a;
    mergeNodeIfCoincident(nb);
    const f = store.floor()!;
    expect(f.walls[B]!.a).toBe(nb);
    expect(f.walls[A]!.a).not.toBe(nb);
    // roh druhé stěny se také nesmí sloučit s označeným
    mergeNodeIfCoincident(f.walls[A]!.a);
    expect(store.floor()!.walls[B]!.a).toBe(nb);
  });

  it('přepnutí zpět na Spojený roh sloučí a napojení se vrátí', () => {
    const { A, B } = lRoom();
    setWallNoJoin(B, 'a', true);
    expect(wallBodies(store.floor()!).get(A)!.poly.some(p => Math.abs(p.x + 300) < 0.01)).toBe(false);
    setWallNoJoin(B, 'a', false);
    const f = store.floor()!;
    expect(f.walls[B]!.noJoinA).toBeUndefined();
    expect(f.walls[B]!.a).toBe(f.walls[A]!.a);
    expect(Object.keys(f.nodes)).toHaveLength(3);
    expect(wallBodies(f).get(A)!.poly.some(p => Math.abs(p.x + 300) < 0.01 && Math.abs(p.y - 300) < 0.01)).toBe(true);
  });

  it('nová stěna nakreslená do oddělené polohy se k označenému konci nepřipojí', () => {
    const { B } = lRoom();
    setWallNoJoin(B, 'a', true);
    const nb = store.floor()!.walls[B]!.a;
    const C = addWall({ x: 0, y: 0 }, nb, { x: -2000, y: 0 }, null, false, { thickness: 300 })!;
    expect(store.floor()!.walls[C]!.a).not.toBe(nb);
  });
});
