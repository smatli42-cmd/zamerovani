/**
 * Chyby od uživatele 2026-11-13: (1) přidání výstupku nefunguje – tvar zůstane samostatné čáry bez výplně;
 * (2) při kreslení stěn i čar chybí zarovnání s koncovým bodem (čtverec: třetí stěna se nesrovná se začátkem první).
 * Kreslí se přímo nástrojem (pero), jako v aplikaci.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addWall } from '../store/actions';
import { store } from '../store/store';
import { wallTool } from './wallTool';
import type { PointerInput } from './types';

const Z = 0.1;
const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
function draw(pts: [number, number][]) {
  wallTool.down!(at(...pts[0]!));
  for (const p of pts.slice(1)) wallTool.drag!(at(...p));
  wallTool.up!(at(...pts[pts.length - 1]!));
}
function open(tool: 'wall' | 'line') {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool });
  store.updateSettings({ snap: true, wallShape: 'straight', wallAxis: 'face' });
}
const f = () => store.floor()!;
const prots = () => Object.values(f().protrusions ?? {});
const lastWall = () => {
  const ws = Object.values(f().walls);
  const w = ws[ws.length - 1]!;
  return { a: f().nodes[w.a]!, b: f().nodes[w.b]!, w };
};

/** Místnost 4000 × 3000 (vnitřní líce), stěny 300 ven. */
function room() {
  const c: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
  for (let i = 0; i < 4; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % 4]!;
    addWall({ x: p[0], y: p[1] }, null, { x: q[0], y: q[1] }, null, false, { thickness: 300 });
  }
}

describe('zarovnání s koncovým bodem při kreslení', () => {
  it('čtverec stěnami: třetí stěna se srovná se začátkem první (x = 0)', () => {
    open('wall');
    draw([[0, 0], [1500, 0], [3000, 0]]);
    draw([[3000, 0], [3000, 1000], [3000, 2000]]);
    draw([[3000, 2000], [1500, 2005], [60, 2010]]);
    expect(lastWall().b).toMatchObject({ x: 0, y: 2000 });
  });

  it('totéž nástrojem Čára', () => {
    open('line');
    draw([[0, 0], [1500, 0], [3000, 0]]);
    draw([[3000, 0], [3000, 1000], [3000, 2000]]);
    draw([[3000, 2000], [1500, 2005], [60, 2010]]);
    expect(lastWall().b).toMatchObject({ x: 0, y: 2000 });
  });
});

describe('výstupek kreslený nástrojem Čára', () => {
  it('ven z místnosti na vnějším líci', () => {
    open('wall');
    room();
    store.set({ tool: 'line' });
    draw([[1000, -300], [1000, -450], [1000, -600]]);
    draw([[1000, -600], [1200, -600], [1400, -600]]);
    draw([[1400, -600], [1400, -450], [1400, -300]]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]!.mode).toBe('add');
    expect(prots()[0]!.pts.map(q => [Math.round(q.u), Math.round(q.v)])).toEqual([[1000, 0], [1000, 300], [1400, 300], [1400, 0]]);
  });

  it('do místnosti z vnitřního líce', () => {
    open('wall');
    room();
    store.set({ tool: 'line' });
    draw([[1000, 0], [1000, 150], [1000, 300]]);
    draw([[1000, 300], [1200, 300], [1400, 300]]);
    draw([[1400, 300], [1400, 150], [1400, 0]]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]!.mode).toBe('add');
  });

  it('samostatná stěna: výstupek na obou lících', () => {
    open('wall');
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300 });
    store.set({ tool: 'line' });
    const side = f().walls[Object.keys(f().walls)[0]!]!.side;
    const out = side === 1 ? -1 : 1; // líc y = 0, ven od těla
    draw([[1000, 0], [1000, out * 100], [1000, out * 200]]);
    draw([[1000, out * 200], [1200, out * 200], [1400, out * 200]]);
    draw([[1400, out * 200], [1400, out * 100], [1400, 0]]);
    expect(prots()).toHaveLength(1);
  });

  it('mělký výstupek (120 mm, při oddálení pod tolerancí přichycení)', () => {
    open('wall');
    room();
    store.set({ tool: 'line' });
    draw([[1000, -300], [1000, -360], [1000, -420]]);
    draw([[1000, -420], [1200, -420], [1400, -420]]);
    draw([[1400, -420], [1400, -360], [1400, -300]]);
    expect(prots()).toHaveLength(1);
    expect(Math.max(...prots()[0]!.pts.map(q => q.v))).toBe(120);
  });

  it('hluboké vybrání (200 v tloušťce 300) při oddálení neprojde na protější líc', () => {
    open('wall');
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    store.set({ tool: 'line' });
    draw([[1000, 0], [1000, 100], [1000, 200]]);
    draw([[1000, 200], [1300, 200], [1600, 200]]);
    draw([[1600, 200], [1600, 100], [1600, 0]]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ mode: 'subtract' });
    expect(Math.min(...prots()[0]!.pts.map(q => q.v))).toBe(-200);
  });

  it('konec čáry u oblouku se na oblouk napojí (jako u nástroje Stěna)', () => {
    open('line');
    const R = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1, sagitta: 500 })!;
    draw([[1100, -2000], [1100, -1000], [1100, 380]]);
    expect(lastWall().b.host).toBe(R);
  });
});
