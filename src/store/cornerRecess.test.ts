/**
 * I1.11 – vybrání v rohu (rozhodnutí uživatele 2026-11-18: vnější i vnitřní roh, kreslí se Čárou ve stěnách jako
 * výstupek v rohu, jen vedené do těl stěn). Osa Y dolů. Stěna S z (0,0) do (4000,0), tloušťka 300, tělo
 * y ∈ [−300, 0]; stěna L z (0,0) do (0,3000), tloušťka 300, tělo x ∈ [−300, 0]. Vnitřní roh líců (0,0),
 * vnější (−300,−300).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { cornerOutline, cornerProtrusionsOf } from '../core/cornerProtrusion';
import { findBodyAt, wallBodies } from '../core/wallBody';
import { pickProtrusion } from '../tools/pick';
import { addLine, addWall, applyNumpadValue, deleteSelection, duplicateSelection, setCornerProtrusionDim, setWallThickness, splitWall } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const corners = () => cornerProtrusionsOf(f());

function room() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
  const S = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
  const L = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
  return { S, L, c: f().walls[S]!.a };
}
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
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
/** Vnitřní roh: zářez 100 mm do obou stěn, 600 podél S, 400 podél L. */
const innerRecess = () =>
  polyline([
    { x: 600, y: 0 },
    { x: 600, y: -100 },
    { x: -100, y: -100 },
    { x: -100, y: 400 },
    { x: 0, y: 400 }
  ]);
/** Vnější roh: pravoúhlý zářez 400 × 200 (od vnějšího rohu (−300,−300)). */
const outerNotch = () =>
  polyline([
    { x: 100, y: -300 },
    { x: 100, y: -100 },
    { x: -300, y: -100 }
  ]);

describe('I1.11: vybrání ve vnitřním rohu', () => {
  it('vznikne jedno vybrání v rohu, čáry zmizí, vybere se', () => {
    const { S, L } = room();
    innerRecess();
    expect(corners()).toHaveLength(1);
    const cp = corners()[0]!;
    expect(cp.mode).toBe('subtract');
    expect(cp.walls).toEqual([S, L]);
    expect(Object.keys(f().walls)).toHaveLength(2);
    expect(store.get().selection).toEqual({ kind: 'protrusion', id: cp.id });
    expect(cp.pts).toEqual([
      { s: 600, t: 0 },
      { s: 600, t: -100 },
      { s: -100, t: -100 },
      { s: -100, t: 400 },
      { s: 0, t: 400 }
    ]);
  });

  it('plocha vybrání se z těl obou stěn vyřízne, zbytek těl zůstane', () => {
    const { S, L } = room();
    innerRecess();
    expect(findBodyAt(f(), { x: 300, y: -50 })).toBeNull(); // v S
    expect(findBodyAt(f(), { x: -50, y: 200 })).toBeNull(); // v L
    expect(findBodyAt(f(), { x: -50, y: -50 })).toBeNull(); // v rohu
    expect(findBodyAt(f(), { x: 300, y: -200 })?.id).toBe(S);
    expect(findBodyAt(f(), { x: 800, y: -50 })?.id).toBe(S);
    expect(findBodyAt(f(), { x: -200, y: 200 })?.id).toBe(L);
    expect(findBodyAt(f(), { x: -50, y: 600 })?.id).toBe(L);
  });

  it('líce obou stěn se v rohu pod vybráním nekreslí, obrys ano', () => {
    room();
    innerRecess();
    expect(edgeOver({ x: 0, y: 0 }, { x: 600, y: 0 })).toBe(false);
    expect(edgeOver({ x: 0, y: 0 }, { x: 0, y: 400 })).toBe(false);
    expect(edgeOver({ x: 600, y: 0 }, { x: 600, y: -100 })).toBe(true);
    expect(edgeOver({ x: 600, y: -100 }, { x: -100, y: -100 })).toBe(true);
    expect(edgeOver({ x: -100, y: -100 }, { x: -100, y: 400 })).toBe(true);
    expect(edgeOver({ x: 600, y: 0 }, { x: 4000, y: 0 })).toBe(true); // zbytek líce S
  });

  it('ťuknutí do vybrání ho vybere', () => {
    room();
    innerRecess();
    expect(pickProtrusion(f(), { x: 300, y: -50 }, store.get().camera)).toBe(corners()[0]!.id);
  });

  it('kóta podél 1. stěny změní jen délku podél líce, hloubka zůstane', () => {
    room();
    innerRecess();
    setCornerProtrusionDim(corners()[0]!.id, 'a', 800);
    expect(corners()[0]!.pts).toEqual([
      { s: 800, t: 0 },
      { s: 800, t: -100 },
      { s: -100, t: -100 },
      { s: -100, t: 400 },
      { s: 0, t: 400 }
    ]);
  });

  it('smazání vybrání vrátí těla, Zpět ho vrátí', () => {
    const { S } = room();
    innerRecess();
    deleteSelection();
    expect(corners()).toHaveLength(0);
    expect(findBodyAt(f(), { x: 300, y: -50 })?.id).toBe(S);
    store.undo();
    expect(corners()).toHaveLength(1);
  });

  it('drží se rohu: posun rohu – vybrání zůstane u rohu se stejnými rozměry', () => {
    const { c } = room();
    innerRecess();
    store.edit(fl => {
      fl.nodes[c]!.x += 100;
      fl.nodes[c]!.y += 50;
    });
    const o = cornerOutline(f(), corners()[0]!)!;
    expect(o).not.toBeNull();
    expect(Math.hypot(o[0]!.x - o[1]!.x, o[0]!.y - o[1]!.y)).toBeCloseTo(100, 3);
  });

  it('F4: rozdělení stěny S uvnitř rozsahu vybrání ho smaže', () => {
    const { S } = room();
    innerRecess();
    splitWall(S, { x: 300, y: -150 });
    expect(corners()).toHaveLength(0);
  });

  it('čára vedená zčásti v těle a zčásti mimo zůstane čarami', () => {
    room();
    polyline([
      { x: 600, y: 0 },
      { x: 600, y: -100 },
      { x: 200, y: -100 },
      { x: 200, y: 300 },
      { x: 0, y: 300 }
    ]);
    expect(corners()).toHaveLength(0);
  });
});

