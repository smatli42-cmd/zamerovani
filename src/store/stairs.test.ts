/**
 * Schodiště – 2D značka (core/stairs.ts, store/actions/stairs.ts, rozhodnutí uživatele 2026-11-19: žádné 3D,
 * výška a počet stupňů jen v panelu). Osa Y míří dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Floor, Pt, Stair } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { arrowPath, flightLength, stairLabel, stepHeight, totalSteps, treadDepth, treadLines } from '../core/stairs';
import { selectInRect } from '../core/rectSelect';
import { migrateProject } from '../persistence/migrate';
import { pickAny } from '../tools/pick';
import { stairTool } from '../tools/stairTool';
import { selectTool } from '../tools/selectTool';
import type { PointerInput, Tool } from '../tools/types';
import {
  addDrawLine,
  addDrawRect,
  addStair,
  addStairFlight,
  addWall,
  applyNumpadValue,
  deleteSelection,
  drawingToStair,
  duplicateSelection,
  flipStairDirection,
  groupOrigin,
  moveGroup,
  removeStairFlight,
  rotateSelection,
  setDimLock,
  setFlightSteps,
  setStairTurn,
  turnStairAxis,
  updateStair
} from './actions';
import { allHitBoxes, resetHitBoxes } from '../canvas/hitTargets';
import { drawStairs } from '../canvas/drawStairs';
import { store } from './store';

const f = (): Floor => store.floor()!;
const stairs = () => Object.values(f().stairs ?? {});
const st = (id: string): Stair => f().stairs![id]!;
const Z = 0.2;
const at = (p: Pt): PointerInput => ({ world: p, screen: { x: p.x * Z, y: p.y * Z }, device: 'pen' });
const near = (p: Pt, q: Pt) => {
  expect(p.x).toBeCloseTo(q.x, 3);
  expect(p.y).toBeCloseTo(q.y, 3);
};

function stroke(tool: Tool, pts: Pt[]) {
  tool.down?.(at(pts[0]!));
  for (const p of pts.slice(1)) tool.drag?.(at(p));
  tool.up?.(at(pts[pts.length - 1]!));
}

/** Přímé schodiště 3000 × 1000 vodorovně, první stupeň vlevo. */
const straight = () => addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'stair' });
});

