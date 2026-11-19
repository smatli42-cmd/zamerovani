/**
 * Úhlopříčka místnosti (rozhodnutí uživatele 2026-11-19, core/diagonal.ts): zadaná délka volné kóty mezi
 * nesousedními rohy uzavřené místnosti zachová délky stěn; stojí pevný roh a delší z jeho stěn. Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { DimEnd, Pt } from '../model/types';
import { freeDimValue } from '../core/freeDim';
import { dist } from '../core/geometry';
import { openingStartFromA, wallLength } from '../core/floorQueries';
import { addFreeDim, addOpening, addWall, applyNumpadValue, setDimLock, splitWall } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1);
const N = (p: Pt): DimEnd => ({ node: nodeAt(p)!.id });
const set = (id: string, move: 'a' | 'b', v: number) => applyNumpadValue({ kind: 'free-dim', dimId: id, move }, v);
const lengths = () => Object.fromEntries(Object.values(f().walls).map(w => [w.id, dist(f().nodes[w.a]!, f().nodes[w.b]!)]));
const expectSameLengths = (before: Record<string, number>) => {
  for (const [id, l] of Object.entries(before)) expect(dist(f().nodes[f().walls[id]!.a]!, f().nodes[f().walls[id]!.b]!)).toBeCloseTo(l, 1);
};

/** Uzavřený obrys z rovných stěn (body po obvodu). */
function loop(c: Pt[], thickness = 0) {
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % c.length]!;
    addWall(p, nodeAt(p)?.id ?? null, q, nodeAt(q)?.id ?? null, false, { thickness, side: -1 });
  }
}
const fresh = () => store.openProject(createProject({ name: 't' }));
const RECT = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 }
];