describe('I1.11: vybrání ve vnějším rohu', () => {
  it('pravoúhlý zářez dvěma čarami = vybrání v rohu', () => {
    const { S, L } = room();
    outerNotch();
    expect(corners()).toHaveLength(1);
    const cp = corners()[0]!;
    expect(cp.mode).toBe('subtract');
    expect(cp.pts).toEqual([
      { s: 400, t: 0 },
      { s: 400, t: 200 },
      { s: 0, t: 200 }
    ]);
    expect(findBodyAt(f(), { x: -200, y: -200 })).toBeNull();
    expect(findBodyAt(f(), { x: 50, y: -250 })).toBeNull();
    expect(findBodyAt(f(), { x: 50, y: -50 })?.id).toBe(S);
    expect(findBodyAt(f(), { x: -200, y: 300 })?.id).toBe(L);
    expect(edgeOver({ x: -300, y: -300 }, { x: 100, y: -300 })).toBe(false); // vnější líc S
    expect(edgeOver({ x: -300, y: -300 }, { x: -300, y: -100 })).toBe(false); // vnější líc L
    expect(edgeOver({ x: 100, y: -300 }, { x: 100, y: -100 })).toBe(true);
    expect(edgeOver({ x: 100, y: -100 }, { x: -300, y: -100 })).toBe(true);
  });

  it('zkosení rohu jednou čárou z líce na líc = vybrání v rohu', () => {
    room();
    polyline([
      { x: 100, y: -300 },
      { x: -300, y: 100 }
    ]);
    expect(corners()).toHaveLength(1);
    const cp = corners()[0]!;
    expect(cp.mode).toBe('subtract');
    expect(cp.pts).toEqual([
      { s: 400, t: 0 },
      { s: 0, t: 400 }
    ]);
    expect(findBodyAt(f(), { x: -250, y: -250 })).toBeNull();
    expect(findBodyAt(f(), { x: -50, y: -50 })).not.toBeNull();
    expect(edgeOver({ x: 100, y: -300 }, { x: -300, y: 100 })).toBe(true);
  });

  it('výstupek v rohu jednou čárou dál nevznikne (vnitřní roh – čára mimo těla)', () => {
    room();
    polyline([
      { x: 600, y: 0 },
      { x: 0, y: 400 }
    ]);
    expect(corners()).toHaveLength(0);
  });
});

describe('I1.11: vybrání v rohu – pravidla prvků nesených stěnou (po kontrole revieweru)', () => {
  it('vnější zářez jde kótou zmenšit i pod tloušťku druhé stěny (jako při kreslení)', () => {
    room();
    outerNotch();
    setCornerProtrusionDim(corners()[0]!.id, 'a', 200);
    expect(corners()[0]!.pts[0]).toEqual({ s: 200, t: 0 });
  });

  it('zúžení stěny pod hloubku vybrání: vybrání se nekreslí (stěnu neprořízne), po rozšíření se vrátí', () => {
    const { S } = room();
    innerRecess();
    setWallThickness(S, 80);
    expect(cornerOutline(f(), corners()[0]!)).toBeNull();
    expect(findBodyAt(f(), { x: 300, y: -50 })?.id).toBe(S);
    setWallThickness(S, 300);
    expect(cornerOutline(f(), corners()[0]!)).not.toBeNull();
  });

  it('změna délky stěny kótou: zkrácení pod rozměr vybrání se neprovede, prodloužení ano a vybrání zůstane', () => {
    const { S } = room();
    innerRecess();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: S, move: { nodeId: f().walls[S]!.b } }, 400)).toBe(false);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: S, move: { nodeId: f().walls[S]!.b } }, 5000)).toBe(true);
    expect(cornerOutline(f(), corners()[0]!)![0]).toEqual({ x: 600, y: 0 });
  });

  it('kopie obou stěn zkopíruje i vybrání v rohu', () => {
    const { S, L } = room();
    innerRecess();
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: S }, { kind: 'wall', id: L }] } });
    duplicateSelection();
    expect(corners()).toHaveLength(2);
    expect(corners().every(c => c.mode === 'subtract')).toBe(true);
  });

  it('třetí stěna napojená do rohu: vybrání se skryje', () => {
    const { c } = room();
    innerRecess();
    addWall({ x: 0, y: 0 }, c, { x: 1500, y: 1500 }, null, false, { thickness: 200 });
    expect(cornerOutline(f(), corners()[0]!)).toBeNull();
  });

  it('sloučení stěny rohu s rovným pokračováním: vybrání zůstane na místě', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 2500, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
    innerRecess();
    const before = cornerOutline(f(), corners()[0]!)!;
    addWall({ x: 2000, y: 0 }, null, { x: 2500, y: 0 }, null, false, { thickness: 300, side: -1 });
    expect(corners()).toHaveLength(1);
    const after = cornerOutline(f(), corners()[0]!)!;
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i]!.x, 6);
      expect(p.y).toBeCloseTo(before[i]!.y, 6);
    });
  });
});
