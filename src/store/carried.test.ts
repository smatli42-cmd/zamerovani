/**
 * F4 / I1.13 – prvky nesené stěnou při zkrácení (nástroj Do rohu), dělení a smazání stěny; tabulka
 * „pravidlo × typ prvku“ (CLAUDE.md, pravidlo pro průřezové funkce; centrální kód core/carried.ts).
 * Rozhodnutí uživatele 2026-11-15: prvek i jen zčásti v mazané části / přes dělicí bod se smaže celý;
 * napojená příčka se nemaže, jen se odpojí (volný konec).
 *
 * Osa Y dolů. Stěna A z (0,0) do (6000,0), tloušťka 300, tělo y ∈ [0, 300]; líc „místnost“ y = 0 (ven = −y),
 * vnější líc y = 300 (ven = +y). Zůstává kus [0, 4000], mazaný / druhý kus [4000, 6000].
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { openingStartFromA, wallLength } from '../core/floorQueries';
import { protrusionOutline } from '../core/protrusion';
import { splitWallAt } from '../core/topology';
import { addLine, addOpening, addWall, deleteSelection, trimToCorner } from './actions';
import { store } from './store';

const f = () => store.floor()!;

const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
const tooth = (u0: number, u1: number, v: number, face: number): Pt[] => [
  { x: u0, y: face },
  { x: u0, y: face + v },
  { x: u1, y: face + v },
  { x: u1, y: face }
];
/** Nově vzniklý výstupek (poslední přidaný). */
const lastProt = (before: Set<string>) => Object.keys(f().protrusions ?? {}).find(id => !before.has(id))!;
const protIds = () => new Set(Object.keys(f().protrusions ?? {}));
const addTooth = (pts: Pt[]) => {
  const b = protIds();
  polyline(pts);
  return lastProt(b);
};

/** Poloha otvoru ve výkresu: x začátku (stěny vedou zleva doprava po ose x). */
function openingX(id: string): number {
  const op = f().openings[id]!;
  const w = f().walls[op.wallId]!;
  return f().nodes[w.a]!.x + openingStartFromA(op, wallLength(f(), w));
}

/** Stěna A se všemi druhy nesených prvků: celé na kusu [0, 4000], celé na [4000, 6000] a přes x = 4000. */
function setup() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const keep = {
    opening: addOpening(A, 'door', 0.1)!, // kolem x = 600
    add: addTooth(tooth(1500, 1900, -200, 0)), // výstupek na líci místnosti
    sub: addTooth(tooth(2200, 2500, -100, 300)), // vybrání z vnějšího líce
    teeFace: addWall({ x: 3200, y: 300 }, null, { x: 3200, y: 2000 }, null, false, { thickness: 100 })!, // příčka na líci
    teeAxis: addWall({ x: 2800, y: 0 }, null, { x: 2800, y: -2000 }, null, false, { thickness: 100 })! // příčka na čáře
  };
  const far = {
    opening: addOpening(A, 'window', 0.85)!, // kolem x = 5100
    add: addTooth(tooth(4800, 5300, 200, 300)),
    tee: addWall({ x: 5600, y: 0 }, null, { x: 5600, y: -2000 }, null, false, { thickness: 100 })!
  };
  const cross = {
    opening: addOpening(A, 'window', 4000 / 6000)!, // střed na x = 4000
    add: addTooth(tooth(3700, 4300, 200, 300))
  };
  return { A, keep, far, cross };
}

const hostOf = (wallId: string) => f().nodes[f().walls[wallId]!.a]!.host;

describe('F4: prvky nesené stěnou – připravený výkres', () => {
  it('všechny prvky vznikly na stěně A (jinak by testy níže nic neověřily)', () => {
    const { A, keep, far, cross } = setup();
    expect(Object.keys(f().walls)).toHaveLength(4);
    for (const id of [keep.opening, far.opening, cross.opening]) expect(f().openings[id]!.wallId).toBe(A);
    for (const id of [keep.add, keep.sub, far.add, cross.add]) expect(f().protrusions![id]!.wallId).toBe(A);
    expect(f().protrusions![keep.sub]!.mode).toBe('subtract');
    for (const id of [keep.teeFace, keep.teeAxis, far.tee]) expect(hostOf(id)).toBe(A);
    expect(f().nodes[f().walls[keep.teeFace]!.a]!.hostFace).toBe(1);
    expect(openingX(cross.opening)).toBeLessThan(4000);
    expect(openingX(cross.opening) + f().openings[cross.opening]!.width).toBeGreaterThan(4000);
  });
});

