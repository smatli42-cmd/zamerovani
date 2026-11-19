/**
 * Oříznout / Prodloužit čáru kresby ťuknutím (core/drawTrim.ts, požadavek uživatele 2026-11-19 – jako Fusion 360).
 * Osa Y míří dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Drawing, DrawPt } from '../model/types';
import { addDrawRect, addWall, extendDrawingAt, setDimLock, trimDrawingAt } from './actions';
import { store } from './store';

const drawings = (): Drawing[] => Object.values(store.floor()!.drawings ?? {});
const pts = (d: Drawing) => d.pts.map(p => [Math.round(p.x), Math.round(p.y)]);
/** Kresba, jejíž první bod je (x, y) (po oříznutí mají kusy nová id). */
const startingAt = (x: number, y: number): Drawing | undefined => drawings().find(d => Math.round(d.pts[0]!.x) === x && Math.round(d.pts[0]!.y) === y);

function line(id: string, p: DrawPt[], extra: Partial<Drawing> = {}) {
  store.edit(fl => void ((fl.drawings ??= {})[id] = { id, shape: 'line', pts: p.map(q => ({ ...q })), ...extra }));
}

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.2 }, selection: null });
});

describe('Oříznout', () => {
  it('kus mezi dvěma křížícími čarami zmizí, čára se rozpadne na dvě (stejný vzhled)', () => {
    line('H', [{ x: 0, y: 0 }, { x: 3000, y: 0 }], { color: 'red' });
    line('V1', [{ x: 1000, y: -500 }, { x: 1000, y: 500 }]);
    line('V2', [{ x: 2000, y: -500 }, { x: 2000, y: 500 }]);
    expect(trimDrawingAt('H', { x: 1500, y: 5 })).toBe('ok');
    const hs = drawings().filter(d => d.id !== 'V1' && d.id !== 'V2');
    expect(hs.map(pts).sort()).toEqual([[[0, 0], [1000, 0]], [[2000, 0], [3000, 0]]].sort());
    expect(hs.every(d => d.color === 'red')).toBe(true);
  });

  it('konec za posledním průsečíkem se usekne; bez průsečíku zmizí celý úsek', () => {
    line('H', [{ x: 0, y: 0 }, { x: 3000, y: 0 }]);
    line('V', [{ x: 1000, y: -500 }, { x: 1000, y: 500 }]);
    trimDrawingAt('H', { x: 2500, y: 0 });
    expect(pts(startingAt(0, 0)!)).toEqual([[0, 0], [1000, 0]]);
    expect(store.floor()!.drawings!.H).toBeUndefined(); // kus má nové id
    trimDrawingAt('V', { x: 1000, y: 300 }); // V kříží H v bodě (1000, 0)
    expect(pts(startingAt(1000, -500)!)).toEqual([[1000, -500], [1000, 0]]);
    line('X', [{ x: 5000, y: 0 }, { x: 6000, y: 0 }]);
    trimDrawingAt('X', { x: 5500, y: 0 });
    expect(store.floor()!.drawings!.X).toBeUndefined();
  });

  it('lomená čára: vrchol není průsečík – zmizí kus k vrcholu, zbytek zůstane jednou čárou', () => {
    line('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    line('C', [{ x: 500, y: -300 }, { x: 500, y: 300 }]);
    trimDrawingAt('L', { x: 800, y: 0 });
    expect(pts(startingAt(0, 0)!)).toEqual([[0, 0], [500, 0]]);
    expect(pts(startingAt(1000, 0)!)).toEqual([[1000, 0], [1000, 1000]]);
    expect(drawings()).toHaveLength(3);
  });

  it('uzavřený tvar (obdélník) se otevře, šrafa zmizí; ořezává se i o stěnu', () => {
    const id = addDrawRect({ x: 0, y: 0 }, { x: 2000, y: 1000 });
    store.edit(fl => void (fl.drawings![id]!.hatch = 'diag'));
    addWall({ x: 1000, y: -500 }, null, { x: 1000, y: 1500 }, null, false, { thickness: 0 }); // čára stěny přes obdélník
    expect(trimDrawingAt(id, { x: 1500, y: 0 })).toBe('ok');
    const d = startingAt(2000, 0)!;
    expect(d.shape).toBe('line');
    expect(d.closed).toBeUndefined();
    expect(d.hatch).toBeUndefined();
    expect(pts(d)).toEqual([[2000, 0], [2000, 1000], [0, 1000], [0, 0], [1000, 0]]);
  });

  it('oblouk v čáře, kruh a dvojitá čára se neořezávají (hlášení), Zpět vrátí oříznutí', () => {
    line('A', [{ x: 0, y: 0, s: 200 }, { x: 1000, y: 0 }]);
    expect(trimDrawingAt('A', { x: 500, y: 0 })).toBe('arcSeg');
    store.edit(fl => void (fl.drawings!.C = { id: 'C', shape: 'circle', pts: [{ x: 5000, y: 0 }], r: 500 }));
    expect(trimDrawingAt('C', { x: 5500, y: 0 })).toBe('notLine');
    line('H', [{ x: 0, y: 3000 }, { x: 3000, y: 3000 }]);
    trimDrawingAt('H', { x: 1500, y: 3000 });
    expect(store.floor()!.drawings!.H).toBeUndefined();
    expect(drawings().some(d => d.pts[0]!.y === 3000)).toBe(false);
    store.undo();
    expect(store.floor()!.drawings!.H).toBeDefined();
  });
});

describe('Prodloužit', () => {
  it('konec čáry se prodlouží k nejbližší čáře ve svém směru (bližší konec k ťuknutí)', () => {
    line('H', [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    line('V1', [{ x: 2000, y: -500 }, { x: 2000, y: 500 }]);
    line('V2', [{ x: 3000, y: -500 }, { x: 3000, y: 500 }]);
    expect(extendDrawingAt('H', { x: 900, y: 0 })).toBe('ok');
    expect(pts(store.floor()!.drawings!.H!)).toEqual([[0, 0], [2000, 0]]);
    expect(extendDrawingAt('H', { x: 1900, y: 0 })).toBe('ok');
    expect(pts(store.floor()!.drawings!.H!)).toEqual([[0, 0], [3000, 0]]);
    expect(extendDrawingAt('H', { x: 2900, y: 0 })).toBe('none');
  });

  it('prodlouží se k líci stěny; jen koncový úsek otevřené čáry', () => {
    addWall({ x: 0, y: 2000 }, null, { x: 4000, y: 2000 }, null, false, { thickness: 300 });
    line('L', [{ x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 1500, y: 1000 }]);
    expect(extendDrawingAt('L', { x: 700, y: 0 })).toBe('none'); // první úsek – doleva, nic tam není
    expect(extendDrawingAt('L', { x: 1000, y: 500 })).toBe('notEnd');
    line('D', [{ x: 2000, y: 0 }, { x: 2000, y: 1000 }]);
    expect(extendDrawingAt('D', { x: 2000, y: 900 })).toBe('ok');
    const end = store.floor()!.drawings!.D!.pts[1]!;
    expect(end.x).toBeCloseTo(2000, 6);
    expect([1700, 2000, 2300].some(y => Math.abs(end.y - y) < 1e-6)).toBe(true);
    expect(end.y).toBeLessThanOrEqual(2000); // nejbližší líc
  });

  it('uzavřená čára se neprodlužuje', () => {
    line('Q', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], { closed: true });
    expect(extendDrawingAt('Q', { x: 500, y: 0 })).toBe('closed');
  });
});

describe('volné kóty a zámky u oříznuté kresby', () => {
  const addDim = (id: string, a: object, b: object) =>
    store.edit(fl => void ((fl.dims ??= {})[id] = { id, a, b, offset: 300 } as never));

  it('kóta na zkrácené hraně obdélníku zůstane na téže přímce; na ořezaném kusu zanikne (nepřeskočí na jinou hranu)', () => {
    const r = addDrawRect({ x: 0, y: 0 }, { x: 2000, y: 1000 });
    line('V', [{ x: 1000, y: -500 }, { x: 1000, y: 1500 }]);
    addDim('K1', { seg: r, i: 0, at: 500 }, { x: 500, y: -2000 }); // horní hrana v x = 500 – zůstane
    addDim('K2', { seg: r, i: 0, at: 1500 }, { x: 1500, y: -2000 }); // horní hrana v x = 1500 – ořízne se
    expect(trimDrawingAt(r, { x: 1500, y: 0 })).toBe('ok');
    const dims = store.floor()!.dims ?? {};
    expect(dims.K2).toBeUndefined();
    const a = dims.K1!.a as { seg: string; i: number; at: number };
    const d = store.floor()!.drawings![a.seg]!;
    expect(d).toBe(startingAt(2000, 0));
    const p = d.pts[a.i]!;
    const q = d.pts[(a.i + 1) % d.pts.length]!;
    expect(p.y).toBe(0);
    expect(q.y).toBe(0);
    // místo dosednutí = bod i + at ve směru úseku → stále (500, 0)
    expect(p.x + (Math.sign(q.x - p.x) * a.at)).toBeCloseTo(500, 6);
  });

  it('zamčená kóta, kterou by oříznutí změnilo, úpravu zastaví a akce to ohlásí', () => {
    line('H', [{ x: 0, y: 0 }, { x: 3000, y: 0 }]);
    line('V', [{ x: 1000, y: -500 }, { x: 1000, y: 500 }]);
    addDim('Z', { drawing: 'H', i: 0 }, { drawing: 'H', i: 1 });
    setDimLock({ kind: 'free-dim', dimId: 'Z', move: 'b' }, true);
    expect(trimDrawingAt('H', { x: 2000, y: 0 })).toBe('blocked');
    expect(store.floor()!.drawings!.H!.pts).toHaveLength(2); // beze změny (stejné id)
    expect(store.floor()!.drawings!.H!.pts[1]!.x).toBe(3000);
  });

  it('kóta k bodu oříznuté čáry jde s vrcholem na nový kus', () => {
    line('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    line('C', [{ x: 500, y: -300 }, { x: 500, y: 300 }]);
    addDim('P', { drawing: 'L', i: 2 }, { x: 3000, y: 1000 });
    trimDrawingAt('L', { x: 800, y: 0 });
    const a = store.floor()!.dims!.P!.a as { drawing: string; i: number };
    expect(store.floor()!.drawings![a.drawing]!.pts[a.i]).toEqual({ x: 1000, y: 1000 });
  });
});
