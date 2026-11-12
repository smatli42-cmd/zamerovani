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
