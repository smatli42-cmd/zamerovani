/**
 * F7 – prvek blízko rohu: upozornění, ne zákaz; otvory i výstupky / vybrání (rozhodnutí uživatele 2026-11-15).
 * Osa Y dolů. Stěna S z a (0,0) do b (4000,0), tloušťka 300, tělo nahoru (−y, side −1) = ven z místnosti,
 * která leží v +y; líc místnosti y = 0 je u výstupku side 1, vnější líc y = −300 side −1.
 * Stěna L z a (0,0) do d (0,3000) navazuje v rohu a.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall, newId } from '../model/factory';
import type { Floor, Protrusion } from '../model/types';
import { openingCornerOverlap, openingCornerWarning, protrusionCornerOverlap, protrusionCornerWarning } from './cornerOverlap';

function room(lInside: boolean) {
  const f: Floor = createFloor('t');
  f.nodes.a = { id: 'a', x: 0, y: 0 };
  f.nodes.b = { id: 'b', x: 4000, y: 0 };
  f.nodes.d = { id: 'd', x: 0, y: 3000 };
  const S = createWall('a', 'b', 0, 300, -1);
  // L: směr +y, normal = (−1, 0) → side 1 = tělo ven (−x); side −1 = tělo dovnitř místnosti (+x)
  const L = createWall('a', 'd', 0, 300, lInside ? -1 : 1);
  f.walls[S.id] = S;
  f.walls[L.id] = L;
  const add = (fields: Parameters<typeof createOpening>[3]) => {
    const op = createOpening(f, S.id, 'window', { width: 900, ...fields });
    f.openings[op.id] = op;
    return op.id;
  };
  return { f, S, L, add };
}

describe('F7: otvor blízko rohu', () => {
  it('těla ven z místnosti: otvor hned u vnitřního rohu nezasahuje do rohu', () => {
    const { f, add } = room(false);
    const id = add({ offset: 0, ref: 'a' });
    expect(openingCornerOverlap(f, id)).toEqual({ a: 0, b: 0, mid: 0 });
    expect(openingCornerWarning(f, id)).toBeNull();
  });

  it('tělo napojené stěny uvnitř místnosti: otvor u rohu se s ním překrývá o jeho tloušťku', () => {
    const { f, add } = room(true);
    const id = add({ offset: 0, ref: 'a' });
    expect(openingCornerOverlap(f, id)).toEqual({ a: 300, b: 0, mid: 0 });
    expect(openingCornerWarning(f, id)).toContain('do rohu A o 300 mm');
  });

  it('otvor dál od rohu (za tělem napojené stěny) je v pořádku', () => {
    const { f, add } = room(true);
    expect(openingCornerOverlap(f, add({ offset: 300, ref: 'a' }))).toEqual({ a: 0, b: 0, mid: 0 });
    expect(openingCornerOverlap(f, add({ offset: 200, ref: 'a' }))).toEqual({ a: 100, b: 0, mid: 0 });
  });

  it('volný konec B: otvor až ke konci stěny je v pořádku', () => {
    const { f, add } = room(true);
    expect(openingCornerOverlap(f, add({ offset: 0, ref: 'b' }))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('roh u konce B: přesah se hlásí u B', () => {
    const { f, S, add } = room(false);
    // stěna z b dolů do místnosti s tělem dovnitř (+... −x od b, tj. do místnosti)
    f.nodes.c = { id: 'c', x: 4000, y: 3000 };
    const R = createWall('b', 'c', 0, 250, 1); // směr +y, normal (−1,0) → side 1 = tělo −x = dovnitř
    f.walls[R.id] = R;
    const id = add({ offset: 100, ref: 'b' });
    expect(f.openings[id]!.wallId).toBe(S.id);
    expect(openingCornerOverlap(f, id)).toEqual({ a: 0, b: 150, mid: 0 });
    expect(openingCornerWarning(f, id)).toContain('do rohu B o 150 mm');
  });

  it('stěna bez tloušťky a neexistující otvor: nehlídá se', () => {
    const { f, S, add } = room(true);
    const id = add({ offset: 0, ref: 'a' });
    f.walls[S.id]!.thickness = 0;
    expect(openingCornerOverlap(f, id)).toBeNull();
    expect(openingCornerOverlap(f, 'nic')).toBeNull();
  });

  it('osa uprostřed: přesah je polovina tloušťky napojené stěny', () => {
    const { f, S, L, add } = room(true);
    f.walls[S.id]!.axis = 'center';
    f.walls[L.id]!.axis = 'center';
    expect(openingCornerOverlap(f, add({ offset: 0, ref: 'a' }))).toEqual({ a: 150, b: 0, mid: 0 });
  });

  it('příčka napojená doprostřed stěny (T): otvor přes ni zasahuje do jejího těla, vedle ní ne', () => {
    const { f, S, add } = room(false);
    // příčka z (2000, 0) do místnosti (+y), tloušťka 100, tělo x ∈ [1900, 2000]; napojená na S bez dělení
    f.nodes.m = { id: 'm', x: 2000, y: 0, host: S.id };
    f.nodes.e = { id: 'e', x: 2000, y: 2000 };
    const P = createWall('m', 'e', 0, 100, 1);
    f.walls[P.id] = P;
    const over = add({ offset: 1500, ref: 'a' }); // 1500–2400
    expect(openingCornerOverlap(f, over)).toEqual({ a: 0, b: 0, mid: 100 });
    expect(openingCornerWarning(f, over)).toContain('do napojené příčky o 100 mm');
    expect(openingCornerOverlap(f, add({ offset: 500, ref: 'a' }))).toEqual({ a: 0, b: 0, mid: 0 });
  });
});

describe('F7: výstupek a vybrání blízko rohu (hlídá se jen líc, na kterém leží)', () => {
  /** Výstupek / vybrání na stěně S v rozsahu u0–u1, hloubka 100. */
  function prot(f: Floor, wallId: string, side: 1 | -1, mode: 'add' | 'subtract', u0: number, u1: number): string {
    const v = mode === 'add' ? 100 : -100;
    const p: Protrusion = { id: newId('pr'), wallId, side, mode, pts: [{ u: u0, v: 0 }, { u: u0, v }, { u: u1, v }, { u: u1, v: 0 }], name: '', material: '', note: '' };
    f.protrusions = { ...(f.protrusions ?? {}), [p.id]: p };
    return p.id;
  }

  it('výstupek na líci místnosti u rohu, kde je tělo napojené stěny uvnitř: zasahuje do rohu o 300 mm', () => {
    const { f, S } = room(true);
    const id = prot(f, S.id, 1, 'add', 0, 200);
    expect(protrusionCornerOverlap(f, id)).toEqual({ a: 300, b: 0, mid: 0 });
    expect(protrusionCornerWarning(f, id)).toContain('Výstupek zasahuje do rohu A o 300 mm');
  });

  it('vybrání stejně (text „Vybrání“)', () => {
    const { f, S } = room(true);
    const id = prot(f, S.id, 1, 'subtract', 100, 500);
    expect(protrusionCornerOverlap(f, id)).toEqual({ a: 200, b: 0, mid: 0 });
    expect(protrusionCornerWarning(f, id)).toContain('Vybrání zasahuje do rohu A o 200 mm');
  });

  it('výstupek na vnějším líci ve stejném místě je v pořádku (vnější líc začíná v rohu)', () => {
    const { f, S } = room(true);
    const id = prot(f, S.id, -1, 'add', 0, 200);
    expect(protrusionCornerOverlap(f, id)).toEqual({ a: 0, b: 0, mid: 0 });
    expect(protrusionCornerWarning(f, id)).toBeNull();
  });

  it('těla ven z místnosti: výstupek v rohu na líci místnosti je v pořádku', () => {
    const { f, S } = room(false);
    expect(protrusionCornerOverlap(f, prot(f, S.id, 1, 'add', 0, 200))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('příčka napojená doprostřed stěny: hlásí se jen u výstupku na líci, na který příčka dosedá', () => {
    const { f, S } = room(false);
    f.nodes.m = { id: 'm', x: 2000, y: 0, host: S.id };
    f.nodes.e = { id: 'e', x: 2000, y: 2000 };
    const P = createWall('m', 'e', 0, 100, 1); // tělo x ∈ [1900, 2000], do místnosti
    f.walls[P.id] = P;
    expect(protrusionCornerOverlap(f, prot(f, S.id, 1, 'add', 1800, 2200))).toEqual({ a: 0, b: 0, mid: 100 });
    expect(protrusionCornerOverlap(f, prot(f, S.id, -1, 'add', 1800, 2200))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('neexistující výstupek: nehlídá se', () => {
    const { f } = room(true);
    expect(protrusionCornerOverlap(f, 'nic')).toBeNull();
    expect(protrusionCornerWarning(f, 'nic')).toBeNull();
  });
});

describe('F7: všechny druhy otvorů', () => {
  for (const kind of ['door', 'window', 'french', 'opening'] as const) {
    it(`${kind}: skrz celé tělo – u rohu s tělem napojené stěny uvnitř se hlásí`, () => {
      const { f, S } = room(true);
      const op = createOpening(f, S.id, kind, { width: 900, offset: 0, ref: 'a' });
      f.openings[op.id] = op;
      expect(openingCornerOverlap(f, op.id)!.a).toBeGreaterThanOrEqual(300);
    });
  }

  it('nika: hlídá se jen líc, ze kterého je přístupná', () => {
    const { f, S } = room(true);
    // líc místnosti (y = 0) je na straně +normal(a→b) → nika na něm má swing −1; vnější líc swing 1
    const inRoom = createOpening(f, S.id, 'niche', { width: 600, offset: 0, ref: 'a', swing: -1 });
    const outside = createOpening(f, S.id, 'niche', { width: 600, offset: 0, ref: 'a', swing: 1 });
    f.openings[inRoom.id] = inRoom;
    f.openings[outside.id] = outside;
    expect(openingCornerOverlap(f, inRoom.id)).toEqual({ a: 300, b: 0, mid: 0 });
    expect(openingCornerOverlap(f, outside.id)).toEqual({ a: 0, b: 0, mid: 0 });
    expect(openingCornerWarning(f, inRoom.id)).toContain('Nika zasahuje do rohu A o 300 mm');
  });
});

describe('F7: rozhodnutí uživatele 2026-11-15 – průraz, oblouk, tolerance', () => {
  function prot(f: Floor, wallId: string, side: 1 | -1, mode: 'add' | 'subtract', u0: number, u1: number, v: number): string {
    const p: Protrusion = { id: newId('pr'), wallId, side, mode, pts: [{ u: u0, v: 0 }, { u: u0, v }, { u: u1, v }, { u: u1, v: 0 }], name: '', material: '', note: '' };
    f.protrusions = { ...(f.protrusions ?? {}), [p.id]: p };
    return p.id;
  }

  it('vybrání přes celou tloušťku (průraz) se hlídá na obou lících jako otvor; mělké vybrání jen na svém', () => {
    const { f, S } = room(true);
    // vnější líc (side −1) u rohu nezasahuje; tělo napojené stěny je u líce místnosti (side 1)
    expect(protrusionCornerOverlap(f, prot(f, S.id, -1, 'subtract', 0, 400, -300))).toEqual({ a: 300, b: 0, mid: 0 });
    expect(protrusionCornerOverlap(f, prot(f, S.id, -1, 'subtract', 0, 400, -100))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('výstupek přečnívající volný konec o méně než 1,5 mm (tolerance kreslení) se nehlásí', () => {
    const { f, S } = room(true);
    expect(protrusionCornerOverlap(f, prot(f, S.id, 1, 'add', 3601, 4001.4, 100))).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('oblouková stěna: příčka napojená doprostřed – hlásí se jen u výstupku na líci, na který dosedá', async () => {
    const { wallFrame } = await import('./protrusion');
    const f: Floor = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 4000, y: 0 };
    // oblouk vyklenutý do +y (vrchol (2000, 1000)), tělo ven (side 1 = normal(tečny) = +y ve vrcholu), 300
    const W = createWall('a', 'b', 1000, 300, 1);
    f.walls[W.id] = W;
    // příčka z vrcholu oblouku dolů (ke středu, mimo tělo), tloušťka 100, tělo x ∈ [2000, 2100]
    f.nodes.m = { id: 'm', x: 2000, y: 1000, host: W.id };
    f.nodes.e = { id: 'e', x: 2000, y: -1000 };
    const P = createWall('m', 'e', 0, 100, 1);
    f.walls[P.id] = P;
    const uApex = wallFrame(f, W)!.project({ x: 2000, y: 1000 }).u;
    // čára oblouku (líc, na který příčka dosedá) je na straně −1, vnější líc těla na straně +1
    const inner = protrusionCornerOverlap(f, prot(f, W.id, -1, 'add', uApex - 300, uApex + 300, 100))!;
    const outer = protrusionCornerOverlap(f, prot(f, W.id, 1, 'add', uApex - 300, uApex + 300, 100))!;
    expect(inner.mid).toBeGreaterThan(90);
    expect(inner.mid).toBeLessThan(110);
    expect(outer).toEqual({ a: 0, b: 0, mid: 0 });
  });

  it('oblouková stěna: roh s napojenou stěnou – líc, za kterým leží její tělo, se hlásí, protější ne', () => {
    const f: Floor = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 4000, y: 0 };
    f.nodes.d = { id: 'd', x: -3000, y: 0 };
    const W = createWall('a', 'b', 1000, 300, 1);
    // napojená stěna z rohu a doleva, tělo nahoru (+y) – tam, kam se oblouk zvedá
    const L = createWall('a', 'd', 0, 300, -1);
    f.walls[W.id] = W;
    f.walls[L.id] = L;
    // vnější líc oblouku (side 1, poloměr 2800) začíná až za tělem napojené stěny (y = 300): u ≈ 137 mm
    expect(protrusionCornerOverlap(f, prot(f, W.id, 1, 'add', 0, 400, 100))!.a).toBeCloseTo(137, -1);
    expect(protrusionCornerOverlap(f, prot(f, W.id, -1, 'add', 0, 400, 100))!.a).toBe(0);
  });

  it('otvor na stěně přepnuté na oblouk se nehlídá (otvory na oblouku zatím nejsou, F6)', () => {
    const { f, S, add } = room(true);
    const id = add({ offset: 0, ref: 'a' });
    f.walls[S.id]!.sagitta = 500;
    expect(openingCornerOverlap(f, id)).toBeNull();
  });
});
