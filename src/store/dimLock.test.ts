/**
 * Zámek kót (KOTY-ZAMEK-EXPORT.md, A): zamčená kóta drží hodnotu, nezamčená se přepíše,
 * konflikt zastaví akci s hlášením, hromadné zamknutí stěny a místnosti, přepsání zamčené kóty v NumPadu.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallLength } from '../core/floorQueries';
import { dimValue, isDimLocked, roomWallIds, wallDimTargets, type DimTarget } from '../core/dimLock';
import {
  addOpening,
  addRoom,
  addWall,
  applyNumpadValue,
  deleteSelection,
  moveNode,
  moveOpeningTo,
  setDimLock,
  setRoomDimsLocked,
  setWallDimsLocked,
  setWallThickness,
  toggleDimLock
} from './actions';
import { openTarget, pressKey } from './numpadController';
import { store } from './store';

const f = () => store.floor()!;
const numpadValueOf = (t: DimTarget) => dimValue(f(), t);
const len = (id: string) => Math.round(wallLength(f(), f().walls[id]!));

/** Obdélník 4000 × 3000 (tloušťka 300): stěny dolní, pravá, horní, levá. */
function rect() {
  store.openProject(createProject({ name: 't' }));
  const bottom = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
  const right = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -3000 }, null, false, { thickness: 300 })!;
  const top = addWall({ x: 4000, y: -3000 }, null, { x: 0, y: -3000 }, null, false, { thickness: 300 })!;
  const left = addWall({ x: 0, y: -3000 }, null, { x: 0, y: 0 }, null, false, { thickness: 300 })!;
  return { bottom, right, top, left };
}

const L = (wallId: string): DimTarget => ({ kind: 'wall-length', wallId, move: 'both' });