describe('F4: zkrácení nástrojem Do rohu', () => {
  function trimmed() {
    const s = setup();
    const outlines = Object.fromEntries(Object.values(f().protrusions!).map(p => [p.id, protrusionOutline(f(), p)]));
    const x0 = openingX(s.keep.opening);
    // stěna B míří do x = 4000 shora; ponechat levou část A
    const B = addWall({ x: 4000, y: -2000 }, null, { x: 4000, y: -500 }, null, false, { thickness: 300 })!;
    expect(trimToCorner(s.A, { x: 500, y: 0 }, B, { x: 4000, y: -1000 })).toBe('ok');
    expect(Math.round(wallLength(f(), f().walls[s.A]!))).toBe(4000);
    return { ...s, outlines, x0 };
  }

  it('otvor: celý na zbývající části zůstane na místě, v odříznuté se smaže, zčásti v odříznuté se smaže celý', () => {
    const { keep, far, cross, x0 } = trimmed();
    expect(openingX(keep.opening)).toBe(x0);
    expect(f().openings[far.opening]).toBeUndefined();
    expect(f().openings[cross.opening]).toBeUndefined();
  });

  it('výstupek a vybrání: celé na zbývající části zůstanou na místě, v odříznuté se smažou, zčásti se smažou celé', () => {
    const { keep, far, cross, outlines } = trimmed();
    for (const id of [keep.add, keep.sub]) expect(protrusionOutline(f(), f().protrusions![id]!)).toEqual(outlines[id]);
    expect(f().protrusions?.[far.add]).toBeUndefined();
    expect(f().protrusions?.[cross.add]).toBeUndefined();
  });

  it('napojená příčka: na zbývající části zůstane napojená (čára i líc) na místě, na odříznuté se odpojí a zůstane s volným koncem', () => {
    const { A, keep, far } = trimmed();
    expect(hostOf(keep.teeAxis)).toBe(A);
    expect(hostOf(keep.teeFace)).toBe(A);
    expect(f().nodes[f().walls[keep.teeAxis]!.a]).toMatchObject({ x: 2800, y: 0 });
    expect(f().nodes[f().walls[keep.teeFace]!.a]).toMatchObject({ x: 3200, y: 300 });
    expect(f().walls[far.tee]).toBeDefined();
    expect(hostOf(far.tee)).toBeUndefined();
    expect(f().nodes[f().walls[far.tee]!.a]).toMatchObject({ x: 5600, y: 0 });
  });

  it('Zpět vrátí všechny prvky', () => {
    const { A, far, cross } = trimmed();
    store.undo();
    expect(f().openings[far.opening]!.wallId).toBe(A);
    expect(f().openings[cross.opening]!.wallId).toBe(A);
    expect(f().protrusions![cross.add]!.wallId).toBe(A);
    expect(hostOf(far.tee)).toBe(A);
  });
});