describe('přímé schodiště', () => {
  it('nástroj: tažení z rohu do rohu = rameno podél delší strany, první stupeň na straně začátku', () => {
    stroke(stairTool, [{ x: 0, y: 3000 }, { x: 500, y: 1500 }, { x: 1200, y: 0 }]);
    const s = stairs()[0]!;
    const fl = s.flights[0]!;
    near(fl.a, { x: 600, y: 3000 });
    near(fl.b, { x: 600, y: 0 });
    expect(fl.width).toBe(1200);
    expect(store.get().selection).toEqual({ kind: 'stair', id: s.id });
  });

  it('výchozí počet stoupání podle délky (cca 270 mm), nášlapů N − 1', () => {
    const id = straight();
    const s = st(id);
    expect(s.flights[0]!.steps).toBe(12);
    expect(treadLines(s)).toHaveLength(10); // N − 1 nášlapů = N − 2 vnitřních čar
    expect(treadDepth(s, s.flights[0]!)).toBeCloseTo(3000 / 11);
  });

  it('výška a počet stupňů jen ve vlastnostech: výška stupně se dopočítá, popisek N × v/š', () => {
    const id = straight();
    setFlightSteps(id, st(id).flights[0]!.id, 16);
    expect(stepHeight(st(id))).toBeNull();
    expect(stairLabel(st(id))).toBe('16 st. / 200');
    updateStair(id, { height: 2800 });
    expect(stepHeight(st(id))).toBeCloseTo(175);
    expect(stairLabel(st(id))).toBe('16 × 175/200');
    // změna N přepočítá v i š, rozměry ramene se nemění
    setFlightSteps(id, st(id).flights[0]!.id, 11);
    expect(stairLabel(st(id))).toBe('11 × 255/300');
    expect(flightLength(st(id).flights[0]!)).toBe(3000);
    // smazání výšky
    updateStair(id, { height: undefined });
    expect(st(id).height).toBeUndefined();
  });

  it('N = 2: jeden nášlap, žádná vnitřní čára; méně než 2 stoupání nejde', () => {
    const id = straight();
    const fid = st(id).flights[0]!.id;
    setFlightSteps(id, fid, 2);
    expect(treadLines(st(id))).toHaveLength(0);
    expect(treadDepth(st(id), st(id).flights[0]!)).toBe(3000);
    setFlightSteps(id, fid, 1);
    expect(st(id).flights[0]!.steps).toBe(2);
  });

  it('šipka od prvního stupně k výstupu; přepnutí směru jen otočí šipku', () => {
    const id = straight();
    const before = JSON.stringify(st(id).flights);
    expect(arrowPath(st(id))[0]).toEqual({ x: 0, y: 500 });
    flipStairDirection(id);
    expect(arrowPath(st(id))[0]).toEqual({ x: 3000, y: 500 });
    expect(JSON.stringify(st(id).flights)).toBe(before);
    flipStairDirection(id);
    expect(st(id).reverse).toBeUndefined();
  });

  it('kóta délky / šířky ramene mění jen schodiště; zámek kóty platí', () => {
    const w = addWall({ x: 0, y: -500 }, null, { x: 4000, y: -500 }, null, false, { thickness: 300, side: -1 })!;
    const walls = JSON.stringify(f().walls) + JSON.stringify(f().nodes);
    const id = straight();
    const fid = st(id).flights[0]!.id;
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'length' }, 3500)).toBe(true);
    near(st(id).flights[0]!.a, { x: 0, y: 500 });
    near(st(id).flights[0]!.b, { x: 3500, y: 500 });
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'width' }, 1100)).toBe(true);
    expect(st(id).flights[0]!.width).toBe(1100);
    expect(JSON.stringify(f().walls) + JSON.stringify(f().nodes)).toBe(walls);
    expect(f().walls[w]).toBeTruthy();
    // zamčená délka ramene: jiná úprava, která by ji změnila, se neprovede
    setDimLock({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'length' }, true);
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'length' }, 2000)).toBe(false);
    expect(flightLength(st(id).flights[0]!)).toBeCloseTo(3500);
    // příliš malé rozměry se neprovedou
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: fid, dim: 'width' }, 50)).toBe(false);
  });
});

describe('L a U schodiště (podesta + další rameno)', () => {
  it('L vlevo: čtvercová podesta za koncem, rameno z jejího boku doleva (osa y dolů = nahoru)', () => {
    const id = straight();
    addStairFlight(id, 'left');
    const s = st(id);
    expect(s.flights).toHaveLength(2);
    expect(s.landings).toHaveLength(1);
    const [, f2] = s.flights;
    near(f2!.a, { x: 3500, y: 0 });
    near(f2!.b, { x: 3500, y: -3000 });
    expect(s.landings[0]!.pts).toHaveLength(4);
    near(s.landings[0]!.pts[2]!, { x: 4000, y: 0 });
    expect(totalSteps(s)).toBe(24);
    // šipka prochází podestou
    expect(arrowPath(s)).toHaveLength(5);
  });

  it('L vpravo a U: rameno vedle předchozího opačným směrem, podesta přes obě ramena', () => {
    const id = straight();
    addStairFlight(id, 'right');
    near(st(id).flights[1]!.a, { x: 3500, y: 1000 });
    const fid = st(id).flights[1]!.id;
    setStairTurn(id, fid, 'u-right');
    const f2 = st(id).flights[1]!;
    near(f2.a, { x: 3000, y: 1500 });
    near(f2.b, { x: 0, y: 1500 });
    const xs = st(id).landings[0]!.pts.map(p => p.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(2000);
    // ID zůstanou stabilní
    expect(st(id).flights[1]!.id).toBe(fid);
  });

  it('kóta 1. ramene posune navazující podestu a rameno; hloubka podesty jde zadat', () => {
    const id = straight();
    addStairFlight(id, 'left');
    const [f1, f2] = st(id).flights;
    applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f1!.id, dim: 'length' }, 2500);
    near(st(id).flights[1]!.a, { x: 3000, y: 0 });
    applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f2!.id, dim: 'depth' }, 1500);
    near(st(id).flights[1]!.a, { x: 3250, y: 0 });
    near(st(id).landings[0]!.pts[2]!, { x: 4000, y: 0 });
    removeStairFlight(id);
    expect(st(id).flights).toHaveLength(1);
    expect(st(id).landings).toHaveLength(0);
  });
});

