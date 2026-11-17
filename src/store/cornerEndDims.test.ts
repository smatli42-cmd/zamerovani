/**
 * Kóty výstupku v rohu a výstupku na konci stěny (I1.11, rozhodnutí uživatele 2026-11-18 „jako u výstupku“):
 * hodnoty, změna NumPadem (mění se jen výstupek), zámek kóty, změna, po které by výstupek nepasoval, se neprovede.
 * Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { cornerDims, cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endDims, endProtrusionsOf } from '../core/endProtrusion';
import { describeDim, dimValue } from '../core/dimLock';
import { addLine, addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';
import { openTarget, pressKey } from './numpadController';

const f = () => store.floor()!;
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};

/** Roh: S (0,0)→(4000,0) tělo y ∈ [−300,0], L (0,0)→(0,3000) tělo x ∈ [−300,0]; výstupek 600 × 400 ve vnitřním rohu. */
function corner() {
  store.openProject(createProject({ name: 't' }));
  const S = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
  const L = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
  polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);
  return { S, L, cp: cornerProtrusionsOf(f())[0]! };
}

/** Konec: W (0,0)→(3000,0) tělo y ∈ [0,300]; výstupek kolem konce B – 400 podél líců, přesah 200, hloubka 200. */
function end() {
  store.openProject(createProject({ name: 't' }));
  const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  polyline([
    { x: 2600, y: 0 },
    { x: 2600, y: -200 },
    { x: 3200, y: -200 },
    { x: 3200, y: 500 },
    { x: 2600, y: 500 },
    { x: 2600, y: 300 }
  ]);
  return { W, ep: endProtrusionsOf(f())[0]! };
}

describe('kóty výstupku v rohu', () => {
  it('hodnoty a změna NumPadem (podél 1. i 2. stěny); jen výstupek, jeden krok Zpět', () => {
    const { cp } = corner();
    expect(dimValue(f(), { kind: 'corner-dim', protrusionId: cp.id, dim: 'a' })).toBe(600);
    expect(dimValue(f(), { kind: 'corner-dim', protrusionId: cp.id, dim: 'b' })).toBe(400);
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 900)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!)).toEqual({ a: 900, b: 400 });
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'b' }, 250)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!)).toEqual({ a: 900, b: 250 });
    store.undo();
    expect(cornerDims(f().cornerProtrusions![cp.id]!)).toEqual({ a: 900, b: 400 });
    expect(describeDim(f(), { kind: 'corner-dim', protrusionId: cp.id, dim: 'a' })).toContain('podél 1. stěny');
  });

  it('zamčená kóta bez potvrzení nezmění; s potvrzením přepsání drží novou hodnotu', () => {
    const { cp } = corner();
    const t = { kind: 'corner-dim', protrusionId: cp.id, dim: 'a' } as const;
    setDimLock(t, true);
    expect(applyNumpadValue(t, 900)).toBe(false);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).a).toBe(600);
    expect(applyNumpadValue(t, 900, true)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).a).toBe(900);
  });

  it('rozměr, se kterým by výstupek vyjel za konec stěny nebo najel na jiný výstupek, se neprovede', () => {
    const { cp } = corner();
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 5000)).toBe(false);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).a).toBe(600);
    // výstupek na líci S od 1000 do 1400
    polyline([{ x: 1000, y: 0 }, { x: 1000, y: 200 }, { x: 1400, y: 200 }, { x: 1400, y: 0 }]);
    expect(Object.keys(f().protrusions ?? {})).toHaveLength(1);
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 1200)).toBe(false);
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 950)).toBe(true);
  });
});

