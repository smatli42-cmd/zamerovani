/**
 * I1.11 – výstupek přes volný konec stěny (rozhodnutí uživatele 2026-11-15: čárami z líce kolem čela na protější líc,
 * drží se konce stěny). Osa Y dolů. Stěna W z (0,0) do (3000,0), tloušťka 300, tělo y ∈ [0, 300]; volný konec B.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { endOutline, endProtrusionsOf } from '../core/endProtrusion';
import { splitWallAt } from '../core/topology';
import { findBodyAt, wallBodies } from '../core/wallBody';
import { addLine, addWall, applyNumpadValue, deleteSelection, duplicateSelection, setWallThickness } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const ends = () => endProtrusionsOf(f());

function wall() {
  store.openProject(createProject({ name: 't' }));
  return addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
}
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
/** Obrys kolem konce B: z líce y = 0 ven, za čelo, na protější stranu a zpět na líc y = 300. */
const aroundB = () =>
  polyline([
    { x: 2600, y: 0 },
    { x: 2600, y: -200 },
    { x: 3200, y: -200 },
    { x: 3200, y: 500 },
    { x: 2600, y: 500 },
    { x: 2600, y: 300 }
  ]);
function edgeOver(p: Pt, q: Pt): boolean {
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  for (const body of wallBodies(f()).values()) {
    for (const [a, b] of body.edges) {
      const d = { x: b.x - a.x, y: b.y - a.y };
      const len2 = d.x * d.x + d.y * d.y;
      if (len2 < 1e-9) continue;
      const t = ((mid.x - a.x) * d.x + (mid.y - a.y) * d.y) / len2;
      if (t < 0 || t > 1) continue;
      if (Math.hypot(a.x + d.x * t - mid.x, a.y + d.y * t - mid.y) < 0.5) return true;
    }
  }
  return false;
}

describe('I1.11: výstupek přes volný konec stěny', () => {
  it('vznikne jeden výstupek u konce B, čáry zmizí, vybere se', () => {
    const W = wall();
    aroundB();
    expect(ends()).toHaveLength(1);
    const ep = ends()[0]!;
    expect(ep).toMatchObject({ wallId: W, end: 'b' });
    expect(Object.keys(f().walls)).toEqual([W]);
    expect(store.get().selection).toEqual({ kind: 'protrusion', id: ep.id });
    expect(ep.pts.map(q => q.f)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('líce i čelo pod výstupkem se nekreslí, obrys ano; plocha patří stěně', () => {
    const W = wall();
    aroundB();
    expect(edgeOver({ x: 2600, y: 0 }, { x: 3000, y: 0 })).toBe(false);
    expect(edgeOver({ x: 2600, y: 300 }, { x: 3000, y: 300 })).toBe(false);
    expect(edgeOver({ x: 3000, y: 0 }, { x: 3000, y: 300 })).toBe(false); // čelo
    expect(edgeOver({ x: 3200, y: -200 }, { x: 3200, y: 500 })).toBe(true);
    expect(edgeOver({ x: 0, y: 0 }, { x: 2600, y: 0 })).toBe(true);
    expect(findBodyAt(f(), { x: 3100, y: 150 })?.id).toBe(W);
  });

  it('drží se konce: prodloužení stěny kótou na konci B posune výstupek s čelem', () => {
    const W = wall();
    aroundB();
    const before = endOutline(f(), ends()[0]!)!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: W, move: { nodeId: f().walls[W]!.b } }, 3500)).toBe(true);
    endOutline(f(), ends()[0]!)!.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i]!.x + 500, 6);
      expect(p.y).toBeCloseTo(before[i]!.y, 6);
    });
  });

  it('změna tloušťky: část obrysu u protějšího líce jede s ním', () => {
    const W = wall();
    aroundB();
    setWallThickness(W, 400);
    const o = endOutline(f(), ends()[0]!)!;
    expect(o[o.length - 1]).toMatchObject({ x: 2600, y: 400 });
    expect(o[0]).toMatchObject({ x: 2600, y: 0 });
    expect(o[3]!.y).toBeCloseTo(600, 6);
  });

  it('kolem konce A stejně', () => {
    wall();
    polyline([
      { x: 400, y: 0 },
      { x: 400, y: -200 },
      { x: -200, y: -200 },
      { x: -200, y: 500 },
      { x: 400, y: 500 },
      { x: 400, y: 300 }
    ]);
    expect(ends()[0]).toMatchObject({ end: 'a' });
  });

  it('když se na konec napojí jiná stěna, výstupek se nekreslí; Zpět ho vrátí', () => {
    wall();
    aroundB();
    addWall({ x: 3000, y: 0 }, null, { x: 3000, y: 2000 }, null, false, { thickness: 300 });
    expect(endOutline(f(), ends()[0]!)).toBeNull();
    store.undo();
    expect(endOutline(f(), ends()[0]!)).not.toBeNull();
  });

  it('smazání stěny smaže výstupek; vybraný výstupek jde smazat', () => {
    const W = wall();
    aroundB();
    deleteSelection();
    expect(ends()).toHaveLength(0);
    store.undo();
    store.set({ selection: { kind: 'wall', id: W } });
    deleteSelection();
    expect(ends()).toHaveLength(0);
  });

  it('F4: dělení mimo výstupek ho přenese na část s koncem; dělení v jeho dosahu ho smaže', () => {
    const W = wall();
    aroundB();
    const before = endOutline(f(), ends()[0]!)!;
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 1000, y: 0 };
      splitWallAt(fl, W, 'm');
    });
    const ep = ends()[0]!;
    expect(f().walls[ep.wallId]!.a).toBe('m');
    expect(endOutline(f(), ep)).toEqual(before);
    store.undo();
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 2800, y: 0 };
      splitWallAt(fl, W, 'm');
    });
    expect(ends()).toHaveLength(0);
  });

  it('kopie stěny zkopíruje i výstupek', () => {
    const W = wall();
    aroundB();
    store.set({ selection: { kind: 'wall', id: W } });
    duplicateSelection();
    expect(ends()).toHaveLength(2);
  });

  it('sloučení s rovným pokračováním na konci B: konec zanikne i s výstupkem; výstupek na A zůstane', () => {
    wall();
    aroundB();
    polyline([
      { x: 400, y: 0 },
      { x: 400, y: -200 },
      { x: -200, y: -200 },
      { x: -200, y: 500 },
      { x: 400, y: 500 },
      { x: 400, y: 300 }
    ]);
    expect(ends()).toHaveLength(2);
    addWall({ x: 3000, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    expect(Object.keys(f().walls)).toHaveLength(1);
    expect(ends()).toHaveLength(1);
    expect(ends()[0]!.end).toBe('a');
    expect(endOutline(f(), ends()[0]!)).not.toBeNull();
  });

  it('zkrácení stěny kótou pod dosah výstupku se neprovede', () => {
    const W = wall();
    aroundB();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: W, move: { nodeId: f().walls[W]!.a } }, 300)).toBe(false);
  });
});

