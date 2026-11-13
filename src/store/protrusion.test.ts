/**
 * Výstupek a vybrání stěny – příklady KATALOG-STEN.md, sekce I2. Osa Y v aplikaci míří dolů:
 * stěna S z (0,0) do (5000,0), tloušťka 300, tělo y ∈ [0, 300] (side 1). Líc „místnost“ y = 0 (ven = −y),
 * vnější líc y = 300 (ven = +y). Katalogové y se proto píše se zápornou hodnotou.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { protrusionDims, protrusionOutline } from '../core/protrusion';
import { findBodyAt, pointInPolygon, wallBodies } from '../core/wallBody';
import { migrateProject } from '../persistence/migrate';
import { splitWallAt } from '../core/topology';
import { addLine, addWall, applyNumpadValue, deleteSelection, duplicateSelection, groupOrigin, moveGroup, moveNode, setWallAxis, setWallThickness } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const prots = () => Object.values(f().protrusions ?? {});

function wallS(opts: { axis?: 'center' } = {}) {
  store.openProject(createProject({ name: 't' }));
  return addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1, ...opts })!;
}

/** Nakreslí lomenou čáru nástrojem Čára (úsek po úseku jako perem). */
function polyline(pts: Pt[]) {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
}

const tooth = (u0: number, u1: number, v: number, face = 0): Pt[] => [
  { x: u0, y: face },
  { x: u0, y: face + v },
  { x: u1, y: face + v },
  { x: u1, y: face }
];

