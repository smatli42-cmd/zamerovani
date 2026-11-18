/**
 * Řetězová kóta otvorů se zámky (příklad uživatele 2026-11-14): stěna 7000, okno 1200, dveře 900, dveře 800;
 * řetěz 1050 | 1200 | 730 🔒 | 900 | 1040 🔒 | 800 | 1280. Zamčená meziostění drží otvory pohromadě.
 */
import { describe, expect, it } from 'vitest';
import { createOpening, createProject } from '../model/factory';
import { openingsOnWall, wallLength } from '../core/floorQueries';
import { addWall, applyNumpadValue, setDimLock } from './actions';
import { openTarget, pressKey } from './numpadController';
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

  // rozhodnutí uživatele 2026-11-18 (mění pravidlo z 2026-11-14): poslední kóta k rohu B posune otvory, stěna zůstane
  it('změna poslední kóty vpravo posune otvory spojené zámky k rohu A; první úsek se přepíše, stěna zůstane', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([830, 1200, 730, 900, 1040, 800, 1500]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7000);
  });

  it('bez zámků: změna poslední kóty posune jen poslední otvor (meziostění před ním se přepíše)', () => {
    const { w, ids } = setup(false);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 820, 800, 1500]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7000);
  });

  it('poslední kóta: otvory zámky přivázané až k rohu A → stěna se prodlouží (otvory se pohnout nemohou)', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, true);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1500]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7220);
    expect(f().nodes[f().walls[w]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('poslední kóta zmenšená: otvory spojené zámky se posunou k rohu B', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1000)).toBe(true);
    expect(chain(w)).toEqual([1330, 1200, 730, 900, 1040, 800, 1000]);
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7000);
  });

  it('poslední kóta u otvoru měřeného od rohu B: otvor skončí na zadaném místě', () => {
    const { w, ids } = setup(false);
    store.edit(fl => {
      const op = fl.openings[ids[2]!]!;
      op.ref = 'b';
      op.offset = 1280;
    });
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 820, 800, 1500]);
    expect(f().openings[ids[2]!]!.ref).toBe('b');
  });

  it('poslední kóta se zamčenou délkou stěny: otvory se posunou, stěna zůstane', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'wall-length', wallId: w, move: 'both' }, true);
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 1500)).toBe(true);
    expect(chain(w)).toEqual([830, 1200, 730, 900, 1040, 800, 1500]);
  });

  it('poslední kóta: skupina by přesáhla nepohnutého souseda → nic se nezmění', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-gap', firstId: ids[0]!, secondId: ids[1]! }, false);
    // dveře + dveře (spojené zámkem) o 800 k A: meziostění 730 k oknu nestačí
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 2080)).toBe(false);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1280]);
  });

  it('poslední kóta: skupina by vyjela ze stěny u rohu A → nic se nezmění', () => {
    const { w, ids } = setup();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, 2500)).toBe(false);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1280]);
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
    setDimLock({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, true); // otvory přivázané k rohu A → prodloužení
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
    setDimLock({ kind: 'opening-offset', openingId: id, ref: 'a' }, true); // otvor přivázaný k rohu A → prodloužení
    const snap = f();
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: id, ref: 'b' }, 1500)).toBe(false);
    expect(f()).toBe(snap);
  });

  it('celková kóta: stěna se protáhne na volném konci, otvory spojené zámky zůstanou, krajní kóta se přepíše', () => {
    store.openProject(createProject({ name: 't' }));
    // roh vlevo napojený na svislou stěnu, konec vpravo volný (obrázek uživatele)
    addWall({ x: 0, y: 3000 }, null, { x: 0, y: 0 }, null, false, { thickness: 300 });
    const w = addWall({ x: 0, y: 0 }, null, { x: 8440, y: 0 }, null, false, { thickness: 300 })!;
    const ids: string[] = [];
    store.edit(fl => {
      for (const [kind, offset, width, ref] of [['window', 1000, 1200, 'a'], ['door', 3200, 900, 'a'], ['door', 2000, 800, 'b']] as const) {
        const op = createOpening(fl, w, kind, { offset, ref, width });
        delete op.frame;
        delete op.reveal;
        fl.openings[op.id] = op;
        ids.push(op.id);
      }
    });
    setDimLock({ kind: 'opening-gap', firstId: ids[0]!, secondId: ids[1]! }, true);
    setDimLock({ kind: 'opening-gap', firstId: ids[1]!, secondId: ids[2]! }, true);
    const before = chain(w);
    expect(before).toEqual([1000, 1200, 1000, 900, 1540, 800, 2000]);
    // kóta se otevírá s posunem rohu B (volný konec); zadání 9000
    openTarget({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } });
    const t = store.get().numpad!.target;
    expect(t.kind === 'wall-length' && t.move !== 'both' && t.move.nodeId).toBe(f().walls[w]!.b);
    for (const k of ['9', '0', '0', '0'] as const) pressKey(k);
    pressKey('ENTER');
    expect(store.get().lockBlock).toBeNull();
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(9000);
    expect(chain(w)).toEqual([1000, 1200, 1000, 900, 1540, 800, 2560]);
    expect(f().nodes[f().walls[w]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('i bez zámků zůstane otvor měřený od posunutého rohu na místě (rozhodnutí uživatele)', () => {
    const { w, ids } = setup(false);
    store.edit(fl => {
      const op = fl.openings[ids[2]!]!;
      op.ref = 'b';
      op.offset = 1280;
    });
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, 7500)).toBe(true);
    expect(chain(w)).toEqual([1050, 1200, 730, 900, 1040, 800, 1780]);
  });

  it('volný konec je u rohu A: stěna se protáhne tam, otvory zůstanou ve výkresu, první kóta se přepíše', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 7000, y: 0 }, null, { x: 7000, y: 3000 }, null, false, { thickness: 300 });
    const w = addWall({ x: 0, y: 0 }, null, { x: 7000, y: 0 }, null, false, { thickness: 300 })!;
    const ids: string[] = [];
    store.edit(fl => {
      for (const [offset, width] of [[1000, 900], [2500, 900]] as const) {
        const op = createOpening(fl, w, 'door', { offset, ref: 'a', width });
        delete op.frame;
        delete op.reveal;
        fl.openings[op.id] = op;
        ids.push(op.id);
      }
    });
    setDimLock({ kind: 'opening-gap', firstId: ids[0]!, secondId: ids[1]! }, true);
    const x0 = f().nodes[f().walls[w]!.b]!.x;
    openTarget({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } });
    for (const k of ['7', '5', '0', '0'] as const) pressKey(k);
    pressKey('ENTER');
    expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(7500);
    expect(f().nodes[f().walls[w]!.b]!.x).toBe(x0);
    expect(chain(w)).toEqual([1500, 900, 600, 900, 3600]);
  });

  it('otvory přivázané zámky k oběma koncům: změna délky se neprovede', () => {
    const { w, ids } = setup();
    setDimLock({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, true);
    setDimLock({ kind: 'opening-offset', openingId: ids[2]!, ref: 'b' }, true);
    const snap = f();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, 7500)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock).not.toBeNull();
  });

  it('Další z první stěny otevřené lomené čáry (volný konec A) pokračuje na druhou stěnu', () => {
    store.openProject(createProject({ name: 't' }));
    const w1 = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300 })!;
    const w2 = addWall({ x: 3000, y: 0 }, null, { x: 3000, y: 2000 }, null, false, { thickness: 300 })!;
    openTarget({ kind: 'wall-length', wallId: w1, move: { nodeId: f().walls[w1]!.b } });
    for (const k of ['3', '5', '0', '0'] as const) pressKey(k);
    pressKey('NEXT');
    expect(Math.round(wallLength(f(), f().walls[w1]!))).toBe(3500);
    const t = store.get().numpad?.target;
    expect(t?.kind === 'wall-length' && t.wallId).toBe(w2);
  });

  it('zkrácení stěny pod otvor: neprovede se, lišta řekne proč', () => {
    const { w } = setup(false);
    const snap = f();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, 5000)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('vyjel');
  });

  it('místnost: otvor na protější stěně zůstane na místě, když ji řešič prodlouží', () => {
    store.openProject(createProject({ name: 't' }));
    const bottom = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
    addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -3000 }, null, false, { thickness: 300 });
    const top = addWall({ x: 4000, y: -3000 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300 })!;
    addWall({ x: 0, y: -3000 }, null, { x: 0, y: 0 }, null, false, { thickness: 300 });
    let id = '';
    store.edit(fl => {
      // horní stěna vede z (4000, -3000) do (0, -3000): otvor měřený od jejího rohu A (vpravo)
      const op = createOpening(fl, top, 'window', { offset: 1000, ref: 'a', width: 1000 });
      fl.openings[op.id] = op;
      id = op.id;
    });
    const x = () => {
      const w = f().walls[top]!;
      const a = f().nodes[w.a]!;
      const b = f().nodes[w.b]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const s = f().openings[id]!.ref === 'a' ? f().openings[id]!.offset : len - f().openings[id]!.offset - 1100;
      return Math.round(a.x + ((b.x - a.x) / len) * s);
    };
    const x0 = x();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } }, 4500)).toBe(true);
    expect(Math.round(wallLength(f(), f().walls[top]!))).toBe(4500);
    expect(x()).toBe(x0);
  });

  it('výstupek: při změně délky stěny zůstane na místě; se zamčeným odstupem od konce jede s ním', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300 })!;
    store.edit(fl => {
      fl.protrusions = {
        pr1: { id: 'pr1', wallId: w, side: -1, mode: 'add', pts: [{ u: 1000, v: 0 }, { u: 1000, v: 200 }, { u: 1400, v: 200 }, { u: 1400, v: 0 }], name: '', material: '', note: '' }
      };
    });
    const u0 = () => Math.min(...f().protrusions!.pr1!.pts.map(q => q.u));
    // posun rohu A o 500 ven: výstupek ve výkresu zůstane → odstup od A vzroste o 500
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } }, 5500)).toBe(true);
    expect(f().nodes[f().walls[w]!.a]).toMatchObject({ x: -500 });
    expect(u0()).toBe(1500);
    // zamčený odstup od A: výstupek jede s rohem A
    setDimLock({ kind: 'protrusion-dim', protrusionId: 'pr1', dim: 'before' }, true);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } }, 6000)).toBe(true);
    expect(u0()).toBe(1500);
  });

  it('výstupky: zamčená mezera k sousedovi jede s koncem jako řetěz; překryv se odmítne; Zpět vrátí vše', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300 })!;
    const box = (id: string, u0: number, u1: number) => ({ id, wallId: w, side: -1 as const, mode: 'add' as const, pts: [{ u: u0, v: 0 }, { u: u0, v: 200 }, { u: u1, v: 200 }, { u: u1, v: 0 }], name: '', material: '', note: '' });
    store.edit(fl => {
      fl.protrusions = { p1: box('p1', 1000, 1400), p2: box('p2', 1600, 2000) };
    });
    const u0 = (id: string) => Math.min(...f().protrusions![id]!.pts.map(q => q.u));
    const moveA = (len: number) => applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } }, len);
    // p1 přivázaný k A, p2 volný → zkrácení od A o 500: p1 by najel na p2 → odmítnuto
    setDimLock({ kind: 'protrusion-dim', protrusionId: 'p1', dim: 'before' }, true);
    const snap = f();
    expect(moveA(4500)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('výstupek');
    // zamčená mezera p1–p2 → jedou oba s rohem A
    setDimLock({ kind: 'protrusion-dim', protrusionId: 'p2', dim: 'before' }, true);
    const before = f();
    expect(moveA(4500)).toBe(true);
    expect([u0('p1'), u0('p2')]).toEqual([1000, 1600]);
    store.undo();
    expect(f()).toBe(before);
  });

  it('výstupek se zamčeným odstupem k B jede s rohem B', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300 })!;
    store.edit(fl => {
      fl.protrusions = { p1: { id: 'p1', wallId: w, side: 1, mode: 'add', pts: [{ u: 4000, v: 0 }, { u: 4000, v: 200 }, { u: 4400, v: 200 }, { u: 4400, v: 0 }], name: '', material: '', note: '' } };
    });
    setDimLock({ kind: 'protrusion-dim', protrusionId: 'p1', dim: 'after' }, true);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, 5600)).toBe(true);
    expect(Math.min(...f().protrusions!.p1!.pts.map(q => q.u))).toBe(4600);
  });

  it('všechny prvky nesené stěnou: průchod, nika i napojená příčka zůstanou na místě; zamčená poloha příčky ji veze s koncem', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 })!;
    const p = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -2000 }, null, false, { thickness: 100 })!;
    store.edit(fl => {
      for (const [k, o] of [['opening', 1000], ['niche', 3000]] as const) {
        const op = createOpening(fl, w, k, { offset: o, ref: 'b', width: 800 });
        fl.openings[op.id] = op;
      }
    });
    const xs = () => openingsOnWall(f(), f().walls[w]!).map(x => Math.round(f().nodes[f().walls[w]!.a]!.x + x.start));
    const jx = () => f().nodes[f().walls[p]!.a]!.x;
    const before = xs();
    const moveA = (len: number) => applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } }, len);
    expect(moveA(7000)).toBe(true);
    expect(xs()).toEqual(before);
    expect(jx()).toBe(4000);
    // zamčená poloha napojení od rohu A → příčka jede s rohem A (i s druhým koncem)
    const j = f().walls[p]!.a;
    setDimLock({ kind: 'junction-gap', wallId: w, nodeId: j, to: 'prev' }, true);
    expect(moveA(7500)).toBe(true);
    expect(jx()).toBe(3500);
    expect(f().nodes[f().walls[p]!.b]!.x).toBe(3500);
    expect(xs()).toEqual(before);
  });

  it('napojené příčky: přivázání k rohu B, k oběma koncům = odmítnutí, zkrácení přes příčku = odmítnutí', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 })!;
    const p1 = addWall({ x: 2000, y: 0 }, null, { x: 2000, y: -2000 }, null, false, { thickness: 100 })!;
    const p2 = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -2000 }, null, false, { thickness: 100 })!;
    const j1 = f().walls[p1]!.a;
    const j2 = f().walls[p2]!.a;
    const moveB = (len: number) => applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, len);
    // p2 přivázaná k B (next), p1 přes zamčenou mezeru p1–p2 (prev u p2) také
    setDimLock({ kind: 'junction-gap', wallId: w, nodeId: j2, to: 'next' }, true);
    setDimLock({ kind: 'junction-gap', wallId: w, nodeId: j2, to: 'prev' }, true);
    expect(moveB(6500)).toBe(true);
    expect([f().nodes[j1]!.x, f().nodes[j2]!.x]).toEqual([2500, 4500]);
    // a k A: zamčené prev u p1 → přivázané k oběma koncům → odmítnuto
    setDimLock({ kind: 'junction-gap', wallId: w, nodeId: j1, to: 'prev' }, true);
    const snap = f();
    expect(moveB(7000)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('brání zamčená kóta');
  });

  it('zkrácení stěny přes napojenou příčku se neprovede s hlášením', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 })!;
    addWall({ x: 5000, y: 0 }, null, { x: 5000, y: -2000 }, null, false, { thickness: 100 });
    const snap = f();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } }, 4500)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('příčka');
  });

  it('obrázek uživatele: okna těsně u sebe / s malým překryvem nebrání změně délky (chyba 2026-11-14)', () => {
    for (const dir of [1, -1]) {
      store.openProject(createProject({ name: 't' }));
      const L = 6432;
      const w = dir === 1 ? addWall({ x: 0, y: 0 }, null, { x: L, y: 0 }, null, false, { thickness: 300 })! : addWall({ x: L, y: 0 }, null, { x: 0, y: 0 }, null, false, { thickness: 300 })!;
      store.edit(fl => {
        // s výchozími rámy (+100 mm) se O1 a O2 o kousek překrývají – takový stav už ve výkresu byl
        for (const [k, s0, wd] of [['door', 580, 800], ['opening', 1750, 900], ['niche', 3650, 600], ['window', 5180, 500], ['window', 5730, 500]] as const) {
          const op = createOpening(fl, w, k, { offset: dir === 1 ? s0 : L - s0 - wd, ref: 'a', width: wd });
          fl.openings[op.id] = op;
        }
      });
      const placed = openingsOnWall(f(), f().walls[w]!);
      setDimLock({ kind: 'opening-gap', firstId: placed[1]!.op.id, secondId: placed[2]!.op.id }, true);
      setDimLock({ kind: 'opening-gap', firstId: placed[2]!.op.id, secondId: placed[3]!.op.id }, true);
      for (const len of [7000, 6600]) {
        openTarget({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.b } });
        for (const k of String(len)) pressKey(k as '0');
        pressKey('ENTER');
        expect(store.get().lockBlock).toBeNull();
        expect(Math.round(wallLength(f(), f().walls[w]!))).toBe(len);
        // otvory zůstaly ve výkresu na místě (roh A se nehýbe, měří se od něj)
        const after = openingsOnWall(f(), f().walls[w]!).map(p => Math.round(p.start));
        expect(after).toEqual(placed.map(p => Math.round(p.start)));
      }
    }
  });

  it('nový překryv otvorů se odmítne; otvor uvnitř průchodu (starý stav) nevadí', () => {
    store.openProject(createProject({ name: 't' }));
    const w = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 })!;
    const ids: string[] = [];
    store.edit(fl => {
      for (const [k, o, wd] of [['opening', 1000, 1000], ['niche', 1200, 300], ['window', 2400, 800]] as const) {
        const op = createOpening(fl, w, k, { offset: o, ref: 'a', width: wd });
        delete op.frame;
        delete op.reveal;
        fl.openings[op.id] = op;
        ids.push(op.id);
      }
    });
    const moveA = (len: number) => applyNumpadValue({ kind: 'wall-length', wallId: w, move: { nodeId: f().walls[w]!.a } }, len);
    // nika uvnitř průchodu – změna délky projde
    expect(moveA(6200)).toBe(true);
    // průchod (a nika uvnitř? ne – jen průchod) přivázaný zamčeným odstupem k rohu A
    setDimLock({ kind: 'opening-offset', openingId: ids[0]!, ref: 'a' }, true);
    const snap = f();
    // průchod jede s A o 700 doprava (zkrácení od A) a najede na okno, které zůstane
    expect(moveA(5500)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toContain('narazil');
  });
});

describe('pravidlo prvků nesených stěnou: výstupek přes volný konec (I1.11)', () => {
  it('jede s koncem; zkrácení, při kterém by najel na výstupek u druhého konce, se neprovede', async () => {
    const { addLine } = await import('./actions');
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const line = (pts: { x: number; y: number }[]) => {
      for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    };
    // dosah 1200 mm od každého konce
    line([{ x: 1800, y: 0 }, { x: 1800, y: -200 }, { x: 3200, y: -200 }, { x: 3200, y: 500 }, { x: 1800, y: 500 }, { x: 1800, y: 300 }]);
    line([{ x: 1200, y: 0 }, { x: 1200, y: -200 }, { x: -200, y: -200 }, { x: -200, y: 500 }, { x: 1200, y: 500 }, { x: 1200, y: 300 }]);
    expect(Object.keys(f().endProtrusions ?? {})).toHaveLength(2);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: W, move: { nodeId: f().walls[W]!.b } }, 3500)).toBe(true);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: W, move: { nodeId: f().walls[W]!.b } }, 2000)).toBe(false);
    expect(Math.round(wallLength(f(), f().walls[W]!))).toBe(3500);
  });
});
