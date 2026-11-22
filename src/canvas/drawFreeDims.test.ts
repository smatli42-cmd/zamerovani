/**
 * Volná kóta k prvku v jiné vrstvě (chyba od uživatele 2026-11-22): kóta mezi čarou a čarou / stěnou a čarou nebyla
 * vidět – kreslení po vrstvách dostalo jen výřez vrstvy Kóty, ve kterém čáry kresby (vrstva Kresba) chybí.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addDrawLine, addFreeDim, addWall, setLayerVisible } from '../store/actions';
import { elementLayer, layerSlice } from '../core/layers';
import { store } from '../store/store';
import { allHitBoxes, resetHitBoxes } from './hitTargets';
import { flushDimLabels, setDimLockContext, setDimPlaceContext } from './dimLine';
import { drawFreeDims } from './drawFreeDims';

const f = () => store.floor()!;
const cam = { x: 0, y: 0, zoom: 0.1 };
const ctx = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 7 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => {
    t[k] = v;
    return true;
  }
}) as unknown as CanvasRenderingContext2D;

/** Vykreslí volné kóty vrstvy kóty `id` jako renderer a vrátí, zda se kóta nakreslila (klikací číslo). */
function drawnInOwnLayer(id: string): boolean {
  resetHitBoxes();
  const floor = f();
  setDimLockContext(floor.dimLocks, null, true);
  setDimPlaceContext(floor.dimPlace, cam.zoom);
  const slice = layerSlice(floor, elementLayer(floor, 'dim', id)!);
  drawFreeDims(ctx, slice, cam, 1, null, null, floor);
  flushDimLabels();
  return allHitBoxes().some(b => b.action.type === 'numpad' && b.action.target.kind === 'free-dim' && b.action.target.dimId === id);
}

beforeEach(() => store.openProject(createProject({ name: 't' })));

describe('volná kóta k prvku v jiné vrstvě', () => {
  it('čára – čára', () => {
    const l1 = addDrawLine({ x: 0, y: 0 }, { x: 3000, y: 0 })!;
    const l2 = addDrawLine({ x: 0, y: 1000 }, { x: 3000, y: 1000 })!;
    const id = addFreeDim({ drawing: l1, i: 0 }, { drawing: l2, i: 0 }, 300)!;
    expect(id).toBeTruthy();
    expect(elementLayer(f(), 'dim', id)).not.toBe(elementLayer(f(), 'drawing', l1));
    expect(drawnInOwnLayer(id)).toBe(true);
  });

  it('stěna – čára', () => {
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null);
    const w = Object.keys(f().walls)[0]!;
    const l = addDrawLine({ x: 0, y: 1000 }, { x: 3000, y: 1000 })!;
    const id = addFreeDim({ wall: w, side: 1, at: 1500 }, { drawing: l, i: 0 }, 300)!;
    expect(id).toBeTruthy();
    expect(drawnInOwnLayer(id)).toBe(true);
  });

  it('měřená čára ve skryté vrstvě – kóta se kreslí dál (V8)', () => {
    const l1 = addDrawLine({ x: 0, y: 0 }, { x: 3000, y: 0 })!;
    const l2 = addDrawLine({ x: 0, y: 1000 }, { x: 3000, y: 1000 })!;
    const id = addFreeDim({ drawing: l1, i: 0 }, { drawing: l2, i: 0 }, 300)!;
    expect(setLayerVisible(elementLayer(f(), 'drawing', l1)!, false)).toBe(true);
    expect(drawnInOwnLayer(id)).toBe(true);
  });
});