describe('I1.11: výstupek na konci – po kontrole revieweru', () => {
  it('ťuknutí na tělo stěny u konce vybere stěnu, mimo tělo výstupek', async () => {
    const { pickAny } = await import('../tools/pick');
    const W = wall();
    aroundB();
    const cam = { x: 0, y: 0, zoom: 0.1 };
    expect(pickAny(f(), { x: 2800, y: 150 }, cam)).toEqual({ kind: 'wall', id: W });
    expect(pickAny(f(), { x: 3100, y: 150 }, cam)?.kind).toBe('protrusion');
  });

  it('kopie stěny se skrytým výstupkem (napojený konec) ho nekopíruje', () => {
    const W = wall();
    aroundB();
    addWall({ x: 3000, y: 0 }, null, { x: 3000, y: 2000 }, null, false, { thickness: 300 });
    store.set({ selection: { kind: 'wall', id: W } });
    duplicateSelection();
    expect(ends()).toHaveLength(1);
  });

  it('oddělený konec dosedající na jinou stěnu není volný (výstupek se nekreslí)', () => {
    wall();
    aroundB();
    addWall({ x: 3000, y: 0 }, null, { x: 3000, y: 2000 }, null, false, { thickness: 300 });
    store.edit(fl => {
      const other = Object.values(fl.walls).find(w => fl.nodes[w.a]!.x === 3000 && fl.nodes[w.b]!.y === 2000)!;
      const n = { id: 'sep', x: 3000, y: 0 };
      fl.nodes.sep = n;
      other.a = 'sep';
      other.noJoinA = true;
    });
    expect(endOutline(f(), ends()[0]!)).toBeNull();
  });

  it('kopie výstupku v řadě se nepoloží přes výstupek na konci stěny', async () => {
    const { copyProtrusionRow } = await import('./actions');
    wall();
    aroundB();
    polyline([{ x: 500, y: 0 }, { x: 500, y: -200 }, { x: 800, y: -200 }, { x: 800, y: 0 }]);
    const id = Object.keys(f().protrusions ?? {})[0]!;
    // kopie po 1000: 1500, 2500 (překryv s výstupkem na konci od 2600? ne – 2500–2800 ano) → jen jedna
    expect(copyProtrusionRow(id, 2, 1000, 1)).toBe(1);
  });
});
