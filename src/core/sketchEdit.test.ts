/** Úchyty, přichytávání a kopie prvků skici poznámky (core/sketchEdit.ts, přání uživatele 2026-11-22). */
import { describe, expect, it } from 'vitest';
import type { MarkPage, SketchStroke } from '../model/types';
import { copySketchItems, dragSketchHandle, hitSketchHandle, sketchHandles, sketchOrtho, sketchSnap } from './sketchEdit';
import { labelBox, sketchPolylines, type SketchRef } from './sketch';

const st = (mode: SketchStroke['mode'], pts: { x: number; y: number }[], extra: Partial<SketchStroke> = {}): SketchStroke => ({ mode, color: '#000', width: 2, pts, ...extra });
const page = (strokes: SketchStroke[], more: Partial<MarkPage> = {}): MarkPage => ({ id: 'p', strokes, labels: [], dims: [], ...more });
const S0 = { kind: 'stroke' as const, index: 0 };
const ids = (p: MarkPage, r: SketchRef = S0) => sketchHandles(p, r).map(h => h.id);

describe('úchyty každého druhu prvku', () => {
  it('čára, dvojitá čára, oblouk, obdélník, kruh, pero, kóta, text', () => {
    expect(ids(page([st('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])]))).toEqual(['a', 'b']);
    expect(ids(page([st('double', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { w: 12 })]))).toEqual(['a', 'b', 'w']);
    expect(ids(page([st('arc', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { s: 25 })]))).toEqual(['a', 'b', 's']);
    expect(ids(page([st('rect', [{ x: 0, y: 0 }, { x: 100, y: 50 }])]))).toHaveLength(8);
    expect(ids(page([st('circle', [{ x: 0, y: 0 }, { x: 50, y: 0 }])]))).toEqual(['q0', 'q1', 'q2', 'q3']);
    expect(ids(page([st('free', [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 10 }])]))).toEqual(['f0', 'f1', 'f2', 'f3']);
    const p = page([], { dims: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, text: '1' }], labels: [{ x: 0, y: 0, text: 'a', color: '#000' }] });
    expect(ids(p, { kind: 'dim', index: 0 })).toEqual(['a', 'b']);
    expect(ids(p, { kind: 'label', index: 0 })).toEqual(['k']);
  });
});

describe('tažení úchytů', () => {
  it('vrchol oblouku mění jeho velikost (vzepětí), přes tětivu se obrátí', () => {
    const p = page([st('arc', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { s: 25 })]);
    const apex = sketchHandles(p, S0).find(h => h.id === 's')!.at;
    expect(apex).toEqual({ x: 50, y: 25 });
    expect(dragSketchHandle(p, S0, 's', { x: 60, y: 40 }).strokes[0]!.s).toBe(40);
    expect(dragSketchHandle(p, S0, 's', { x: 50, y: -30 }).strokes[0]!.s).toBe(-30);
    // konec oblouku: vzepětí zůstane
    const q = dragSketchHandle(p, S0, 'b', { x: 200, y: 0 }).strokes[0]!;
    expect(q.pts[1]).toEqual({ x: 200, y: 0 });
    expect(q.s).toBe(25);
  });

  it('vzdálenost čar dvojité čáry tažením, přes první čáru se přeloží, nikdy nula', () => {
    const p = page([st('double', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { w: 12 })]);
    expect(dragSketchHandle(p, S0, 'w', { x: 50, y: 30 }).strokes[0]!.w).toBe(30);
    expect(dragSketchHandle(p, S0, 'w', { x: 50, y: -8 }).strokes[0]!.w).toBe(-8);
    expect(dragSketchHandle(p, S0, 'w', { x: 50, y: 0.2 }).strokes[0]!.w).toBe(1);
    // druhá čára leží v nové vzdálenosti
    expect(sketchPolylines(dragSketchHandle(p, S0, 'w', { x: 50, y: 30 }).strokes[0]!)[1]![0]).toEqual({ x: 0, y: 30 });
  });

  it('konec čáry', () => {
    const p = page([st('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])]);
    expect(dragSketchHandle(p, S0, 'a', { x: -20, y: 10 }).strokes[0]!.pts).toEqual([{ x: -20, y: 10 }, { x: 100, y: 0 }]);
  });

  it('obdélník: roh (protější stojí) a strana (jen ta)', () => {
    const p = page([st('rect', [{ x: 0, y: 0 }, { x: 100, y: 50 }])]);
    expect(dragSketchHandle(p, S0, 'c2', { x: 120, y: 80 }).strokes[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 120, y: 80 }]);
    expect(dragSketchHandle(p, S0, 'c0', { x: -10, y: -5 }).strokes[0]!.pts).toEqual([{ x: -10, y: -5 }, { x: 100, y: 50 }]);
    expect(dragSketchHandle(p, S0, 'c1', { x: 130, y: -5 }).strokes[0]!.pts).toEqual([{ x: 0, y: -5 }, { x: 130, y: 50 }]);
    expect(dragSketchHandle(p, S0, 'e1', { x: 150, y: 999 }).strokes[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 150, y: 50 }]);
    expect(dragSketchHandle(p, S0, 'e0', { x: 999, y: -20 }).strokes[0]!.pts).toEqual([{ x: 0, y: -20 }, { x: 100, y: 50 }]);
  });

  it('kruh: poloměr, střed stojí', () => {
    const p = page([st('circle', [{ x: 0, y: 0 }, { x: 50, y: 0 }])]);
    const q = dragSketchHandle(p, S0, 'q1', { x: 0, y: 80 }).strokes[0]!;
    expect(q.pts[0]).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(q.pts[1]!.x, q.pts[1]!.y)).toBe(80);
  });

  it('tah perem: zvětšení z rohu, protější roh stojí', () => {
    const p = page([st('free', [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 40 }])]);
    const q = dragSketchHandle(p, S0, 'f2', { x: 200, y: 80 }).strokes[0]!;
    expect(q.pts).toEqual([{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 200, y: 80 }]);
  });

  it('konec kóty, velikost textu', () => {
    const p = page([], { dims: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, text: '1' }], labels: [{ x: 0, y: 0, text: 'okno', color: '#000' }] });
    expect(dragSketchHandle(p, { kind: 'dim', index: 0 }, 'b', { x: 150, y: 5 }).dims[0]!.b).toEqual({ x: 150, y: 5 });
    const b1 = labelBox('okno', 0, 0, 1);
    const k = dragSketchHandle(p, { kind: 'label', index: 0 }, 'k', { x: b1.w, y: 0 }).labels[0]!.k!;
    // roh rámečku ve dvojnásobné vzdálenosti od středu → dvojnásobná velikost
    expect(k).toBeCloseTo(2, 1);
  });

  it('zásah úchytu jen u vybraných prvků', () => {
    const p = page([st('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])]);
    expect(hitSketchHandle(p, [S0], { x: 98, y: 3 }, 5)).toEqual({ ref: S0, id: 'b', at: { x: 100, y: 0 } });
    expect(hitSketchHandle(p, [], { x: 98, y: 3 }, 5)).toBeNull();
  });
});

describe('přichytávání (krovy: krokev na vaznici)', () => {
  const p = page([st('line', [{ x: 0, y: 0 }, { x: 200, y: 0 }]), st('rect', [{ x: 300, y: 0 }, { x: 400, y: 100 }])]);
  it('význačný bod: konec, střed čáry, roh obdélníku', () => {
    expect(sketchSnap(p, { x: 197, y: 4 }, 8)).toEqual({ pt: { x: 200, y: 0 }, kind: 'point' });
    expect(sketchSnap(p, { x: 103, y: 2 }, 8)).toEqual({ pt: { x: 100, y: 0 }, kind: 'point' });
    expect(sketchSnap(p, { x: 403, y: 97 }, 8)).toEqual({ pt: { x: 400, y: 100 }, kind: 'point' });
  });
  it('jinak bod na čáře; mimo dosah nic; vlastní prvek se vynechá', () => {
    expect(sketchSnap(p, { x: 60, y: 5 }, 8)).toEqual({ pt: { x: 60, y: 0 }, kind: 'on' });
    expect(sketchSnap(p, { x: 60, y: 30 }, 8)).toBeNull();
    expect(sketchSnap(p, { x: 197, y: 4 }, 8, S0)).toBeNull();
  });
  it('srovnání do vodorovné / svislé', () => {
    expect(sketchOrtho({ x: 0, y: 0 }, { x: 100, y: 5 })).toEqual({ x: 100, y: 0 });
    expect(sketchOrtho({ x: 0, y: 0 }, { x: 100, y: 60 })).toEqual({ x: 100, y: 60 });
  });
});

describe('kopie vybraných prvků', () => {
  it('přidá posunuté kopie a vrátí jejich odkazy', () => {
    const p = page([st('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])], { labels: [{ x: 5, y: 5, text: 'a', color: '#000' }] });
    const c = copySketchItems(p, [S0, { kind: 'label', index: 0 }], 10, 20);
    expect(c.page.strokes).toHaveLength(2);
    expect(c.page.strokes[1]!.pts).toEqual([{ x: 10, y: 20 }, { x: 110, y: 20 }]);
    expect(c.page.labels[1]).toMatchObject({ x: 15, y: 25, text: 'a' });
    expect(c.refs).toEqual([{ kind: 'stroke', index: 1 }, { kind: 'label', index: 1 }]);
    expect(p.strokes).toHaveLength(1);
  });
});

describe('nálezy kontroly', () => {
  it('úchyt se táhne o posun pera, ne pod hrot', async () => {
    const { handleTarget } = await import('./sketchEdit');
    expect(handleTarget({ x: 100, y: 0 }, { x: 105, y: 8 }, { x: 125, y: 8 })).toEqual({ x: 120, y: 0 });
  });
  it('u velkého výběru žádné úchyty (ani neviditelné)', async () => {
    const { selectionHandles, SKETCH_HANDLES_MAX } = await import('./sketchEdit');
    const p = page(Array.from({ length: SKETCH_HANDLES_MAX + 1 }, (_, i) => st('line', [{ x: 0, y: i * 10 }, { x: 100, y: i * 10 }])));
    const refs = p.strokes.map((_, index) => ({ kind: 'stroke' as const, index }));
    expect(selectionHandles(p, refs)).toEqual([]);
    expect(hitSketchHandle(p, refs, { x: 100, y: 0 }, 5)).toBeNull();
  });
  it('tah perem nejde stáhnout do čáry', () => {
    const p = page([st('free', [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 40 }])]);
    expect(dragSketchHandle(p, S0, 'f2', { x: 0, y: 80 }).strokes[0]).toBe(p.strokes[0]);
  });
  it('kopie má zaokrouhlené souřadnice', () => {
    const p = page([st('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])]);
    expect(copySketchItems(p, [S0], 24 / 0.7, 24 / 0.7).page.strokes[1]!.pts[0]).toEqual({ x: 34.3, y: 34.3 });
  });
  it('obdélník: zbylé rohy a strany; kruh všemi body; přichycení ke kótě a vrcholu oblouku', () => {
    const r = page([st('rect', [{ x: 0, y: 0 }, { x: 100, y: 50 }])]);
    expect(dragSketchHandle(r, S0, 'c3', { x: -10, y: 70 }).strokes[0]!.pts).toEqual([{ x: -10, y: 0 }, { x: 100, y: 70 }]);
    expect(dragSketchHandle(r, S0, 'e2', { x: 999, y: 90 }).strokes[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 100, y: 90 }]);
    expect(dragSketchHandle(r, S0, 'e3', { x: 20, y: 999 }).strokes[0]!.pts).toEqual([{ x: 20, y: 0 }, { x: 100, y: 50 }]);
    const c = page([st('circle', [{ x: 0, y: 0 }, { x: 50, y: 0 }])]);
    for (const id of ['q0', 'q2', 'q3']) expect(Math.hypot(...Object.values(dragSketchHandle(c, S0, id, { x: -70, y: 0 }).strokes[0]!.pts[1]!) as [number, number])).toBe(70);
    const p = page([st('arc', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { s: 25 })], { dims: [{ a: { x: 0, y: 200 }, b: { x: 100, y: 200 }, text: '' }] });
    expect(sketchSnap(p, { x: 52, y: 27 }, 6)).toEqual({ pt: { x: 50, y: 25 }, kind: 'point' });
    expect(sketchSnap(p, { x: 98, y: 203 }, 6)).toEqual({ pt: { x: 100, y: 200 }, kind: 'point' });
  });
});
