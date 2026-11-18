/**
 * Volná kóta k hraně výstupku / vybrání (rozhodnutí uživatele 2026-11-18 – výstupek se chová jako část stěny,
 * core/protrusionDimMove.ts). Tabulka druh výstupku × hrana: boční hrana = jen hrana (zamčený rozměr → celek),
 * čelní hrana = celá stěna, hrana téhož výstupku / vlastní líc = jen rozměr. Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { DimEnd, Pt } from '../model/types';
import { cornerDims, cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endDims, endProtrusionsOf } from '../core/endProtrusion';
import { protrusionsOf, protrusionExtent } from '../core/protrusion';
import { freeDimValue } from '../core/freeDim';
import { refAt } from '../core/dimRefs';
import { dist } from '../core/geometry';
import { addDrawLine, addFreeDim, addLine, addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1);
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
/** Bod kresby (krátká čára) – „jiný prvek“ na druhém konci kóty. */
const pointAt = (p: Pt): DimEnd => ({ drawing: addDrawLine(p, { x: p.x + 1, y: p.y + 1000 })!, i: 0 });
const set = (id: string, move: 'a' | 'b', v: number) => applyNumpadValue({ kind: 'free-dim', dimId: id, move }, v);

/** Stěna (0,0)→(5000,0), tělo y ∈ [−300,0]; výstupek 1000 × 400 z líce y = 0 (u 1000…2000). */
function wallProt(mode: 'add' | 'subtract' = 'add') {
  store.openProject(createProject({ name: 't' }));
  const W = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
  const d = mode === 'add' ? 400 : -150;
  polyline([{ x: 1000, y: 0 }, { x: 1000, y: d }, { x: 2000, y: d }, { x: 2000, y: 0 }]);
  const p = protrusionsOf(f())[0]!;
  return { W, p };
}
const ext = (id: string) => protrusionExtent(f().protrusions![id]!);

