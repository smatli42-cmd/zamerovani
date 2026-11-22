/**
 * Skica značky, krok C (ZNACKY-POZNAMKY-DETAILY.md): popisky a kóty ve velikosti podle fotky (měřítko `k` podle
 * zoomu při vzniku – na obrazovce stejně velké jako čáry), kóty na straně s fotkou jen orientační (odlišený vzhled).
 */
import { describe, expect, it } from 'vitest';
import type { MarkPage } from '../model/types';
import { dimIsOrient, dimText, eraseInPage, hitSketch, labelBox, moveSketchItems, nearestSketchWidth, removeSketchItems, restyleStroke, restyleStrokes, sketchInRect, sketchLineWidth, sketchPolylines, sketchScale } from './sketch';

const page = (photo = false): MarkPage => ({
  id: 'p',
  ...(photo ? { photo: { id: 'f', w: 2000, h: 1500 } } : {}),
  strokes: [],
  labels: [{ x: 1000, y: 500, text: 'okno', color: '#000', k: 4 }],
  dims: [{ a: { x: 0, y: 1000 }, b: { x: 800, y: 1000 }, text: '120', k: 4 }]
});

describe('velikost popisků a kót podle zoomu při vzniku', () => {
  it('měřítko = převrácený zoom (na obrazovce stejná velikost), zaokrouhlené', () => {
    expect(sketchScale(1)).toBe(1);
    expect(sketchScale(0.25)).toBe(4);
    expect(sketchScale(0.3)).toBeCloseTo(3.33, 2);
    expect(sketchScale(4)).toBe(0.25);
  });

  it('rámeček popisku roste s měřítkem; bez měřítka (starší data) = 1', () => {
    const b1 = labelBox('okno', 0, 0);
    const b4 = labelBox('okno', 0, 0, 4);
    expect(b4.w).toBeCloseTo(b1.w * 4);
    expect(b4.h).toBeCloseTo(b1.h * 4);
  });

  it('zásah i guma berou zvětšený rámeček popisku', () => {
    const p = page();
    // 40 jednotek od středu = mimo rámeček velikosti 1, uvnitř rámečku velikosti 4
    expect(hitSketch(p, { x: 1000, y: 530 }, 0)).toEqual({ kind: 'label', index: 0 });
    expect(eraseInPage(p, { x: 1000, y: 530 }, 2)?.labels).toHaveLength(0);
  });

  it('zásah kóty i za jejím (zvětšeným) textem', () => {
    const p = page();
    expect(hitSketch(p, { x: 400, y: 1030 }, 0)).toEqual({ kind: 'dim', index: 0 });
  });

  it('guma smaže kótu i v rámečku jejího textu mimo čáru', () => {
    const p = page();
    expect(eraseInPage(p, { x: 400, y: 1030 }, 2)?.dims).toHaveLength(0);
    expect(eraseInPage(p, { x: 400, y: 1100 }, 2)).toBeNull();
  });
});

describe('kóty na fotce jsou jen orientační', () => {
  it('na straně s fotkou se kóta kreslí jako orientační se znakem ≈, bez fotky obyčejně', () => {
    expect(dimIsOrient(page(true))).toBe(true);
    expect(dimIsOrient(page(false))).toBe(false);
    const d = page().dims[0]!;
    expect(dimText(page(true), d)).toBe('≈ 120');
    expect(dimText(page(false), d)).toBe('120');
    expect(dimText(page(true), { ...d, text: '' })).toBe('');
  });

  it('rámeček textu kóty počítá se znakem ≈ (zásah sedí s kreslením)', () => {
    const p = page(true);
    const d = p.dims[0]!;
    const w = labelBox(dimText(p, d), 0, 0, 4).w;
    expect(w).toBeGreaterThan(labelBox(d.text, 0, 0, 4).w);
    // okraj rámečku s ≈ je zásah, bez fotky už ne
    const x = 400 + w / 2 - 2;
    expect(hitSketch(p, { x, y: 1000 + 30 }, 0)).toEqual({ kind: 'dim', index: 0 });
    expect(hitSketch(page(false), { x, y: 1000 + 30 }, 0)).toBeNull();
  });
});

