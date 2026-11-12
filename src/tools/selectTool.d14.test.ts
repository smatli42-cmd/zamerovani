/**
 * D14 v nástroji Vybrat: rozpojený roh (C1.13) – výběr konce vybrané stěny, přepínání ťuknutím, tažení
 * jen vybraného konce. Chyba nahlášená uživatelem 2026-11-12.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addWall, setWallNoJoin } from '../store/actions';
import { store } from '../store/store';
import { selectTool } from './selectTool';
import type { PointerInput } from './types';

function setup() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
  const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const B = addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300, side: -1 })!;
  setWallNoJoin(B, 'a', true);
  const f = store.floor()!;
  return { A, B, nA: f.walls[A]!.a, nB: f.walls[B]!.a };
}

const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * 0.1, y: y * 0.1 }, device: 'pen' });
const tap = (x: number, y: number) => {
  selectTool.down!(at(x, y));
  selectTool.up!(at(x, y));
};
const sel = () => store.get().selection;

describe('D14 v nástroji Vybrat', () => {
  it('po výběru stěny A i B vybere ťuknutí na roh konec té vybrané stěny', () => {
    const { A, B, nA, nB } = setup();
    store.set({ selection: { kind: 'wall', id: A } });
    tap(5, 5);
    expect(sel()).toEqual({ kind: 'node', id: nA });
    store.set({ selection: { kind: 'wall', id: B } });
    tap(5, 5);
    expect(sel()).toEqual({ kind: 'node', id: nB });
  });

  it('další ťuknutí na vybraný roh přepne na druhý konec a zpět', () => {
    const { A, nA, nB } = setup();
    store.set({ selection: { kind: 'wall', id: A } });
    tap(5, 5);
    tap(5, 5);
    expect(sel()).toEqual({ kind: 'node', id: nB });
    tap(5, 5);
    expect(sel()).toEqual({ kind: 'node', id: nA });
  });

  it('tažení vybraného rohu nepřepne a pohne jen jím', () => {
    const { A, nA, nB } = setup();
    store.set({ selection: { kind: 'wall', id: A } });
    tap(5, 5);
    selectTool.down!(at(5, 5));
    selectTool.drag!(at(400, 5));
    selectTool.up!(at(400, 5));
    const f = store.floor()!;
    expect(sel()).toEqual({ kind: 'node', id: nA });
    expect(f.nodes[nA]!.x).toBeGreaterThan(100);
    expect(f.nodes[nB]).toMatchObject({ x: 0, y: 0 });
  });

  it('výběr skupiny se stěnou A: tažení za roh táhne skupinu, ne cizí roh', () => {
    const { A } = setup();
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: A }] } });
    selectTool.down!(at(5, 5));
    selectTool.drag!(at(500, 5));
    selectTool.up!(at(500, 5));
    expect(sel()?.kind).toBe('multi');
    const f = store.floor()!;
    expect(f.nodes[f.walls[A]!.b]!.x).toBeGreaterThan(3100); // celá stěna A se posunula
  });
});
