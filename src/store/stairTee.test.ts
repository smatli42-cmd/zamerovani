/**
 * Schodiště – doplněné druhy z obrázku uživatele (2026-11-19): rovné s podestou (napojení „Rovně“) a atypické T
 * (podesta a dvě ramena na obě strany, `turn: 'tee'`). Osa Y míří dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Floor, Pt, Stair } from '../model/types';
import { arrowPath, arrowPaths, canAppendFlight, stairLabel, totalSteps } from '../core/stairs';
import {
  addDrawRect,
  addStair,
  addStairFlight,
  addStairTeeFlights,
  applyNumpadValue,
  drawingToLanding,
  removeStairFlight,
  setFlightSteps,
  setLandingWinders,
  setStairTurn
} from './actions';
import { store } from './store';

const f = (): Floor => store.floor()!;
const st = (id: string): Stair => f().stairs![id]!;
const near = (p: Pt, q: Pt) => {
  expect(p.x).toBeCloseTo(q.x, 3);
  expect(p.y).toBeCloseTo(q.y, 3);
};
const box = (pts: Pt[]) => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });

/** Přímé schodiště 3000 × 1000 vodorovně (osa y = 500), první stupeň vlevo, 12 stoupání. */
const straight = () => addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.2 }, selection: null, tool: 'stair' });
});

describe('rovné s podestou (napojení Rovně)', () => {
  it('podesta za koncem ramene, další rameno pokračuje stejným směrem', () => {
    const id = straight();
    addStairFlight(id, 'straight');
    const s = st(id);
    expect(s.flights).toHaveLength(2);
    const f2 = s.flights[1]!;
    expect(f2.turn).toBe('straight');
    near(f2.a, { x: 4000, y: 500 });
    near(f2.b, { x: 7000, y: 500 });
    expect(box(s.landings[0]!.pts)).toEqual({ x0: 3000, x1: 4000, y0: 0, y1: 1000 });
    expect(totalSteps(s)).toBe(24);
    // šipka prochází středem podesty (jeden bod)
    expect(arrowPath(s)).toHaveLength(5);
    near(arrowPath(s)[2]!, { x: 3500, y: 500 });
  });

  it('hloubka podesty jde zadat kótou; širší další rameno = širší podesta', () => {
    const id = straight();
    addStairFlight(id, 'straight');
    const fid = st(id).flights[1]!.id;
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'depth' }, 1500)).toBe(true);
    near(st(id).flights[1]!.a, { x: 4500, y: 500 });
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'width' }, 1400)).toBe(true);
    expect(box(st(id).landings[0]!.pts)).toEqual({ x0: 3000, x1: 4500, y0: -200, y1: 1200 });
  });

  it('zabíhavé stupně u rovně nejdou; přepnutí L se zabíhavými na Rovně je zruší', () => {
    const id = straight();
    addStairFlight(id, 'left');
    const fid = st(id).flights[1]!.id;
    setLandingWinders(id, fid, 0);
    expect(st(id).landings[0]!.winders).toBe(3);
    setStairTurn(id, fid, 'straight');
    expect(st(id).landings[0]!.winders).toBeUndefined();
    expect(totalSteps(st(id))).toBe(24);
    setLandingWinders(id, fid, 3);
    expect(st(id).landings[0]!.winders).toBeUndefined();
    near(st(id).flights[1]!.a, { x: 4000, y: 500 });
  });
});

