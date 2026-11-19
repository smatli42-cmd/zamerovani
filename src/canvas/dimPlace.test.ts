/**
 * Posun kót tažením za číslo (rozhodnutí uživatele 2026-11-18, core/dimPlace.ts) – průřezové pravidlo pro všechny
 * druhy kót: každá klikací kóta jde chytit, kolmý posun se týká celé řady (řetěz otvorů, řada napojení, řetěz výstupku,
 * řada po líci výstupku na konci), posun čísla podél jen té kóty; jeden krok Zpět; poloha zaniká s prvkem.
 * Kreslí se do náhradního plátna a měří se polohy klikacích čísel. Osa Y dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { dimKey, type DimTarget } from '../core/dimLock';
import { cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endProtrusionsOf } from '../core/endProtrusion';
import { dist } from '../core/geometry';
import { addStair, addStairFlight, addFreeDim, addLine, addOpening, addWall, beginDimDrag, deleteSelection, dragDim, setRevealEnabled } from '../store/actions';
import { frameOutside } from '../core/floorQueries';
import { store, type Selection } from '../store/store';
import { allHitBoxes, resetHitBoxes, type HitBox } from './hitTargets';
import { drawDimLine, flushDimLabels, setDimLockContext, setDimPlaceContext } from './dimLine';
import { drawBodyDims, drawDims, drawProtrusionDims } from './drawDims';
import { drawComponentDims } from './drawComponentDims';
import { drawCornerEndDims } from './drawCornerEndDims';
import { drawFreeDims } from './drawFreeDims';
import { drawStairDims } from './drawStairs';

const f = () => store.floor()!;
const ZOOM = 0.1;
const cam = { x: 0, y: 0, zoom: ZOOM };

/** Náhradní plátno: všechno nic nedělá, šířka textu = 7 px na znak. */
const ctx = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 7 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => {
    t[k] = v;
    return true;
  }
}) as unknown as CanvasRenderingContext2D;

/** Vykreslí všechny kóty (jako renderer) a vrátí klikací čísla kót. */
function render(selection: Selection = null): HitBox[] {
  resetHitBoxes();
  const floor = f();
  setDimLockContext(floor.dimLocks, null, true);
  setDimPlaceContext(floor.dimPlace, ZOOM);
  drawDims(ctx, floor, cam, 1, selection);
  drawComponentDims(ctx, floor, cam, 1, selection);
  drawBodyDims(ctx, floor, cam, 1, selection);
  drawProtrusionDims(ctx, floor, cam, 1, selection);
  drawCornerEndDims(ctx, floor, cam, 1, selection);
  drawFreeDims(ctx, floor, cam, 1, selection, null);
  drawStairDims(ctx, floor, cam, 1, selection);
  flushDimLabels();
  return allHitBoxes().filter(b => b.action.type === 'numpad');
}

const keyOf = (b: HitBox) => (b.action.type === 'numpad' && b.action.target.kind !== 'field' ? dimKey(b.action.target) : '');
const box = (boxes: HitBox[], key: string) => boxes.find(b => keyOf(b) === key)!;

/** Táhne číslem kóty o (dx, dy) px jako pero (jeden krok Zpět). */
function drag(b: HitBox, dx: number, dy: number): void {
  const d = b.drag!;
  const start = beginDimDrag(d)!;
  store.beginGesture();
  dragDim(d, start, (dx * d.out.x + dy * d.out.y) / ZOOM, (dx * d.u.x + dy * d.u.y) / ZOOM, 8 / ZOOM);
  store.endGesture();
}

/** Posune číslo `key` kolmo o 30 px a ověří, že se posunulo právě o 30 px ve směru „ven“. Vrací posun ostatních čísel. */
function checkPerp(selection: Selection, key: string): Map<string, number> {
  const before = render(selection);
  const b = box(before, key);
  expect(b, key).toBeDefined();
  expect(b.drag, key).toBeDefined();
  drag(b, b.drag!.out.x * 30, b.drag!.out.y * 30);
  const after = render(selection);
  const moved = new Map<string, number>();
  for (const o of before) {
    const a = box(after, keyOf(o));
    if (a) moved.set(keyOf(o), dist(o, a));
  }
  const nb = box(after, key);
  expect(nb.x - b.x, key).toBeCloseTo(b.drag!.out.x * 30, 0);
  expect(nb.y - b.y, key).toBeCloseTo(b.drag!.out.y * 30, 0);
  return moved;
}

/** Posune číslo `key` podél kóty o 40 px; ostatní čísla se nehnou. */
function checkAlong(selection: Selection, key: string): void {
  const before = render(selection);
  const b = box(before, key);
  drag(b, b.drag!.u.x * 40, b.drag!.u.y * 40);
  const after = render(selection);
  const nb = box(after, key);
  expect(nb.x - b.x, key).toBeCloseTo(b.drag!.u.x * 40, 0);
  expect(nb.y - b.y, key).toBeCloseTo(b.drag!.u.y * 40, 0);
  for (const o of before) if (keyOf(o) !== key) expect(dist(o, box(after, keyOf(o))), keyOf(o)).toBeLessThan(0.01);
}

