/**
 * Značka v půdorysu (ZNACKY-POZNAMKY-DETAILY.md, krok A): číslování, nepřečíslování po smazání, ruční číslo,
 * Zpět / Vpřed, kopie, otočení směru se skupinou, zachování obsahu skici, migrace.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createFloor, createProject } from '../model/factory';
import type { MarkDir, MarkPage, Project } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { dirAngle, dirDistance, dirTargetFromDrag, markCode, markContent, MARK_PREFIX, nextMarkNumber } from '../core/marks';
import { markDirHandle } from '../canvas/drawMarks';
import { toScreen } from '../canvas/view';
import { eraseInPage, hitSketch, moveSketchItem, removeSketchItem, sketchPolylines } from '../core/sketch';
import { markBoxPx, markIconPx } from '../core/marks';
import { selectTool } from '../tools/selectTool';
import { markTool } from '../tools/markTool';
import type { PointerInput } from '../tools/types';
import { layerContents, SYS } from '../core/layers';
import { requestDelete } from '../ui/deleteConfirm';
import { pickAny } from '../tools/pick';
import { addWall, setLayerLocked } from './actions';
import { migrateProject } from '../persistence/migrate';
import { addMark, deleteSelection, duplicateSelection, groupOrigin, moveGroup, rotateSelection, setMarkContent, setMarkDir, setMarkNumber, updateMark } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const P = () => store.get().project!;
const nums = () => P().floors.flatMap(fl => Object.values(fl.marks ?? {}).map(m => m.num)).sort((a, b) => a - b);

beforeEach(() => store.openProject(createProject({ name: 't' })));

describe('číslování', () => {
  it('pořadové čísla Z1, Z2…, unikátní v celém projektu (i na jiném podlaží)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    addMark({ x: 1000, y: 0 });
    expect(markCode(f().marks![a]!)).toBe(`${MARK_PREFIX}1`);
    store.editProject(p => void p.floors.push(createFloor('2.NP')));
    store.set({ floorId: P().floors[1]!.id });
    const c = addMark({ x: 0, y: 0 })!;
    expect(f().marks![c]!.num).toBe(3);
    expect(nums()).toEqual([1, 2, 3]);
  });

  it('smazání nepřečísluje ostatní; nová značka dostane číslo nad nejvyšším', () => {
    addMark({ x: 0, y: 0 });
    const b = addMark({ x: 1000, y: 0 })!;
    addMark({ x: 2000, y: 0 });
    store.set({ selection: { kind: 'mark', id: b } });
    deleteSelection();
    expect(nums()).toEqual([1, 3]);
    addMark({ x: 3000, y: 0 });
    expect(nums()).toEqual([1, 3, 4]);
  });

  it('ruční změna čísla s kontrolou duplicity (i na jiném podlaží)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    addMark({ x: 1000, y: 0 });
    expect(setMarkNumber(a, 2)).toContain('už má jiná poznámka');
    expect(setMarkNumber(a, 0)).toContain('kladné celé');
    expect(setMarkNumber(a, 7)).toBeNull();
    expect(f().marks![a]!.num).toBe(7);
    expect(nextMarkNumber(P())).toBe(8);
  });
});

describe('Zpět / Vpřed', () => {
  it('založení, posun, přejmenování, smazání – každé jeden krok', () => {
    const a = addMark({ x: 0, y: 0 })!;
    moveGroup(groupOrigin(f(), [{ kind: 'mark', id: a }]), 500, 300);
    expect(f().marks![a]).toMatchObject({ x: 500, y: 300 });
    updateMark(a, { name: 'Sokl' });
    store.set({ selection: { kind: 'mark', id: a } });
    deleteSelection();
    expect(f().marks?.[a]).toBeUndefined();
    store.undo();
    expect(f().marks![a]).toMatchObject({ name: 'Sokl', x: 500, y: 300 });
    store.undo();
    expect(f().marks![a]!.name).toBe('');
    store.undo();
    expect(f().marks![a]).toMatchObject({ x: 0, y: 0 });
    store.undo();
    expect(f().marks?.[a]).toBeUndefined();
    store.redo();
    store.redo();
    expect(f().marks![a]).toMatchObject({ x: 500, y: 300, num: 1 });
  });

  it('obsah skici a poznámka se zachovají; smazání a Zpět vrátí značku i s obsahem', () => {
    const a = addMark({ x: 0, y: 0 })!;
    const page: MarkPage = { ...f().marks![a]!.pages[0]!, strokes: [{ mode: 'free', color: '#dc2626', width: 2.5, pts: [{ x: 1, y: 2 }, { x: 30, y: 40 }] }], labels: [{ x: 10, y: 10, text: 'EPS 160', color: '#0f172a' }], dims: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, text: '120 mm' }] };
    setMarkContent(a, 'hydroizolace', [page]);
    const saved = JSON.stringify(f().marks![a]);
    expect(f().marks![a]!.note).toBe('hydroizolace');
    expect(f().marks![a]!.pages[0]).toEqual(page);
    store.set({ selection: { kind: 'mark', id: a } });
    deleteSelection();
    store.undo();
    expect(JSON.stringify(f().marks![a])).toBe(saved);
    // stejný obsah = žádný krok navíc
    const canUndoBefore = store.get().canUndo;
    setMarkContent(a, 'hydroizolace', [page]);
    expect(store.get().canUndo).toBe(canUndoBefore);
  });
});

describe('kopie, otočení, vrstva', () => {
  it('kopie dostane další číslo a nese název, barvu, poznámku i skicu (rozhodnutí uživatele 2026-11-20)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    updateMark(a, { name: 'Parapet', color: '#dc2626' });
    setMarkContent(a, 'pozn', [{ ...f().marks![a]!.pages[0]!, labels: [{ x: 0, y: 0, text: 'x', color: '#0f172a' }] }]);
    store.set({ selection: { kind: 'mark', id: a } });
    duplicateSelection();
    const copies = Object.values(f().marks!).filter(m => m.id !== a);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ num: 2, name: 'Parapet', color: '#dc2626', note: 'pozn' });
    expect(copies[0]!.pages[0]!.labels).toHaveLength(1);
    expect(copies[0]!.pages[0]!.id).not.toBe(f().marks![a]!.pages[0]!.id);
  });

  it('otočení skupiny otočí i směr pohledu; nová značka jde do vrstvy Popisky', () => {
    const a = addMark({ x: 0, y: 0 })!;
    expect(f().marks![a]!.layerId).toBe(SYS.popisky);
    setMarkDir(a, { on: true, style: 'arrow', to: { x: 1500, y: 0 } });
    store.set({ selection: { kind: 'mark', id: a } });
    rotateSelection(90);
    const m = f().marks![a]!;
    expect(m.dir).toMatchObject({ on: true, style: 'arrow' });
    expect(dirAngle(m)).toBe(90);
    expect(dirDistance(m)).toBe(1500);
  });
});

describe('migrace 29 → 30', () => {
  it('starý projekt bez značek se otevře; značka bez vrstvy dostane Popisky; opakované načtení nic nemění', () => {
    const old = JSON.parse(JSON.stringify(createProject({ name: 'x' }))) as Project;
    old.schema = 29;
    const m = migrateProject(old);
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.floors[0]!.marks).toBeUndefined();
    const withMark = JSON.parse(JSON.stringify(m)) as Project;
    withMark.floors[0]!.marks = { mk1: { id: 'mk1', num: 5, name: '', x: 0, y: 0, color: '#7c3aed', note: '', pages: [{ id: 'pg', strokes: [], labels: [], dims: [] }] } };
    const m2 = migrateProject(withMark);
    expect(m2.floors[0]!.marks!.mk1!.layerId).toBe(SYS.popisky);
    expect(m2.floors[0]!.marks!.mk1!.num).toBe(5);
    expect(migrateProject(JSON.parse(JSON.stringify(m2)))).toEqual(m2);
  });
});

describe('skica a ovládání v půdorysu', () => {
  it('guma smaže tah, kótu i popisek pod bodem; ikona podle obsahu', () => {
    const a = addMark({ x: 0, y: 0 })!;
    expect(markContent(f().marks![a]!)).toBeNull();
    setMarkContent(a, 'jen text', f().marks![a]!.pages);
    expect(markContent(f().marks![a]!)).toBe('text');
    const pg: MarkPage = { id: 'p', strokes: [{ mode: 'line', color: '#000', width: 2, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], labels: [{ x: 200, y: 0, text: 'a', color: '#000' }], dims: [{ a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, text: '1' }] };
    expect(eraseInPage(pg, { x: 50, y: 3 }, 10)!.strokes).toHaveLength(0);
    expect(eraseInPage(pg, { x: 50, y: 52 }, 10)!.dims).toHaveLength(0);
    expect(eraseInPage(pg, { x: 205, y: 0 }, 10)!.labels).toHaveLength(0);
    expect(eraseInPage(pg, { x: 500, y: 500 }, 10)).toBeNull();
    setMarkContent(a, 'jen text', [pg]);
    expect(markContent(f().marks![a]!)).toBe('sketch');
  });

  const Z = 0.1;
  const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
  it('nástroj Značka: klepnutí založí; klepnutí na značku otevře okno; tažení posune; úchyt otočí směr', () => {
    store.set({ camera: { x: 0, y: 0, zoom: Z }, tool: 'mark', selection: null });
    markTool.down!(at(1000, 1000));
    markTool.up!(at(1000, 1000));
    const id = Object.keys(f().marks!)[0]!;
    expect(store.get().selection).toEqual({ kind: 'mark', id });
    expect(store.get().markOpen).toBeNull();
    markTool.down!(at(1000, 1000));
    markTool.up!(at(1000, 1000));
    expect(store.get().markOpen).toBe(id);
    store.set({ markOpen: null });
    selectTool.down!(at(1000, 1000));
    selectTool.drag!(at(1500, 1000));
    selectTool.drag!(at(3000, 1000));
    selectTool.up!(at(3000, 1000));
    expect(f().marks![id]).toMatchObject({ x: 3000, y: 1000 });
    expect(store.get().markOpen).toBeNull();
    setMarkDir(id, { on: true, to: { x: 5000, y: 1000 } });
    selectTool.down!(at(5000, 1000));
    selectTool.drag!(at(4000, 2000));
    // konec směru = bod ve výkresu (přání uživatele 2026-11-20 – při zoomu ukazuje pořád na stejné místo)
    selectTool.drag!(at(3000, 2500));
    selectTool.up!(at(3000, 2500));
    expect(f().marks![id]!.dir!.to).toEqual({ x: 3000, y: 2500 });
  });
});

describe('nálezy kontroly kroku A', () => {
  it('Smazat s výběrem značky jen požádá o potvrzení; ostatní prvky se smažou hned', () => {
    const a = addMark({ x: 0, y: 0 })!;
    store.set({ selection: { kind: 'mark', id: a } });
    requestDelete();
    expect(store.get().deleteConfirm).toBe(true);
    expect(f().marks![a]).toBeTruthy();
    store.set({ deleteConfirm: false });
    const w = addWall({ x: 0, y: 3000 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 200, side: 1 })!;
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: w }] } });
    requestDelete();
    expect(f().walls[w]).toBeUndefined();
    expect(store.get().deleteConfirm).toBe(false);
  });

  it('značka na rohu stěny se vybere ťuknutím (má přednost před rohem)', () => {
    addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 300, side: 1 });
    const a = addMark({ x: 0, y: 0 })!;
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    expect(pickAny(store.view('pick')!, { x: 0, y: 0 }, store.get().camera, null)).toEqual({ kind: 'mark', id: a });
  });

  it('značka je v exportu (layerContents) ve vrstvě Popisky', () => {
    const a = addMark({ x: 0, y: 0 })!;
    const pop = layerContents(P(), f()).find(g => g.layer.id === SYS.popisky)!;
    expect(pop.items).toContainEqual({ kind: 'mark', id: a });
  });

  it('uložení obsahu do zamčené vrstvy Popisky se neprovede a vrátí false (okno zůstane otevřené)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    setLayerLocked(SYS.popisky, true);
    expect(setMarkContent(a, 'nová', f().marks![a]!.pages)).toBe(false);
    expect(f().marks![a]!.note).toBe('');
  });
});

describe('úpravy 2026-11-20: štítek, tvary a výběr ve skice', () => {
  it('štítek značky nese číslo i název (směr ho nezakrývá); zásah perem po celé šířce štítku', () => {
    const a = addMark({ x: 0, y: 0 })!;
    updateMark(a, { name: 'Sokl u terasy' });
    const m = f().marks![a]!;
    const { w } = markBoxPx(m);
    expect(w).toBeGreaterThan(markBoxPx({ num: 1, name: '' }).w);
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    // bod u pravého okraje štítku (kde je název) vybere značku
    expect(pickAny(store.view('pick')!, { x: (w / 2 - 4) / 0.1, y: 0 }, store.get().camera, null)).toEqual({ kind: 'mark', id: a });
  });

  it('štítek značky s obsahem má pole s ikonou (o 24 px širší) a ťuknutí u pravého okraje ji vybere', () => {
    const a = addMark({ x: 0, y: 0 })!;
    updateMark(a, { name: 'Sokl' });
    expect(markIconPx(f().marks![a]!)).toBe(0);
    const w0 = markBoxPx(f().marks![a]!).w;
    setMarkContent(a, 'EPS 160 mm', f().marks![a]!.pages);
    const m = f().marks![a]!;
    expect(markIconPx(m)).toBe(24);
    const { w } = markBoxPx(m);
    expect(w).toBe(w0 + 24);
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    expect(pickAny(store.view('pick')!, { x: (w / 2 - 4) / 0.1, y: 0 }, store.get().camera, null)).toEqual({ kind: 'mark', id: a });
  });

  it('tvary skici: čára, obdélník, kruh, oblouk, dvojitá čára mají geometrii; výběr, posun a smazání prvku', () => {
    const c = '#000';
    const page: MarkPage = {
      id: 'p',
      strokes: [
        { mode: 'line', color: c, width: 2, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { mode: 'rect', color: c, width: 2, pts: [{ x: 200, y: 0 }, { x: 300, y: 100 }] },
        { mode: 'circle', color: c, width: 2, pts: [{ x: 500, y: 0 }, { x: 550, y: 0 }] },
        { mode: 'arc', color: c, width: 2, pts: [{ x: 0, y: 300 }, { x: 200, y: 300 }], s: 50 },
        { mode: 'double', color: c, width: 2, pts: [{ x: 0, y: 500 }, { x: 200, y: 500 }], w: 12 }
      ],
      labels: [{ x: 700, y: 0, text: 'EPS', color: c }],
      dims: []
    };
    expect(sketchPolylines(page.strokes[1]!)[0]).toHaveLength(5);
    expect(sketchPolylines(page.strokes[2]!)[0]!.length).toBeGreaterThan(20);
    expect(sketchPolylines(page.strokes[4]!)).toHaveLength(2);
    expect(hitSketch(page, { x: 300, y: 50 }, 5)).toEqual({ kind: 'stroke', index: 1 });
    expect(hitSketch(page, { x: 550, y: 0 }, 5)).toEqual({ kind: 'stroke', index: 2 });
    expect(hitSketch(page, { x: 100, y: 512 }, 5)).toEqual({ kind: 'stroke', index: 4 });
    expect(hitSketch(page, { x: 700, y: 0 }, 5)).toEqual({ kind: 'label', index: 0 });
    expect(hitSketch(page, { x: 400, y: 400 }, 5)).toBeNull();
    const moved = moveSketchItem(page, { kind: 'stroke', index: 1 }, 10, 20);
    expect(moved.strokes[1]!.pts).toEqual([{ x: 210, y: 20 }, { x: 310, y: 120 }]);
    expect(moved.strokes[0]).toBe(page.strokes[0]);
    expect(moveSketchItem(page, { kind: 'label', index: 0 }, 5, 5).labels[0]).toMatchObject({ x: 705, y: 5 });
    expect(removeSketchItem(page, { kind: 'stroke', index: 0 }).strokes).toHaveLength(4);
    // tvar uložený ve značce se zachová
    const a = addMark({ x: 0, y: 0 })!;
    setMarkContent(a, '', [page]);
    expect(f().marks![a]!.pages[0]).toEqual(page);
  });
});

describe('nálezy kontroly úprav 2026-11-20', () => {
  it('konec směru ukazuje při každém zoomu na stejné místo výkresu; pod štítkem úchyt není (táhne se štítek)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    setMarkDir(a, { on: true, to: { x: 2000, y: 1000 } });
    const m = f().marks![a]!;
    for (const zoom of [0.05, 0.2, 1]) {
      const cam = { x: 0, y: 0, zoom };
      const h = markDirHandle(m, cam);
      expect(h).toEqual(toScreen({ x: 2000, y: 1000 }, cam));
    }
    // velmi oddálený výkres: cíl pod štítkem → úchyt se nenabízí
    expect(markDirHandle(m, { x: 0, y: 0, zoom: 0.001 })).toBeNull();
    // úhel a vzdálenost z panelu
    setMarkDir(a, { angle: 90 });
    expect(f().marks![a]!.dir!.to).toEqual({ x: 0, y: Math.round(Math.hypot(2000, 1000)) });
    setMarkDir(a, { dist: 500 });
    expect(f().marks![a]!.dir!.to).toEqual({ x: 0, y: 500 });
  });

  it('roh pod názvem dlouhého štítku jde vybrat; číslo značky má přednost i před rohem', () => {
    store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
    const a = addMark({ x: 0, y: 0 })!;
    updateMark(a, { name: 'Ostění okna v obývacím pokoji' });
    const { w } = markBoxPx(f().marks![a]!);
    // roh stěny pod pravou částí štítku (název)
    const x = (w / 2 - 20) / 0.1;
    addWall({ x, y: 0 }, null, { x: x + 3000, y: 0 }, null, false, { thickness: 300, side: 1 });
    expect(pickAny(store.view('pick')!, { x, y: 0 }, store.get().camera, null)?.kind).toBe('node');
    // roh pod číslem: vybere se značka
    const x2 = (-w / 2 + 12) / 0.1;
    addWall({ x: x2, y: 0 }, null, { x: x2, y: -3000 }, null, false, { thickness: 300, side: 1 });
    expect(pickAny(store.view('pick')!, { x: x2, y: 0 }, store.get().camera, null)).toEqual({ kind: 'mark', id: a });
  });

  it('stará data (verze 30 / 31): směr z úhlu se převede na cíl ve výkresu; skica jen s perem / přímkou funguje', () => {
    const old = JSON.parse(JSON.stringify(createProject({ name: 'x' }))) as Project;
    old.schema = 31;
    const pg: MarkPage = { id: 'pg', strokes: [{ mode: 'free', color: '#000', width: 2, pts: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 40, y: 0 }] }, { mode: 'line', color: '#000', width: 2, pts: [{ x: 0, y: 100 }, { x: 100, y: 100 }] }], labels: [], dims: [] };
    old.floors[0]!.marks = { mk1: { id: 'mk1', num: 1, name: '', x: 0, y: 0, color: '#7c3aed', note: '', dir: { on: true, angle: 0, len: 150, style: 'cone' } as unknown as MarkDir, pages: [pg] } };
    const m = migrateProject(old);
    const mk = m.floors[0]!.marks!.mk1!;
    expect(mk.dir).toEqual({ on: true, style: 'cone', to: { x: 1500, y: 0 } });
    expect(migrateProject(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(hitSketch(mk.pages[0]!, { x: 50, y: 100 }, 5)).toEqual({ kind: 'stroke', index: 1 });
    expect(hitSketch(mk.pages[0]!, { x: 20, y: 2 }, 5)).toEqual({ kind: 'stroke', index: 0 });
  });

  it('guma maže obdélník a kruh po obrysu; ťuknutí dovnitř obdélníku ho nevybere', () => {
    const pg: MarkPage = { id: 'p', strokes: [{ mode: 'rect', color: '#000', width: 2, pts: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }, { mode: 'circle', color: '#000', width: 2, pts: [{ x: 300, y: 0 }, { x: 350, y: 0 }] }], labels: [], dims: [] };
    expect(hitSketch(pg, { x: 50, y: 50 }, 5)).toBeNull();
    expect(eraseInPage(pg, { x: 100, y: 50 }, 5)!.strokes).toHaveLength(1);
    expect(eraseInPage(pg, { x: 300, y: 50 }, 5)!.strokes).toHaveLength(1);
    expect(eraseInPage(pg, { x: 300, y: 0 }, 5)).toBeNull();
  });
});

describe('nálezy kontroly cíle směru', () => {
  it('tažení úchytu na štítek nebo na značku uloží cíl aspoň kousek za okrajem štítku (úchyt nezapadne)', () => {
    const a = addMark({ x: 0, y: 0 })!;
    updateMark(a, { name: 'Dlouhý název značky' });
    setMarkDir(a, { on: true, to: { x: 0, y: -3000 } });
    const zoom = 0.1;
    const m = f().marks![a]!;
    const { w } = markBoxPx(m);
    // pero 10 px vpravo od středu (na štítku)
    const to = dirTargetFromDrag(m, { x: 10 / zoom, y: 0 }, zoom);
    expect(to.y).toBe(0);
    expect(to.x * zoom).toBeGreaterThanOrEqual(w / 2 + 19);
    // pero přesně na značce: původní směr (nahoru)
    const up = dirTargetFromDrag(m, { x: 0, y: 0 }, zoom);
    expect(up.x).toBe(0);
    expect(up.y).toBeLessThan(0);
    setMarkDir(a, { to });
    expect(markDirHandle(f().marks![a]!, { x: 0, y: 0, zoom })).not.toBeNull();
  });
});