describe('druh a tloušťka čáry ve skice (přání uživatele 2026-11-22)', () => {
  const withLine = (): MarkPage => ({ ...page(), strokes: [{ mode: 'line', color: '#000', width: 2.5, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }] });

  it('tloušťka = volba × měřítko zoomu (na obrazovce stejná)', () => {
    expect(sketchLineWidth(5, 1)).toBe(5);
    expect(sketchLineWidth(1.5, 0.25)).toBe(6);
  });

  it('změna druhu a tloušťky vybraného prvku kresby; plná = bez pole style', () => {
    const p = restyleStroke(withLine(), { kind: 'stroke', index: 0 }, { style: 'dashed', width: 5 })!;
    expect(p.strokes[0]).toMatchObject({ style: 'dashed', width: 5 });
    const q = restyleStroke(p, { kind: 'stroke', index: 0 }, { style: 'solid' })!;
    expect('style' in q.strokes[0]!).toBe(false);
    expect(q.strokes[0]!.width).toBe(5);
  });

  it('nejbližší volba tloušťky k vybrané čáře (podle zoomu)', () => {
    expect(nearestSketchWidth(5, 1)).toBe(5);
    expect(nearestSketchWidth(6, 0.25)).toBe(1.5);
    expect(nearestSketchWidth(2.4, 1)).toBe(2.5);
  });

  it('text a kóta se nemění; beze změny → null', () => {
    expect(restyleStroke(withLine(), { kind: 'label', index: 0 }, { style: 'dashed' })).toBeNull();
    expect(restyleStroke(withLine(), { kind: 'dim', index: 0 }, { width: 5 })).toBeNull();
    expect(restyleStroke(withLine(), { kind: 'stroke', index: 0 }, { style: 'solid', width: 2.5 })).toBeNull();
  });
});

describe('výběr obdélníkem ve skice (přání uživatele 2026-11-22)', () => {
  // čára 0–100 na y = 0, obdélník 200–300, kóta 0–100 na y = 200, popisek u (500, 50)
  const pg = (): MarkPage => ({
    id: 'p',
    strokes: [
      { mode: 'line', color: '#000', width: 2.5, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { mode: 'rect', color: '#000', width: 2.5, pts: [{ x: 200, y: 0 }, { x: 300, y: 100 }] }
    ],
    labels: [{ x: 500, y: 50, text: 'ok', color: '#000' }],
    dims: [{ a: { x: 0, y: 200 }, b: { x: 100, y: 200 }, text: '1' }]
  });
  const r = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

  it('okno: jen prvky celé uvnitř', () => {
    expect(sketchInRect(pg(), r(-10, -10, 150, 250), false)).toEqual([{ kind: 'stroke', index: 0 }, { kind: 'dim', index: 0 }]);
    // obdélník zasažený jen zčásti se oknem nevybere
    expect(sketchInRect(pg(), r(150, -10, 250, 150), false)).toEqual([]);
  });

  it('křížení: i prvky, kterých se obdélník dotkne (i popisek rámečkem)', () => {
    expect(sketchInRect(pg(), r(150, -10, 250, 150), true)).toEqual([{ kind: 'stroke', index: 1 }]);
    expect(sketchInRect(pg(), r(490, 40, 495, 45), true)).toEqual([{ kind: 'label', index: 0 }]);
  });

  it('křížení: kóta po své čáře, oblouk po svém tvaru; okno je nevybere zčásti', () => {
    const p: MarkPage = { ...pg(), strokes: [{ mode: 'arc', color: '#000', width: 2.5, pts: [{ x: 0, y: 400 }, { x: 200, y: 400 }], s: 50 }] };
    // oblouk vybouchlý jednou stranou – obdélník přes jeho vrchol (mimo tětivu) ho křížením vybere
    const top = sketchPolylines(p.strokes[0]!)[0]!.reduce((a, q) => (Math.abs(q.y - 400) > Math.abs(a.y - 400) ? q : a));
    expect(sketchInRect(p, r(top.x - 5, top.y - 5, top.x + 5, top.y + 5), true)).toEqual([{ kind: 'stroke', index: 0 }]);
    expect(sketchInRect(p, r(40, 190, 60, 210), true)).toEqual([{ kind: 'dim', index: 0 }]);
    expect(sketchInRect(p, r(40, 190, 60, 210), false)).toEqual([]);
  });

  it('posun, smazání a druh čáry u celého výběru (text a kóta bez druhu čáry)', () => {
    const refs = sketchInRect(pg(), r(-10, -10, 600, 250), false);
    expect(refs).toHaveLength(4);
    const m = moveSketchItems(pg(), refs, 10, 5);
    expect(m.strokes[1]!.pts[0]).toEqual({ x: 210, y: 5 });
    expect(m.labels[0]).toMatchObject({ x: 510, y: 55 });
    expect(m.dims[0]!.a).toEqual({ x: 10, y: 205 });
    const d = removeSketchItems(pg(), [{ kind: 'stroke', index: 0 }, { kind: 'label', index: 0 }]);
    expect(d.strokes).toHaveLength(1);
    expect(d.strokes[0]!.mode).toBe('rect');
    expect(d.labels).toHaveLength(0);
    expect(d.dims).toHaveLength(1);
    const st = restyleStrokes(pg(), refs, { style: 'dashed' })!;
    expect(st.strokes.map(x => x.style)).toEqual(['dashed', 'dashed']);
    expect(restyleStrokes(pg(), [{ kind: 'label', index: 0 }], { style: 'dashed' })).toBeNull();
  });
});
