/**
 * Posun celé stěny kótou u otevřeného půdorysu (chyba od uživatele 2026-11-18, výkres `__fixtures__/protDimUser.json`:
 * horní, pravá a spodní stěna, levá chybí). Kóta 5000 od čelní hrany výstupku na horní stěně ke spodní stěně: posune se
 * jen horní stěna, pravá se zkrátí – dřív ujela celá místnost („volná větev“) a úprava hlásila zamčené kóty.
 */
import { describe, expect, it } from 'vitest';
import data from './__fixtures__/protDimUser.json';
import { createProject } from '../model/factory';
import type { Project, Pt } from '../model/types';
import { freeDimValue } from '../core/freeDim';
import { dist } from '../core/geometry';
import { addFreeDim, addWall, applyNumpadValue, setDimLock } from './actions';
import { openTarget } from './numpadController';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1);

describe('posun celé stěny kótou u otevřeného půdorysu', () => {
  it('výkres uživatele: kóta výstupek – spodní stěna posune jen horní stěnu', () => {
    store.openProject(JSON.parse(JSON.stringify((data as { project: Project }).project)));
    const id = 'dim_mwmk39xmbxbita';
    const locked = 'dim_mwmdpx3bmrjr8h'; // 1340 obdélník – spodní stěna (zamčená)
    const l0 = freeDimValue(f(), locked)!;
    openTarget({ kind: 'free-dim', dimId: id, move: 'b' });
    expect(applyNumpadValue(store.get().numpad!.target, 5300)).toBe(true);
    expect(store.get().lockBlock).toBeNull();
    expect(freeDimValue(f(), id)).toBeCloseTo(5300, 3);
    expect(freeDimValue(f(), locked)).toBeCloseTo(l0, 3);
    expect(nodeAt({ x: 12510, y: 3490 })).toBeDefined(); // spodní stěna na místě
    expect(nodeAt({ x: 12510, y: -3010 })).toBeDefined(); // horní stěna o 300 výš
  });

  it('kóta mezi líci dvou stěn tvaru U: posune se jen jedna stěna, sousední se protáhne', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 5000, y: 0 }, null, { x: 5000, y: 4000 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 5000, y: 4000 }, null, { x: 0, y: 4000 }, null, false, { thickness: 300, side: 1 });
    const top = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.b]!.y === 0)!;
    const bot = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 4000 && f().nodes[w.b]!.y === 4000)!;
    const id = addFreeDim({ wall: top.id, side: 0, at: 2500 }, { wall: bot.id, side: 0, at: 2500 }) ?? addFreeDim({ wall: top.id, side: 1, at: 2500 }, { wall: bot.id, side: 1, at: 2500 })!;
    const v0 = freeDimValue(f(), id)!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'a' }, Math.round(v0) + 500)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(Math.round(v0) + 500, 3);
    expect(nodeAt({ x: 0, y: 4000 })).toBeDefined();
    expect(nodeAt({ x: 5000, y: -500 })).toBeDefined();
  });

  it('kóta k líci stěny s napojenou příčkou: příčka se protáhne a zůstane napojená', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 2500, y: 3000 }, null, { x: 2500, y: 0 }, null, false, { thickness: 100, side: 1 });
    const top = Object.values(f().walls).find(w => w.thickness === 300)!;
    const t = Object.values(f().nodes).find(n => n.host === top.id);
    expect(t).toBeDefined();
    const id = addFreeDim({ wall: top.id, side: 0, at: 1000 }, { x: 1000, y: 2000 }) ?? addFreeDim({ wall: top.id, side: 1, at: 1000 }, { x: 1000, y: 2000 })!;
    const v0 = freeDimValue(f(), id)!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'a' }, Math.round(v0) + 300)).toBe(true);
    const t1 = f().nodes[t!.id]!;
    expect(t1.host).toBe(top.id);
    expect(t1.y).toBeCloseTo(-300, 3);
  });

  it('zamčená délka sousední stěny: posun stěny kótou se neprovede s hlášením', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 5000, y: 0 }, null, { x: 5000, y: 4000 }, null, false, { thickness: 300, side: 1 });
    const top = Object.values(f().walls).find(w => f().nodes[w.b]!.y === 0 && f().nodes[w.a]!.y === 0)!;
    const right = Object.values(f().walls).find(w => w.id !== top.id)!;
    setDimLock({ kind: 'wall-length', wallId: right.id, move: 'both' }, true);
    const id = addFreeDim({ wall: top.id, side: 0, at: 1000 }, { x: 1000, y: 2000 }) ?? addFreeDim({ wall: top.id, side: 1, at: 1000 }, { x: 1000, y: 2000 })!;
    const snap = f();
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'a' }, Math.round(freeDimValue(f(), id)!) + 300)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock).not.toBeNull();
  });
});
