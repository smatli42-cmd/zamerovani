/**
 * Nástroj Vybrat: tažení s držením směru (D11), posun celé stěny (D12), kolmice (D13 / C2/16).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/factory';
import { addWall, setWallNoJoin } from '../store/actions';
import { store } from '../store/store';
import { selectTool } from './selectTool';
import type { PointerInput } from './types';

const Z = 0.1; // px / mm → zachycení 10 px = 100 mm
const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
function dragPath(pts: [number, number][]) {
  selectTool.down!(at(...pts[0]!));
  for (const p of pts.slice(1)) selectTool.drag!(at(...p));
  selectTool.up!(at(...pts[pts.length - 1]!));
}

function open() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null });
}

afterEach(() => vi.useRealTimers());

describe('D12: posun celé stěny', () => {
  it('vybraná samostatná stěna se tažením za tělo posune celá; skoro kolmo = přesně rovnoběžně', () => {
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    store.set({ selection: { kind: 'wall', id: W } });
    dragPath([[1500, 150], [1520, 600], [1540, 1150]]);
    const f = store.floor()!;
    const w = f.walls[W]!;
    expect(f.nodes[w.a]).toMatchObject({ x: 0, y: 1000 });
    expect(f.nodes[w.b]).toMatchObject({ x: 3000, y: 1000 });
    expect(store.get().selection).toEqual({ kind: 'wall', id: W });
  });

  it('nevybraná stěna se tažením neposune (jen se vybere)', () => {
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    dragPath([[1500, 150], [1500, 600], [1500, 1150]]);
    const f = store.floor()!;
    expect(f.nodes[f.walls[W]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('jde vrátit jedním krokem Zpět', () => {
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    store.set({ selection: { kind: 'wall', id: W } });
    dragPath([[1500, 150], [1500, 600], [1500, 1150]]);
    store.undo();
    const f = store.floor()!;
    expect(f.nodes[f.walls[W]!.a]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('D11: tažení konce drží původní směr', () => {
  it('konec táhnutý kousek vedle přímky zůstane na ní', () => {
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const b = store.floor()!.walls[W]!.b;
    dragPath([[3000, 0], [3300, 60], [3800, 80]]);
    expect(store.floor()!.nodes[b]).toMatchObject({ x: 3800, y: 0 });
  });

  it('po prodlevě 0,7 s se zachycení uvolní a platí poloha pod perem', () => {
    vi.useFakeTimers();
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const b = store.floor()!.walls[W]!.b;
    selectTool.down!(at(3000, 0));
    selectTool.drag!(at(3300, 60));
    selectTool.drag!(at(3800, 80));
    expect(store.floor()!.nodes[b]).toMatchObject({ x: 3800, y: 0 });
    vi.advanceTimersByTime(800);
    selectTool.up!(at(3800, 80));
    expect(store.floor()!.nodes[b]).toMatchObject({ x: 3800, y: 80 });
  });
});

describe('D13 / C2/16: kolmice při tažení konce k jiné stěně', () => {
  it('konec šikmé stěny dotažený k jiné stěně se přichytí do pravého úhlu a dosedne na ni', () => {
    open();
    addWall({ x: 3000, y: -2000 }, null, { x: 3000, y: 2000 }, null, false, { thickness: 0 });
    const A = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 400 }, null, false, { thickness: 0 })!;
    const b = store.floor()!.walls[A]!.b;
    dragPath([[2000, 400], [2600, 200], [2970, 50]]);
    const f = store.floor()!;
    // konec A leží na stěně x = 3000 v y = 0 (pravý úhel), stěna se v tom místě rozdělila
    const end = f.nodes[f.walls[A]!.b] ?? f.nodes[b];
    expect(end).toMatchObject({ x: 3000, y: 0 });
    expect(Object.keys(f.walls)).toHaveLength(3);
  });
});

describe('doplněno po kontrole revieweru', () => {
  it('prodleva: po 600 ms je konec pořád na přímce; po uvolnění platí přesná poloha pod perem', () => {
    vi.useFakeTimers();
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const b = store.floor()!.walls[W]!.b;
    selectTool.down!(at(3000, 0));
    selectTool.drag!(at(3300, 60));
    selectTool.drag!(at(3803, 87));
    vi.advanceTimersByTime(600);
    expect(store.floor()!.nodes[b]).toMatchObject({ x: 3803, y: 0 });
    vi.advanceTimersByTime(200);
    selectTool.up!(at(3803, 87));
    expect(store.floor()!.nodes[b]).toMatchObject({ x: 3803, y: 87 });
  });

  it('zrušené tažení: časovač prodlevy už nic nezmění', () => {
    vi.useFakeTimers();
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const b = store.floor()!.walls[W]!.b;
    selectTool.down!(at(3000, 0));
    selectTool.drag!(at(3300, 60));
    selectTool.drag!(at(3800, 80));
    selectTool.cancel!();
    const snap = JSON.stringify(store.floor()!.nodes);
    vi.advanceTimersByTime(1000);
    expect(JSON.stringify(store.floor()!.nodes)).toBe(snap);
    expect(store.floor()!.nodes[b]!.y).toBe(0);
  });

  it('bod 6 návrhu: roh jiné stěny má přednost před pomocnou čarou', () => {
    open();
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 0 })!;
    addWall({ x: 4000, y: 80 }, null, { x: 4000, y: 2000 }, null, false, { thickness: 0 }); // roh (4000, 80) kousek od přímky
    const b = store.floor()!.walls[W]!.b;
    dragPath([[3000, 0], [3500, 20], [3990, 70]]);
    const f = store.floor()!;
    const end = f.nodes[f.walls[W]!.b] ?? f.nodes[b];
    expect(end).toMatchObject({ x: 4000, y: 80 });
  });

  it('roh dvou stěn: tažení po přímce A, stěna B drží svůj vzdálený konec a otočí se', () => {
    open();
    const A = addWall({ x: 3000, y: 0 }, null, { x: 0, y: 0 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 0 })!;
    dragPath([[0, 0], [-300, 30], [-800, 50]]);
    const f = store.floor()!;
    expect(f.nodes[f.walls[A]!.b]).toMatchObject({ x: -800, y: 0 }); // A drží směr
    expect(f.nodes[f.walls[B]!.b]).toMatchObject({ x: 0, y: -3000 }); // vzdálený konec B na místě
    expect(f.walls[A]!.b).toBe(f.walls[B]!.a); // roh zůstal společný
  });

  it('oddělený roh (C1.13): tažení jednoho konce s pomocnou čarou nepohne druhou stěnou', () => {
    open();
    const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const B = addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300, side: -1 })!;
    setWallNoJoin(B, 'a', true);
    store.set({ selection: { kind: 'wall', id: A } });
    selectTool.down!(at(5, 5)); // D14: konec vybrané stěny A
    selectTool.drag!(at(-300, 30));
    selectTool.drag!(at(-600, 40));
    selectTool.up!(at(-600, 40));
    const f = store.floor()!;
    expect(f.nodes[f.walls[A]!.a]).toMatchObject({ x: -600, y: 0 });
    expect(f.nodes[f.walls[B]!.a]).toMatchObject({ x: 0, y: 0 });
  });
});
