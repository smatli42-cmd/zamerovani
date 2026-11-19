/**
 * Zamčená volná kóta = pevné spojení (rozhodnutí uživatele 2026-11-18, core/dimFollow.ts): když se pohne prvek na
 * jednom konci, prvek na druhém konci se posune s ním; blokuje se jen to, co se dorovnat nedá (pevný bod, otvor
 * napříč stěnou, jiný zámek). Tabulka „druh konce × posun“ – každý druh konce má test.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { freeDimValue } from '../core/freeDim';
import { dist } from '../core/geometry';
import { openingSpan, openingStartFromA, wallLength } from '../core/floorQueries';
import { addDrawLine, addDrawRect, addFreeDim, addOpening, addStair, addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1)!;
const wallBy = (p: Pt, q: Pt) => Object.values(f().walls).find(w => [w.a, w.b].includes(nodeAt(p).id) && [w.a, w.b].includes(nodeAt(q).id))!;
const C: Pt[] = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }];
const lock = (id: string) => setDimLock({ kind: 'free-dim', dimId: id, move: 'b' }, true);

/** Místnost 5000 × 5000, osa na vnitřním líci (tělo ven). */
function room() {
  store.openProject(createProject({ name: 't' }));
  for (let i = 0; i < 4; i++) addWall(C[i]!, null, C[(i + 1) % 4]!, null, false, { thickness: 300, side: -1 });
  return { right: wallBy(C[1]!, C[2]!), bottom: wallBy(C[2]!, C[3]!), left: wallBy(C[3]!, C[0]!) };
}
const rectTop = (r: string) => f().drawings![r]!.pts[0]!.y;

