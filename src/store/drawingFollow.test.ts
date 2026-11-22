/**
 * Konec čáry kresby na líci stěny jede se stěnou (rozhodnutí uživatele 2026-11-22, core/drawingFollow.ts):
 * čára a dvojitá čára; tažení stěny / rohu, změna délky kótou / NumPadem, tloušťka. Obdélník, kruh, oblouk ne.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Id } from '../model/types';
import { wallFaceOffset } from '../core/floorQueries';
import { normal, unit } from '../core/geometry';
import { freeDimValue, setFreeDimLength } from '../core/freeDim';
import { elementLayer } from '../core/layers';
import { addFreeDim, addDrawDouble, addDrawLine, addDrawRect, addWall, applyWallLength, flipWallSide, groupOrigin, moveGroup, moveNode, setDimLock, setLayerLocked, setWallThickness } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const pts = (id: Id) => f().drawings![id]!.pts.map(p => ({ x: p.x, y: p.y }));

/** Svislá stěna x od y = 0 do 3000, tloušťka 300, `side` strana těla. */
const vwall = (x: number, side: 1 | -1) => addWall({ x, y: 0 }, null, { x, y: 3000 }, null, false, { thickness: 300, side })!;

/** Souřadnice x obou líců svislé stěny. */
function faceXs(wallId: Id): number[] {
  const w = f().walls[wallId]!;
  const a = f().nodes[w.a]!;
  const n = normal(unit(a, f().nodes[w.b]!));
  return ([1, -1] as const).map(s => a.x + n.x * wallFaceOffset(w, s));
}

/** Posun celé stěny tažením (jako nástroj Vybrat). */
function dragWall(wallId: Id, dx: number, dy: number): void {
  const o = groupOrigin(f(), [{ kind: 'wall', id: wallId }]);
  store.beginGesture();
  moveGroup(o, dx, dy);
  store.endGesture();
}

let left: Id;
let right: Id;
let xl: number;
let xr: number;

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  left = vwall(0, 1);
  right = vwall(4000, -1);
  // vnitřní líce (k sobě)
  xl = Math.max(...faceXs(left));
  xr = Math.min(...faceXs(right));
});

