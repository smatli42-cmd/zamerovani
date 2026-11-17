/**
 * Kresba – pravidla na jednom místě (core/drawing.ts): uzavřený tvar, šrafa, obrys, zásah, úchyty, obdélník.
 */
import { describe, expect, it } from 'vitest';
import type { Drawing } from '../model/types';
import {
  activeHatch,
  canHatch,
  doubleOffset,
  drawingHandles,
  drawingOutline,
  drawingPaths,
  drawingSnapPoints,
  hitDrawing,
  isClosedDrawing,
  moveDrawingVertex,
  rectSize,
  sagittaTowards,
  setRectSize
} from './drawing';

const rect = (): Drawing => ({ id: 'r', shape: 'rect', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] });
const circle = (): Drawing => ({ id: 'c', shape: 'circle', pts: [{ x: 0, y: 0 }], r: 500 });
const arc = (): Drawing => ({ id: 'a', shape: 'arc', pts: [{ x: 0, y: 0, s: 200 }, { x: 1000, y: 0 }] });
const line = (closed = false): Drawing => ({ id: 'l', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }], ...(closed ? { closed: true as const } : {}) });
const double = (closedEnds = false): Drawing => ({ id: 'd', shape: 'double', pts: [{ x: 0, y: 0 }, { x: 2000, y: 0 }], width: 250, side: 1, ...(closedEnds ? { closedEnds: true as const } : {}) });

describe('uzavřený tvar a šrafa (jedno pravidlo pro všechny druhy kresby)', () => {
  it('obdélník, kruh, uzavřená čára a dvojitá čára s uzavřenými konci jsou uzavřené – šrafa jde zapnout', () => {
    for (const d of [rect(), circle(), line(true), double(true)]) {
      expect(isClosedDrawing(d)).toBe(true);
      expect(canHatch(d)).toBe(true);
      expect(drawingOutline(d)!.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('oblouk, otevřená čára a dvojitá čára s otevřenými konci uzavřené nejsou – šrafa nejde, uložená se nekreslí', () => {
    for (const d of [arc(), line(false), double(false)]) {
      expect(canHatch(d)).toBe(false);
      expect(drawingOutline(d)).toBeNull();
      expect(activeHatch({ ...d, hatch: 'diag' })).toBeNull();
    }
  });
  it('uzavřená čára ze dvou bodů jen s obloukem (kapka) je uzavřená, rovná dvoubodová ne', () => {
    expect(isClosedDrawing({ id: 'x', shape: 'line', pts: [{ x: 0, y: 0, s: 300 }, { x: 1000, y: 0 }], closed: true })).toBe(true);
    expect(isClosedDrawing({ id: 'x', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], closed: true })).toBe(false);
  });
});

describe('geometrie kresby', () => {
  it('dvojitá čára: druhá čára o šířku na stranu side, uzavřené konce = obdélník překladu', () => {
    const o = doubleOffset(double())!;
    expect(o[0].x).toBeCloseTo(0);
    expect(o[0].y).toBeCloseTo(250);
    expect(drawingPaths(double())).toHaveLength(2);
    expect(drawingPaths(double(true))[0]).toHaveLength(4);
    expect(doubleOffset({ ...double(), side: -1 })![1]).toEqual({ x: 2000, y: -250 });
  });
  it('zásah: čára vždy, vnitřek jen u šrafovaného tvaru', () => {
    expect(hitDrawing(rect(), { x: 200, y: 2 }, 5)).toBe('edge');
    expect(hitDrawing(rect(), { x: 200, y: 150 }, 5)).toBeNull();
    expect(hitDrawing({ ...rect(), hatch: 'cross' }, { x: 200, y: 150 }, 5)).toBe('inside');
    expect(hitDrawing(circle(), { x: 500, y: 0 }, 5)).toBe('edge');
  });
  it('body pro přichycení: vrcholy a středy úseků, kruh střed a kvadranty', () => {
    expect(drawingSnapPoints(rect())).toContainEqual({ x: 200, y: 0 });
    expect(drawingSnapPoints(circle())).toContainEqual({ x: 0, y: -500 });
  });
  it('úchyty: vrcholy + vzepětí úseků; kruh poloměr; dvojitá čára konce + vzdálenost čar', () => {
    expect(drawingHandles(line()).filter(h => h.kind === 'bulge')).toHaveLength(2);
    expect(drawingHandles(line(true)).filter(h => h.kind === 'bulge')).toHaveLength(3);
    expect(drawingHandles(circle()).map(h => h.kind)).toEqual(['radius']);
    expect(drawingHandles(double()).map(h => h.kind)).toEqual(['vertex', 'vertex', 'width']);
  });
  it('vzepětí k bodu: kolmo od středu tětivy, nejvýše půlkruh', () => {
    expect(sagittaTowards({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 204 })).toBe(200);
    expect(sagittaTowards({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: -2000 })).toBe(-500);
  });
  it('obdélník zůstane obdélníkem při tažení rohu (protější roh stojí) i při zadání rozměrů', () => {
    const d = rect();
    moveDrawingVertex(d, 2, { x: 600, y: 500 });
    expect(d.pts).toEqual([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 0, y: 500 }]);
    expect(rectSize(d)).toEqual({ w: 600, h: 500 });
    setRectSize(d, 450, 450);
    expect(d.pts[2]).toEqual({ x: 450, y: 450 });
  });
});
