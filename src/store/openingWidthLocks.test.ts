/**
 * Šířka otvoru se zamčeným úsekem na jedné straně (chyba od uživatele 2026-11-18: rozšíření okna se zamčeným
 * úsekem 700 k rohu prodloužilo stěnu a zastavila ho nesouvisející zamčená kóta). Rozhodnutí uživatele: otvor se
 * rozšíří / zúží na volnou stranu, stěna se neprodlužuje. Stěna z (0,0) do (0,3000), okno 1200, úseky 1100 / 700.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { openingSpan, openingStartFromA, wallLength } from '../core/floorQueries';
import { addOpening, addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';

const f = () => store.floor()!;
function setup(ref: 'a' | 'b') {
  store.openProject(createProject({ name: 't' }));
  const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
  const op = addOpening(W, 'window', 0.5)!;
  // okno 1200 se zárubní: zarovnat tak, aby úsek k A byl 1100
  store.edit(fl => {
    const o = fl.openings[op]!;
    const span = openingSpan(o);
    o.ref = ref;
    o.offset = ref === 'a' ? 1100 : 3000 - 1100 - span;
  });
  return { W, op };
}
const parts = (W: string, op: string) => {
  const o = f().openings[op]!;
  const len = wallLength(f(), f().walls[W]!);
  const s = openingStartFromA(o, len);
  return { before: Math.round(s), after: Math.round(len - s - openingSpan(o)), len: Math.round(len) };
};

describe('šířka otvoru se zamčeným úsekem na jedné straně', () => {
  it('ref A, úsek k rohu B zamčený: rozšíření zmenší úsek k A, zamčený úsek i stěna zůstanou', () => {
    const { W, op } = setup('a');
    const before = parts(W, op);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: op }, 1300)).toBe(true);
    const now = parts(W, op);
    expect(now.after).toBe(before.after);
    expect(now.before).toBe(before.before - 100);
    expect(now.len).toBe(3000);
  });

  it('ref A, úsek k rohu B zamčený: zúžení zvětší úsek k A', () => {
    const { W, op } = setup('a');
    const before = parts(W, op);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: op }, 1000)).toBe(true);
    expect(parts(W, op)).toMatchObject({ after: before.after, before: before.before + 200, len: 3000 });
  });

  it('ref B, úsek k rohu A zamčený: rozšíření zmenší úsek k B', () => {
    const { W, op } = setup('b');
    const before = parts(W, op);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'a' }, true);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: op }, 1300)).toBe(true);
    expect(parts(W, op)).toMatchObject({ before: before.before, after: before.after - 100, len: 3000 });
  });

  it('zamčené obě strany: jako dřív – stěna se prodlouží', () => {
    const { W, op } = setup('a');
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'a' }, true);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: op }, 1300)).toBe(true);
    expect(parts(W, op).len).toBe(3100);
  });

  it('rozšíření větší než volný úsek se neprovede', () => {
    const { W, op } = setup('a');
    const before = parts(W, op);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: op }, 1200 + 1200)).toBe(false);
    expect(parts(W, op)).toEqual(before);
  });
});

describe('šířka otvoru se zámky – řada otvorů a dveře (po kontrole revieweru)', () => {
  function row() {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 6000 }, null, false, { thickness: 300, side: 1 })!;
    const o1 = addOpening(W, 'window', 0.2)!;
    const o2 = addOpening(W, 'window', 0.5)!;
    const o3 = addOpening(W, 'window', 0.8)!;
    return { W, o1, o2, o3 };
  }
  const startOf = (W: string, op: string) => openingStartFromA(f().openings[op]!, wallLength(f(), f().walls[W]!));
  const endOf = (W: string, op: string) => startOf(W, op) + openingSpan(f().openings[op]!);

  it('prostřední okno, vpravo zamčené meziostění i úsek k B: roste doleva, sousedé i stěna stojí', () => {
    const { W, o1, o2, o3 } = row();
    store.edit(fl => {
      const o = fl.openings[o2]!;
      if (o.ref === 'b') {
        const len = 6000;
        const st = openingStartFromA(o, len);
        o.ref = 'a';
        o.offset = Math.round(st);
      }
    });
    setDimLock({ kind: 'opening-gap', firstId: o2, secondId: o3 }, true);
    setDimLock({ kind: 'opening-offset', openingId: o3, ref: 'b' }, true);
    const e2 = endOf(W, o2);
    const s1 = startOf(W, o1);
    const s3 = startOf(W, o3);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: o2 }, f().openings[o2]!.width + 100)).toBe(true);
    expect(endOf(W, o2)).toBeCloseTo(e2, 0);
    expect(startOf(W, o1)).toBeCloseTo(s1, 0);
    expect(startOf(W, o3)).toBeCloseTo(s3, 0);
    expect(wallLength(f(), f().walls[W]!)).toBeCloseTo(6000, 0);
  });

  it('řetěz vpravo končí volným úsekem: jako dřív – sousedé se posunou, volný úsek změnu spolkne', () => {
    const { W, o2, o3 } = row();
    store.edit(fl => {
      const o = fl.openings[o2]!;
      const st = openingStartFromA(o, 6000);
      o.ref = 'a';
      o.offset = Math.round(st);
    });
    setDimLock({ kind: 'opening-gap', firstId: o2, secondId: o3 }, true);
    const s2 = startOf(W, o2);
    const s3 = startOf(W, o3);
    expect(applyNumpadValue({ kind: 'opening-width', openingId: o2 }, f().openings[o2]!.width + 100)).toBe(true);
    expect(startOf(W, o2)).toBeCloseTo(s2, 0);
    expect(startOf(W, o3)).toBeCloseTo(s3 + 100, 0);
    expect(wallLength(f(), f().walls[W]!)).toBeCloseTo(6000, 0);
  });

  it('dveře se zárubní: zamčený úsek k B drží, roste doleva; Zpět vrátí', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
    const d = addOpening(W, 'door', 0.5)!;
    store.edit(fl => {
      const o = fl.openings[d]!;
      const st = openingStartFromA(o, 3000);
      o.ref = 'a';
      o.offset = Math.round(st);
    });
    setDimLock({ kind: 'opening-offset', openingId: d, ref: 'b' }, true);
    const before = parts(W, d);
    const w0 = f().openings[d]!.width;
    expect(applyNumpadValue({ kind: 'opening-width', openingId: d }, w0 + 100)).toBe(true);
    expect(parts(W, d)).toMatchObject({ after: before.after, before: before.before - 100, len: 3000 });
    store.undo();
    expect(parts(W, d)).toEqual(before);
  });
});
