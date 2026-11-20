import { beforeEach, describe, expect, it } from 'vitest';
import { moveSnapTargets, movingGeom, outlineGeom, snapMove, stairGeom } from './moveSnap';
import { wallBodies } from './wallBody';
import { createProject } from '../model/factory';
import { addDrawArc, addDrawCircle, addDrawDouble, addDrawLine, addDrawRect, addStair, addStroke, addText, addWall } from '../store/actions';
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
    const r1 = snapMove(stairGeom(f(), below)!, moveSnapTargets(f(), [{ kind: 'stair', id: below }]), { x: 0, y: 0 }, 100);
    expect(r1.delta.y).toBeCloseTo(40);
    // nad stěnou: dolní hrana 60 mm od druhého líce
    const above = addStair({ x: 1000, y: hi + 60 }, { x: 2000, y: hi + 60 + 3000 })!;
    const r2 = snapMove(stairGeom(f(), above)!, moveSnapTargets(f(), [{ kind: 'stair', id: above }]), { x: 0, y: 0 }, 100);
    expect(r2.delta.y).toBeCloseTo(-60);
  });

  it('oblouková stěna dává jen své konce (ne hrany z krátkých úseků)', () => {
    const w = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    store.edit(fl => void (fl.walls[w]!.sagitta = 800));
    const t = moveSnapTargets(f(), [{ kind: 'stair', id: 'nic' }]);
    expect(t.segs).toHaveLength(0);
    expect(t.pts).toHaveLength(2);
  });

  it('k čáře kresby a k jinému schodišti; posouvané schodiště samo sebe nebere', () => {
    addDrawLine({ x: 8000, y: -2000 }, { x: 8000, y: 5000 });
    const s = addStair({ x: 6970, y: 0 }, { x: 7970, y: 3000 })!;
    const r = snapMove(stairGeom(f(), s)!, moveSnapTargets(f(), [{ kind: 'stair', id: s }]), { x: 0, y: 0 }, 100);
    expect(r.delta.x).toBeCloseTo(30);
    const t = addStair({ x: 4000, y: 3020 }, { x: 5000, y: 6020 })!;
    const own = moveSnapTargets(f(), [{ kind: 'stair', id: t }]);
    expect(own.segs.some(([a, b]) => a.y === 3020 && b.y === 3020 && a.x >= 4000)).toBe(false);
    const r2 = snapMove(stairGeom(f(), t)!, moveSnapTargets(f(), [{ kind: 'stair', id: t }]), { x: 2950, y: 0 }, 100);
    // po posunu +2950: dolní hrana y = 3020 je 20 mm nad horní hranou prvního schodiště (y = 3000), pravá hrana
    // x = 7950 je 20 mm od jeho pravé hrany (x = 7970) → zapadne do rohu
    expect(r2.delta.x).toBeCloseTo(2970);
    expect(r2.delta.y).toBeCloseTo(-20);
  });
});

describe('tabulka: posouvaný prvek × přichycení k líci stěny (přání uživatele 2026-11-20 – i kresba)', () => {
  beforeEach(() => store.openProject(createProject({ name: 't' })));
  const f = () => store.floor()!;
  /** Stěna podél osy x; vrací y spodního líce (strana bez těla nebo s tělem – bere se ten, ke kterému je prvek blíž). */
  const wall = () => {
    const w = addWall({ x: -5000, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    return Math.max(...wallBodies(f()).get(w)!.poly.map(p => p.y));
  };
  /** Posun prvku 40 mm od líce (pod ním); po přichycení má jeho nejbližší bod / hrana ležet na líci. */
  const snapsTo = (items: { kind: string; id: string }[], face: number) => {
    const g = movingGeom(f(), items)!;
    expect(g).toBeTruthy();
    const top = Math.min(...g.pts.map(p => p.y), ...g.segs.flat().map(p => p.y));
    const r = snapMove(g, moveSnapTargets(f(), items), { x: 0, y: face + 40 - top }, 100);
    expect(r.snapped).toBe(true);
    expect(r.delta.y).toBeCloseTo(face - top);
  };
  const CASES: Record<string, () => { kind: string; id: string }[]> = {
    schodiště: () => [{ kind: 'stair', id: addStair({ x: 0, y: 2000 }, { x: 1000, y: 5000 })! }],
    čára: () => [{ kind: 'drawing', id: addDrawLine({ x: 0, y: 2000 }, { x: 2000, y: 2000 })! }],
    obdélník: () => [{ kind: 'drawing', id: addDrawRect({ x: 0, y: 2000 }, { x: 2000, y: 3000 })! }],
    'dvojitá čára': () => [{ kind: 'drawing', id: addDrawDouble({ x: 0, y: 2000 }, { x: 2000, y: 2000 }, 250, 1)! }],
    'kruh (body)': () => [{ kind: 'drawing', id: addDrawCircle({ x: 0, y: 3000 }, 500)! }],
    'oblouk (body)': () => [{ kind: 'drawing', id: addDrawArc({ x: 0, y: 2000 }, { x: 2000, y: 2000 }, -400)! }],
    'ruční tah (tvar Pera)': () => [{ kind: 'stroke', id: addStroke([{ x: 0, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }], 25)! }],
    'skupina kresba + schodiště + text': () => [
      { kind: 'drawing', id: addDrawLine({ x: 0, y: 2000 }, { x: 2000, y: 2000 })! },
      { kind: 'stair', id: addStair({ x: 3000, y: 2500 }, { x: 4000, y: 5500 })! },
      { kind: 'text', id: addText({ x: 0, y: 4000 })! }
    ]
  };
  it.each(Object.keys(CASES))('%s', name => {
    const face = wall();
    snapsTo(CASES[name]!(), face);
  });

  it('skupina se stěnou se nepřichytává (stěny mají vlastní pravidla); tah od ruky dává jen konce', () => {
    const w = addWall({ x: 0, y: 5000 }, null, { x: 1000, y: 5000 }, null, false, { thickness: 100, side: 1 })!;
    const d = addDrawLine({ x: 0, y: 2000 }, { x: 2000, y: 2000 })!;
    expect(movingGeom(f(), [{ kind: 'drawing', id: d }, { kind: 'wall', id: w }])).toBeNull();
    const free = Array.from({ length: 50 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 5) * 20 }));
    const sk = addStroke(free, 25)!;
    const g = movingGeom(f(), [{ kind: 'stroke', id: sk }])!;
    expect(g.segs).toHaveLength(0);
    expect(g.pts).toHaveLength(2);
  });

  it('cíle: stěna bez tloušťky, ruční tah; posouvané prvky cílem nejsou', () => {
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 0, side: 1 });
    const st = addStroke([{ x: 0, y: -2000 }, { x: 3000, y: -2000 }], 25)!;
    const d = addDrawLine({ x: 0, y: 1000 }, { x: 3000, y: 1000 })!;
    const t = moveSnapTargets(f(), [{ kind: 'drawing', id: d }]);
    const has = (y: number) => t.segs.some(([a, b]) => Math.abs(a.y - y) < 1e-6 && Math.abs(b.y - y) < 1e-6);
    expect(has(0)).toBe(true);
    expect(has(-2000)).toBe(true);
    expect(has(1000)).toBe(false);
    expect(moveSnapTargets(f(), [{ kind: 'stroke', id: st }]).segs.some(([a]) => a.y === -2000)).toBe(false);
  });
});
