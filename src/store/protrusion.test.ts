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
import { selectTool } from '../tools/selectTool';
import { addLine, addWall, applyNumpadValue, setProtrusionArc, deleteSelection, duplicateSelection, groupOrigin, moveGroup, moveNode, setWallAxis, setWallThickness } from './actions';
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

  // Dříve: „vybrání hlouběji než tloušťka stěny nevznikne“. Změněno podle obrázku od uživatele 2026-11-13 (3):
  // obrys od líce přes celou tloušťku ven = výstupek na protějším líci (části v těle se zahodí).
  it('obrys od líce přes celou tloušťku ven = výstupek na protějším líci (hloubka jen část za lícem)', () => {
    const S = wallS();
    polyline(tooth(1000, 1600, 400)); // od líce y = 0 přes tělo (y 0–300) až na y = 400
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ wallId: S, mode: 'add', side: 1 });
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ width: 600, depth: 100 });
    expect(Object.keys(f().walls)).toEqual([S]);
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

  it('I1.10: oblouk v obrysu – vzepětí čelní strany 100 ven, hloubka 300, plocha i hrany po oblouku, jeden krok Zpět', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: id, seg: 1 }, 100)).toBe(true);
    const p = prots()[0]!;
    expect(Math.abs(p.pts[1]!.s!)).toBe(100);
    expect(protrusionDims(f(), p)).toMatchObject({ width: 300, depth: 300 });
    // vrchol oblouku ven od stěny (y = −300), plocha patří stěně
    expect(findBodyAt(f(), { x: 2500, y: -280 })?.id).toBe(S);
    expect(hasEdgeOver(S, { x: 2400, y: -200 }, { x: 2600, y: -200 })).toBe(false);
    store.undo();
    expect(prots()[0]!.pts[1]!.s).toBeUndefined();
  });

  it('oblouk zůstane při změně hloubky úměrný a při uložení / načtení', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    setProtrusionArc(id, 1, 100);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: id, dim: 'depth' }, 600)).toBe(true);
    expect(protrusionDims(f(), prots()[0]!)!.depth).toBeCloseTo(600, 0);
    const back = migrateProject(JSON.parse(JSON.stringify(store.get().project)));
    expect(Object.values(back.floors[0]!.protrusions!)[0]!.pts[1]!.s).toBe(prots()[0]!.pts[1]!.s);
  });

  it('úsek po líci oblouk nedostane; vzepětí nejvýš půlkruh; 0 = zpět rovný', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    store.edit(fl => {
      fl.protrusions![id]!.pts.push({ u: 2350, v: 0 }); // umělý úsek po líci na konci
    });
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: id, seg: 3 }, 50)).toBe(false);
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: id, seg: 1 }, 400)).toBe(false);
    setProtrusionArc(id, 1, 120);
    setProtrusionArc(id, 1, 0);
    expect(prots()[0]!.pts[1]!.s).toBeUndefined();
  });

  it('úchyt: tažením nástrojem Vybrat se úsek vyklene, ťuknutí otevře NumPad vzepětí', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    const Z = 0.1;
    store.set({ camera: { x: 0, y: 0, zoom: Z }, tool: 'select', selection: { kind: 'protrusion', id } });
    const pen = (x: number, y: number) => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' as const });
    selectTool.down!(pen(2500, -200));
    selectTool.drag!(pen(2500, -260));
    selectTool.drag!(pen(2500, -350));
    selectTool.up!(pen(2500, -350));
    expect(protrusionDims(f(), prots()[0]!)!.depth).toBe(350);
    store.set({ selection: { kind: 'protrusion', id } });
    selectTool.down!(pen(2500, -350));
    selectTool.up!(pen(2500, -350));
    expect(store.get().numpad?.target).toEqual({ kind: 'protrusion-sagitta', protrusionId: id, seg: 1 });
  });

  it('vzepětí vybrání nesmí prorazit stěnu; boční oblouk nesmí přes souseda a líc pod ním se nekreslí', () => {
    const S = wallS();
    polyline(tooth(1000, 1600, 150)); // vybrání hloubky 150 ve stěně 300
    const sub = prots()[0]!;
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: sub.id, seg: 1 }, 200)).toBe(false);
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: sub.id, seg: 1 }, 100)).toBe(true);
    polyline(tooth(2350, 2650, -200));
    polyline(tooth(2700, 3000, -200));
    const a = prots().find(p => p.pts[0]!.u === 2350)!;
    // boční strana u 2650 (úsek 2) vyklenutá o 100 ven by zasáhla do souseda (2700)
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: a.id, seg: 2 }, 100)).toBe(false);
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: a.id, seg: 2 }, 40)).toBe(true);
    expect(protrusionDims(f(), prots().find(p => p.id === a.id)!)!.width).toBeCloseTo(340, 0);
    expect(hasEdgeOver(S, { x: 2655, y: 0 }, { x: 2685, y: 0 })).toBe(false);
  });

  it('změna hloubky s obloukem na čele: hloubka přesně, vzepětí nejvýš půlkruh', () => {
    wallS();
    polyline(tooth(2350, 2650, -200));
    const id = prots()[0]!.id;
    setProtrusionArc(id, 1, 150);
    expect(applyNumpadValue({ kind: 'protrusion-dim', protrusionId: id, dim: 'depth' }, 700)).toBe(true);
    const p = prots()[0]!;
    expect(protrusionDims(f(), p)!.depth).toBeCloseTo(700, 0);
    expect(Math.abs(p.pts[1]!.s!)).toBeLessThanOrEqual(150);
  });

  it('sloučení s obráceně kreslenou stěnou: oblouk ve výkresu zůstane na místě', () => {
    const S = wallS();
    polyline(tooth(2350, 2650, -200));
    setProtrusionArc(prots()[0]!.id, 1, 100);
    const before = protrusionOutline(f(), prots()[0]!)!;
    // pokračování na konci A kreslené od A ven (opačný směr než S)
    addWall({ x: 0, y: 0 }, f().walls[S]!.a, { x: -1000, y: 0 }, null, false, { thickness: 300 });
    expect(Object.keys(f().walls)).toHaveLength(1);
    const after = protrusionOutline(f(), prots()[0]!)!;
    const near = (p: { x: number; y: number }) => after.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.6);
    expect(before.every(near)).toBe(true);
  });

  it('obrys jen pár mm za protějším lícem = vybrání přes celou tloušťku (ne 2mm výstupek); návrat do těla = čáry', () => {
    wallS();
    polyline(tooth(1000, 1600, 302));
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ mode: 'subtract' });
    expect(protrusionDims(f(), prots()[0]!)!.depth).toBe(300);
    store.openProject(createProject({ name: 't' }));
    wallS();
    // venku za protějším lícem, mezi tím zpět do těla
    polyline([{ x: 2000, y: 0 }, { x: 2000, y: 400 }, { x: 2200, y: 150 }, { x: 2400, y: 400 }, { x: 2400, y: 0 }]);
    expect(prots()).toHaveLength(0);
  });
});
