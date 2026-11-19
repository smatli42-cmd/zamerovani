/**
 * Ruční kresba (zadání Vrstvy, krok 2): Pero – vektorový vyhlazený tah v aktivní vrstvě, tloušťka v mm výkresu;
 * Guma – celé tahy jen v aktivní vrstvě (ne skryté, ne zamčené), jedno gumování = jeden krok Zpět; tah nechytá.
 * Pravidla vrstev 1–6 pro ruční tah jsou ve společné tabulce store/layers.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { smoothStroke, strokeHit } from '../core/strokes';
import { snapPoint } from '../core/snapping';
import { drawSnap } from '../tools/drawSnap';
import { layerContents, SYS } from '../core/layers';
import { addStroke, eraseStrokesAt, setActiveLayer, setLayerLocked, setStrokeWidth } from './actions';
import { store } from './store';

const f = () => store.floor()!;
beforeEach(() => store.openProject(createProject({ name: 't' })));

describe('Pero', () => {
  it('tah se vyhladí a zjednoduší na lomenou čáru v mm (vektor); přímka = 2 body, konce zůstanou', () => {
    const raw: Pt[] = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: (i % 2) * 0.3 }));
    const pts = smoothStroke(raw, 5, 2);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]!.x).toBe(1000);
    // oblouk zůstane obloukem (víc bodů), ale méně než surových
    const arc: Pt[] = Array.from({ length: 200 }, (_, i) => ({ x: 1000 * Math.cos(i / 63), y: 1000 * Math.sin(i / 63) }));
    const a = smoothStroke(arc, 5, 2);
    expect(a.length).toBeGreaterThan(5);
    expect(a.length).toBeLessThan(arc.length);
  });

  it('nový tah jde do aktivní vrstvy (i systémové), tloušťka v mm výkresu', () => {
    setActiveLayer('elektro');
    const id = addStroke([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 50)!;
    expect(f().strokes![id]).toMatchObject({ width: 50, layerId: 'elektro' });
    setActiveLayer(SYS.stavba);
    const id2 = addStroke([{ x: 0, y: 500 }, { x: 1000, y: 500 }], 25)!;
    expect(f().strokes![id2]!.layerId).toBe(SYS.stavba);
    setStrokeWidth(id, 100);
    expect(f().strokes![id]!.width).toBe(100);
    store.undo();
    expect(f().strokes![id]!.width).toBe(50);
  });

  it('tah nechytá: přichytávání k jeho bodům nevznikne', () => {
    const at = { x: 1033, y: 17 };
    const without = drawSnap(store.view('snap')!, at, null);
    addStroke([{ x: 0, y: 0 }, { x: 1033, y: 0 }], 25);
    const opts = { nodeTol: 200, snap: true } as Parameters<typeof snapPoint>[2];
    expect(snapPoint(store.view('snap')!, { x: 1003, y: 4 }, opts).node).toBeFalsy();
    expect(drawSnap(store.view('snap')!, at, null).pt).toEqual(without.pt);
  });

  it('do exportu jde ve své vrstvě (hladina DXF = název vrstvy)', () => {
    setActiveLayer('voda');
    const id = addStroke([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 25)!;
    const g = layerContents(store.get().project, f()).find(x => x.layer.id === 'voda')!;
    expect(g.layer.name).toBe('Voda');
    expect(g.items).toContainEqual({ kind: 'stroke', id });
  });

  it('zásah tahu: do poloviny tloušťky + tolerance', () => {
    const s = { id: 's', pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], width: 40 };
    expect(strokeHit(s, { x: 500, y: 25 }, 5)).toBe(true);
    expect(strokeHit(s, { x: 500, y: 30 }, 5)).toBe(false);
  });
});

describe('Guma', () => {
  it('maže celý tah jen v aktivní vrstvě; jedno gumování = jeden krok Zpět', () => {
    setActiveLayer('elektro');
    const a = addStroke([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 25)!;
    const b = addStroke([{ x: 0, y: 200 }, { x: 1000, y: 200 }], 25)!;
    setActiveLayer('voda');
    const c = addStroke([{ x: 0, y: 100 }, { x: 1000, y: 100 }], 25)!;
    setActiveLayer('elektro');
    store.beginGesture();
    eraseStrokesAt({ x: 500, y: 0 }, 50);
    eraseStrokesAt({ x: 500, y: 100 }, 50); // tah c je ve Vodě – zůstane
    eraseStrokesAt({ x: 500, y: 200 }, 50);
    store.endGesture();
    expect(Object.keys(f().strokes!)).toEqual([c]);
    store.undo();
    expect(Object.keys(f().strokes!).sort()).toEqual([a, b, c].sort());
  });

  it('guma maže i tah mezi dvěma vzdálenými vzorky pohybu (rychlé máchnutí)', async () => {
    const { eraserTool } = await import('../tools/penTool');
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    const id = addStroke([{ x: 0, y: 1000 }, { x: 0, y: 2000 }], 10)!;
    const at = (x: number) => ({ world: { x, y: 1500 }, screen: { x: x * 0.1, y: 150 }, device: 'pen' as const });
    eraserTool.down!(at(-2000));
    eraserTool.drag!(at(2000));
    eraserTool.up!(at(2000));
    expect(f().strokes![id]).toBeUndefined();
  });

  it('pero do zamčené aktivní vrstvy nekreslí (hlášení)', async () => {
    const { penTool } = await import('../tools/penTool');
    setActiveLayer('elektro');
    setLayerLocked('elektro', true);
    const at = (x: number) => ({ world: { x, y: 0 }, screen: { x, y: 0 }, device: 'pen' as const });
    penTool.down!(at(0));
    penTool.drag!(at(500));
    penTool.up!(at(1000));
    expect(Object.keys(f().strokes ?? {})).toHaveLength(0);
    expect(store.get().lockBlock?.text).toContain('zamčená');
  });

  it('zamčenou ani skrytou vrstvu nemaže', () => {
    setActiveLayer('elektro');
    addStroke([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 25);
    setLayerLocked('elektro', true);
    expect(eraseStrokesAt({ x: 500, y: 0 }, 50)).toBe(0);
    setLayerLocked('elektro', false);
    // skrytá vrstva nemůže být aktivní; tah skryté vrstvy guma v jiné aktivní vrstvě nemaže
    setActiveLayer('voda');
    expect(eraseStrokesAt({ x: 500, y: 0 }, 50)).toBe(0);
    expect(Object.keys(f().strokes!)).toHaveLength(1);
  });
});

describe('Pero – tvary (čára, obdélník, kruh, oblouk) jsou ruční tahy', () => {
  const at = (x: number, y: number) => ({ world: { x, y }, screen: { x: x * 0.1, y: y * 0.1 }, device: 'pen' as const });
  const drag = async (a: [number, number], b: [number, number]) => {
    const { penTool } = await import('../tools/penTool');
    penTool.down!(at(...a));
    penTool.drag!(at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    penTool.drag!(at(...b));
    penTool.up!(at(...b));
  };
  const strokes = () => Object.values(f().strokes ?? {});
  beforeEach(async () => {
    const { penTool } = await import('../tools/penTool');
    penTool.cancel!();
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    setActiveLayer('elektro');
  });

  it('obdélník = uzavřený tah 4 strany ve vrstvě, guma ho smaže celý', async () => {
    store.updateSettings({ penShape: 'rect', penWidth: 25 });
    await drag([0, 0], [2000, 1000]);
    expect(strokes()).toHaveLength(1);
    const s = strokes()[0]!;
    expect(s.layerId).toBe('elektro');
    expect(s.pts).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }, { x: 0, y: 0 }]);
    expect(eraseStrokesAt({ x: 2000, y: 500 }, 20)).toBe(1);
    expect(strokes()).toHaveLength(0);
  });

  it('čára navazuje na konec předchozí čáry (lomená čára); dosednutím na začátek se uzavře', async () => {
    store.updateSettings({ penShape: 'line' });
    await drag([0, 0], [2000, 0]);
    await drag([2000, 0], [2000, 2000]);
    await drag([2000, 2000], [0, 2000]);
    await drag([0, 2000], [0, 0]);
    expect(strokes()).toHaveLength(1);
    expect(strokes()[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }, { x: 0, y: 0 }]);
    // každý úsek je krok Zpět
    store.undo();
    expect(strokes()[0]!.pts).toHaveLength(4);
    // čára jinde = nový tah
    await drag([5000, 0], [6000, 0]);
    expect(strokes()).toHaveLength(2);
  });

  it('kruh: střed a bod na obvodu, uzavřený tah', async () => {
    store.updateSettings({ penShape: 'circle' });
    await drag([0, 0], [1000, 0]);
    const s = strokes()[0]!;
    expect(s.pts[0]).toEqual(s.pts[s.pts.length - 1]);
    for (const p of s.pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1000, 0);
  });

  it('oblouk: tětiva tažením, pak tažením vyklenutí; ťuknutí bez tažení nic nevytvoří', async () => {
    const { penTool } = await import('../tools/penTool');
    store.updateSettings({ penShape: 'arc' });
    await drag([0, 0], [2000, 0]);
    expect(strokes()).toHaveLength(0); // čeká na vyklenutí
    penTool.down!(at(1000, 500));
    penTool.drag!(at(1000, 500));
    penTool.up!(at(1000, 500));
    const s = strokes()[0]!;
    expect(s.pts[0]).toEqual({ x: 0, y: 0 });
    expect(s.pts[s.pts.length - 1]).toEqual({ x: 2000, y: 0 });
    expect(Math.max(...s.pts.map(p => Math.abs(p.y)))).toBeCloseTo(500, 0);
    store.updateSettings({ penShape: 'rect' });
    penTool.down!(at(3000, 3000));
    penTool.up!(at(3000, 3000));
    expect(strokes()).toHaveLength(1);
  });
});
