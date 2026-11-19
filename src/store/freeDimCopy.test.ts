/**
 * Volná kóta ve výběru (fronta bod 2): výběr obdélníkem (okno / křížení), kopie s prvky (konec na kopírovaném
 * prvku jede s kopií, jinak pevný bod), posun a otočení skupiny (pevné body kóty jedou se skupinou). Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { DimEnd, FreeDim, Pt } from '../model/types';
import { dimPoints, freeDimValue, freeDimsOf } from '../core/freeDim';
import { protrusionsOf } from '../core/protrusion';
import { cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endProtrusionsOf } from '../core/endProtrusion';
import { selectInRect } from '../core/rectSelect';
import { dist } from '../core/geometry';
import { addDrawLine, addFreeDim, addLine, addOpening, addWall, deleteSelection, duplicateSelection, groupOrigin, moveGroup, rotateSelection } from './actions';
import { store, type SingleSelection } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1)!;
const N = (p: Pt): DimEnd => ({ node: nodeAt(p).id });
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
const fresh = () => store.openProject(createProject({ name: 't' }));
const selectItems = (items: SingleSelection[]) => store.set({ selection: { kind: 'multi', items } });
/** Kopie kóty z poslední kopie výběru. */
const copiedDim = (): FreeDim => {
  const sel = store.get().selection;
  const items = sel?.kind === 'multi' ? sel.items : [];
  const it = items.find(i => i.kind === 'dim');
  return f().dims![it!.id]!;
};
const pts = (d: FreeDim) => dimPoints(f(), d)!;
const near = (p: Pt, q: Pt) => expect(dist(p, q)).toBeLessThan(0.5);

describe('výběr obdélníkem zahrne volnou kótu', () => {
  it('okno: jen kóta celá uvnitř (měřené body i kótovací čára); křížení: dotyk kótovací čáry', () => {
    fresh();
    const id = addFreeDim({ x: 0, y: 0 }, { x: 2000, y: 0 }, -500)!; // kótovací čára y = −500 (normála a→b = (0,1)·−500)
    const line = pts(f().dims![id]!);
    near(line[0], { x: 0, y: 0 });
    const inWin = selectInRect(f(), { x1: -100, y1: -600, x2: 2100, y2: 100 }, false);
    expect(inWin).toContainEqual({ kind: 'dim', id });
    // okno bez kótovací čáry → nevybere
    expect(selectInRect(f(), { x1: -100, y1: -100, x2: 2100, y2: 100 }, false)).not.toContainEqual({ kind: 'dim', id });
    // křížení přes kótovací čáru (mimo měřené body)
    expect(selectInRect(f(), { x1: 900, y1: -550, x2: 1100, y2: -450 }, true)).toContainEqual({ kind: 'dim', id });
    // křížení přes vynášecí čáru
    expect(selectInRect(f(), { x1: -50, y1: -300, x2: 50, y2: -200 }, true)).toContainEqual({ kind: 'dim', id });
    // křížení mimo kótu
    expect(selectInRect(f(), { x1: 900, y1: 100, x2: 1100, y2: 200 }, true)).not.toContainEqual({ kind: 'dim', id });
  });

  it('kóta vybraná ve skupině jde smazat s ostatními', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 3000, y: 0 }))!;
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    deleteSelection();
    expect(freeDimsOf(f())).toHaveLength(0);
  });
});

