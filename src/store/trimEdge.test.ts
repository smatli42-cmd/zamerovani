/**
 * D3 doplnění – zkrátit / prodloužit jen jednu stěnu k hraně druhé (T místo L, Revit „jeden prvek“).
 * První ťuknutí = stěna, která se upraví (část, která zůstane), druhé = stěna, ke které se zkrátí / prodlouží.
 * Druhá stěna se nemění; konec první dosedne na její bližší líc a napojí se na ni (T, Node.host / hostFace).
 * Osa Y dolů; vodorovná stěna (0,0)→(4000,0) se stranou 1 má tělo y 0…300.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallNodes } from '../core/floorQueries';
import { addLine, addOpening, addWall, setDimLock, setWallSagitta, trimToEdge } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const ends = (id: string) => wallNodes(f(), f().walls[id]!)!.map(n => ({ x: Math.round(n.x), y: Math.round(n.y) }));
const fresh = () => store.openProject(createProject({ name: 't' }));
const host = () => addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;

describe('D3 – zkrátit / prodloužit k hraně druhé stěny (T)', () => {
  it('příčka přečnívá přes stěnu: odřízne se přečnívající část, konec dosedne na líc a napojí se (T)', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: -1000 }, null, { x: 2000, y: 2000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 1500 }, A)).toBe('ok');
    expect(ends(B)).toEqual([{ x: 2000, y: 300 }, { x: 2000, y: 2000 }]);
    const n = f().nodes[f().walls[B]!.a]!;
    expect(n.host).toBe(A);
    expect(n.hostFace).toBe(1);
    expect(ends(A)).toEqual([{ x: 0, y: 0 }, { x: 4000, y: 0 }]); // druhá stěna beze změny
    expect(f().walls[A]!.a).not.toBe(n.id);
    store.undo();
    expect(ends(B)).toEqual([{ x: 2000, y: -1000 }, { x: 2000, y: 2000 }]);
  });

  it('ponechaná horní část dosedne na čáru stěny (líc na ose)', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: -1000 }, null, { x: 2000, y: 2000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: -500 }, A)).toBe('ok');
    expect(ends(B)).toEqual([{ x: 2000, y: -1000 }, { x: 2000, y: 0 }]);
    const n = f().nodes[f().walls[B]!.b]!;
    expect(n.host).toBe(A);
    expect(n.hostFace).toBeUndefined();
  });

  it('krátká stěna se prodlouží k líci druhé stěny', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('ok');
    expect(ends(B)).toEqual([{ x: 2000, y: 300 }, { x: 2000, y: 3000 }]);
    expect(f().nodes[f().walls[B]!.a]!.host).toBe(A);
  });

  it('šikmá stěna: konec na průsečíku s lícem', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: 1300 }, null, { x: 3000, y: 2300 }, null, false, { thickness: 0 })!;
    expect(trimToEdge(B, { x: 2500, y: 1800 }, A)).toBe('ok');
    expect(ends(B)[0]).toEqual({ x: 1000, y: 300 });
  });

  it('stěna s osou uprostřed: líc v polovině tloušťky', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, axis: 'center' })!;
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('ok');
    expect(ends(B)[0]).toEqual({ x: 2000, y: 150 });
    const B2 = addWall({ x: 3000, y: -1000 }, null, { x: 3000, y: -3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B2, { x: 3000, y: -2000 }, A)).toBe('ok');
    expect(ends(B2)[0]).toEqual({ x: 3000, y: -150 });
    expect(f().nodes[f().walls[B2]!.a]!.hostFace).toBe(-1);
  });

  it('druhá stěna bez tloušťky: konec na její čáře', () => {
    fresh();
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('ok');
    expect(ends(B)[0]).toEqual({ x: 2000, y: 0 });
    expect(f().nodes[f().walls[B]!.a]!.host).toBe(A);
  });

  it('roh sdílený s další stěnou: ta zůstane na místě', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    const C = addWall({ x: 2000, y: 1000 }, f().walls[B]!.a, { x: 3000, y: 1000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('ok');
    expect(ends(B)[0]).toEqual({ x: 2000, y: 300 });
    expect(ends(C)).toEqual([{ x: 2000, y: 1000 }, { x: 3000, y: 1000 }]);
  });

  it('otvor v odříznuté části se smaže, ostatní drží polohu (F4)', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: -1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    const lost = addOpening(B, 'window', 0.1)!; // kolem y = -600
    const keep = addOpening(B, 'door', 0.75)!; // kolem y = 2000
    const o = f().openings[keep]!;
    const world = o.ref === 'a' ? -1000 + o.offset : 3000 - o.offset;
    expect(trimToEdge(B, { x: 2000, y: 2500 }, A)).toBe('ok');
    expect(f().openings[lost]).toBeUndefined();
    const o2 = f().openings[keep]!;
    expect(o2.ref === 'a' ? 300 + o2.offset : 3000 - o2.offset).toBe(world);
  });

  it('konec by nedosedl na druhou stěnu (mimo její délku) → nic se nezmění', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 5000, y: 1000 }, null, { x: 5000, y: 3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 5000, y: 2000 }, A)).toBe('outside');
    expect(ends(B)).toEqual([{ x: 5000, y: 1000 }, { x: 5000, y: 3000 }]);
  });

  it('rovnoběžné, oblouk, stejná stěna, už napojená a příliš krátká se odmítnou', () => {
    fresh();
    const A = host();
    const P = addWall({ x: 0, y: 1000 }, null, { x: 3000, y: 1000 }, null, false)!;
    expect(trimToEdge(P, { x: 100, y: 1000 }, A)).toBe('parallel');
    expect(trimToEdge(A, { x: 100, y: 0 }, A)).toBe('same');
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('ok');
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('joined');
    const S = addWall({ x: 1000, y: -5 }, null, { x: 1000, y: 2000 }, null, false, { thickness: 0 })!;
    expect(trimToEdge(S, { x: 1000, y: -2 }, A)).toBe('tooShort');
    const R = addWall({ x: 3000, y: 1000 }, null, { x: 3000, y: 3000 }, null, false)!;
    setWallSagitta(R, 300);
    expect(trimToEdge(R, { x: 3000, y: 2000 }, A)).toBe('curved');
  });

  it('ponechaný konec uvnitř těla druhé stěny se odmítne (strana 1 i −1)', () => {
    fresh();
    const A = host(); // tělo y 0…300
    const B = addWall({ x: 2000, y: 100 }, null, { x: 2000, y: -2000 }, null, false, { thickness: 0 })!;
    expect(trimToEdge(B, { x: 2000, y: 50 }, A)).toBe('tooShort');
    const M = addWall({ x: 0, y: 3000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 300, side: -1 })!; // tělo y 2700…3000
    const N = addWall({ x: 1000, y: 2900 }, null, { x: 1000, y: 5000 }, null, false, { thickness: 0 })!;
    expect(trimToEdge(N, { x: 1000, y: 2950 }, M)).toBe('tooShort');
    expect(ends(B)).toEqual([{ x: 2000, y: 100 }, { x: 2000, y: -2000 }]);
  });

  it('výstupek v odříznuté části se smaže, jinde zůstane; napojená příčka v odříznuté části se jen odpojí (F4)', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: -2000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 300 })!; // tělo x 1700…2000
    // výstupky na líci x = 2000 (vpravo): jeden v odříznuté horní části, jeden dole
    const prot = (y: number) => [{ x: 2000, y }, { x: 2200, y }, { x: 2200, y: y + 400 }, { x: 2000, y: y + 400 }].forEach((p, i, a) => i + 1 < a.length && addLine(p, null, a[i + 1]!, null));
    prot(-1500);
    prot(2000);
    expect(Object.keys(f().protrusions)).toHaveLength(2);
    const T = addWall({ x: 2000, y: -1000 }, null, { x: 3500, y: -1000 }, null, false, { thickness: 100 })!; // příčka napojená nahoře
    const tn = f().walls[T]!.a;
    expect(f().nodes[tn]!.host).toBe(B);
    expect(trimToEdge(B, { x: 2000, y: 2500 }, A)).toBe('ok');
    expect(ends(B)[0]).toEqual({ x: 2000, y: 300 });
    const left = Object.values(f().protrusions);
    expect(left).toHaveLength(1);
    expect(f().walls[T]).toBeDefined();
    expect(f().nodes[f().walls[T]!.a]!.host).toBeUndefined();
  });

  it('zamčená délka upravované stěny zastaví úpravu', () => {
    fresh();
    const A = host();
    const B = addWall({ x: 2000, y: 1000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    setDimLock({ kind: 'wall-length', wallId: B, move: 'both' }, true);
    const snap = f();
    expect(trimToEdge(B, { x: 2000, y: 2000 }, A)).toBe('locked');
    expect(f()).toBe(snap);
  });
});
