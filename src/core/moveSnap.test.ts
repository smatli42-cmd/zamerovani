import { beforeEach, describe, expect, it } from 'vitest';
import { moveSnapTargets, outlineGeom, snapMove, stairGeom } from './moveSnap';
import { wallBodies } from './wallBody';
import { createProject } from '../model/factory';
import { addDrawLine, addStair, addWall } from '../store/actions';
import { store } from '../store/store';
import type { Pt } from '../model/types';

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
];
const STAIR = outlineGeom([rect(0, 0, 1000, 3000)]);
const seg = (a: Pt, b: Pt): [Pt, Pt] => [a, b];

describe('snapMove – přichycení posouvaného schodiště', () => {
  it('hrana k rovnoběžné hraně vedle ní (do tolerance)', () => {
    const r = snapMove(STAIR, { pts: [], segs: [seg({ x: -500, y: 3050 }, { x: 2000, y: 3050 })] }, { x: 0, y: 0 }, 100);
    expect(r.snapped).toBe(true);
    expect(r.delta.x).toBeCloseTo(0);
    expect(r.delta.y).toBeCloseTo(50);
  });

  it('dvě hrany v různých směrech – zapadne do rohu', () => {
    const t = { pts: [], segs: [seg({ x: -500, y: 3050 }, { x: 2000, y: 3050 }), seg({ x: -30, y: -500 }, { x: -30, y: 4000 })] };
    const r = snapMove(STAIR, t, { x: 0, y: 0 }, 100);
    expect(r.delta.x).toBeCloseTo(-30);
    expect(r.delta.y).toBeCloseTo(50);
    expect(r.hits).toHaveLength(2);
  });

  it('hrana na stejné přímce, ale daleko podél, ani šikmá hrana nepřichytí', () => {
    const far = snapMove(STAIR, { pts: [], segs: [seg({ x: 5000, y: 3050 }, { x: 6000, y: 3050 })] }, { x: 0, y: 0 }, 100);
    expect(far.snapped).toBe(false);
    const slanted = snapMove(STAIR, { pts: [], segs: [seg({ x: -500, y: 3050 }, { x: 2000, y: 3150 })] }, { x: 0, y: 0 }, 100);
    expect(slanted.snapped).toBe(false);
  });

  it('bez hrany roh na roh; mimo toleranci nic', () => {
    const r = snapMove(STAIR, { pts: [{ x: 1020, y: 3010 }], segs: [] }, { x: 0, y: 0 }, 100);
    expect(r.delta).toEqual({ x: 20, y: 10 });
    expect(snapMove(STAIR, { pts: [{ x: 1500, y: 3500 }], segs: [] }, { x: 0, y: 0 }, 100).snapped).toBe(false);
  });

  it('roh s ostrým úhlem, který by skočil dál než 2× tolerance, se nebere – jen první hrana', () => {
    // druhá hrana svírá s první ~25°: průsečík je daleko, schodiště se dorazí jen k bližší hraně
    const t = { pts: [], segs: [seg({ x: -500, y: 3040 }, { x: 2000, y: 3040 }), seg({ x: 1090, y: 2000 }, { x: 1090 + 2000 * Math.sin(0.44), y: 2000 + 2000 * Math.cos(0.44) })] };
    const r = snapMove(outlineGeom([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000 + 1000 * Math.sin(0.44), y: 1000 * Math.cos(0.44) + 2000 }, { x: 0, y: 3000 }]]), t, { x: 0, y: 0 }, 100);
    expect(Math.hypot(r.delta.x, r.delta.y)).toBeLessThanOrEqual(200);
  });

  it('posun se započítá: hledá se u posunuté polohy', () => {
    const r = snapMove(STAIR, { pts: [], segs: [seg({ x: -500, y: 5000 }, { x: 2000, y: 5000 })] }, { x: 0, y: 1970 }, 100);
    expect(r.delta.y).toBeCloseTo(2000);
  });
});

describe('moveSnapTargets – stěna z obou stran a ostatní prvky', () => {
  beforeEach(() => store.openProject(createProject({ name: 't' })));
  const f = () => store.floor()!;

  it('schodiště se přichytí k oběma lícům stěny s tloušťkou', () => {
    const w = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const ys = wallBodies(f()).get(w)!.poly.map(p => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    expect(hi - lo).toBeCloseTo(300);
    // pod stěnou: horní hrana schodiště 40 mm od líce
    const below = addStair({ x: 1000, y: lo - 40 - 3000 }, { x: 2000, y: lo - 40 })!;
    const r1 = snapMove(stairGeom(f(), below)!, moveSnapTargets(f(), below), { x: 0, y: 0 }, 100);
    expect(r1.delta.y).toBeCloseTo(40);
    // nad stěnou: dolní hrana 60 mm od druhého líce
    const above = addStair({ x: 1000, y: hi + 60 }, { x: 2000, y: hi + 60 + 3000 })!;
    const r2 = snapMove(stairGeom(f(), above)!, moveSnapTargets(f(), above), { x: 0, y: 0 }, 100);
    expect(r2.delta.y).toBeCloseTo(-60);
  });

  it('oblouková stěna dává jen své konce (ne hrany z krátkých úseků)', () => {
    const w = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    store.edit(fl => void (fl.walls[w]!.sagitta = 800));
    const t = moveSnapTargets(f(), 'nic');
    expect(t.segs).toHaveLength(0);
    expect(t.pts).toHaveLength(2);
  });

  it('k čáře kresby a k jinému schodišti; posouvané schodiště samo sebe nebere', () => {
    addDrawLine({ x: 8000, y: -2000 }, { x: 8000, y: 5000 });
    const s = addStair({ x: 6970, y: 0 }, { x: 7970, y: 3000 })!;
    const r = snapMove(stairGeom(f(), s)!, moveSnapTargets(f(), s), { x: 0, y: 0 }, 100);
    expect(r.delta.x).toBeCloseTo(30);
    const t = addStair({ x: 4000, y: 3020 }, { x: 5000, y: 6020 })!;
    const own = moveSnapTargets(f(), t);
    expect(own.segs.some(([a, b]) => a.y === 3020 && b.y === 3020 && a.x >= 4000)).toBe(false);
    const r2 = snapMove(stairGeom(f(), t)!, moveSnapTargets(f(), t), { x: 2950, y: 0 }, 100);
    // po posunu +2950: dolní hrana y = 3020 je 20 mm nad horní hranou prvního schodiště (y = 3000), pravá hrana
    // x = 7950 je 20 mm od jeho pravé hrany (x = 7970) → zapadne do rohu
    expect(r2.delta.x).toBeCloseTo(2970);
    expect(r2.delta.y).toBeCloseTo(-20);
  });
});