describe('F4 / I1.13: rozdělení stěny v bodě x = 4000', () => {
  function split() {
    const s = setup();
    const outlines = Object.fromEntries(Object.values(f().protrusions!).map(p => [p.id, protrusionOutline(f(), p)]));
    const xs = { keep: openingX(s.keep.opening), far: openingX(s.far.opening) };
    let parts: [string, string] | null = null;
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 4000, y: 0 };
      parts = splitWallAt(fl, s.A, 'm');
    });
    expect(parts).not.toBeNull();
    return { ...s, outlines, xs, pA: parts![0], pB: parts![1] };
  }

  it('otvor: přejde na část, na které leží, a zůstane na místě; přes dělicí bod se smaže', () => {
    const { keep, far, cross, xs, pA, pB } = split();
    expect(f().openings[keep.opening]!.wallId).toBe(pA);
    expect(f().openings[far.opening]!.wallId).toBe(pB);
    expect(openingX(keep.opening)).toBe(xs.keep);
    expect(openingX(far.opening)).toBe(xs.far);
    expect(f().openings[cross.opening]).toBeUndefined();
  });

  it('výstupek a vybrání: přejdou na svou část a zůstanou na místě; přes dělicí bod se smaže', () => {
    const { keep, far, cross, outlines, pA, pB } = split();
    for (const id of [keep.add, keep.sub]) expect(f().protrusions![id]!.wallId).toBe(pA);
    expect(f().protrusions![far.add]!.wallId).toBe(pB);
    for (const id of [keep.add, keep.sub, far.add]) expect(protrusionOutline(f(), f().protrusions![id]!)).toEqual(outlines[id]);
    expect(f().protrusions?.[cross.add]).toBeUndefined();
  });

  it('napojená příčka: zůstane napojená na část, na které leží (čára i líc)', () => {
    const { keep, far, pA, pB } = split();
    expect(hostOf(keep.teeAxis)).toBe(pA);
    expect(hostOf(keep.teeFace)).toBe(pA);
    expect(hostOf(far.tee)).toBe(pB);
    expect(f().nodes[f().walls[far.tee]!.a]).toMatchObject({ x: 5600, y: 0 });
    expect(f().nodes[f().walls[keep.teeAxis]!.a]).toMatchObject({ x: 2800, y: 0 });
    expect(f().nodes[f().walls[keep.teeFace]!.a]).toMatchObject({ x: 3200, y: 300 });
  });

  it('příčka napojená přesně v bodě dělení: roh je teď rohem obou částí, ne napojení', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 6000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const T = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -2000 }, null, false, { thickness: 100 })!;
    const m = f().walls[T]!.a;
    expect(f().nodes[m]!.host).toBe(A);
    let parts: [string, string] | null = null;
    store.edit(fl => {
      parts = splitWallAt(fl, A, m);
    });
    expect(parts).not.toBeNull();
    expect(f().nodes[m]!.host).toBeUndefined();
    expect(f().walls[parts![0]]!.b).toBe(m);
    expect(f().walls[parts![1]]!.a).toBe(m);
  });
});

describe('F4: smazání celé stěny', () => {
  it('otvory, výstupky i vybrání zaniknou; příčky zůstanou s volným koncem', () => {
    const { A, keep, far } = setup();
    store.set({ selection: { kind: 'wall', id: A } });
    deleteSelection();
    expect(Object.keys(f().openings)).toHaveLength(0);
    expect(Object.keys(f().protrusions ?? {})).toHaveLength(0);
    for (const id of [keep.teeFace, keep.teeAxis, far.tee]) {
      expect(f().walls[id]).toBeDefined();
      expect(hostOf(id)).toBeUndefined();
    }
  });
});

describe('F4: výstupek přes volný konec stěny (I1.11)', () => {
  it('Do rohu, který odřízne konec s výstupkem, výstupek smaže; zkrácení druhého konce ho nechá', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const around = [
      { x: 2600, y: 0 },
      { x: 2600, y: -200 },
      { x: 3200, y: -200 },
      { x: 3200, y: 500 },
      { x: 2600, y: 500 },
      { x: 2600, y: 300 }
    ];
    for (let i = 0; i + 1 < around.length; i++) addLine(around[i]!, null, around[i + 1]!, null);
    expect(Object.keys(f().endProtrusions ?? {})).toHaveLength(1);
    const B = addWall({ x: 2000, y: -2000 }, null, { x: 2000, y: -500 }, null, false, { thickness: 300 })!;
    // ponechat levou část W → konec B s výstupkem se odřízne
    expect(trimToCorner(W, { x: 500, y: 150 }, B, { x: 2000, y: -1000 })).toBe('ok');
    expect(Object.keys(f().endProtrusions ?? {})).toHaveLength(0);
    store.undo();
    // ponechat pravou část W → odřízne se konec A, výstupek u B zůstane
    expect(trimToCorner(W, { x: 2900, y: 150 }, B, { x: 2000, y: -1000 })).toBe('ok');
    expect(Object.keys(f().endProtrusions ?? {})).toHaveLength(1);
  });
});