/** Je na výkresu kreslená hrana ležící na úsečce p–q (do 0,5 mm)? */
function hasEdgeOver(wallId: string, p: Pt, q: Pt): boolean {
  const body = wallBodies(f()).get(wallId)!;
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return body.edges.some(([a, b]) => {
    const t = ((mid.x - a.x) * (b.x - a.x) + (mid.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    if (t < 0 || t > 1) return false;
    return Math.hypot(a.x + (b.x - a.x) * t - mid.x, a.y + (b.y - a.y) * t - mid.y) < 0.5;
  });
}

describe('I2 výstupek a vybrání', () => {
  it('1: obdélníkový výstupek uprostřed – jeden prvek, líc v jeho šířce se nekreslí, stěna celá', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    expect(Object.keys(f().walls)).toEqual([S]); // čáry zmizely, stěna jedna
    expect(prots()).toHaveLength(1);
    const p = prots()[0]!;
    expect(p).toMatchObject({ wallId: S, mode: 'add' });
    expect(protrusionDims(f(), p)).toMatchObject({ width: 300, depth: 200, before: 2350, after: 2350 });
    expect(hasEdgeOver(S, { x: 2400, y: 0 }, { x: 2600, y: 0 })).toBe(false);
    expect(hasEdgeOver(S, { x: 1000, y: 0 }, { x: 2000, y: 0 })).toBe(true);
    expect(hasEdgeOver(S, { x: 2400, y: -200 }, { x: 2600, y: -200 })).toBe(true);
    expect(store.get().selection).toEqual({ kind: 'protrusion', id: p.id });
    // plocha výstupku patří stěně (zásah perem)
    expect(findBodyAt(f(), { x: 2500, y: -100 })?.id).toBe(S);
  });

  it('2: dva výstupky vedle sebe – odstup od prvního a od konce B', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    polyline(tooth(3650, 3950, -200));
    expect(prots()).toHaveLength(2);
    const second = prots().find(p => p.pts[0]!.u > 3000)!;
    expect(protrusionDims(f(), second)).toMatchObject({ before: 1000, after: 1050 });
  });

  it('3: vybrání do těla – odebere se z těla, vnější líc beze změny', () => {
    const S = wallS();
    polyline(tooth(1000, 1600, 150));
    const p = prots()[0]!;
    expect(p.mode).toBe('subtract');
    expect(protrusionDims(f(), p)).toMatchObject({ width: 600, depth: 150 });
    expect(findBodyAt(f(), { x: 1300, y: 50 })).toBeNull(); // výklenek je prázdný
    expect(findBodyAt(f(), { x: 1300, y: 250 })?.id).toBe(S);
    expect(hasEdgeOver(S, { x: 1100, y: 0 }, { x: 1500, y: 0 })).toBe(false);
    expect(hasEdgeOver(S, { x: 1100, y: 300 }, { x: 1500, y: 300 })).toBe(true);
  });

  it('4: výstupek zvenku (na vnějším líci)', () => {
    const S = wallS();
    polyline(tooth(500, 900, 300, 300));
    const p = prots()[0]!;
    expect(p).toMatchObject({ mode: 'add', side: 1 });
    expect(hasEdgeOver(S, { x: 600, y: 300 }, { x: 800, y: 300 })).toBe(false);
    expect(hasEdgeOver(S, { x: 600, y: 0 }, { x: 800, y: 0 })).toBe(true);
  });

  it('5: konec mimo líc – zůstane obyčejná čára', () => {
    wallS();
    polyline([{ x: 2350, y: 0 }, { x: 2350, y: -200 }, { x: 2800, y: -400 }]);
    expect(prots()).toHaveLength(0);
    expect(Object.keys(f().walls)).toHaveLength(3);
  });

  it('6: posun stěny nese výstupek; konec B nehýbe, konec A ho posune (odstup od A)', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    const p = () => prots()[0]!;
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: S }]), 0, 1000);
    expect(protrusionOutline(f(), p())![1]).toEqual({ x: 2350, y: 800 });
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: S }]), 0, -1000);
    moveNode(f().walls[S]!.b, { x: 6000, y: 0 });
    expect(protrusionOutline(f(), p())![0]).toEqual({ x: 2350, y: 0 });
    moveNode(f().walls[S]!.a, { x: -1000, y: 0 });
    expect(protrusionOutline(f(), p())![0]).toEqual({ x: 1350, y: 0 });
  });

  it('7: smazání výstupku vrátí tělo, Zpět ho vrátí; smazání stěny smaže i výstupek', () => {
    const S = wallS();
    const before = JSON.stringify(wallBodies(f()).get(S)!.edges);
    polyline(tooth(2350, 2650, -200));
    deleteSelection();
    expect(prots()).toHaveLength(0);
    expect(JSON.stringify(wallBodies(f()).get(S)!.edges)).toBe(before);
    store.undo();
    expect(prots()).toHaveLength(1);
    store.set({ selection: { kind: 'wall', id: S } });
    deleteSelection();
    expect(prots()).toHaveLength(0);
  });

  it('8: změna tloušťky – výstupek na líci místnosti zůstane, na vnějším líci se posune s lícem', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    polyline(tooth(500, 900, 300, 300));
    setWallThickness(S, 200);
    const inner = prots().find(p => p.side === -1)!;
    const outer = prots().find(p => p.side === 1)!;
    expect(protrusionOutline(f(), inner)![1]).toEqual({ x: 2350, y: -200 });
    expect(protrusionOutline(f(), outer)![0]).toEqual({ x: 500, y: 200 });
    expect(protrusionOutline(f(), outer)![1]).toEqual({ x: 500, y: 500 });
  });

  it('9: osa uprostřed – výstupek jen od líce těla, ne od osy', () => {
    wallS({ axis: 'center' }); // tělo y ∈ [−150, 150]
    polyline(tooth(2350, 2650, -200, 0));
    expect(prots()).toHaveLength(0);
    polyline(tooth(1000, 1300, -200, -150));
    expect(prots()).toHaveLength(1);
    expect(protrusionOutline(f(), prots()[0]!)![1]).toEqual({ x: 1000, y: -350 });
  });

  it('osa líc → střed: výstupek zůstane na svém líci', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    setWallAxis(S, 'center');
    expect(protrusionOutline(f(), prots()[0]!)![0]).toEqual({ x: 2350, y: -150 });
  });

  it('10: kóta hloubky 250 – mění se jen výstupek, jeden krok Zpět', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    const wallBefore = JSON.stringify(f().walls[S]);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: id, dim: 'depth' }, 250)).toBe(true);
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ depth: 250, width: 300 });
    expect(JSON.stringify(f().walls[S])).toBe(wallBefore);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: id, dim: 'width' }, 500)).toBe(true);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: id, dim: 'before' }, 1000)).toBe(true);
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ before: 1000, width: 500, after: 3500 });
    store.undo();
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ before: 2350, width: 500 });
  });

  it('vybrání hlouběji než tloušťka stěny nevznikne', () => {
    wallS();
    polyline(tooth(1000, 1600, 400));
    expect(prots()).toHaveLength(0);
  });

  it('11: uložení a načtení – výstupek se zachová; starší data bez výstupků dostanou prázdný seznam', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    const saved = JSON.parse(JSON.stringify(store.get().project));
    const back = migrateProject(saved);
    expect(Object.values(back.floors[0]!.protrusions!)).toHaveLength(1);
    const old = JSON.parse(JSON.stringify(saved));
    old.schema = 9;
    delete old.floors[0].protrusions;
    expect(migrateProject(old).floors[0]!.protrusions).toEqual({});
  });

  it('obrys výstupku je uzavřený mnohoúhelník (bod uvnitř)', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    expect(pointInPolygon({ x: 2500, y: -100 }, protrusionOutline(f(), prots()[0]!)!)).toBe(true);
  });

  it('pokračování stěny přikreslené na konci A: výstupek zůstane na místě ve výkresu', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    addWall({ x: -1000, y: 0 }, null, { x: 0, y: 0 }, f().walls[S]!.a, false, { thickness: 300 });
    expect(Object.keys(f().walls)).toHaveLength(1);
    expect(protrusionOutline(f(), prots()[0]!)![1]).toEqual({ x: 2350, y: -200 });
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ before: 3350 });
  });

  it('kopie stěny zkopíruje i výstupek', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    store.set({ selection: { kind: 'wall', id: S } });
    duplicateSelection();
    expect(prots()).toHaveLength(2);
    expect(new Set(prots().map(p => p.wallId)).size).toBe(2);
  });

  it('rozdělení stěny (D4): výstupek přejde na část, na které leží, a zůstane na místě', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 2000, y: 0 };
      splitWallAt(fl, S, 'm');
    });
    const p = prots()[0]!;
    expect(f().walls[p.wallId]!.a).toBe('m');
    expect(protrusionOutline(f(), p)![1]).toEqual({ x: 2350, y: -200 });
  });

  it('výstupek od rohu stěny (u0 = 0): čára začíná v rohu A', () => {
    const S = wallS();
    addLine({ x: 0, y: 0 }, f().walls[S]!.a, { x: 0, y: -200 }, null);
    polyline([{ x: 0, y: -200 }, { x: 400, y: -200 }, { x: 400, y: 0 }]);
    expect(prots()).toHaveLength(1);
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ before: 0, width: 400 });
    expect(Object.keys(f().walls)).toEqual([S]);
  });

  it('obrys přes konec stěny zůstane čarou; kóta nepustí výstupek za konec stěny ani přes souseda', () => {
    wallS();
    polyline([{ x: 4800, y: 0 }, { x: 4800, y: -200 }, { x: 5200, y: -200 }, { x: 5200, y: 0 }]);
    expect(prots()).toHaveLength(0);
    store.openProject(createProject({ name: 't' }));
    wallS();
    polyline(tooth(2350, 2650, -200));
    polyline(tooth(3650, 3950, -200));
    const first = prots().find(p => p.pts[0]!.u < 3000)!;
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: first.id, dim: 'width' }, 6000)).toBe(false);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: first.id, dim: 'after' }, 0)).toBe(true);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: first.id, dim: 'before' }, 3500)).toBe(false);
    expect(protrusionDims(f(), prots().find(p => p.id === first.id)!)).toMatchObject({ before: 3350, after: 0 });
  });

  it('výstupek přes dělicí bod zůstane u části s větším překrytím (I1.13)', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 2400, y: 0 };
      splitWallAt(fl, S, 'm');
    });
    expect(f().walls[prots()[0]!.wallId]!.a).toBe('m');
    expect(protrusionOutline(f(), prots()[0]!)![0]).toEqual({ x: 2350, y: 0 });
  });

  it('přehození strany stěny: výstupek zůstane na své straně (ven od těla) a posune se s lícem', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    store.edit(fl => {
      fl.walls[S]!.side = -1;
    });
    // tělo je teď y ∈ [−300, 0], výstupek na líci y = −300 dál míří od těla (−y)
    expect(protrusionOutline(f(), prots()[0]!)![1]).toEqual({ x: 2350, y: -500 });
  });
});