describe('zamčená volná kóta = pevné spojení', () => {
  it('obrázek uživatele: délka pravé stěny posune spodní stěnu, obdélník zamčený ke spodní stěně jede s ní', () => {
    const { right, bottom } = room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(store.get().lockBlock).toBeNull();
    expect(freeDimValue(f(), lk)).toBeCloseTo(1500, 3);
    expect(rectTop(r)).toBeCloseTo(2300, 3);
  });

  it('bod kresby: druhý konec na rohu stěny – kresba jede s rohem', () => {
    const { right } = room();
    const l = addDrawLine({ x: 3000, y: 3000 }, { x: 4000, y: 4000 })!;
    const lk = addFreeDim({ drawing: l, i: 1 }, { node: right.b })!;
    lock(lk);
    const v0 = freeDimValue(f(), lk)!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(v0, 3);
  });

  it('řetěz dvou zamčených kót: stěna → obdélník → čára', () => {
    const { right, bottom } = room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const l = addDrawLine({ x: 1000, y: 1000 }, { x: 2500, y: 1000 })!;
    const k1 = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    const k2 = addFreeDim({ seg: l, i: 0, at: 500 }, { seg: r, i: 0, at: 500 })!;
    lock(k1);
    lock(k2);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(freeDimValue(f(), k1)).toBeCloseTo(1500, 3);
    expect(freeDimValue(f(), k2)).toBeCloseTo(1000, 3);
    expect(f().drawings![l]!.pts[0]!.y).toBeCloseTo(1300, 3);
  });

  it('okraj otvoru: kóta podél stěny – okno jede po stěně s posunutou stěnou', () => {
    const { right, bottom } = room();
    const op = addOpening(right.id, 'window', 0.5)!;
    // kóta od spodní stěny k okraji okna (svisle = podél pravé stěny)
    const lk = addFreeDim({ wall: bottom.id, side: 1, at: 4900 }, { opening: op, edge: 'end', at: 0 })!;
    lock(lk);
    const v0 = freeDimValue(f(), lk)!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(v0, 0);
  });

  it('okraj otvoru: okno by vyjelo ze stěny → zámek zastaví', () => {
    room();
    const top = wallBy(C[0]!, C[1]!);
    const op = addOpening(top.id, 'window', 0.5)!;
    const l = addDrawLine({ x: 3000, y: 1000 }, { x: 3000, y: 2000 })!;
    const lk = addFreeDim({ opening: op, edge: 'start', at: 0 }, { drawing: l, i: 0 })!;
    lock(lk);
    // jiná kóta posune čáru o 3000 doprava → okno by muselo za konec stěny
    const mv = addFreeDim({ x: 1000, y: 1000 }, { drawing: l, i: 0 })!;
    const snap = f();
    expect(applyNumpadValue({ kind: 'free-dim', dimId: mv, move: 'b' }, 5000)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock).not.toBeNull();
  });

  it('líc stěny: kresba posunutá kótou potáhne zamčenou stěnu (sousední stěny se protáhnou)', () => {
    const { bottom } = room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    // jiná (nezamčená) kóta posune obdélník o 200 dolů
    const mv = addFreeDim({ x: 1000, y: 1000 }, { seg: r, i: 0, at: 500 })!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: mv, move: 'b' }, 1200)).toBe(true);
    expect(rectTop(r)).toBeCloseTo(2200, 3);
    expect(freeDimValue(f(), lk)).toBeCloseTo(1500, 3);
    expect(nodeAt({ x: 5000, y: 5200 })).toBeDefined();
  });

  it('roh stěny: zamčená úhlopříčka potáhne protější roh', () => {
    room();
    const lk = addFreeDim({ node: nodeAt(C[0]!).id }, { node: nodeAt(C[2]!).id })!;
    lock(lk);
    const v0 = freeDimValue(f(), lk)!;
    const c = nodeAt(C[2]!).id;
    expect(store.edit(fl => void (fl.nodes[c]!.x += 100))).toBe(true);
    expect(Math.abs(freeDimValue(f(), lk)! - v0)).toBeLessThan(0.5);
    expect(nodeAt(C[0]!)).toBeUndefined(); // protější roh se posunul
  });

  it('pevný bod výkresu se neposune → zámek zastaví', () => {
    const { right } = room();
    const lk = addFreeDim({ x: 2000, y: 2000 }, { node: right.b })!;
    lock(lk);
    const snap = f();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(false);
    expect(f()).toBe(snap);
  });

  it('pohnuly se oba konce (celá kresba): kóta se nemění, nic se nedorovnává', () => {
    room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ drawing: r, i: 0 }, { drawing: r, i: 2 })!;
    lock(lk);
    expect(store.edit(fl => fl.drawings![r]!.pts.forEach(p => void (p.y += 100)))).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(Math.hypot(1500, 1500), 3);
  });

  it('přepisovaná zamčená kóta sama se nedorovnává (potvrzení přepsání)', () => {
    const { bottom } = room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: lk, move: 'a' }, 1200, true)).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(1200, 3);
    expect(wallLength(f(), f().walls[bottom.id]!)).toBeCloseTo(5000, 3);
  });

  it('okno na stěně protažené zamčenou kótou zůstane ve výkresu na místě', () => {
    const { bottom, left } = room();
    const op = addOpening(left.id, 'window', 0.3)!;
    // okraje okna ve výkresu (y na levé stěně)
    const edgesY = () => {
      const w = f().walls[left.id]!;
      const a = f().nodes[w.a]!;
      const b = f().nodes[w.b]!;
      const o = f().openings[op]!;
      const s0 = openingStartFromA(o, wallLength(f(), w));
      const dir = Math.sign(b.y - a.y);
      return [a.y + dir * s0, a.y + dir * (s0 + openingSpan(o))].sort((x, y) => x - y);
    };
    const e0 = edgesY();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    // obdélník o 200 dolů → spodní stěna o 200 dolů → levá stěna se prodlouží
    const mv = addFreeDim({ x: 1000, y: 1000 }, { seg: r, i: 0, at: 500 })!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: mv, move: 'b' }, 1200)).toBe(true);
    expect(wallLength(f(), f().walls[left.id]!)).toBeCloseTo(5200, 3);
    const e1 = edgesY();
    expect(e1[0]).toBeCloseTo(e0[0]!, 0);
    expect(e1[1]).toBeCloseTo(e0[1]!, 0);
  });

  it('obdélník zamčený ke dvěma protilehlým stěnám: změna délky stěny se neprovede (dorovnání by ji vrátilo)', () => {
    const { right, bottom } = room();
    const top = wallBy(C[0]!, C[1]!);
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    lock(addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!);
    lock(addFreeDim({ seg: r, i: 0, at: 500 }, { wall: top.id, side: 1, at: 2000 })!);
    const snap = f();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(false);
    expect(f()).toBe(snap);
    expect(store.get().lockBlock).not.toBeNull();
  });

  it('neúspěšné dorovnání stěny (zamčená délka sousední stěny) → výkres beze změny', () => {
    const { bottom } = room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    lock(addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!);
    const left = wallBy(C[3]!, C[0]!);
    setDimLock({ kind: 'wall-length', wallId: left.id, move: 'both' }, true);
    const mv = addFreeDim({ x: 1000, y: 1000 }, { seg: r, i: 0, at: 500 })!;
    const snap = f();
    expect(applyNumpadValue({ kind: 'free-dim', dimId: mv, move: 'b' }, 1200)).toBe(false);
    expect(f()).toBe(snap);
  });

  it('řetěz otvorů prodlouží stěnu: obdélník zamčený ke spodní stěně jede s ní', () => {
    const { right, bottom } = room();
    const op = addOpening(right.id, 'window', 0.5)!;
    // odstup od A zamčený → poslední kóta k B prodlouží stěnu (core/openingChain.ts)
    setDimLock({ kind: 'opening-offset', openingId: op, ref: right.a === nodeAt(C[1]!).id ? 'a' : 'b' }, true);
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const lk = addFreeDim({ seg: r, i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    const toB = Math.round(wallLength(f(), f().walls[right.id]!) - openingStartFromA(f().openings[op]!, wallLength(f(), f().walls[right.id]!)) - openingSpan(f().openings[op]!));
    expect(applyNumpadValue({ kind: 'opening-offset', openingId: op, ref: 'b' }, toB + 300)).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(1500, 3);
    expect(rectTop(r)).toBeCloseTo(2300, 3);
  });

  it('posun kresby (jeden konec): zamčená kóta potáhne druhou kresbu', () => {
    room();
    const r = addDrawRect({ x: 1000, y: 2000 }, { x: 2500, y: 3500 });
    const l = addDrawLine({ x: 1000, y: 1000 }, { x: 2500, y: 1000 })!;
    const lk = addFreeDim({ seg: l, i: 0, at: 500 }, { seg: r, i: 0, at: 500 })!;
    lock(lk);
    expect(store.edit(fl => fl.drawings![r]!.pts.forEach(p => void (p.y += 100)))).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(1000, 3);
    expect(f().drawings![l]!.pts[0]!.y).toBeCloseTo(1100, 3);
  });
  it('roh / hrana schodiště: schodiště zamčené ke spodní stěně jede s ní', () => {
    const { right, bottom } = room();
    const sid = addStair({ x: 1000, y: 2000 }, { x: 4000, y: 3000 })!;
    // hrana 2 ramene = pravý okraj (b vpravo → a vpravo) – dole, rovnoběžná se spodní stěnou
    const lk = addFreeDim({ stairSeg: sid, part: 'f0', i: 2, at: 500 }, { wall: bottom.id, side: 1, at: 2000 })!;
    lock(lk);
    expect(freeDimValue(f(), lk)).toBeCloseTo(2000, 3);
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(store.get().lockBlock).toBeNull();
    expect(freeDimValue(f(), lk)).toBeCloseTo(2000, 3);
    expect(f().stairs![sid]!.flights[0]!.a.y).toBeCloseTo(2800, 3);
  });

  it('roh schodiště: zamčená kóta k rohu stěny – schodiště jede s rohem', () => {
    const { right } = room();
    const sid = addStair({ x: 1000, y: 2000 }, { x: 4000, y: 3000 })!;
    const lk = addFreeDim({ stair: sid, part: 'f0', i: 2 }, { node: right.b })!;
    lock(lk);
    const v0 = freeDimValue(f(), lk)!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: right.id, move: { nodeId: right.b } }, 5300)).toBe(true);
    expect(freeDimValue(f(), lk)).toBeCloseTo(v0, 3);
    // roh schodiště (4000, 3000) se posunul ve směru kóty k rohu (5000, 5300): na spojnici, ve vzdálenosti v0
    const b = f().stairs![sid]!.flights[0]!.b;
    const moved = { x: b.x, y: b.y + 500 }; // b = střed čela ramene, roh vpravo je o půl šířky níž
    expect(Math.hypot(5000 - moved.x, 5300 - moved.y)).toBeCloseTo(v0, 3);
    expect(moved.y).toBeGreaterThan(3000);
  });
});

