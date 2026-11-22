/**
 * Tažení konce vybrané čáry (přání uživatele 2026-11-22): pomocná čára v původním směru čáry jako při kreslení –
 * konec se na ni přichytí (délka po 10 mm), čára jde pohodlně prodloužit / zkrátit. Platí pro konec čáry a dvojité
 * čáry s rovným koncovým úsekem; obdélník a vnitřní bod lomené čáry ne.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Drawing, Pt } from '../model/types';
import { dist } from '../core/geometry';
import { store } from '../store/store';
import { dragDrawingHandle, drawingHandleUnderPen } from './drawingEdit';

const cam = { x: 0, y: 0, zoom: 0.2 };
const input = (world: Pt) => ({ world, screen: { x: world.x * cam.zoom, y: world.y * cam.zoom }, device: 'pen' as const });

function put(d: Drawing): void {
  store.edit(fl => void ((fl.drawings ??= {})[d.id] = d));
  store.set({ selection: { kind: 'drawing', id: d.id } });
}

/** Chytí úchyt v bodě `at` a táhne ho na `to`; vrací nový bod a pomocné čáry. */
function dragEnd(at: Pt, to: Pt) {
  const h = drawingHandleUnderPen(input(at))!;
  expect(h).not.toBeNull();
  store.beginGesture();
  const g = dragDrawingHandle(h, input(to));
  store.endGesture();
  return g;
}

const pts = (id: string) => store.floor()!.drawings![id]!.pts;

/** Vzdálenost bodu od přímky a→b. */
const off = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / dist(a, b);

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: cam, selection: null });
});

describe('konec vybrané čáry se přichytí na její směr', () => {
  it('šikmá čára: prodloužení kousek vedle směru → přesně na směru, délka po 10 mm', () => {
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 3000, y: 1000 }] });
    const g = dragEnd({ x: 3000, y: 1000 }, { x: 4503, y: 1530 });
    const p = pts('L')[1]!;
    expect(off(p, { x: 0, y: 0 }, { x: 3000, y: 1000 })).toBeLessThan(0.01);
    expect(Math.round(dist({ x: 0, y: 0 }, p)) % 10).toBe(0);
    expect(p.x).toBeGreaterThan(4000);
    expect(g?.line?.id).toBe('orig:dir');
    expect(g?.lines.map(l => l.id)).toEqual(['orig:dir']);
  });

  it('zkrácení: první bod lomené čáry jede po směru prvního úseku', () => {
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 2000, y: 2000 }, { x: 4000, y: 2000 }] });
    dragEnd({ x: 0, y: 0 }, { x: 812, y: 790 });
    const p = pts('L')[0]!;
    expect(off(p, { x: 0, y: 0 }, { x: 2000, y: 2000 })).toBeLessThan(0.01);
    expect(p.x).toBeGreaterThan(700);
    expect(pts('L')[1]).toEqual({ x: 2000, y: 2000 });
  });

  it('dvojitá čára: konec se přichytí na směr', () => {
    put({ id: 'D', shape: 'double', pts: [{ x: 0, y: 0 }, { x: 2000, y: 1000 }], width: 100, side: 1 });
    dragEnd({ x: 2000, y: 1000 }, { x: 2990, y: 1520 });
    expect(off(pts('D')[1]!, { x: 0, y: 0 }, { x: 2000, y: 1000 })).toBeLessThan(0.01);
  });

  it('daleko od směru: konec jde volně (bez pomocné čáry směru)', () => {
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 3000, y: 1000 }] });
    const g = dragEnd({ x: 3000, y: 1000 }, { x: 2470, y: 2930 });
    expect(g?.line?.id).not.toBe('orig:dir');
    expect(off(pts('L')[1]!, { x: 0, y: 0 }, { x: 3000, y: 1000 })).toBeGreaterThan(100);
  });

  it('vnitřní bod lomené čáry a obdélník pomocnou čáru směru nemají', () => {
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 2000, y: 2000 }, { x: 4000, y: 2000 }] });
    expect(dragEnd({ x: 2000, y: 2000 }, { x: 2100, y: 2300 })).toBeNull();
    put({ id: 'R', shape: 'rect', pts: [{ x: 6000, y: 0 }, { x: 7000, y: 0 }, { x: 7000, y: 1000 }, { x: 6000, y: 1000 }] });
    expect(dragEnd({ x: 7000, y: 1000 }, { x: 7200, y: 1300 })).toBeNull();
  });

  it('vypnuté přichytávání: bez pomocné čáry, konec volně', () => {
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 3000, y: 1000 }] });
    store.set({ settings: { ...store.get().settings, snap: false } });
    expect(dragEnd({ x: 3000, y: 1000 }, { x: 4503, y: 1530 })).toBeNull();
    expect(off(pts('L')[1]!, { x: 0, y: 0 }, { x: 3000, y: 1000 })).toBeGreaterThan(1);
    store.set({ settings: { ...store.get().settings, snap: true } });
  });

  it('zarovnání s bodem jiné kresby na směru se ukáže stopou (jako při kreslení)', () => {
    put({ id: 'P', shape: 'line', pts: [{ x: 4500, y: 300 }, { x: 6000, y: 300 }] });
    put({ id: 'L', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 3000, y: 1000 }] });
    const g = dragEnd({ x: 3000, y: 1000 }, { x: 4497, y: 1505 });
    expect(pts('L')[1]!.x).toBeCloseTo(4500);
    expect(pts('L')[1]!.y).toBeCloseTo(1500);
    expect(g?.align).toEqual([{ from: { x: 4500, y: 300 }, to: { x: 4500, y: 1500 } }]);
  });
});