const C: Pt[] = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }];
const wallBy = (i: number) => Object.values(f().walls).find(w => dist(f().nodes[w.a]!, C[i]!) < 1 && dist(f().nodes[w.b]!, C[(i + 1) % 4]!) < 1)!;

/** Místnost 5000 × 5000, okno s ostěním na pravé stěně, příčka napojená do horní stěny. */
function room() {
  store.openProject(createProject({ name: 't' }));
  for (let i = 0; i < 4; i++) addWall(C[i]!, null, C[(i + 1) % 4]!, null, false, { thickness: 300, side: -1 });
  const right = wallBy(1);
  const op = addOpening(right.id, 'window', 0.5)!;
  setRevealEnabled(op, true);
  addWall({ x: 2500, y: 0 }, null, { x: 2500, y: 2000 }, null, false, { thickness: 100, side: 1 });
  return { right, top: wallBy(0), op };
}

beforeEach(() => store.openProject(createProject({ name: 't' })));

describe('posun kóty tažením za číslo – každý druh kóty', () => {
  it('délka stěny: kolmo jen ona, podél jen ona; jeden krok Zpět', () => {
    const { right } = room();
    const key = `wall-length:${right.id}`;
    const moved = checkPerp(null, key);
    for (const [k, d] of moved) if (k !== key) expect(d, k).toBeLessThan(0.01);
    expect(store.get().canUndo).toBe(true);
    store.undo();
    expect(f().dimPlace).toBeUndefined();
    checkAlong(null, key);
  });

  it('řetězová kóta otvorů: kolmo celá řada, ostatní řady stojí; číslo podél jen jedno', () => {
    const { right, op } = room();
    const moved = checkPerp(null, `opening-width:${op}`);
    for (const k of [`opening-offset:${op}:a`, `opening-offset:${op}:b`, `opening-reveal:${op}:left`, `opening-reveal:${op}:right`])
      expect(moved.get(k), k).toBeCloseTo(30, 0);
    expect(moved.get(`wall-length:${right.id}`)).toBeLessThan(0.01);
    checkAlong(null, `opening-offset:${op}:a`);
  });

  it('řada napojení (příčka v T): kolmo celá řada', () => {
    const { top } = room();
    const keys = render().map(keyOf).filter(k => k.startsWith(`junction-gap:${top.id}`));
    expect(keys).toHaveLength(2);
    const moved = checkPerp(null, keys[0]!);
    expect(moved.get(keys[1]!)).toBeCloseTo(30, 0);
    expect(moved.get(`wall-length:${top.id}`)).toBeLessThan(0.01);
    checkAlong(null, keys[1]!);
  });

  it('tloušťka stěny a hloubky ostění (vybraný prvek)', () => {
    const { right, op } = room();
    checkPerp({ kind: 'wall', id: right.id }, `wall-thickness:${right.id}`);
    checkAlong({ kind: 'wall', id: right.id }, `wall-thickness:${right.id}`);
    const depthKey = render({ kind: 'opening', id: op }).map(keyOf).find(k => k.startsWith(`opening-reveal:${op}:depth`))!;
    checkPerp({ kind: 'opening', id: op }, depthKey);
  });

  it('míry líců stěny s osou uprostřed', () => {
    const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, axis: 'center' })!;
    const sel: Selection = { kind: 'wall', id: W };
    checkPerp(sel, `wall-face-length:${W}:0`);
    checkAlong(sel, `wall-face-length:${W}:1`);
  });

  it('vzepětí obloukové stěny', () => {
    const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1, sagitta: 1000 })!;
    checkPerp(null, `wall-sagitta:${W}`);
    checkAlong(null, `wall-sagitta:${W}`);
  });

  it('průměr kruhu (stará data)', () => {
    const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 0 })!;
    store.edit(fl => {
      const w = fl.walls[W]!;
      w.b = w.a;
      w.radius = 1000;
    });
    checkPerp(null, `circle-diameter:${W}`);
    checkAlong(null, `circle-diameter:${W}`);
  });

  it('odstup skupiny stěn (sloupu)', () => {
    room();
    const col = addWall({ x: 3000, y: 1400 }, null, { x: 3400, y: 1400 }, null, false, { thickness: 0 })!;
    addWall({ x: 3400, y: 1400 }, null, { x: 3400, y: 1600 }, null, false, { thickness: 0 });
    addWall({ x: 3400, y: 1600 }, null, { x: 3000, y: 1600 }, null, false, { thickness: 0 });
    addWall({ x: 3000, y: 1600 }, null, { x: 3000, y: 1400 }, null, false, { thickness: 0 });
    const sel: Selection = { kind: 'wall', id: col };
    const key = render(sel).map(keyOf).find(k => k.startsWith(`comp-gap:${col}`))!;
    expect(key).toBeDefined();
    checkPerp(sel, key);
    checkAlong(sel, key);
  });

  it('výstupek na stěně: řetěz (před – šířka – za) celý, hloubka sama, vzepětí oblouku v obrysu', () => {
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    const pts: Pt[] = [{ x: 500, y: 0 }, { x: 500, y: -200 }, { x: 800, y: -200 }, { x: 800, y: 0 }];
    for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    const p = Object.values(f().protrusions!)[0]!;
    const sel: Selection = { kind: 'protrusion', id: p.id };
    const moved = checkPerp(sel, `protrusion-dim:${p.id}:width`);
    expect(moved.get(`protrusion-dim:${p.id}:before`)).toBeCloseTo(30, 0);
    expect(moved.get(`protrusion-dim:${p.id}:after`)).toBeCloseTo(30, 0);
    expect(moved.get(`protrusion-dim:${p.id}:depth`)).toBeLessThan(0.01);
    checkPerp(sel, `protrusion-dim:${p.id}:depth`);
    checkAlong(sel, `protrusion-dim:${p.id}:before`);
    store.edit(fl => {
      fl.protrusions![p.id]!.pts[1]!.s = 80;
    });
    checkPerp(sel, `protrusion-sagitta:${p.id}:1`);
  });

  it('výstupek v rohu: kóta podél 1. i 2. stěny', () => {
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
    const pts: Pt[] = [{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }];
    for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    const cp = cornerProtrusionsOf(f())[0]!;
    const sel: Selection = { kind: 'protrusion', id: cp.id };
    const moved = checkPerp(sel, `corner-dim:${cp.id}:a`);
    expect(moved.get(`corner-dim:${cp.id}:b`)).toBeLessThan(0.01);
    checkAlong(sel, `corner-dim:${cp.id}:b`);
  });

  it('výstupek na konci stěny: přesah + podél líce jedna řada, ostatní samy', () => {
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 });
    const pts: Pt[] = [{ x: 2600, y: 0 }, { x: 2600, y: -200 }, { x: 3200, y: -200 }, { x: 3200, y: 500 }, { x: 2600, y: 500 }, { x: 2600, y: 300 }];
    for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    const ep = endProtrusionsOf(f())[0]!;
    const sel: Selection = { kind: 'protrusion', id: ep.id };
    const moved = checkPerp(sel, `end-dim:${ep.id}:over`);
    expect(moved.get(`end-dim:${ep.id}:along0`)).toBeCloseTo(30, 0);
    expect(moved.get(`end-dim:${ep.id}:along1`)).toBeLessThan(0.01);
    expect(moved.get(`end-dim:${ep.id}:depth0`)).toBeLessThan(0.01);
    checkPerp(sel, `end-dim:${ep.id}:along1`);
    checkPerp(sel, `end-dim:${ep.id}:depth1`);
    checkAlong(sel, `end-dim:${ep.id}:over`);
  });

  it('volná kóta: kolmý posun mění její odsazení (i přes nulu na druhou stranu), číslo podél', () => {
    const id = addFreeDim({ x: 0, y: 0 }, { x: 3000, y: 0 }, 500)!;
    const key = `free-dim:${id}`;
    checkPerp(null, key);
    expect(f().dims![id]!.offset).toBe(800);
    expect(f().dimPlace).toBeUndefined();
    const b = box(render(), key);
    drag(b, -b.drag!.out.x * 130, -b.drag!.out.y * 130);
    expect(f().dims![id]!.offset).toBe(-500);
    checkAlong(null, key);
    expect(f().dimPlace?.[key]?.along).toBe(400);
  });
});

