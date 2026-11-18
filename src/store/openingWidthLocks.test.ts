/**
 * Šířka otvoru se zamčeným úsekem na jedné straně (chyba od uživatele 2026-11-18: rozšíření okna se zamčeným
 * úsekem 700 k rohu prodloužilo stěnu a zastavila ho nesouvisející zamčená kóta). Rozhodnutí uživatele: otvor se
 * rozšíří / zúží na volnou stranu, stěna se neprodlužuje. Stěna z (0,0) do (0,3000), okno 1200, úseky 1100 / 700.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { openingSpan, openingStartFromA, wallLength } from '../core/floorQueries';
import { addOpening, addWall, applyNumpadValue, setDimLock, setRevealEnabled } from './actions';
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

describe('ostění a zárubeň se zámkem na jedné straně (rozhodnutí uživatele 2026-11-18: i tam na volnou stranu)', () => {
  it('ostění vpravo u okna od A se zamčeným úsekem k B: otvor roste doleva, zamčený úsek stojí', () => {
    const { W, op } = setup('a');
    setRevealEnabled(op, true);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    const before = parts(W, op);
    const r0 = f().openings[op]!.reveal!.right;
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: op, part: 'right' }, r0 + 50)).toBe(true);
    expect(parts(W, op)).toMatchObject({ after: before.after, before: before.before - 50, len: 3000 });
  });

  it('ostění vlevo u okna od B se zamčeným úsekem k A: otvor roste doprava', () => {
    const { W, op } = setup('b');
    setRevealEnabled(op, true);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'a' }, true);
    const before = parts(W, op);
    const l0 = f().openings[op]!.reveal!.left;
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: op, part: 'left' }, l0 + 50)).toBe(true);
    expect(parts(W, op)).toMatchObject({ before: before.before, after: before.after - 50, len: 3000 });
  });

  it('šířka zárubně dveří od A se zamčeným úsekem k B: roste doleva', () => {
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
    const span0 = openingSpan(f().openings[d]!);
    const fw = f().openings[d]!.frame!.width;
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: d, part: 'frameWidth' }, fw + 20)).toBe(true);
    const grow = openingSpan(f().openings[d]!) - span0;
    expect(grow).toBeGreaterThan(0);
    expect(parts(W, d)).toMatchObject({ after: before.after, before: Math.round(before.before - grow), len: 3000 });
  });

  it('ostění větší než volný úsek se neprovede', () => {
    const { W, op } = setup('a');
    setRevealEnabled(op, true);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    const before = parts(W, op);
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: op, part: 'left' }, 2000)).toBe(false);
    expect(parts(W, op)).toEqual(before);
    expect(store.get().lockBlock?.text).toContain('přesáhl souseda');
  });

  it('zmenšení ostění se zamčeným úsekem k B: otvor se zúží z volné strany', () => {
    const { W, op } = setup('a');
    setRevealEnabled(op, true);
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'b' }, true);
    const before = parts(W, op);
    const r0 = f().openings[op]!.reveal!.right;
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: op, part: 'right' }, r0 - 20)).toBe(true);
    expect(parts(W, op)).toMatchObject({ after: before.after, before: before.before + 20, len: 3000 });
  });

  it('ostění u okna od A se zamčeným meziostěním k dalšímu oknu (dál volno): jako u šířky – soused se posune', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 6000 }, null, false, { thickness: 300, side: 1 })!;
    const o1 = addOpening(W, 'window', 0.3)!;
    const o2 = addOpening(W, 'window', 0.6)!;
    store.edit(fl => {
      for (const id of [o1, o2]) {
        const o = fl.openings[id]!;
        const st = openingStartFromA(o, 6000);
        o.ref = 'a';
        o.offset = Math.round(st);
      }
    });
    setRevealEnabled(o1, true);
    setDimLock({ kind: 'opening-gap', firstId: o1, secondId: o2 }, true);
    const s1 = openingStartFromA(f().openings[o1]!, 6000);
    const s2 = openingStartFromA(f().openings[o2]!, 6000);
    const r0 = f().openings[o1]!.reveal!.right;
    expect(applyNumpadValue({ kind: 'opening-reveal', openingId: o1, part: 'right' }, r0 + 50)).toBe(true);
    expect(openingStartFromA(f().openings[o1]!, 6000)).toBeCloseTo(s1, 0);
    expect(openingStartFromA(f().openings[o2]!, 6000)).toBeCloseTo(s2 + 50, 0);
    expect(wallLength(f(), f().walls[W]!)).toBeCloseTo(6000, 0);
  });
});
