/**
 * Připomínka uživatele 2026-11-12: nová stěna se musí dát kreslit libovolným směrem, vodorovně / svisle
 * pomáhá fialová pomocná čára (jako při úpravě stěny, D11/D13).
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
function open() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'wall' });
  store.updateSettings({ snap: true, wallShape: 'straight' });
}
const lastWall = () => {
  const f = store.floor()!;
  const ws = Object.values(f.walls);
  const w = ws[ws.length - 1]!;
  return { a: f.nodes[w.a]!, b: f.nodes[w.b]!, w };
};

describe('kreslení nové stěny libovolným směrem', () => {
  it('šikmo (30°) se nakreslí šikmo, ne vodorovně', () => {
    open();
    draw([[0, 0], [1000, 577], [2000, 1155]]);
    const { a, b } = lastWall();
    expect(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)).toBeCloseTo(30, 0);
  });

  it('skoro vodorovně se přichytí na vodorovnou pomocnou čáru (délka po 10 mm)', () => {
    open();
    draw([[0, 0], [1000, 60], [2003, 90]]);
    const { b } = lastWall();
    expect(b).toMatchObject({ x: 2000, y: 0 });
  });

  it('konec u oblouku se přichytí na oblouk a napojí se (oblouk se nerozdělí)', () => {
    open();
    const R = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1, sagitta: 800 })!;
    // svisle dolů z (2000, −2000) k vrcholu oblouku (2000, 800), konec kousek za obloukem
    draw([[2000, -2000], [2010, 0], [2020, 860]]);
    const f = store.floor()!;
    const { w } = lastWall();
    const end = f.nodes[w.b]!;
    expect(end.host).toBe(R);
    expect(end.x).toBeCloseTo(2000, 6);
    expect(end.y).toBeCloseTo(800, 3);
    expect(Object.values(f.walls).filter(x => x.sagitta)).toHaveLength(1);
  });
});
