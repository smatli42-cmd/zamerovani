/**
 * I1.11 – kopírování výstupku v řadě (rozhodnutí uživatele 2026-11-15: tlačítko v panelu – počet, rozteč, směr).
 * Stěna S z (0,0) do (5000,0), tloušťka 300, tělo y ∈ [0, 300]; výstupek na líci místnosti y = 0 (ven = −y).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { protrusionExtent } from '../core/protrusion';
import { addLine, addWall, copyProtrusionRow } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const prots = () => Object.values(f().protrusions ?? {});
const starts = () => prots().map(p => Math.round(protrusionExtent(p).u0)).sort((a, b) => a - b);

function setup() {
  store.openProject(createProject({ name: 't' }));
  addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
  const pts: Pt[] = [{ x: 500, y: 0 }, { x: 500, y: -200 }, { x: 800, y: -200 }, { x: 800, y: 0 }];
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
  return prots()[0]!.id;
}

describe('I1.11: kopírování výstupku v řadě', () => {
  it('tři kopie po 1200 mm směrem k B', () => {
    const id = setup();
    expect(copyProtrusionRow(id, 3, 1200, 1)).toBe(3);
    expect(starts()).toEqual([500, 1700, 2900, 4100]);
    // kopie mají stejný tvar a stranu
    expect(new Set(prots().map(p => p.side)).size).toBe(1);
  });

  it('co by vyjelo ze stěny, se nevloží; Zpět jedním krokem', () => {
    const id = setup();
    expect(copyProtrusionRow(id, 10, 1200, 1)).toBe(3); // 1700, 2900, 4100; 5300 už ne
    expect(prots()).toHaveLength(4);
    store.undo();
    expect(prots()).toHaveLength(1);
  });

  it('směrem k A se vejde jen to, co je na stěně; nic se nevejde → beze změny (bez kroku Zpět)', () => {
    const id = setup();
    expect(copyProtrusionRow(id, 2, 1000, -1)).toBe(0);
    expect(prots()).toHaveLength(1);
    expect(store.get().canUndo).toBe(true); // jen kroky z nakreslení
  });

  it('kopie se nepřekryje s jiným výstupkem na stejném líci', () => {
    const id = setup();
    const pts: Pt[] = [{ x: 1800, y: 0 }, { x: 1800, y: -200 }, { x: 2000, y: -200 }, { x: 2000, y: 0 }];
    for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    expect(copyProtrusionRow(id, 2, 1200, 1)).toBe(1); // 1700–2000 by se překryl, 2900 ano
    expect(starts()).toEqual([500, 1800, 2900]);
  });
});