describe('ruční obrys', () => {
  it('uzavřený tvar kresby se označí jako schodiště: nášlapy rovnoměrně podél osy, osa jde otočit', () => {
    const d = addDrawRect({ x: 0, y: 0 }, { x: 1000, y: 2700 });
    const id = drawingToStair(d)!;
    const s = st(id);
    expect(f().drawings?.[d]).toBeUndefined();
    expect(s.outline).toHaveLength(4);
    expect(s.flights[0]!.steps).toBe(11);
    const lines = treadLines(s);
    expect(lines).toHaveLength(9);
    expect(lines[0]![0].y).toBeCloseTo(270);
    updateStair(id, { manualTreads: true });
    expect(treadLines(st(id))).toHaveLength(0);
  });

  it('lomená uzavřená čára (L tvar) – nášlapy oříznuté obrysem; otevřená čára nejde', () => {
    const open = addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    expect(drawingToStair(open)).toBeNull();
    const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }];
    store.edit(fl => void ((fl.drawings ??= {}).L = { id: 'L', shape: 'line', pts, closed: true }));
    const id = drawingToStair('L')!;
    expect(st(id).outline).toHaveLength(6);
    for (const [p, q] of treadLines(st(id))) expect(Math.abs(p.x - q.x) + Math.abs(p.y - q.y)).toBeLessThanOrEqual(2000.001);
  });
});

describe('průřezová pravidla (core/looseElements.ts)', () => {
  it('výběr ťuknutím, výběr obdélníkem (okno / křížení)', () => {
    const id = straight();
    expect(pickAny(f(), { x: 1500, y: 300 }, store.get().camera)).toEqual({ kind: 'stair', id });
    expect(selectInRect(f(), { x1: -10, y1: -10, x2: 3010, y2: 1010 }, false)).toContainEqual({ kind: 'stair', id });
    expect(selectInRect(f(), { x1: -10, y1: -10, x2: 2000, y2: 1010 }, false)).not.toContainEqual({ kind: 'stair', id });
    expect(selectInRect(f(), { x1: 2900, y1: 400, x2: 3100, y2: 600 }, true)).toContainEqual({ kind: 'stair', id });
  });

  it('tažení vybraného schodiště za osu (šipku) ho posune celé (jeden krok Zpět)', () => {
    const id = straight();
    store.set({ tool: 'select', selection: { kind: 'stair', id } });
    stroke(selectTool, [{ x: 1500, y: 500 }, { x: 1700, y: 800 }, { x: 2500, y: 1500 }]);
    near(st(id).flights[0]!.a, { x: 1000, y: 1500 });
    store.undo();
    near(st(id).flights[0]!.a, { x: 0, y: 500 });
  });

  it('posun a otočení skupiny, kopie (nová ID), mazání, Zpět / Vpřed', () => {
    const id = straight();
    addStairFlight(id, 'left');
    moveGroup(groupOrigin(f(), [{ kind: 'stair', id }]), 100, 200);
    near(st(id).flights[0]!.a, { x: 100, y: 700 });
    near(st(id).landings[0]!.pts[2]!, { x: 4100, y: 200 });
    store.set({ selection: { kind: 'stair', id } });
    rotateSelection(90);
    const s = st(id);
    expect(s.flights[0]!.width).toBe(1000);
    expect(flightLength(s.flights[0]!)).toBeCloseTo(3000);
    store.set({ selection: { kind: 'stair', id } });
    duplicateSelection();
    expect(stairs()).toHaveLength(2);
    const copy = stairs().find(x => x.id !== id)!;
    expect(copy.flights[0]!.id).not.toBe(s.flights[0]!.id);
    expect(copy.landings[0]!.id).not.toBe(s.landings[0]!.id);
    near(copy.flights[0]!.a, { x: s.flights[0]!.a.x + 300, y: s.flights[0]!.a.y + 300 });
    store.set({ selection: { kind: 'stair', id } });
    deleteSelection();
    expect(f().stairs?.[id]).toBeUndefined();
    store.undo();
    expect(f().stairs?.[id]).toBeTruthy();
    store.redo();
    expect(f().stairs?.[id]).toBeUndefined();
  });

  it('schodiště nemá vazbu na stěny: posun stěny schodiště nemění', () => {
    const w = addWall({ x: 0, y: -300 }, null, { x: 4000, y: -300 }, null, false, { thickness: 300, side: -1 })!;
    const id = straight();
    const before = JSON.stringify(st(id));
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: w }]), 0, -500);
    expect(JSON.stringify(st(id))).toBe(before);
  });
});

