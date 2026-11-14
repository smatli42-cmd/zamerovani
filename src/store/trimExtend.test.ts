/**
 * D3 – zkrátit / prodloužit do rohu (samostatný nástroj): ťuknutí na část stěny, která zůstane.
 * Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallLength, wallNodes } from '../core/floorQueries';
import { addOpening, addWall, setWallNoJoin, trimToCorner } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const ends = (id: string) => wallNodes(f(), f().walls[id]!)!.map(n => ({ x: Math.round(n.x), y: Math.round(n.y) }));
const fresh = () => store.openProject(createProject({ name: 't' }));

describe('D3 zkrátit / prodloužit do rohu', () => {
  it('dvě stěny, které se nepotkají: obě se prodlouží do rohu a sdílejí ho', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300 })!;
    const B = addWall({ x: 4000, y: 1000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 300 })!;
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 4000, y: 2000 })).toBe('ok');
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 4000, y: 0 }]);
    expect(ends(B)).toEqual([{ x: 4000, y: 0 }, { x: 4000, y: 3000 }]);
    expect(f().walls[A]!.b).toBe(f().walls[B]!.a);
    expect(store.get().canUndo).toBe(true);
    store.undo();
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 3000, y: 0 }]);
  });

  it('křížení „+“: odříznou se části, na které se neťuklo, vznikne roh L', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 2000, y: -1000 }, null, { x: 2000, y: 2000 }, null, false, { thickness: 0 })!;
    // ponechat levou část A a dolní část B
    expect(trimToCorner(A, { x: 500, y: 0 }, B, { x: 2000, y: 1500 })).toBe('ok');
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
    expect(ends(B)).toEqual([{ x: 2000, y: 0 }, { x: 2000, y: 2000 }]);
    expect(Object.keys(f().nodes)).toHaveLength(3);
  });

  it('vyčnívající konec po protažení: jedna stěna se zkrátí, druhá prodlouží', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 2500, y: 0 }, null, false, { thickness: 0 })!; // přečnívá přes B
    const B = addWall({ x: 2000, y: 500 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 0 })!; // nedosahuje k A
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 2000, y: 2000 })).toBe('ok');
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
    expect(ends(B)).toEqual([{ x: 2000, y: 0 }, { x: 2000, y: 3000 }]);
  });

  it('roh sdílený s další stěnou: sousední stěna zůstane na místě', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 0 })!;
    const C = addWall({ x: 3000, y: 0 }, null, { x: 3000, y: -1500 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 4000, y: 1000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 0 })!;
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 4000, y: 2000 })).toBe('ok');
    expect(ends(A)[1]).toEqual({ x: 4000, y: 0 });
    expect(ends(C)).toEqual([{ x: 3000, y: 0 }, { x: 3000, y: -1500 }]);
  });

  it('otvory drží polohu ve výkresu; otvor v odříznuté části se smaže (F4); změřená délka se zruší', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300 })!;
    const B = addWall({ x: 4000, y: -2000 }, null, { x: 4000, y: 2000 }, null, false, { thickness: 300 })!;
    const keep = addOpening(A, 'door', 0.2)!; // kolem x = 1200, měří se od A
    const lost = addOpening(A, 'window', 0.85)!; // kolem x = 5100 – v odříznuté části
    const before = f().openings[keep]!.offset;
    // ponechat pravou část A? ne – levou, a dolní část B
    expect(trimToCorner(A, { x: 500, y: 0 }, B, { x: 4000, y: 1500 })).toBe('ok');
    expect(f().openings[lost]).toBeUndefined();
    expect(f().openings[keep]!.offset).toBe(before);
    expect(f().walls[A]!.measured).toBeNull();
    expect(Math.round(wallLength(f(), f().walls[A]!))).toBe(4000);
  });

  it('konec A se posune: otvor měřený od A zůstane na stejném místě ve výkresu', () => {
    fresh();
    const A = addWall({ x: 1000, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 0, y: 500 }, null, { x: 0, y: 3000 }, null, false, { thickness: 0 })!;
    const op = addOpening(A, 'door', 0.3)!;
    const o = f().openings[op]!;
    expect(o.ref).toBe('a');
    const worldStart = 1000 + o.offset;
    expect(trimToCorner(A, { x: 3000, y: 0 }, B, { x: 0, y: 2000 })).toBe('ok');
    expect(ends(A)[0]).toEqual({ x: 0, y: 0 });
    expect(f().openings[op]!.offset).toBe(worldStart);
  });

  it('rovnoběžné stěny, oblouk, stejná stěna a příliš krátký výsledek se odmítnou beze změny', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const P = addWall({ x: 0, y: 1000 }, null, { x: 3000, y: 1000 }, null, false)!;
    expect(trimToCorner(A, { x: 100, y: 0 }, P, { x: 100, y: 1000 })).toBe('parallel');
    expect(trimToCorner(A, { x: 100, y: 0 }, A, { x: 200, y: 0 })).toBe('same');
    const Q = addWall({ x: 5, y: -1000 }, null, { x: 5, y: 1000 }, null, false)!;
    // ponechat jen 5 mm A vlevo od průsečíku → kratší než 10 mm
    expect(trimToCorner(A, { x: 2, y: 0 }, Q, { x: 5, y: 500 })).toBe('tooShort');
    expect(store.get().canUndo).toBe(true); // jen přidání stěn
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 3000, y: 0 }]);
  });

  it('T-napojení → roh L: průběžná stěna se odřízne u příčky, roh přestane být napojený', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
    const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -2000 }, null, false, { thickness: 100 })!;
    const m = f().walls[B]!.a;
    expect(f().nodes[m]!.host).toBe(A);
    expect(trimToCorner(A, { x: 3000, y: 0 }, B, { x: 1000, y: -1000 })).toBe('ok');
    expect(ends(A)).toEqual([{ x: 1000, y: 0 }, { x: 4000, y: 0 }]);
    expect(f().walls[A]!.a).toBe(m);
    expect(f().nodes[m]!.host).toBeUndefined();
  });

  it('napojení společného rohu na třetí stěnu zůstane', () => {
    fresh();
    const D = addWall({ x: 0, y: 0 }, null, { x: 0, y: 4000 }, null, false)!;
    const A = addWall({ x: 0, y: 2000 }, null, { x: 3000, y: 2000 }, null, false)!; // T na D
    const m = f().walls[A]!.a;
    expect(f().nodes[m]!.host).toBe(D);
    const B = addWall({ x: -2000, y: 3000 }, null, { x: -1000, y: 2500 }, null, false)!; // míří k rohu m (0, 2000)
    const ok = trimToCorner(A, { x: 2000, y: 2000 }, B, { x: -1500, y: 2750 });
    expect(ok).toBe('ok');
    expect(f().nodes[m]!.host).toBe(D);
  });

  it('oddělený konec (C1.13) ve stejném bodě se spojí; když už spojené jsou, nevznikne krok Zpět', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false)!;
    const B = addWall({ x: 3000, y: 0 }, null, { x: 3000, y: 2000 }, null, false)!;
    setWallNoJoin(B, 'a', true);
    expect(f().walls[B]!.a).not.toBe(f().walls[A]!.b);
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 3000, y: 1000 })).toBe('ok');
    expect(f().walls[B]!.a).toBe(f().walls[A]!.b);
    expect(f().walls[B]!.noJoinA).toBeUndefined();
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 3000, y: 1000 })).toBe('joined');
  });

  it('otvor měřený od B drží polohu, když se posune konec B; Vpřed po Zpět', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300 })!;
    const B = addWall({ x: 6000, y: 500 }, null, { x: 6000, y: 3000 }, null, false, { thickness: 300 })!;
    const op = addOpening(A, 'window', 0.8)!;
    const o = f().openings[op]!;
    expect(o.ref).toBe('b');
    const worldEnd = 5000 - o.offset;
    expect(trimToCorner(A, { x: 1000, y: 0 }, B, { x: 6000, y: 2000 })).toBe('ok');
    expect(6000 - f().openings[op]!.offset).toBe(worldEnd);
    store.undo();
    store.redo();
    expect(ends(A)[1]).toEqual({ x: 6000, y: 0 });
  });
});