describe('zámek kót', () => {
  it('výchozí stav: vše odemčené, ani zadaná hodnota nezamyká', () => {
    const { bottom } = rect();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } }, 4500)).toBe(true);
    expect(f().dimLocks).toBeUndefined();
  });

  it('nezamčená protější kóta se po posunu přepíše na novou délku', () => {
    const { bottom, top } = rect();
    applyNumpadValue({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } }, 4500);
    expect(len(bottom)).toBe(4500);
    expect(len(top)).toBe(4500); // obdélník zůstal, horní kóta ukazuje novou délku
  });

  it('zamčená protější kóta drží při posunu souseda (řešič posune jen to, co smí)', () => {
    const { bottom, top } = rect();
    setDimLock(L(top), true);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } }, 4500)).toBe(true);
    expect(len(bottom)).toBe(4500);
    expect(len(top)).toBe(4000);
  });

  it('konflikt: posun rohu zamčené stěny se neprovede a lišta řekne, která kóta brání', () => {
    const { bottom } = rect();
    setDimLock(L(bottom), true);
    const snap = f();
    const b = f().walls[bottom]!.b;
    store.beginGesture();
    moveNode(b, { x: 4200, y: 0 }); // tažení rohu
    store.endGesture();
    expect(f()).toBe(snap);
    expect(store.get().lockBlock?.text).toBe('Nelze – brání zamčená kóta: délka stěny 4000 mm');
    // další úspěšná úprava hlášení smaže
    setWallThickness(bottom, 250);
    expect(store.get().lockBlock).toBeNull();
  });

  it('zámek brání omylem posunutí otvoru tažením (zamčený odstup)', () => {
    const { bottom } = rect();
    const op = addOpening(bottom, 'door', 0.5)!;
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'a' }, true);
    const before = f().openings[op]!.offset;
    moveOpeningTo(op, 500);
    expect(f().openings[op]!.offset).toBe(before);
    expect(store.get().lockBlock?.text).toContain('odstup');
  });

  it('ťuknutí na zámek odemkne, pak úprava projde', () => {
    const { bottom } = rect();
    setDimLock(L(bottom), true);
    toggleDimLock(L(bottom));
    expect(isDimLocked(f(), L(bottom))).toBe(false);
    moveNode(f().walls[bottom]!.b, { x: 4200, y: 0 });
    expect(len(bottom)).toBe(4200);
  });

  it('přepsání zamčené kóty v NumPadu: první potvrzení jen upozorní, druhé přepíše; zámek zůstane', () => {
    const { bottom } = rect();
    setDimLock(L(bottom), true);
    openTarget({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } });
    for (const k of ['4', '5', '0', '0'] as const) pressKey(k);
    pressKey('ENTER');
    expect(store.get().numpad?.confirmLock).toBe(true);
    expect(len(bottom)).toBe(4000);
    pressKey('ENTER');
    expect(store.get().numpad).toBeNull();
    expect(len(bottom)).toBe(4500);
    expect(isDimLocked(f(), L(bottom))).toBe(true);
  });

  it('hromadně: zamknout / odemknout vše u stěny (délka, tloušťka, otvor)', () => {
    const { bottom } = rect();
    const op = addOpening(bottom, 'window', 0.5)!;
    setWallDimsLocked(bottom, true);
    const ts = wallDimTargets(f(), bottom);
    expect(ts.length).toBeGreaterThanOrEqual(5);
    for (const t of ts) expect(isDimLocked(f(), t)).toBe(true);
    expect(isDimLocked(f(), { kind: 'opening-width', openingId: op })).toBe(true);
    expect(isDimLocked(f(), { kind: 'wall-thickness', wallId: bottom })).toBe(true);
    setWallDimsLocked(bottom, false);
    expect(f().dimLocks).toBeUndefined();
  });

  it('hromadně: zamknout vše u místnosti = kóty všech čtyř stěn obrysu', () => {
    const w = rect();
    const room = addRoom({ x: 2000, y: -1500 })!;
    expect(new Set(roomWallIds(f(), { x: 2000, y: -1500 }))).toEqual(new Set(Object.values(w)));
    expect(setRoomDimsLocked(room, true)).toBe(true);
    for (const id of Object.values(w)) expect(isDimLocked(f(), L(id))).toBe(true);
  });

  it('místnost rozdělená příčkou: obrys jen té části, ve které je štítek', () => {
    const w = rect();
    const p = addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -3000 }, null, false, { thickness: 100 })!;
    const ids = new Set(roomWallIds(f(), { x: 700, y: -1500 }));
    expect(ids).toEqual(new Set([w.bottom, w.top, w.left, p]));
  });

  it('smazaný prvek bere zámek s sebou', () => {
    const { bottom } = rect();
    const op = addOpening(bottom, 'door', 0.5)!;
    setDimLock({ kind: 'opening-width', openingId: op }, true);
    store.set({ selection: { kind: 'opening', id: op } });
    deleteSelection();
    expect(f().openings[op]).toBeUndefined();
    expect(f().dimLocks).toBeUndefined();
  });

  it('pokračování zamčené stěny se nepřipojí – vznikne nová stěna, zamčená délka zůstane', () => {
    const { bottom } = rect();
    setDimLock(L(bottom), true);
    const id = addWall({ x: 4000, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 });
    expect(id).not.toBeNull();
    expect(f().walls[id!]).toBeDefined();
    expect(id).not.toBe(bottom);
    expect(len(bottom)).toBe(4000);
    expect(store.get().lockBlock).toBeNull();
  });

  it('zastavená akce nevrací ID prvku, který nevznikl (zamčený odstup sloupu od stěny)', () => {
    rect();
    // sloup (obdélník čar) uvnitř místnosti
    const col = addWall({ x: 3000, y: -1400 }, null, { x: 3400, y: -1400 }, null, false, { thickness: 0 })!;
    addWall({ x: 3400, y: -1400 }, null, { x: 3400, y: -1600 }, null, false, { thickness: 0 });
    addWall({ x: 3400, y: -1600 }, null, { x: 3000, y: -1600 }, null, false, { thickness: 0 });
    addWall({ x: 3000, y: -1600 }, null, { x: 3000, y: -1400 }, null, false, { thickness: 0 });
    const gap: DimTarget = { kind: 'comp-gap', wallId: col, side: 'left' };
    expect(numpadValueOf(gap)).not.toBeNull();
    setDimLock(gap, true);
    const snap = f();
    const sel = store.get().selection;
    // nová stěna mezi sloupem a levou stěnou by změnila zamčený odstup → nevznikne
    expect(addWall({ x: 2000, y: -1000 }, null, { x: 2000, y: -2000 }, null, true, { thickness: 100 })).toBeNull();
    expect(f()).toBe(snap);
    expect(store.get().selection).toBe(sel);
    expect(store.get().lockBlock?.text).toContain('odstup skupiny');
  });

  it('poloha napojení měřená od souseda: smazání sousední příčky zámek ruší, nezastaví', () => {
    const { bottom } = rect();
    const p1 = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -1000 }, null, false, { thickness: 100 })!;
    addWall({ x: 2500, y: 0 }, null, { x: 2500, y: -1000 }, null, false, { thickness: 100 })!;
    setWallDimsLocked(bottom, true);
    const locked = Object.keys(f().dimLocks ?? {}).filter(k => k.startsWith('junction-gap')).length;
    expect(locked).toBe(3);
    store.set({ selection: { kind: 'wall', id: p1 } });
    deleteSelection();
    expect(f().walls[p1]).toBeUndefined();
    expect(store.get().lockBlock).toBeNull();
    // poloha zbylé příčky od rohu A je jiná kóta (dřív od p1) → odemčená; kóta k rohu B zůstala zamčená
    const jg = Object.keys(f().dimLocks ?? {}).filter(k => k.startsWith('junction-gap'));
    expect(jg).toHaveLength(1);
    expect(jg[0]).toMatch(/:next$/);
  });

  it('místnost s volnou příčkou a se sloupem napravo od štítku', () => {
    const w = rect();
    const free = addWall({ x: 2500, y: 0 }, null, { x: 2500, y: -1200 }, null, false, { thickness: 100 })!;
    // sloup (obdélník čar) vpravo od štítku
    addWall({ x: 3000, y: -1400 }, null, { x: 3400, y: -1400 }, null, false, { thickness: 0 });
    addWall({ x: 3400, y: -1400 }, null, { x: 3400, y: -1600 }, null, false, { thickness: 0 });
    addWall({ x: 3400, y: -1600 }, null, { x: 3000, y: -1600 }, null, false, { thickness: 0 });
    addWall({ x: 3000, y: -1600 }, null, { x: 3000, y: -1400 }, null, false, { thickness: 0 });
    const ids = new Set(roomWallIds(f(), { x: 2000, y: -1500 }));
    for (const id of Object.values(w)) expect(ids.has(id)).toBe(true);
    expect(ids.has(free)).toBe(true);
    expect(ids.size).toBe(5);
  });

  it('NumPad zastavený jinou zamčenou kótou zůstane otevřený se zadanou hodnotou', () => {
    const { bottom, right, top } = rect();
    setDimLock(L(top), true); // drží horní roh pravé stěny
    setDimLock(L(right), true); // pravá stěna by se natočila a prodloužila
    openTarget({ kind: 'wall-length', wallId: bottom, move: { nodeId: f().walls[bottom]!.b } });
    for (const k of ['4', '5', '0', '0'] as const) pressKey(k);
    pressKey('ENTER');
    expect(len(bottom)).toBe(4000);
    expect(store.get().lockBlock?.text).toContain('délka stěny 3000 mm');
    expect(store.get().numpad?.buffer).toBe('4500');
  });
});