describe('doplnění po kontrole', () => {
  it('klikací je jen hrot šipky vybraného schodiště', () => {
    const id = straight();
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k === 'measureText' ? (x: string) => ({ width: x.length * 7 }) : k in t ? t[k] : () => {}),
      set: (t, k, v) => ((t[k] = v), true)
    }) as unknown as CanvasRenderingContext2D;
    const cam = { x: 0, y: 0, zoom: Z };
    resetHitBoxes();
    drawStairs(ctx, f(), cam, null, null);
    expect(allHitBoxes().filter(b => b.action.type === 'flipStair')).toHaveLength(0);
    drawStairs(ctx, f(), cam, { kind: 'stair', id }, null);
    const boxes = allHitBoxes().filter(b => b.action.type === 'flipStair');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x).toBeCloseTo(3000 * Z);
    expect(boxes[0]!.halfW).toBeLessThanOrEqual(14);
  });

  it('ruční obrys pootočeného obdélníku: osa podél nejdelší hrany, o 90° otočí osu', () => {
    const c = Math.SQRT1_2;
    const R = (x: number, y: number) => ({ x: x * c - y * c, y: x * c + y * c });
    const pts = [R(0, 0), R(2700, 0), R(2700, 1000), R(0, 1000)];
    store.edit(fl => void ((fl.drawings ??= {}).T = { id: 'T', shape: 'line', pts, closed: true }));
    const id = drawingToStair('T')!;
    const f0 = st(id).flights[0]!;
    expect(flightLength(f0)).toBeCloseTo(2700);
    expect(f0.width).toBeCloseTo(1000);
    // nášlapy kolmo k ose, celé uvnitř obrysu (délka = šířka)
    for (const [p, q] of treadLines(st(id))) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(1000);
    turnStairAxis(id);
    expect(flightLength(st(id).flights[0]!)).toBeCloseTo(1000);
    turnStairAxis(id);
    expect(flightLength(st(id).flights[0]!)).toBeCloseTo(2700);
  });

  it('podesta L nesmí být mělčí než šířka navazujícího ramene', () => {
    const id = straight();
    addStairFlight(id, 'left');
    const f2 = st(id).flights[1]!;
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f2.id, dim: 'depth' }, 800)).toBe(false);
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f2.id, dim: 'depth' }, 1200)).toBe(true);
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f2.id, dim: 'width' }, 1300)).toBe(false);
    // u U podesty hloubka menší než šířka jde
    setStairTurn(id, f2.id, 'u-left');
    expect(applyNumpadValue({ kind: 'stair-dim', stairId: id, flightId: f2.id, dim: 'depth' }, 800)).toBe(true);
  });

  it('kopie schodiště přenese posunutá čísla jeho kót', () => {
    const id = straight();
    const fid = st(id).flights[0]!.id;
    const owner = { kind: 'stair-dim' as const, stairId: id, flightId: fid, dim: 'length' as const };
    store.edit(fl => void ((fl.dimPlace ??= {})[`stair-dim:${id}:${fid}:length`] = { off: 500, owner }));
    store.set({ selection: { kind: 'stair', id } });
    duplicateSelection();
    const copy = stairs().find(x => x.id !== id)!;
    expect(f().dimPlace?.[`stair-dim:${copy.id}:${copy.flights[0]!.id}:length`]?.off).toBe(500);
  });
});

describe('uložení a migrace', () => {
  it('starý projekt bez schodišť se načte; schodiště přežije migraci (záloha JSON)', () => {
    const p = migrateProject({ schema: 24, id: 'p', floors: [{ id: 'f', name: 'P', nodes: {}, walls: {}, openings: {}, rooms: {}, texts: {} }] });
    expect(p.schema).toBe(SCHEMA_VERSION);
    expect(p.floors[0]!.stairs).toBeUndefined();
    const id = straight();
    const saved = JSON.parse(JSON.stringify(store.get().project));
    const back = migrateProject(saved);
    expect(back.floors[0]!.stairs?.[id]).toEqual(st(id));
  });
});