describe('atypické T (podesta a dvě ramena na obě strany)', () => {
  it('rameno L vlevo a větev T vpravo z boků téže podesty; počet stupňů jen jednou větví', () => {
    const id = straight();
    addStairTeeFlights(id);
    const s = st(id);
    expect(s.flights.map(x => x.turn)).toEqual([undefined, 'left', 'tee']);
    near(s.flights[1]!.a, { x: 3500, y: 0 });
    near(s.flights[1]!.b, { x: 3500, y: -3000 });
    near(s.flights[2]!.a, { x: 3500, y: 1000 });
    near(s.flights[2]!.b, { x: 3500, y: 4000 });
    expect(box(s.landings[0]!.pts)).toEqual({ x0: 3000, x1: 4000, y0: 0, y1: 1000 });
    expect(s.landings[1]!.pts).toEqual([]);
    expect(totalSteps(s)).toBe(24);
    // dvě šipky: hlavní přes podestu do ramene L, druhá ze středu podesty po větvi T
    const ar = arrowPaths(s);
    expect(ar).toHaveLength(2);
    near(ar[0]![ar[0]!.length - 1]!, { x: 3500, y: -3000 });
    near(ar[1]![0]!, { x: 3500, y: 500 });
    near(ar[1]![ar[1]!.length - 1]!, { x: 3500, y: 4000 });
  });

  it('obrácený výstup otočí obě šipky', () => {
    const id = straight();
    addStairTeeFlights(id);
    store.edit(fl => void (fl.stairs![id]!.reverse = true));
    const ar = arrowPaths(st(id));
    near(ar[0]![ar[0]!.length - 1]!, { x: 0, y: 500 });
    near(ar[1]![ar[1]!.length - 1]!, { x: 3500, y: 500 });
  });

  it('L vpravo přehodí strany; U, Rovně ani zabíhavé stupně u T nejdou; větev T napojení nemění', () => {
    const id = straight();
    addStairTeeFlights(id);
    const [, l, t] = st(id).flights;
    setStairTurn(id, l!.id, 'right');
    near(st(id).flights[1]!.a, { x: 3500, y: 1000 });
    near(st(id).flights[2]!.a, { x: 3500, y: 0 });
    near(st(id).flights[2]!.b, { x: 3500, y: -3000 });
    for (const turn of ['u-left', 'straight', 'free'] as const) {
      setStairTurn(id, l!.id, turn);
      expect(st(id).flights[1]!.turn).toBe('right');
    }
    setStairTurn(id, t!.id, 'left');
    expect(st(id).flights[2]!.turn).toBe('tee');
    setLandingWinders(id, l!.id, 0);
    expect(st(id).landings[0]!.winders).toBeUndefined();
  });

  it('za větev T nejde přidat další rameno; odebrání posledního ramene odebere větev T', () => {
    const id = straight();
    addStairTeeFlights(id);
    expect(canAppendFlight(st(id))).toBe(false);
    addStairFlight(id, 'left');
    expect(st(id).flights).toHaveLength(3);
    removeStairFlight(id);
    expect(st(id).flights.map(x => x.turn)).toEqual([undefined, 'left']);
    expect(st(id).landings).toHaveLength(1);
    expect(canAppendFlight(st(id))).toBe(true);
  });

  it('větev T nesmí být širší než hloubka společné podesty; hloubku jde zvětšit', () => {
    const id = straight();
    addStairTeeFlights(id);
    const [, l, t] = st(id).flights;
    const set = (fid: string, dim: 'width' | 'depth', v: number) => applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim }, v);
    expect(set(t!.id, 'width', 1200)).toBe(false);
    expect(set(l!.id, 'width', 800)).toBe(false); // hloubka podesty = šířka L → větev T by přečnívala
    expect(set(t!.id, 'depth', 1500)).toBe(false); // hloubka patří ramenu L
    expect(set(l!.id, 'depth', 1500)).toBe(true);
    expect(set(t!.id, 'width', 1200)).toBe(true);
    near(st(id).flights[2]!.a, { x: 3750, y: 1000 });
    expect(set(l!.id, 'depth', 1100)).toBe(false);
  });

  it('kresba u podesty T se jako podesta nepoužije (T by se rozpojilo)', () => {
    const id = straight();
    addStairTeeFlights(id);
    const before = JSON.stringify(st(id));
    const d = addDrawRect({ x: 2900, y: -100 }, { x: 4100, y: 1100 });
    expect(drawingToLanding(d!)).toBeNull();
    expect(JSON.stringify(st(id))).toBe(before);
  });

  it('počet stupňů ramene L a větve T se mění zároveň (vedou do stejné výšky)', () => {
    const id = straight();
    addStairTeeFlights(id);
    const [, l, t] = st(id).flights;
    setFlightSteps(id, t!.id, 9);
    expect(st(id).flights.map(x => x.steps)).toEqual([12, 9, 9]);
    setFlightSteps(id, l!.id, 11);
    expect(st(id).flights.map(x => x.steps)).toEqual([12, 11, 11]);
    expect(totalSteps(st(id))).toBe(23);
    expect(stairLabel(st(id))).toBe('23 st.');
  });
});

describe('přepnutí napojení na L po mělké podestě', () => {
  it('podesta Rovně mělčí než šířka ramene → po přepnutí na L výchozí hloubka = šířka ramene', () => {
    const id = straight();
    addStairFlight(id, 'straight');
    const fid = st(id).flights[1]!.id;
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'depth' }, 400)).toBe(true);
    setStairTurn(id, fid, 'left');
    expect(st(id).flights[1]!.depth).toBeUndefined();
    expect(box(st(id).landings[0]!.pts)).toEqual({ x0: 3000, x1: 4000, y0: 0, y1: 1000 });
  });
});