describe('kopie výběru s volnou kótou', () => {
  it('konce na rozích kopírované stěny jedou s kopií (posun o 300 / 300), odsazení zůstane', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 3000, y: 0 }), 700)!;
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect(c.id).not.toBe(id);
    expect('node' in c.a && 'node' in c.b).toBe(true);
    near(pts(c)[0], { x: 300, y: 300 });
    near(pts(c)[1], { x: 3300, y: 300 });
    expect(c.offset).toBe(700);
    expect(freeDimsOf(f())).toHaveLength(2);
  });

  it('konec na prvku, který se nekopíruje → v kopii pevný bod na posunutém měřeném bodu', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const w2 = addWall({ x: 0, y: 2000 }, null, { x: 3000, y: 2000 }, null, false)!;
    const id = addFreeDim({ wall: w, side: 0, at: 1000 }, { wall: w2, side: 0, at: 1000 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(2000, 6);
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect(c.a).toMatchObject({ side: 0, at: 1000 });
    expect('wall' in c.a && c.a.wall !== w).toBe(true);
    expect(c.b).toEqual({ x: 1300, y: 2300 });
    expect(freeDimValue(f(), c.id)).toBeCloseTo(2000, 6);
  });

  it('samotná vybraná kóta → kopie s pevnými body (stejná délka)', () => {
    fresh();
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 3000, y: 0 }))!;
    store.set({ selection: { kind: 'dim', id } });
    duplicateSelection();
    const c = copiedDim();
    expect(c.a).toEqual({ x: 300, y: 300 });
    expect(c.b).toEqual({ x: 3300, y: 300 });
  });

  it('pevný bod se posune s kopií', () => {
    fresh();
    const id = addFreeDim({ x: 100, y: 100 }, { x: 1100, y: 100 })!;
    store.set({ selection: { kind: 'dim', id } });
    duplicateSelection();
    expect(copiedDim().a).toEqual({ x: 400, y: 400 });
  });

  it('bod kresby a úsek kresby jedou s kopií kresby', () => {
    fresh();
    const d1 = addDrawLine({ x: 0, y: 0 }, { x: 2000, y: 0 })!;
    const d2 = addDrawLine({ x: 0, y: 1000 }, { x: 2000, y: 1000 })!;
    const id = addFreeDim({ drawing: d1, i: 1 }, { seg: d2, i: 0, at: 500 })!;
    selectItems([{ kind: 'drawing', id: d1 }, { kind: 'drawing', id: d2 }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect('drawing' in c.a && c.a.drawing !== d1 && c.a.i === 1).toBe(true);
    expect('seg' in c.b && c.b.seg !== d2 && c.b.at === 500).toBe(true);
    near(pts(c)[0], { x: 2300, y: 300 });
    expect(freeDimValue(f(), c.id)).toBeCloseTo(1000, 6);
  });

  it('okraj otvoru jede s kopií otvoru (otvor se kopíruje se stěnou)', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const op = addOpening(w, 'window', 0.5)!;
    const id = addFreeDim({ opening: op, edge: 'start', at: 0 }, N({ x: 0, y: 0 }))!;
    const v = freeDimValue(f(), id)!;
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect('opening' in c.a && c.a.opening !== op && f().openings[c.a.opening]?.wallId !== w).toBe(true);
    expect(freeDimValue(f(), c.id)).toBeCloseTo(v, 6);
  });

  it('hrana výstupku na stěně jede s kopií výstupku', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    polyline([{ x: 1000, y: 0 }, { x: 1000, y: 400 }, { x: 2000, y: 400 }, { x: 2000, y: 0 }]);
    const p = protrusionsOf(f())[0]!;
    const id = addFreeDim({ prot: p.id, i: 1, at: 500 }, N({ x: 0, y: 0 }))!;
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect('prot' in c.a && c.a.prot !== p.id && !!f().protrusions?.[c.a.prot]).toBe(true);
    expect(freeDimValue(f(), c.id)).toBeCloseTo(400, 6);
  });

  it('hrana výstupku v rohu jede s kopií (obě stěny rohu ve výběru)', () => {
    fresh();
    const w1 = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const w2 = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
    polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);
    const cp = cornerProtrusionsOf(f())[0];
    if (!cp) return expect.fail('výstupek v rohu nevznikl');
    const id = addFreeDim({ prot: cp.id, i: 0, at: 100 }, { x: 2000, y: 200 })!;
    const v = freeDimValue(f(), id)!;
    selectItems([{ kind: 'wall', id: w1 }, { kind: 'wall', id: w2 }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect('prot' in c.a && c.a.prot !== cp.id && !!f().cornerProtrusions?.[c.a.prot]).toBe(true);
    expect(freeDimValue(f(), c.id)).toBeCloseTo(v, 6);
    expect(f().dims![id]).toBeDefined();
  });

  // Nález (není chyba kót): kopie se odsadí jen o 300 mm, takže tělo zkopírované stěny leží přes roh originálu
  // a výstupek v rohu originálu se do odtažení kopie nekreslí (KATALOG I1.11 – roh přestane platit, core/cornerProtrusion.ts
  // cornerValid) – s ním i kóta k jeho hraně. Zapsáno v POSTUP.md jako otevřené.
  it.fails('originál výstupku v rohu i kóta k němu se kreslí i hned po kopii (kopie přes roh originálu)', () => {
    fresh();
    const w1 = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const w2 = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
    polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);
    const cp = cornerProtrusionsOf(f())[0]!;
    const id = addFreeDim({ prot: cp.id, i: 0, at: 100 }, { x: 2000, y: 200 })!;
    const v = freeDimValue(f(), id)!;
    selectItems([{ kind: 'wall', id: w1 }, { kind: 'wall', id: w2 }, { kind: 'dim', id }]);
    duplicateSelection();
    expect(freeDimValue(f(), id)).toBeCloseTo(v, 6);
  });

  it('hrana výstupku na konci stěny jede s kopií', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    polyline([{ x: 2600, y: 0 }, { x: 2600, y: -200 }, { x: 3200, y: -200 }, { x: 3200, y: 500 }, { x: 2600, y: 500 }, { x: 2600, y: 300 }]);
    const ep = endProtrusionsOf(f())[0];
    if (!ep) return expect.fail('výstupek na konci nevznikl');
    const id = addFreeDim({ prot: ep.id, i: 1, at: 100 }, N({ x: 0, y: 0 }))!;
    const v = freeDimValue(f(), id);
    if (v === null) return expect.fail('kóta k výstupku na konci nevznikla');
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    duplicateSelection();
    const c = copiedDim();
    expect('prot' in c.a && c.a.prot !== ep.id && !!f().endProtrusions?.[c.a.prot]).toBe(true);
    expect(freeDimValue(f(), c.id)).toBeCloseTo(v, 6);
  });

  it('posun čísla podél se kopíruje, zámek ne', () => {
    fresh();
    const id = addFreeDim({ x: 0, y: 0 }, { x: 2000, y: 0 })!;
    store.edit(fl => {
      (fl.dimPlace ??= {})[`free-dim:${id}`] = { along: 400, owner: { kind: 'free-dim', dimId: id, move: 'b' } };
      (fl.dimLocks ??= {})[`free-dim:${id}`] = { kind: 'free-dim', dimId: id, move: 'b' } as never;
    });
    store.set({ selection: { kind: 'dim', id } });
    duplicateSelection();
    const c = copiedDim();
    expect(f().dimPlace?.[`free-dim:${c.id}`]?.along).toBe(400);
    expect(f().dimLocks?.[`free-dim:${c.id}`]).toBeUndefined();
  });
});