describe('úhlopříčka místnosti zachová délky stěn', () => {
  it('posun 1. bodu: stojí 2. roh a jeho delší stěna (spodní 4000)', () => {
    fresh();
    loop(RECT, 300);
    const L = lengths();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'a', 4900)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(4900, 1);
    expectSameLengths(L);
    expect(nodeAt({ x: 4000, y: 3000 })).toBeDefined();
    expect(nodeAt({ x: 0, y: 3000 })).toBeDefined();
    expect(nodeAt({ x: 0, y: 0 })).toBeUndefined();
  });

  it('místnost tvaru L (6 rohů): délky stěn zůstanou, úhlopříčka sedí', () => {
    fresh();
    loop([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 2000 },
      { x: 2500, y: 2000 },
      { x: 2500, y: 4000 },
      { x: 0, y: 4000 }
    ]);
    const L = lengths();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 2500, y: 2000 }))!;
    const v = freeDimValue(f(), id)!;
    expect(set(id, 'b', v + 50)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(v + 50, 1);
    expectSameLengths(L);
    expect(nodeAt({ x: 0, y: 0 })).toBeDefined();
    expect(nodeAt({ x: 5000, y: 0 })).toBeDefined(); // základna = delší stěna pevného rohu (5000)
  });

  it('okno na posunuté stěně zůstane na stěně ve stejné vzdálenosti od rohu', () => {
    fresh();
    loop(RECT, 300);
    const right = Object.values(f().walls).find(w => f().nodes[w.a]!.x === 4000 && f().nodes[w.b]!.x === 4000)!;
    const op = addOpening(right.id, 'window', 0.5)!;
    const s0 = openingStartFromA(f().openings[op]!, wallLength(f(), right));
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(true);
    expect(openingStartFromA(f().openings[op]!, wallLength(f(), f().walls[right.id]!))).toBeCloseTo(s0, 1);
  });

  it('příčka napojená doprostřed posunuté stěny zůstane napojená', () => {
    fresh();
    loop(RECT);
    const top = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 3000 && f().nodes[w.b]!.y === 3000)!;
    // příčka z bodu na spodní stěně (y 3000) dovnitř místnosti
    addWall({ x: 2000, y: 3000 }, null, { x: 2000, y: 1500 }, null, false);
    const hosted = Object.values(f().nodes).find(n => n.host === top.id);
    if (!hosted) return expect.fail('příčka se nenapojila do T');
    const L = lengths();
    const roomWalls = Object.fromEntries(Object.entries(L).filter(([id]) => id !== Object.keys(L)[4]));
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(true);
    const a = f().nodes[f().walls[top.id]!.a]!;
    const b = f().nodes[f().walls[top.id]!.b]!;
    const h = f().nodes[hosted.id]!;
    expectSameLengths(roomWalls); // stěny místnosti si délku drží (příčka s volným koncem do obrysu nepatří)
    // napojený roh leží dál na (posunuté) stěně
    const cross = (b.x - a.x) * (h.y - a.y) - (b.y - a.y) * (h.x - a.x);
    expect(Math.abs(cross) / dist(a, b)).toBeLessThan(0.5);
  });

  it('sousední místnost: společná stěna se posune, stěny sousední místnosti se protáhnou', () => {
    fresh();
    loop(RECT);
    addWall({ x: 4000, y: 0 }, nodeAt({ x: 4000, y: 0 })!.id, { x: 7000, y: 0 }, null, false);
    addWall({ x: 7000, y: 0 }, nodeAt({ x: 7000, y: 0 })!.id, { x: 7000, y: 3000 }, null, false);
    addWall({ x: 7000, y: 3000 }, nodeAt({ x: 7000, y: 3000 })!.id, { x: 4000, y: 3000 }, nodeAt({ x: 4000, y: 3000 })!.id, false);
    const left = lengths();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(5100, 1);
    // stěny levé místnosti si délku drží, pravá místnost zůstala spojená (rohy 7000 stojí)
    const leftIds = Object.keys(left).slice(0, 4);
    expectSameLengths(Object.fromEntries(leftIds.map(k => [k, left[k]!])));
    expect(nodeAt({ x: 7000, y: 0 })).toBeDefined();
    expect(nodeAt({ x: 7000, y: 3000 })).toBeDefined();
  });

  it('úhlopříčka delší než obvod dovolí: nic se nezmění', () => {
    fresh();
    loop(RECT);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 7500)).toBe(false);
    expect(nodeAt({ x: 4000, y: 3000 })).toBeDefined();
  });

  it('zamčená jiná volná kóta úpravu zastaví', () => {
    fresh();
    loop(RECT);
    const other = addFreeDim(N({ x: 4000, y: 0 }), N({ x: 0, y: 3000 }))!;
    setDimLock({ kind: 'free-dim', dimId: other, move: 'b' }, true);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(false);
    expect(freeDimValue(f(), id)).toBeCloseTo(5000, 3);
  });

  it('mimo uzavřenou místnost (tvar U): platí dřívější posun rohu po kótě', () => {
    fresh();
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false);
    addWall({ x: 4000, y: 0 }, nodeAt({ x: 4000, y: 0 })!.id, { x: 4000, y: 3000 }, null, false);
    addWall({ x: 4000, y: 3000 }, nodeAt({ x: 4000, y: 3000 })!.id, { x: 0, y: 3000 }, null, false);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(5100, 1);
  });

  it('místnost s obloukovou stěnou: platí dřívější posun rohu', () => {
    fresh();
    loop(RECT);
    const top = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.b]!.y === 0)!;
    store.edit(fl => {
      fl.walls[top.id]!.sagitta = -500;
    });
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    const v = freeDimValue(f(), id)!;
    set(id, 'b', v + 100);
    // délka bez zachování stěn (posun rohu) – kóta se změní nebo se úprava neprovede, ale řešič úhlopříčky se nepoužije
    const right = Object.values(f().walls).find(w => w.id !== top.id && f().nodes[w.a]!.x > 3000 && f().nodes[w.b]!.x > 3000)!;
    expect(dist(f().nodes[right.a]!, f().nodes[right.b]!)).not.toBeCloseTo(3000, 0);
  });
});