describe('kóta k hraně výstupku na stěně', () => {
  it('přichycení: boční i čelní hrana (přednost před lícem)', () => {
    const { p } = wallProt();
    expect(refAt(f(), { x: 1003, y: 200 }, 20, 20)).toMatchObject({ prot: p.id, i: 0 });
    expect(refAt(f(), { x: 1500, y: 403 }, 20, 20)).toMatchObject({ prot: p.id, i: 1 });
  });

  it('boční hrana: posune se jen hrana (šířka se změní, druhá hrana stojí)', () => {
    const { p } = wallProt();
    const id = addFreeDim({ prot: p.id, i: 2, at: 200 }, pointAt({ x: 3000, y: 200 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(1000, 6);
    expect(set(id, 'a', 1200)).toBe(true);
    const e = ext(p.id);
    const w = f().walls[p.wallId]!;
    const ax = f().nodes[w.a]!.x;
    // u od rohu A (směr podle stěny)
    const xs = [ax + (ax === 0 ? 1 : -1) * e.u0, ax + (ax === 0 ? 1 : -1) * e.u1].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(1000, 3);
    expect(xs[1]).toBeCloseTo(1800, 3);
  });

  it('boční hrana se zamčenou šířkou: posune se celý výstupek po stěně', () => {
    const { p } = wallProt();
    setDimLock({ kind: 'protrusion-dim', protrusionId: p.id, dim: 'width' }, true);
    const id = addFreeDim({ prot: p.id, i: 2, at: 200 }, pointAt({ x: 3000, y: 200 }))!;
    expect(set(id, 'a', 1200)).toBe(true);
    expect(ext(p.id).u1 - ext(p.id).u0).toBeCloseTo(1000, 3);
    expect(freeDimValue(f(), id)).toBeCloseTo(1200, 3);
  });

  it('čelní hrana: posune se celá stěna i s výstupkem (hloubka stejná)', () => {
    const { p } = wallProt();
    const id = addFreeDim({ prot: p.id, i: 1, at: 500 }, pointAt({ x: 1500, y: 1000 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 6);
    expect(set(id, 'a', 800)).toBe(true);
    expect(nodeAt({ x: 0, y: -200 })).toBeDefined();
    expect(ext(p.id).depth).toBeCloseTo(400, 3);
  });

  it('obě hrany téhož výstupku: změní se šířka (posouvaná hrana jede)', () => {
    const { p } = wallProt();
    const id = addFreeDim({ prot: p.id, i: 0, at: 200 }, { prot: p.id, i: 2, at: 200 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(1000, 6);
    expect(set(id, 'b', 1300)).toBe(true);
    expect(ext(p.id).u1 - ext(p.id).u0).toBeCloseTo(1300, 3);
  });

  it('vlastní líc – čelní hrana: změní se hloubka, stěna stojí', () => {
    const { p } = wallProt();
    // líc y = 0 (ten, ze kterého výstupek vystupuje)
    const face = refAt(f(), { x: 3000, y: 2 }, 20, 20)!;
    expect('wall' in face).toBe(true);
    const id = addFreeDim(face, { prot: p.id, i: 1, at: 500 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(400, 6);
    expect(set(id, 'b', 500)).toBe(true);
    expect(ext(p.id).depth).toBeCloseTo(500, 3);
    expect(nodeAt({ x: 0, y: 0 })).toBeDefined();
  });

  it('vybrání: boční hrana se posune jen sama', () => {
    const { p } = wallProt('subtract');
    expect(p.mode).toBe('subtract');
    const id = addFreeDim({ prot: p.id, i: 0, at: 50 }, pointAt({ x: 500, y: 500 }))!;
    expect(set(id, 'a', 300)).toBe(true);
    expect(ext(p.id).u1 - ext(p.id).u0).toBeCloseTo(1200, 3);
  });

  it('zamčená kóta k boční hraně: posun kresby potáhne hranu (pevné spojení)', () => {
    const { p } = wallProt();
    const pt = pointAt({ x: 3000, y: 200 }) as { drawing: string; i: number };
    const id = addFreeDim({ prot: p.id, i: 2, at: 200 }, pt)!;
    setDimLock({ kind: 'free-dim', dimId: id, move: 'b' }, true);
    expect(store.edit(fl => fl.drawings![pt.drawing]!.pts.forEach(q => void (q.x -= 100)))).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(1000, 3);
    expect(ext(p.id).u1 - ext(p.id).u0).toBeCloseTo(900, 3);
  });
});

/** Roh: S (0,0)→(4000,0) tělo y ∈ [−300,0], L (0,0)→(0,3000) tělo x ∈ [−300,0]; výstupek 600 × 400 ve vnitřním rohu. */
function corner() {
  store.openProject(createProject({ name: 't' }));
  addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
  addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
  polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);
  return cornerProtrusionsOf(f())[0]!;
}

describe('kóta k hraně výstupku v rohu', () => {
  it('hrana: posune se jen hrana (rozměr podél stěny)', () => {
    const cp = corner();
    expect(refAt(f(), { x: 603, y: 200 }, 20, 20)).toMatchObject({ prot: cp.id, i: 0 });
    const id = addFreeDim({ prot: cp.id, i: 0, at: 200 }, pointAt({ x: 1000, y: 200 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(400, 6);
    expect(set(id, 'a', 600)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).a).toBeCloseTo(400, 3);
    expect(nodeAt({ x: 0, y: 0 })).toBeDefined();
  });

  it('zamčený rozměr: posune se stěna, se kterou je hrana rovnoběžná, výstupek jede s rohem', () => {
    const cp = corner();
    setDimLock({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, true);
    const id = addFreeDim({ prot: cp.id, i: 0, at: 200 }, pointAt({ x: 1000, y: 200 }))!;
    expect(set(id, 'a', 600)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).a).toBeCloseTo(600, 3);
    expect(nodeAt({ x: -200, y: 0 })).toBeDefined();
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 3);
  });
});

/** Konec: W (0,0)→(3000,0) tělo y ∈ [0,300]; výstupek kolem konce B – 400 podél líců, přesah 200, hloubka 200. */
function end() {
  store.openProject(createProject({ name: 't' }));
  addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 });
  polyline([
    { x: 2600, y: 0 },
    { x: 2600, y: -200 },
    { x: 3200, y: -200 },
    { x: 3200, y: 500 },
    { x: 2600, y: 500 },
    { x: 2600, y: 300 }
  ]);
  return endProtrusionsOf(f())[0]!;
}

describe('kóta k hraně výstupku na konci stěny', () => {
  it('hrana za čelem: změní se přesah, stěna stojí', () => {
    const ep = end();
    const id = addFreeDim({ prot: ep.id, i: 2, at: 300 }, pointAt({ x: 4000, y: 100 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(800, 6);
    expect(set(id, 'a', 600)).toBe(true);
    expect(endDims(f().endProtrusions![ep.id]!).over).toBeCloseTo(400, 3);
    expect(nodeAt({ x: 3000, y: 0 })).toBeDefined();
  });

  it('zamčený přesah: prodlouží se stěna, výstupek jede s koncem', () => {
    const ep = end();
    setDimLock({ kind: 'end-dim', protrusionId: ep.id, dim: 'over' }, true);
    const id = addFreeDim({ prot: ep.id, i: 2, at: 300 }, pointAt({ x: 4000, y: 100 }))!;
    expect(set(id, 'a', 600)).toBe(true);
    expect(endDims(f().endProtrusions![ep.id]!).over).toBeCloseTo(200, 3);
    expect(nodeAt({ x: 3200, y: 0 })).toBeDefined();
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 3);
  });

  it('čelní hrana (podél stěny): posune se celá stěna', () => {
    const ep = end();
    const id = addFreeDim({ prot: ep.id, i: 1, at: 300 }, pointAt({ x: 2900, y: -1000 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(800, 6);
    expect(set(id, 'a', 1000)).toBe(true);
    expect(nodeAt({ x: 0, y: 200 })).toBeDefined();
    expect(endDims(f().endProtrusions![ep.id]!).depth0).toBeCloseTo(200, 3);
  });
});

describe('kóta k hraně výstupku – kontroly, šikmé hrany, zbylé případy', () => {
  it('hrana by vyjela za konec stěny nebo přeskočila protější hranu → nic se nezmění', () => {
    const { p } = wallProt();
    const id = addFreeDim({ prot: p.id, i: 0, at: 200 }, pointAt({ x: 500, y: 200 }))!;
    const snap = f();
    expect(set(id, 'a', 1600)).toBe(false); // levá hrana na x = −1100 (za rohem A)
    expect(f()).toBe(snap);
    expect(set(id, 'a', 2000 - 500 + 300)).toBe(false); // přes pravou hranu
    expect(f()).toBe(snap);
  });

  it('šikmá boční hrana (lichoběžník): hrana se posune, bod na líci jede po líci', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1 });
    polyline([{ x: 1000, y: 0 }, { x: 1200, y: 400 }, { x: 1800, y: 400 }, { x: 2000, y: 0 }]);
    const p = protrusionsOf(f())[0]!;
    // kóta od bodu vlevo ke šikmé levé hraně (kolmo na hranu)
    const id = addFreeDim(pointAt({ x: 300, y: 300 }), { prot: p.id, i: 0, at: 100 })!;
    const v0 = freeDimValue(f(), id)!;
    expect(set(id, 'b', Math.round(v0) + 100)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(Math.round(v0) + 100, 0);
    expect(f().protrusions![p.id]!.pts.map(q => q.v)).toEqual([0, 400, 400, 0]);
  });

  it('vybrání: čelní hrana (dno) od jiného prvku posune celou stěnu', () => {
    const { p } = wallProt('subtract');
    const id = addFreeDim({ prot: p.id, i: 1, at: 500 }, pointAt({ x: 1500, y: -1000 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(850, 6);
    expect(set(id, 'a', 950)).toBe(true);
    expect(nodeAt({ x: 0, y: 100 })).toBeDefined();
  });

  it('roh: hrana rovnoběžná s první stěnou, zamčený rozměr → posune se ta stěna', () => {
    const cp = corner();
    setDimLock({ kind: 'corner-dim', protrusionId: cp.id, dim: 'b' }, true);
    const id = addFreeDim({ prot: cp.id, i: 1, at: 300 }, pointAt({ x: 300, y: 1000 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 6);
    expect(set(id, 'a', 800)).toBe(true);
    expect(cornerDims(f().cornerProtrusions![cp.id]!).b).toBeCloseTo(400, 3);
    expect(nodeAt({ x: 0, y: -200 })).toBeDefined();
  });

  it('vybrání v rohu se zkosením (jedna šikmá čára): hrana se posune', () => {
    store.openProject(createProject({ name: 't' }));
    // vnější roh: S (0,0)→(4000,0) tělo y ∈ [0,300], L (0,0)→(0,3000) tělo x ∈ [0,300]; zkosení přes vnější roh
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: -1 });
    const before = cornerProtrusionsOf(f()).length;
    polyline([{ x: 200, y: 0 }, { x: 0, y: 200 }]);
    const cps = cornerProtrusionsOf(f());
    expect(cps.length).toBe(before + 1);
    const cp = cps[cps.length - 1]!;
    const id = addFreeDim({ prot: cp.id, i: 0, at: 100 }, { x: 1000, y: 1000 })!;
    const v0 = freeDimValue(f(), id)!;
    expect(set(id, 'b', Math.round(v0) + 50)).toBe(true);
  });

  it('konec stěny: boční hrana na líci (podél stěny dovnitř) se posune jen sama', () => {
    const ep = end();
    const id = addFreeDim({ prot: ep.id, i: 0, at: 100 }, pointAt({ x: 2000, y: -100 }))!;
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 6);
    expect(set(id, 'a', 400)).toBe(true);
    expect(endDims(f().endProtrusions![ep.id]!).along0).toBeCloseTo(600, 3); // 400 → hrana o 200 dál od čela
    expect(endDims(f().endProtrusions![ep.id]!).over).toBeCloseTo(200, 3);
  });

  it('roh dočasně neplatný (třetí stěna) – kóta se nesmaže, po odstranění stěny se zase kreslí', () => {
    const cp = corner();
    const id = addFreeDim({ prot: cp.id, i: 0, at: 200 }, pointAt({ x: 1000, y: 200 }))!;
    const extra = addWall({ x: 0, y: 0 }, null, { x: -2000, y: -2000 }, null, false, { thickness: 300 })!;
    expect(f().dims?.[id]).toBeDefined();
    store.edit(fl => void delete fl.walls[extra]);
    expect(freeDimValue(f(), id)).toBeCloseTo(400, 3);
  });

  it('Zpět vrátí posun hrany jedním krokem', () => {
    const { p } = wallProt();
    const id = addFreeDim({ prot: p.id, i: 2, at: 200 }, pointAt({ x: 3000, y: 200 }))!;
    const before = f();
    expect(set(id, 'a', 1200)).toBe(true);
    store.undo();
    expect(f()).toBe(before);
  });
});
