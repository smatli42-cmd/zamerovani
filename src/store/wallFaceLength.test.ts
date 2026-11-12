/**
 * 2b (osa stěny, kóty): u stěny s osou uprostřed se dá zadat míra líce; délka osy se dopočítá.
 * L-roh z C2/15: A = 300 podél +x z (0,0) do (3000,0), B = 100 podél −y, obě s osou uprostřed.
 * Líc A směrem do místnosti (y = −150) začíná na x = 50, vnější líc (y = 150) na x = −50.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { faceLength } from '../core/wallBody';
import { addWall } from './actions';
import { applyNumpadValue, numpadInitialValue } from './actions/numpad';
import { store } from './store';

function lCenter() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1, axis: 'center' })!;
  addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 100, side: -1, axis: 'center' });
  return A;
}

describe('2b: míra líc–líc u osy uprostřed', () => {
  it('délky líců: vnitřní 2950, vnější 3050 (osa 3000)', () => {
    const A = lCenter();
    const f = store.floor()!;
    // A jde +x, normal(a→b) = (0, 1) → face 0 = y −150 (místnost), face 1 = y +150
    expect(faceLength(f, A, 0)).toBeCloseTo(2950, 1);
    expect(faceLength(f, A, 1)).toBeCloseTo(3050, 1);
    expect(numpadInitialValue(f, { kind: 'wall-face-length', wallId: A, face: 0 })).toBe(2950);
  });

  it('zadání vnitřního líce 3000 prodlouží osu na 3050 (posune se konec B), jeden krok Zpět', () => {
    const A = lCenter();
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: A, face: 0 }, 3000)).toBe(true);
    const f = store.floor()!;
    expect(faceLength(f, A, 0)).toBeCloseTo(3000, 0);
    const w = f.walls[A]!;
    expect(f.nodes[w.a]).toMatchObject({ x: 0, y: 0 });
    expect(f.nodes[w.b]!.x).toBeCloseTo(3050, 0);
    store.undo();
    expect(store.floor()!.nodes[store.floor()!.walls[A]!.b]!.x).toBeCloseTo(3000, 3);
  });

  it('stěna bez osy uprostřed nebo bez těla: líc nejde zadat', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 0 })!;
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: W, face: 0 }, 2500)).toBe(false);
  });
});

describe('2b: okrajové případy (nálezy revieweru)', () => {
  const C = { thickness: 300, axis: 'center' as const };
  const wallAt = (x: number, y: number) => {
    const f = store.floor()!;
    return Object.values(f.walls).find(w => {
      const a = f.nodes[w.a]!;
      return Math.abs(a.x - x) < 0.5 && Math.abs(a.y - y) < 0.5;
    })!.id;
  };

  it('uzavřená místnost: vnitřní líc 2700 → 3200, dorovná se přes napojení v rozích, soused se posune', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, C);
    addWall({ x: 3000, y: 0 }, null, { x: 3000, y: -3000 }, null, false, C);
    addWall({ x: 3000, y: -3000 }, null, { x: 0, y: -3000 }, null, false, C);
    addWall({ x: 0, y: -3000 }, null, { x: 0, y: 0 }, null, false, C);
    const A = wallAt(0, 0);
    expect(faceLength(store.floor()!, A, 0)).toBeCloseTo(2700, 1);
    expect(faceLength(store.floor()!, A, 1)).toBeCloseTo(3300, 1);
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: A, face: 0 }, 3200)).toBe(true);
    const f = store.floor()!;
    expect(faceLength(f, A, 0)).toBeCloseTo(3200, 0);
    expect(f.nodes[f.walls[A]!.b]!.x).toBeCloseTo(3500, 0);
    // vnější líc (face 1)
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: A, face: 1 }, 3900)).toBe(true);
    expect(faceLength(store.floor()!, A, 1)).toBeCloseTo(3900, 0);
  });

  it('rozdělená stěna (příčka): posune se bod napojení, konec celé stěny zůstane', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, C);
    addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -1500 }, null, false, { thickness: 100, axis: 'center' });
    const A1 = wallAt(0, 0);
    expect(faceLength(store.floor()!, A1, 0)).toBeCloseTo(950, 1);
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: A1, face: 0 }, 1500)).toBe(true);
    const f = store.floor()!;
    expect(faceLength(f, A1, 0)).toBeCloseTo(1500, 0);
    expect(Object.values(f.nodes).some(n => Math.abs(n.x - 3000) < 0.5 && Math.abs(n.y) < 0.5)).toBe(true);
  });

  it('odmítne stěnu s osou na líci a obloukovou stěnu', () => {
    store.openProject(createProject({ name: 't' }));
    const F = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300 })!;
    const R = addWall({ x: 0, y: -5000 }, null, { x: 2000, y: -5000 }, null, false, { ...C, sagitta: 300 })!;
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: F, face: 0 }, 2500)).toBe(false);
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: R, face: 0 }, 2500)).toBe(false);
  });

  it('líc přetočený napojením (záporná délka) se odmítne a výkres se nezmění', () => {
    store.openProject(createProject({ name: 't' }));
    // krátká stěna 200 mezi dvěma stěnami 300 (osy uprostřed): líc do místnosti = 50 − 150 = −100
    addWall({ x: 0, y: 0 }, null, { x: 200, y: 0 }, null, false, C);
    addWall({ x: 0, y: 0 }, null, { x: 0, y: -2000 }, null, false, C);
    addWall({ x: 200, y: 0 }, null, { x: 200, y: -2000 }, null, false, C);
    // vodorovná stěna (0,0)–(200,0)
    const f0 = store.floor()!;
    const A = Object.values(f0.walls).find(w => Math.abs(f0.nodes[w.a]!.y) < 0.5 && Math.abs(f0.nodes[w.b]!.y) < 0.5)!.id;
    expect(faceLength(store.floor()!, A, 0)!).toBeLessThan(0);
    const before = JSON.stringify(store.floor());
    expect(applyNumpadValue({ kind: 'wall-face-length', wallId: A, face: 0 }, 50)).toBe(false);
    expect(JSON.stringify(store.floor())).toBe(before);
  });
});