describe('úhlopříčka – nálezy revieweru', () => {
  it('kóta podél rozdělené stěny (rohy na přímce) = délka stěny, ne úhlopříčka: stěna zůstane rovná', () => {
    fresh();
    loop(RECT);
    const bottom = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.b]!.y === 0)!;
    splitWall(bottom.id, { x: 2000, y: 0 });
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 0 }))!;
    expect(set(id, 'b', 3900)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(3900, 1);
    for (const n of Object.values(f().nodes)) if (n.y < 1500) expect(Math.abs(n.y)).toBeLessThan(0.5);
  });

  it('úhlopříčka přes rozdělenou stěnu: bod na přímce zůstane na rovné stěně', () => {
    fresh();
    loop(RECT);
    const right = Object.values(f().walls).find(w => f().nodes[w.a]!.x === 4000 && f().nodes[w.b]!.x === 4000)!;
    splitWall(right.id, { x: 4000, y: 1000 });
    const mid = nodeAt({ x: 4000, y: 1000 })!.id;
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(true);
    const a = nodeAt({ x: 4000, y: 0 })!;
    const c = f().nodes[(f().dims![id]!.b as { node: string }).node]!;
    const m = f().nodes[mid]!;
    expect(Math.abs((c.x - a.x) * (m.y - a.y) - (c.y - a.y) * (m.x - a.x)) / dist(a, c)).toBeLessThan(0.5);
    expect(dist(a, m)).toBeCloseTo(1000, 1);
    expect(dist(a, c)).toBeCloseTo(3000, 1);
  });

  it('konkávní místnost (L): úhlopříčka, jejíž střed leží mimo místnost, zachová délky stěn', () => {
    fresh();
    loop([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 2000 },
      { x: 2500, y: 2000 },
      { x: 2500, y: 4000 },
      { x: 0, y: 4000 }
    ]);
    const L = lengths();
    const id = addFreeDim(N({ x: 5000, y: 2000 }), N({ x: 2500, y: 4000 }))!;
    const v = freeDimValue(f(), id)!;
    expect(set(id, 'b', v + 40)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(v + 40, 1);
    expectSameLengths(L);
  });

  // omezení (rozhodnuto samostatně): roh místnosti napojený doprostřed jiné stěny (T) musí zůstat na ní – řešič
  // to zatím neumí, úprava se neprovede (dřív by se napojení příčky utrhlo)
  it('místnost rozdělená příčkou do T: úhlopříčka v polovině se neprovede, nic se nezmění', () => {
    fresh();
    loop(RECT);
    addWall({ x: 2000, y: 0 }, null, { x: 2000, y: 3000 }, null, false);
    const hosted = Object.values(f().nodes).filter(n => n.host).map(n => n.id);
    expect(hosted).toHaveLength(2);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 2000, y: 3000 }))!;
    const v = freeDimValue(f(), id)!;
    expect(set(id, 'b', 3700)).toBe(false);
    expect(freeDimValue(f(), id)).toBeCloseTo(v, 3);
    expect(Object.values(f().nodes).filter(n => n.host)).toHaveLength(2);
  });

  it('mimo místnost (tvar U): zamčená délka stěny posun rohu zastaví', () => {
    fresh();
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false);
    const S = addWall({ x: 4000, y: 0 }, nodeAt({ x: 4000, y: 0 })!.id, { x: 4000, y: 3000 }, null, false)!;
    addWall({ x: 4000, y: 3000 }, nodeAt({ x: 4000, y: 3000 })!.id, { x: 0, y: 3000 }, null, false);
    setDimLock({ kind: 'wall-length', wallId: S, move: 'both' }, true);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(set(id, 'b', 5100)).toBe(false);
    expect(nodeAt({ x: 4000, y: 3000 })).toBeDefined();
  });
});
