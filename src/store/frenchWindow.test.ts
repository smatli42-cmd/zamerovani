import { describe, expect, it } from 'vitest';
import { createProject, hasLeaf } from '../model/factory';
import { addOpening, addWall, setWindowKind } from './actions';
import { store } from './store';

describe('francouzské okno s křídlem', () => {
  it('má křídlo jako dveře (panty, dovnitř / ven), běžné okno ne', () => {
    expect(hasLeaf('french')).toBe(true);
    expect(hasLeaf('door')).toBe(true);
    expect(hasLeaf('window')).toBe(false);
  });

  it('ve stěně s tloušťkou se otevírá do místnosti jako dveře – při vložení i po přepnutí druhu', () => {
    store.openProject(createProject({ name: 't' }));
    const wId = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
    const side = store.floor()!.walls[wId]!.side;
    const door = addOpening(wId, 'door', 0.2)!;
    const fr = addOpening(wId, 'french', 0.5)!;
    const win = addOpening(wId, 'window', 0.8)!;
    const f = store.floor()!;
    expect(f.openings[fr]!.swing).toBe(f.openings[door]!.swing);
    expect(f.openings[fr]!.swing).toBe(-side);
    setWindowKind(win, 'french');
    const o = store.floor()!.openings[win]!;
    expect(o.kind).toBe('french');
    expect(o.swing).toBe(-side);
    expect(o.sill).toBe(50); // výchozí parapet francouzského okna
  });
});
