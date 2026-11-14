/**
 * Řetězová kóta otvorů se zámky (příklad uživatele 2026-11-14): stěna 7000, okno 1200, dveře 900, dveře 800;
 * řetěz 1050 | 1200 | 730 🔒 | 900 | 1040 🔒 | 800 | 1280. Zamčená meziostění drží otvory pohromadě.
 */
import { describe, expect, it } from 'vitest';
import { createOpening, createProject } from '../model/factory';
import { openingsOnWall, wallLength } from '../core/floorQueries';
import { addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';

const f = () => store.floor()!;

function setup(lockGaps = true) {
  store.openProject(createProject({ name: 't' }));
  const w = addWall({ x: 0, y: 0 }, null, { x: 7000, y: 0 }, null, false, { thickness: 300 })!;
  const ids: string[] = [];
  store.edit(fl => {
    for (const [kind, offset, width] of [['window', 1050, 1200], ['door', 2980, 900], ['door', 4920, 800]] as const) {
      const op = createOpening(fl, w, kind, { offset, ref: 'a', width });
      delete op.frame;
      delete op.reveal;
      fl.openings[op.id] = op;
      ids.push(op.id);
    }
  });
  if (lockGaps) {
    setDimLock({ kind: 'opening-gap', firstId: ids[0]!, secondId: ids[1]! }, true);
    setDimLock({ kind: 'opening-gap', firstId: ids[1]!, secondId: ids[2]! }, true);
  }
  return { w, ids };
}

/** Řetěz kót od rohu A: [odstup, šířka, mezera, šířka, mezera, šířka, odstup k B]. */
function chain(w: string): number[] {
  const wall = f().walls[w]!;
  const len = wallLength(f(), wall);
  const out: number[] = [];
  let cur = 0;
  for (const p of openingsOnWall(f(), wall)) {
    out.push(Math.round(p.start - cur), Math.round(p.end - p.start));
    cur = p.end;
  }
  out.push(Math.round(len - cur));
  return out;
}

describe('řetězová kóta otvorů se zámky', () => {
  it('výchozí řetěz odpovídá obrázku', () => {
    const { w } = setup();
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1280]);
  });

  it('změna první kóty vlevo posune všechny otvory spojené zámky společně; poslední úsek se přepíše', () => {
    const { w } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: openingsOnWall(f(), f().walls[w]!)[0]!.op.id, ref: 'a' }, 1200)).toBe(true);
    expect(chain(w)).toEqual([1200, 1200, 730, 900, 1040, 800, 1130]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7000);
  });

  it('změna poslední kóty vpravo: otvory zůstanou na místě, stěna se prodlouží', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1500]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7220);
    expect(f().nodes[f().walls[w]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('bez zámků: změna první kóty posune jen první otvor (další meziostění se přepíše)', () => {
    const { w, ids } = setup(false);
    applyNumpadValue({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, 1200);
    expect(chain(w)).toEqual([1200, 1200, 580, 900, 1040, 800, 1280]);
  });

  it('změna meziostění posune další otvory spojené zámky; první nezamčený úsek se přepíše', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-gap', firstId: ids[1]!, secondId: ids[2]! }, false);
    // 730 → 830: dveře O5 se posunou, D4 (nezamčené meziostění 1040) zůstane
    // meziostění 730 je samo zamčené → přepis po potvrzení (overrideLock)
    expect(applyNumpadValue({ kind: 'opening-gap', firstId: ids[0]!, secondId: ids[1]! }, 830, true)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 830, 900, 940, 800, 1280]);
  });

  it('všechno napravo zamčené → posune se roh B (stěna se prodlouží)', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, true);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, 1150)).toBe(true);
    expect(chain(w)).toEqual([1150, 1200, 730, 900, 1040, 800, 1280]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7100);
  });

  it('zamčená délka stěny prodloužení zastaví s hlášením', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'wall-length', wallId: w, move: 'both' }, true);
    const snap = f();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('délka stěny 7000 mm');
  });

  it('šířka otvoru se zamčeným meziostěním napravo posune spojené otvory', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-width', openingId: ids[0]! }, 1300)).toBe(true);
    expect(chain(w)).toEqual([1050, 1300, 730, 900, 1040, 800, 1180]);
  });

  it('skupina by vyjela ze stěny → nic se nezmění', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, 2500)).toBe(false);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1280]);
  });

  it('první kóta vlevo u otvoru měřeného od rohu B: otvor skončí na zadaném místě', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 7000, y: 0 }, null, false, { thickness: 300 })!;
    let id = '';
    store.edit(fl => {
      const op = createOpening(fl, w, 'door', { offset: 1000, ref: 'b', width: 900 });
      delete op.frame;
      delete op.reveal;
      fl.openings[op.id] = op;
      id = op.id;
    });
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: id, ref: 'a' }, 5000)).toBe(true);
    expect(chain(w)).toEqual([5000, 900, 1100]);
    expect(f().openings[id]!.ref).toBe('b');
  });

  it('z panelu otvoru („Odstup od B“) se poslední otvor posune, stěna zůstane', () => {
    const { w, ids } = setup(false);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b', move: true }, 1000)).toBe(true);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7000);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1320, 800, 1000]);
  });

  it('nezamčený soused v cestě → nic se nezmění a lišta řekne proč', () => {
    const { w, ids } = setup(false);
    const snap = f();
    // šířka okna 2000 by přesáhla dveře (meziostění 730 nezamčené)
    expect(applyNumpadValue({ kind: 'opening-width', openingId: ids[0]! }, 2000)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('přesáhl');
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1280]);
  });

  it('šířka posledního otvoru se zamčeným odstupem k B prodlouží stěnu; Zpět vrátí vše', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, true);
    const before = f();
    expect(applyNumpadValue({ kind: 'opening-width', openingId: ids[2]! }, 900)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 900, 1280]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7100);
    store.undo();
    expect(f()).toBe(before);
  });

  it('konec B napojený na jinou stěnu (T) se neprodlouží', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 7000, y: 2000 }, null, { x: 7000, y: -2000 }, null, false, { thickness: 300 });
    const w = addWall({ x: 0, y: 0 }, null, { x: 7000, y: 0 }, null, false, { thickness: 300 })!;
    let id = '';
    store.edit(fl => {
      const op = createOpening(fl, w, 'door', { offset: 1000, ref: 'a', width: 900 });
      fl.openings[op.id] = op;
      id = op.id;
    });
    const wall = f().walls[w]!;
    const endB = [wall.a, wall.b].find(n => f().nodes[n]!.x === 7000)!;
    expect(f().nodes[endB]!.host).toBeDefined();
    if (endB !== wall.b) return; // stěna vede od rohu B – odstup k B je u rohu A, netýká se
    const snap = f();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: id, ref: 'b' }, 1500)).toBe(false);
    expect(f()).toBe(snap);
  });
});