describe('kóty výstupku na konci stěny', () => {
  it('hodnoty: podél obou líců, přesah za čelo, hloubka od obou líců', () => {
    const { ep } = end();
    expect(endDims(ep)).toEqual({ along0: 400, along1: 400, over: 200, depth0: 200, depth1: 200 });
  });

  it('změna každé kóty mění jen svou část obrysu; Zpět', () => {
    const { ep } = end();
    const set = (dim: 'along0' | 'along1' | 'over' | 'depth0' | 'depth1', v: number) => applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim }, v);
    expect(set('over', 350)).toBe(true);
    expect(endDims(f().endProtrusions![ep.id]!)).toEqual({ along0: 400, along1: 400, over: 350, depth0: 200, depth1: 200 });
    expect(set('along0', 600)).toBe(true);
    expect(set('depth1', 100)).toBe(true);
    expect(endDims(f().endProtrusions![ep.id]!)).toEqual({ along0: 600, along1: 400, over: 350, depth0: 200, depth1: 100 });
    store.undo();
    expect(endDims(f().endProtrusions![ep.id]!).depth1).toBe(200);
  });

  it('zamčená kóta drží hodnotu; podél líce přes celou stěnu se neprovede', () => {
    const { ep } = end();
    const t = { kind: 'end-dim', protrusionId: ep.id, dim: 'over' } as const;
    setDimLock(t, true);
    expect(applyNumpadValue(t, 500)).toBe(false);
    expect(endDims(f().endProtrusions![ep.id]!).over).toBe(200);
    expect(applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim: 'along0' }, 3500)).toBe(false);
    expect(endDims(f().endProtrusions![ep.id]!).along0).toBe(400);
  });

  it('výstupek na konci nenajede na výstupek na stěně', () => {
    const { ep } = end();
    polyline([{ x: 1800, y: 0 }, { x: 1800, y: -200 }, { x: 2200, y: -200 }, { x: 2200, y: 0 }]);
    expect(Object.keys(f().protrusions ?? {})).toHaveLength(1);
    expect(applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim: 'along0' }, 1000)).toBe(false);
    expect(applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim: 'along0' }, 700)).toBe(true);
  });
});

describe('kóty výstupků – kombinace a pořadí', () => {
  it('výstupek v rohu nenajede na výstupek na konci téže stěny (a naopak)', () => {
    const { cp } = corner();
    // konec B stěny S (4000,0), tělo y ∈ [−300,0]: obrys 400 podél líců
    polyline([{ x: 3600, y: 0 }, { x: 3600, y: 200 }, { x: 4200, y: 200 }, { x: 4200, y: -500 }, { x: 3600, y: -500 }, { x: 3600, y: -300 }]);
    const ep = endProtrusionsOf(f())[0]!;
    expect(ep).toBeDefined();
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 3800)).toBe(false);
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, 3500)).toBe(true);
    expect(applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim: 'along0' }, 600)).toBe(false);
  });

  it('vnější roh: změna rozměru zachová obtočení na druhé straně', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
    polyline([{ x: 600, y: -300 }, { x: 600, y: -500 }, { x: -500, y: -500 }, { x: -500, y: 600 }, { x: -300, y: 600 }]);
    const cp = cornerProtrusionsOf(f())[0]!;
    const d0 = cornerDims(cp);
    expect(applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, d0.a + 300)).toBe(true);
    const cp1 = f().cornerProtrusions![cp.id]!;
    expect(cornerDims(cp1)).toEqual({ a: d0.a + 300, b: d0.b });
    // body za rohem (záporné s) se nezměnily
    expect(cp1.pts.filter(q => q.s < 0)).toEqual(cp.pts.filter(q => q.s < 0));
  });

  it('NumPad Další: roh a → b; konec podél líce → přesah → podél protějšího → hloubky', () => {
    const { cp } = corner();
    openTarget({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' });
    pressKey('NEXT');
    expect(store.get().numpad?.target).toMatchObject({ kind: 'corner-dim', dim: 'b' });
    pressKey('NEXT');
    expect(store.get().numpad).toBeNull();
    const { ep } = end();
    openTarget({ kind: 'end-dim', protrusionId: ep.id, dim: 'along0' });
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = store.get().numpad?.target;
      if (!t || t.kind !== 'end-dim') break;
      seen.push(t.dim);
      pressKey('NEXT');
    }
    expect(seen).toEqual(['along0', 'over', 'along1', 'depth0', 'depth1']);
    expect(store.get().numpad).toBeNull();
  });
});