describe('posun a otočení skupiny s volnou kótou', () => {
  it('posun: pevné body vybrané kóty jedou se skupinou, konce na rozích s rohy', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const id = addFreeDim(N({ x: 0, y: 0 }), { x: 3000, y: 1000 })!;
    const items: SingleSelection[] = [{ kind: 'wall', id: w }, { kind: 'dim', id }];
    moveGroup(groupOrigin(f(), items), 500, 200);
    const d = f().dims![id]!;
    expect(d.b).toEqual({ x: 3500, y: 1200 });
    near(pts(d)[0], { x: 500, y: 200 });
  });

  it('kóta mimo výběr: pevný bod zůstane', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const id = addFreeDim(N({ x: 0, y: 0 }), { x: 3000, y: 1000 })!;
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: w }]), 500, 200);
    expect(f().dims![id]!.b).toEqual({ x: 3000, y: 1000 });
  });

  it('otočení o 90°: pevné body kóty se otočí kolem středu výběru', () => {
    fresh();
    const w = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false)!;
    const id = addFreeDim(N({ x: 0, y: 0 }), { x: 2000, y: 2000 })!;
    selectItems([{ kind: 'wall', id: w }, { kind: 'dim', id }]);
    rotateSelection(90);
    // střed výběru (1000, 1000); (2000, 2000) → (0, 2000); roh (0,0) → (2000, 0)
    expect(f().dims![id]!.b).toEqual({ x: 0, y: 2000 });
    near(pts(f().dims![id]!)[0], { x: 2000, y: 0 });
  });
});
