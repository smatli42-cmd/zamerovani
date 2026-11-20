/**
 * Schodiště – další druhy a způsoby zadání (rozhodnutí uživatele 2026-11-19): rameno dvěma ťuknutími a zadanými
 * rozměry, točité schodiště, rameno po oblouku, zabíhavé stupně místo podesty, ručně nakreslené další rameno,
 * podesta z kresby, kóta / přichycení k rohům a hranám schodiště. Osa Y míří dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Floor, Pt, Stair } from '../model/types';
import { flightLength, stairHit, totalSteps, treadLines } from '../core/stairs';
import { flightAcross, flightOuterRadius, flightPolygon, flightRadius, isArcFlight } from '../core/stairFlight';
import { refAt, refGeom } from '../core/dimRefs';
import { freeDimValue } from '../core/freeDim';
import { dist } from '../core/geometry';
import { stairTool } from '../tools/stairTool';
import { drawSnap } from '../tools/drawSnap';
import type { PointerInput } from '../tools/types';
import {
  addDrawRect,
  addFreeDim,
  addSpiralStair,
  addStair,
  addStairFlight,
  addWall,
  appendDrawnFlight,
  applyNumpadValue,
  drawingToLanding,
  duplicateSelection,
  mirrorStairArc,
  setFlightArc,
  setLandingWinders,
  setStairTurn
} from './actions';
import { store } from './store';

const f = (): Floor => store.floor()!;
const stairs = () => Object.values(f().stairs ?? {});
const st = (id: string): Stair => f().stairs![id]!;
const Z = 0.2;
const at = (p: Pt): PointerInput => ({ world: p, screen: { x: p.x * Z, y: p.y * Z }, device: 'pen' });
const near = (p: Pt, q: Pt, d = 3) => {
  expect(p.x).toBeCloseTo(q.x, d);
  expect(p.y).toBeCloseTo(q.y, d);
};
const tap = (p: Pt) => {
  stairTool.down?.(at(p));
  stairTool.up?.(at(p));
};

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'stair', stairAppend: null });
  store.updateSettings({ stairMode: 'rect', stairWidth: 1000, stairLength: 3000, snap: false });
});

describe('způsoby zadání', () => {
  it('dvě ťuknutí: roh u prvního stupně a protější roh (jako tažení)', () => {
    tap({ x: 0, y: 3000 });
    expect(stairs()).toHaveLength(0);
    expect(store.get().toolMsg).toContain('protějšího rohu');
    tap({ x: 1200, y: 0 });
    const fl = stairs()[0]!.flights[0]!;
    near(fl.a, { x: 600, y: 3000 });
    near(fl.b, { x: 600, y: 0 });
    expect(fl.width).toBe(1200);
  });

  it('ťuknutí na schodiště ho vybere (nezačne nové)', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    store.set({ selection: null });
    tap({ x: 1500, y: 500 });
    expect(store.get().selection).toEqual({ kind: 'stair', id });
    expect(stairs()).toHaveLength(1);
  });

  it('zadané rozměry: roh u prvního stupně + směr; délka podél osy, ke které je směr blíž', () => {
    store.updateSettings({ stairMode: 'size', stairWidth: 900, stairLength: 2700 });
    tap({ x: 1000, y: 1000 });
    tap({ x: 1000 + 200, y: 1000 - 800 }); // nahoru (vpravo jen trochu)
    const fl = stairs()[0]!.flights[0]!;
    expect(fl.width).toBe(900);
    expect(flightLength(fl)).toBeCloseTo(2700, 3);
    near(fl.a, { x: 1450, y: 1000 });
    near(fl.b, { x: 1450, y: -1700 });
  });

  it('točité: ťuknutí do středu a na vnější okraj = 360°, vřeteno 150 mm, stupně podle osy', () => {
    store.updateSettings({ stairMode: 'spiral' });
    tap({ x: 0, y: 0 });
    tap({ x: 1000, y: 0 });
    const s = stairs()[0]!;
    const fl = s.flights[0]!;
    expect(isArcFlight(fl)).toBe(true);
    expect(fl.sweep).toBe(360);
    expect(flightOuterRadius(fl)).toBeCloseTo(1000, 3);
    expect(flightRadius(fl) - fl.width / 2).toBeCloseTo(150, 3);
    expect(fl.steps).toBeGreaterThan(10);
    // N − 2 čar po poloměru (mezi vřetenem a vnějším okrajem)
    const lines = treadLines(s);
    expect(lines).toHaveLength(fl.steps - 2);
    for (const [p, q] of lines) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1000, 0);
      expect(Math.hypot(q.x, q.y)).toBeCloseTo(150, 0);
    }
    expect(stairHit(s, { x: 0, y: 600 }, 1)).toBe(true);
    expect(stairHit(s, { x: 0, y: 0 }, 1)).toBe(false); // vřeteno
  });

  it('točité menší než 300 mm nevznikne', () => {
    expect(addSpiralStair({ x: 0, y: 0 }, { x: 200, y: 0 })).toBeNull();
  });
});

describe('rameno po oblouku', () => {
  it('rovné → po oblouku: délka osy, začátek a směr zůstanou; úhel a poloměr kótou', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    const fl0 = st(id).flights[0]!;
    setFlightArc(id, fl0.id, true);
    const fl = st(id).flights[0]!;
    expect(fl.sweep).toBe(90);
    expect(flightLength(fl)).toBeCloseTo(3000, 3);
    near(fl.a, { x: 0, y: 500 });
    // úhel 120° = delší osa, poloměr stejný
    const r = flightRadius(fl);
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fl.id, dim: 'sweep' }, 120)).toBe(true);
    expect(flightRadius(st(id).flights[0]!)).toBeCloseTo(r, 3);
    expect(flightLength(st(id).flights[0]!)).toBeCloseTo((r * Math.PI * 2) / 3, 3);
    // vnější poloměr 2500 u 1. ramene: střed stojí
    const c = { ...st(id).flights[0]!.center! };
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fl.id, dim: 'radius' }, 2500)).toBe(true);
    near(st(id).flights[0]!.center!, c);
    expect(flightOuterRadius(st(id).flights[0]!)).toBeCloseTo(2500, 3);
    // zpět rovné: délka zůstane
    const len = flightLength(st(id).flights[0]!);
    setFlightArc(id, fl.id, false);
    expect(isArcFlight(st(id).flights[0]!)).toBe(false);
    expect(flightLength(st(id).flights[0]!)).toBeCloseTo(len, 3);
  });

  it('oblouk na druhou stranu: začátek a směr zůstanou, střed na druhé straně', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    const fid = st(id).flights[0]!.id;
    setFlightArc(id, fid, true);
    const c1 = st(id).flights[0]!.center!;
    mirrorStairArc(id, fid);
    const fl = st(id).flights[0]!;
    expect(fl.sweep).toBe(-90);
    near(fl.a, { x: 0, y: 500 });
    expect(Math.sign(fl.center!.y - 500)).toBe(-Math.sign(c1.y - 500));
  });

  it('L za ramenem po oblouku: podesta navazuje na konec oblouku', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    setFlightArc(id, st(id).flights[0]!.id, true);
    addStairFlight(id, 'left');
    const s = st(id);
    const [l, r] = flightAcross(s.flights[0]!, 1);
    const land = s.landings[0]!.pts;
    // podesta začíná hranou výstupu oblouku (pořadí: vnější, vnitřní kraj)
    expect([land[0]!, land[1]!].every(p => dist(p, l) < 1e-6 || dist(p, r) < 1e-6)).toBe(true);
  });

  it('točité: oblouk na druhou stranu = střed stojí, otočí se smysl otáčení', () => {
    const id = addSpiralStair({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    const fid = st(id).flights[0]!.id;
    mirrorStairArc(id, fid);
    const fl = st(id).flights[0]!;
    expect(fl.sweep).toBe(-360);
    near(fl.center!, { x: 0, y: 0 });
    expect(flightOuterRadius(fl)).toBeCloseTo(1000, 3);
  });

  it('bez vřetena (šířka = průměr osy): obrys drží vnější okraj na obě strany otáčení', () => {
    const id = addSpiralStair({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    const fid = st(id).flights[0]!.id;
    // vřeteno 0: šířka = 2 × poloměr osy při stejném středu
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'radius' }, 1700)).toBe(true);
    const r = flightRadius(st(id).flights[0]!);
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'width' }, 2 * r)).toBe(true);
    for (const flip of [false, true]) {
      if (flip) mirrorStairArc(id, fid);
      const poly = flightPolygon(st(id).flights[0]!);
      expect(Math.max(...poly.map(p => Math.hypot(p.x, p.y)))).toBeCloseTo(2 * r, 0);
    }
  });

  it('šířka ramene po oblouku nesmí přesáhnout střed', () => {
    store.updateSettings({ stairMode: 'spiral' });
    const id = addSpiralStair({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    const fl = st(id).flights[0]!;
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fl.id, dim: 'width' }, 1300)).toBe(false);
  });
});

describe('zabíhavé stupně místo podesty', () => {
  it('L: 3 zabíhavé stupně = 3 nášlapy, 2 čáry z vnitřního rohu, přidají 2 stoupání', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    addStairFlight(id, 'left');
    const s0 = st(id);
    const n0 = totalSteps(s0);
    const t0 = treadLines(s0).length;
    setLandingWinders(id, s0.flights[1]!.id, 0);
    const s = st(id);
    expect(s.landings[0]!.winders).toBe(3);
    expect(totalSteps(s)).toBe(n0 + 2);
    const lines = treadLines(s);
    expect(lines).toHaveLength(t0 + 2);
    // vnitřní roh L vlevo: konec ramene (3000, 500) + vlevo (nahoru) půl šířky
    for (const [p] of lines.slice(t0)) near(p, { x: 3000, y: 0 });
    // zpět podesta
    setLandingWinders(id, s.flights[1]!.id, null);
    expect(st(id).landings[0]!.winders).toBeUndefined();
  });

  it('U: 6 zabíhavých stupňů = 5 čar z bodu mezi rameny; změna L → U nastaví výchozí počet', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    addStairFlight(id, 'left');
    const fid = st(id).flights[1]!.id;
    setLandingWinders(id, fid, 4);
    expect(st(id).landings[0]!.winders).toBe(4);
    setStairTurn(id, fid, 'u-left');
    expect(st(id).landings[0]!.winders).toBe(6);
    const t = treadLines(st(id));
    const fan = t.filter(([p]) => dist(p, { x: 3000, y: 0 }) < 1e-6);
    expect(fan).toHaveLength(5);
    // čáry míří do podesty (za konec ramene)
    for (const [, q] of fan) expect(q.x).toBeGreaterThan(3000 - 1e-6);
  });
});

describe('ručně nakreslené rameno a podesta z kresby', () => {
  it('nakreslit další rameno: stojí, kde je; první stupeň u výstupu; podesta vyplní mezeru', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    store.set({ stairAppend: id });
    // rameno 1000 × 2500 svisle dolů, s mezerou 500 mm za koncem prvního
    tap({ x: 3500, y: 3500 });
    tap({ x: 4500, y: 1000 });
    const s = st(id);
    expect(s.flights).toHaveLength(2);
    const f2 = s.flights[1]!;
    expect(f2.turn).toBe('free');
    near(f2.a, { x: 4000, y: 1000 });
    near(f2.b, { x: 4000, y: 3500 });
    expect(s.landings[0]!.pts).toHaveLength(4);
    expect(store.get().stairAppend).toBeNull();
    // změna délky prvního ramene nehne ručně nakresleným
    applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: s.flights[0]!.id, dim: 'length' }, 2500);
    near(st(id).flights[1]!.a, { x: 4000, y: 1000 });
  });

  it('další rameno zadanými rozměry: šířka a délka z lišty i když je šířka větší', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    store.updateSettings({ stairMode: 'size', stairWidth: 1500, stairLength: 1200 });
    store.set({ stairAppend: id });
    tap({ x: 3500, y: 1000 });
    tap({ x: 3600, y: 3000 });
    const f2 = st(id).flights[1]!;
    expect(f2.width).toBe(1500);
    expect(flightLength(f2)).toBeCloseTo(1200, 3);
  });

  it('ťuknutí na roh schodiště (přichycení) začne nové rameno, nevybere schodiště', () => {
    store.updateSettings({ snap: true });
    addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    store.set({ selection: null });
    tap({ x: 3010, y: 5 });
    expect(store.get().toolMsg).toContain('protějšího rohu');
    tap({ x: 4000, y: 3000 });
    expect(stairs()).toHaveLength(2);
    near(stairs()[1]!.flights[0]!.a, { x: 3500, y: 0 }); // začátek přesně v rohu prvního schodiště
  });

  it('dotýkající se rameno: bez podesty', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    expect(appendDrawnFlight(id, { x: 3000, y: 0 }, { x: 5000, y: 1000 })).toBe(true);
    expect(st(id).landings[0]!.pts).toHaveLength(0);
  });

  it('kresba → podesta: nahradí podestu L, rameno pak stojí („volně“), kresba zmizí', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    addStairFlight(id, 'left');
    const a2 = { ...st(id).flights[1]!.a };
    const r = addDrawRect({ x: 2900, y: -100 }, { x: 4200, y: 1100 })!;
    expect(drawingToLanding(r)).toBe(id);
    const s = st(id);
    expect(s.landings[0]!.pts).toHaveLength(4);
    expect(s.landings[0]!.pts.some(p => dist(p, { x: 4200, y: 1100 }) < 1)).toBe(true);
    expect(s.flights[1]!.turn).toBe('free');
    near(s.flights[1]!.a, a2);
    expect(f().drawings?.[r]).toBeUndefined();
  });

  it('kresba bez schodiště poblíž: hlášení, kresba zůstane', () => {
    addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    const r = addDrawRect({ x: 10000, y: 10000 }, { x: 11000, y: 11000 })!;
    expect(drawingToLanding(r)).toBeNull();
    expect(store.get().lockBlock?.text).toContain('Podesta');
    expect(f().drawings?.[r]).toBeDefined();
  });
});

describe('kóta a přichycení ke schodišti (odstup od stěny)', () => {
  it('kóta od líce stěny k hraně schodiště: zadaná hodnota posune schodiště, stěna stojí', () => {
    addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 0 });
    const id = addStair({ x: 1000, y: 500 }, { x: 4000, y: 1500 })!;
    // hrana pod perem: horní okraj ramene (y = 500)
    const e = refAt(f(), { x: 2000, y: 505 }, 1, 50);
    expect(e && 'stairSeg' in e && e.stairSeg === id).toBe(true);
    const w = Object.values(f().walls)[0]!;
    const d = addFreeDim({ wall: w.id, side: 0, at: 2000 }, e!)!;
    expect(freeDimValue(f(), d)).toBeCloseTo(500, 3);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: d, move: 'b' }, 800)).toBe(true);
    expect(st(id).flights[0]!.a.y).toBeCloseTo(1300, 3);
    expect(f().nodes[w.a]!.y).toBe(0);
  });

  it('roh schodiště: kóta k bodu i přichycení kresby', () => {
    const id = addStair({ x: 1000, y: 500 }, { x: 4000, y: 1500 })!;
    const e = refAt(f(), { x: 1003, y: 502 }, 20, 20);
    expect(e).toEqual({ stair: id, part: 'f0', i: 0 });
    near(refGeom(f(), e!)!.p, { x: 1000, y: 500 });
    store.updateSettings({ snap: true });
    near(drawSnap(f(), { x: 4010, y: 1495 }, null).pt, { x: 4000, y: 1500 });
  });

  it('kopie schodiště s kótou: konec kóty přejde na kopii', () => {
    const id = addStair({ x: 1000, y: 500 }, { x: 4000, y: 1500 })!;
    const d = addFreeDim({ stair: id, part: 'f0', i: 0 }, { stair: id, part: 'f0', i: 1 })!;
    store.set({ selection: { kind: 'multi', items: [{ kind: 'stair', id }, { kind: 'dim', id: d }] } });
    duplicateSelection();
    const copy = stairs().find(s => s.id !== id)!;
    const dims = Object.values(f().dims ?? {});
    expect(dims).toHaveLength(2);
    const nd = dims.find(x => x.id !== d)!;
    expect(nd.a).toEqual({ stair: copy.id, part: 'f0', i: 0 });
  });
});