describe('kóty schodiště (jen u vybraného)', () => {
  it('délka a šířka ramene, hloubka podesty: kolmo i podél každá sama; bez výběru se nekreslí', () => {
    const id = addStair({ x: 0, y: 0 }, { x: 3000, y: 1000 })!;
    addStairFlight(id, 'left');
    expect(render(null)).toHaveLength(0);
    const sel: Selection = { kind: 'stair', id };
    const [f1, f2] = f().stairs![id]!.flights;
    const keys = [`stair-dim:${id}:${f1!.id}:length`, `stair-dim:${id}:${f1!.id}:width`, `stair-dim:${id}:${f2!.id}:depth`];
    for (const key of keys) {
      const moved = checkPerp(sel, key);
      for (const [k, d] of moved) if (k !== key) expect(d, k).toBeLessThan(0.01);
      checkAlong(sel, key);
    }
  });
});

describe('posun kóty – společná pravidla', () => {
  it('blízko výchozí polohy se kóta vrátí na výchozí (záznam zmizí)', () => {
    const { right } = room();
    const key = `wall-length:${right.id}`;
    const b = box(render(), key);
    drag(b, b.drag!.out.x * 5, b.drag!.out.y * 5);
    expect(f().dimPlace).toBeUndefined();
  });

  it('kóta na druhou stranu stěny: vynášecí čáry vedou dál od měřených bodů (záporné odsazení)', () => {
    const { right } = room();
    const key = `wall-length:${right.id}`;
    const b = box(render(), key);
    drag(b, -b.drag!.out.x * 200, -b.drag!.out.y * 200);
    expect(f().dimPlace![key]!.off).toBe(-2000);
    const nb = box(render(), key);
    // číslo je uvnitř místnosti (pravá stěna x = 5000, ven = +x)
    expect(nb.x / ZOOM).toBeLessThan(5000);
  });

  it('poloha kóty zaniká se svým prvkem', () => {
    const { op } = room();
    const t: DimTarget = { kind: 'opening-width', openingId: op };
    const b = box(render(), dimKey(t));
    drag(b, b.drag!.u.x * 40, b.drag!.u.y * 40);
    expect(f().dimPlace?.[dimKey(t)]).toBeDefined();
    store.set({ selection: { kind: 'opening', id: op } });
    deleteSelection();
    expect(f().dimPlace?.[dimKey(t)]).toBeUndefined();
  });

  it('zárubeň dveří vlevo a vpravo: číslo podél se posune jen u tažené', () => {
    const W = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const d = addOpening(W, 'door', 0.5)!;
    expect(frameOutside(f().openings[d]!)).toBeGreaterThan(0);
    const before = render().filter(b => keyOf(b) === `opening-reveal:${d}:frameWidth`);
    expect(before).toHaveLength(2);
    const b = before[0]!;
    drag(b, b.drag!.u.x * 40, b.drag!.u.y * 40);
    const after = render().filter(x => keyOf(x) === `opening-reveal:${d}:frameWidth`);
    expect(dist(after[0]!, before[0]!)).toBeCloseTo(40, 0);
    expect(dist(after[1]!, before[1]!)).toBeLessThan(0.01);
  });

  it('volná kóta: odsazení se k nule nepřichytí (kóta nespadne na měřené body)', () => {
    const id = addFreeDim({ x: 0, y: 0 }, { x: 3000, y: 0 }, 300)!;
    const b = box(render(), `free-dim:${id}`);
    drag(b, -b.drag!.out.x * 25, -b.drag!.out.y * 25);
    expect(f().dims![id]!.offset).toBe(50);
  });

  it('přerušené tažení (druhý prst) se vrátí bez kroku Zpět', () => {
    const { right } = room();
    const b = box(render(), `wall-length:${right.id}`);
    const start = beginDimDrag(b.drag!)!;
    const undo = store.get().canUndo;
    store.beginGesture();
    dragDim(b.drag!, start, 3000, 0, 80);
    expect(f().dimPlace).toBeDefined();
    store.cancelGesture();
    expect(f().dimPlace).toBeUndefined();
    expect(store.get().canUndo).toBe(undo);
  });

  it('posun řetězu otvorů zanikne se smazáním posledního otvoru (nový otvor ho nezdědí)', () => {
    const { right, op } = room();
    const b = box(render(), `opening-width:${op}`);
    drag(b, b.drag!.out.x * 30, b.drag!.out.y * 30);
    expect(f().dimPlace?.[`row:openings:${right.id}`]).toBeDefined();
    store.set({ selection: { kind: 'opening', id: op } });
    deleteSelection();
    expect(f().dimPlace?.[`row:openings:${right.id}`]).toBeUndefined();
  });

  it('čísla kót se kreslí až po čarách všech kót (posunuté číslo na čáře sousední kóty je čitelné)', () => {
    const calls: string[] = [];
    const rec = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k === 'measureText' ? () => ({ width: 30 }) : k in t ? t[k] : () => calls.push(String(k))),
      set: (t, k, v) => {
        t[k] = v;
        return true;
      }
    }) as unknown as CanvasRenderingContext2D;
    const st = { color: '#000', bg: '#fff', bold: false };
    const act = { type: 'numpad' as const, target: { kind: 'wall-thickness' as const, wallId: 'w' } };
    drawDimLine(rec, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 1 }, 20, '100', undefined, st, 1, act);
    drawDimLine(rec, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 0, y: 1 }, 20, '200', undefined, st, 1, act);
    expect(calls).not.toContain('fillText');
    const lines = calls.length;
    flushDimLabels();
    const after = calls.slice(lines);
    expect(after.filter(c => c === 'fillText')).toHaveLength(2);
    expect(after).not.toContain('lineTo');
  });
});
