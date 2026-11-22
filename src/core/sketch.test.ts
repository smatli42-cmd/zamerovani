/**
 * Skica značky, krok C (ZNACKY-POZNAMKY-DETAILY.md): popisky a kóty ve velikosti podle fotky (měřítko `k` podle
 * zoomu při vzniku – na obrazovce stejně velké jako čáry), kóty na straně s fotkou jen orientační (odlišený vzhled).
 */
import { describe, expect, it } from 'vitest';
import type { MarkPage } from '../model/types';
import { dimIsOrient, dimText, eraseInPage, hitSketch, labelBox, nearestSketchWidth, restyleStroke, sketchLineWidth, sketchScale } from './sketch';

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