describe('konec čáry na líci jede se stěnou', () => {
  it('předpoklad: vnitřní líce 0 a 4000', () => {
    expect(xl).toBeCloseTo(0);
    expect(xr).toBeCloseTo(4000);
  });

  it('tažení stěny: čára mezi stěnami se prodlouží, druhý konec zůstane', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    dragWall(right, 500, 0);
    const p = pts(id);
    expect(p[0]).toEqual({ x: xl, y: 1500 });
    expect(p[1]!.x).toBeCloseTo(xr + 500);
    expect(p[1]!.y).toBeCloseTo(1500);
  });

  it('tažení stěny podél sebe: konec se nehne', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    dragWall(right, 0, 400);
    expect(pts(id)[1]).toEqual({ x: xr, y: 1500 });
  });

  it('šikmá čára: konec jede po přímce čáry (směr zůstane)', () => {
    const id = addDrawLine({ x: xl, y: 1000 }, { x: xr, y: 2000 })!;
    dragWall(right, 400, 0);
    const p = pts(id)[1]!;
    expect(p.x).toBeCloseTo(xr + 400);
    expect(p.y).toBeCloseTo(2100);
  });

  it('lomená čára: jede jen koncový bod', () => {
    const id = addDrawLine({ x: xl, y: 1000 }, { x: 2000, y: 1000 })!;
    store.edit(fl => {
      fl.drawings![id]!.pts.push({ x: 2000, y: 2000 }, { x: xr, y: 2000 });
    });
    dragWall(right, 300, 0);
    const p = pts(id);
    expect(p.slice(0, 3)).toEqual([{ x: xl, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }]);
    expect(p[3]!.x).toBeCloseTo(xr + 300);
  });

  it('tažení rohu (stěna se natočí): konec zůstane na novém líci', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    moveNode(f().walls[right]!.b, { x: 4600, y: 3000 });
    const q = pts(id)[1]!;
    expect(q.y).toBeCloseTo(1500);
    // líc stěny vede z (4000, 0) do (4600, 3000): v y = 1500 je x = 4300
    expect(q.x).toBeCloseTo(4300);
  });

  it('změna délky stěny NumPadem posune příčnou stěnu – konec čáry jede s ní', () => {
    // vodorovná stěna z rohu pravé stěny doleva dole: změna délky posune pravou stěnu
    const w = f().walls[right]!;
    const bottom = addWall({ x: 1000, y: 0 }, null, { x: 4000, y: 0 }, w.a, false, { thickness: 0 })!;
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    const end = f().walls[bottom]!.b;
    expect(applyWallLength(bottom, 3500, { nodeId: end })).toBe(true);
    const xs = faceXs(right);
    const q = pts(id)[1]!;
    expect(xs.some(x => Math.abs(x - q.x) < 0.01)).toBe(true);
    expect(q.x).not.toBeCloseTo(xr);
    expect(pts(id)[0]).toEqual({ x: xl, y: 1500 });
  });

  it('volná kóta mezi stěnami zadaná číslem posune stěnu – konec čáry jede s ní', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    const dim = addFreeDim({ wall: left, side: 1, at: 500 }, { wall: right, side: 1, at: 500 }, 300)!;
    expect(dim).toBeTruthy();
    expect(store.edit(fl => setFreeDimLength(fl, dim, 4600, 'b'))).toBe(true);
    expect(pts(id)[1]!.x).toBeCloseTo(Math.min(...faceXs(right)));
    expect(pts(id)[1]!.x).not.toBeCloseTo(xr);
  });

  it('tloušťka stěny: konec na líci, který se posune, jede s ním', () => {
    // pravá stěna má líc na čáře stěny (4000) uvnitř – vnější líc 4300 se změnou tloušťky posune
    const outer = Math.max(...faceXs(right));
    const id = addDrawLine({ x: outer, y: 1500 }, { x: 6000, y: 1500 })!;
    setWallThickness(right, 500);
    expect(pts(id)[0]!.x).toBeCloseTo(Math.max(...faceXs(right)));
    expect(pts(id)[0]!.x).toBeCloseTo(outer + 200);
    expect(pts(id)[1]).toEqual({ x: 6000, y: 1500 });
  });

  it('dvojitá čára jede se stěnou', () => {
    const id = addDrawDouble({ x: xl, y: 1500 }, { x: xr, y: 1500 }, 100, 1)!;
    dragWall(right, -500, 0);
    expect(pts(id)[1]!.x).toBeCloseTo(xr - 500);
    expect(pts(id)[0]!.x).toBeCloseTo(xl);
  });

  it('konec mimo líc (mezera) se nehne', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr - 50, y: 1500 })!;
    dragWall(right, 500, 0);
    expect(pts(id)[1]).toEqual({ x: xr - 50, y: 1500 });
  });

  it('obdélník se stěnou nejede (jen čára a dvojitá čára)', () => {
    const id = addDrawRect({ x: 2000, y: 1000 }, { x: xr, y: 2000 })!;
    const before = pts(id);
    dragWall(right, 500, 0);
    expect(pts(id)).toEqual(before);
  });

  it('posun stěny i s čárou (skupina): čára jede jen jako součást skupiny', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    const o = groupOrigin(f(), [{ kind: 'wall', id: right }, { kind: 'drawing', id }]);
    moveGroup(o, 300, 0);
    expect(pts(id)).toEqual([{ x: xl + 300, y: 1500 }, { x: xr + 300, y: 1500 }]);
  });

  it('čára, která by se obrátila, zůstane na místě', () => {
    const id = addDrawLine({ x: 3000, y: 1500 }, { x: xr, y: 1500 })!;
    dragWall(right, -1500, 0);
    expect(pts(id)).toEqual([{ x: 3000, y: 1500 }, { x: xr, y: 1500 }]);
  });

  it('Zpět vrátí stěnu i čáru jedním krokem', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    dragWall(right, 500, 0);
    store.undo();
    expect(pts(id)[1]).toEqual({ x: xr, y: 1500 });
  });

  it('čára ležící podél líce jede s lícem rovnoběžně', () => {
    const id = addDrawLine({ x: xr, y: 500 }, { x: xr, y: 2500 })!;
    dragWall(right, 250, 0);
    const p = pts(id);
    expect(p[0]!.x).toBeCloseTo(xr + 250);
    expect(p[1]!.x).toBeCloseTo(xr + 250);
    expect(p[0]!.y).toBeCloseTo(500);
    expect(p[1]!.y).toBeCloseTo(2500);
  });

  it('otočení strany stěny: konec jede s lícem na téže straně (nový vnitřní líc)', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    flipWallSide(right);
    const inner = Math.min(...faceXs(right));
    expect(inner).toBeCloseTo(xr - 300);
    expect(pts(id)[1]!.x).toBeCloseTo(inner);
  });

  it('při tažení stěna nesebere konec cizí čáry, přes který přejede', () => {
    const id = addDrawLine({ x: 4500, y: 1500 }, { x: 6000, y: 1500 })!;
    const o = groupOrigin(f(), [{ kind: 'wall', id: right }]);
    store.beginGesture();
    for (let dx = 1; dx <= 400; dx++) moveGroup(o, dx, 0, 1);
    store.endGesture();
    expect(Math.max(...faceXs(right))).toBeCloseTo(4700);
    expect(pts(id)).toEqual([{ x: 4500, y: 1500 }, { x: 6000, y: 1500 }]);
  });

  it('tažení po krocích: připojená čára jede celou dobu', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    const o = groupOrigin(f(), [{ kind: 'wall', id: right }]);
    store.beginGesture();
    for (let dx = 10; dx <= 600; dx += 10) moveGroup(o, dx, 0);
    store.endGesture();
    expect(pts(id)[1]!.x).toBeCloseTo(xr + 600);
  });

  it('čára skoro rovnoběžná s lícem (1°) se neprodlouží o metry – zůstane na místě', () => {
    const id = addDrawLine({ x: xr - 17.455, y: 500 }, { x: xr, y: 1500 })!;
    const before = pts(id);
    dragWall(right, 100, 0);
    expect(pts(id)).toEqual(before);
  });

  it('zamčená vrstva čáry: posun stěny se neprovede s hlášením (V2)', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    setLayerLocked(elementLayer(f(), 'drawing', id)!, true);
    const n = { ...f().nodes[f().walls[right]!.a]! };
    dragWall(right, 500, 0);
    expect(f().nodes[f().walls[right]!.a]!.x).toBe(n.x);
    expect(pts(id)[1]!.x).toBeCloseTo(xr);
    expect(store.get().lockBlock).not.toBeNull();
  });

  it('zamčená délka čáry (volná kóta mezi jejími body) se posunem stěny nezmění', () => {
    const id = addDrawLine({ x: xl, y: 1500 }, { x: xr, y: 1500 })!;
    const dim = addFreeDim({ drawing: id, i: 0 }, { drawing: id, i: 1 }, 300)!;
    setDimLock({ kind: 'free-dim', dimId: dim, move: 'b' }, true);
    dragWall(right, 500, 0);
    expect(freeDimValue(f(), dim)).toBeCloseTo(4000);
  });
});

describe('konec v rohu dvou líců', () => {
  it('jde do průsečíku nových líců', () => {
    store.openProject(createProject({ name: 't' }));
    // L: vodorovná stěna nahoře a svislá vpravo se společným rohem
    const h = addWall({ x: 0, y: 3000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
    const v = addWall({ x: 4000, y: 3000 }, f().walls[h]!.b, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const lines = (wid: Id) => {
      const w = f().walls[wid]!;
      const a = f().nodes[w.a]!;
      const n = normal(unit(a, f().nodes[w.b]!));
      return ([1, -1] as const).map(s => ({ x: a.x + n.x * wallFaceOffset(w, s), y: a.y + n.y * wallFaceOffset(w, s) }));
    };
    // vnitřní líce: y vodorovné blíž k 0, x svislé blíž k 0
    const yIn = () => Math.min(...lines(h).map(p => p.y));
    const xIn = () => Math.min(...lines(v).map(p => p.x));
    const y0 = yIn();
    const id = addDrawLine({ x: 1000, y: 1000 }, { x: xIn(), y: yIn() })!;
    dragWall(v, 500, 0);
    const q = pts(id)[1]!;
    expect(q.x).toBeCloseTo(xIn());
    expect(q.y).toBeCloseTo(yIn());
    expect(q.y).toBeCloseTo(y0);
    expect(q.x).toBeGreaterThan(4000);
    expect(pts(id)[0]).toEqual({ x: 1000, y: 1000 });
  });
});
