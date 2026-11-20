/**
 * Značka v půdorysu (ZNACKY-POZNAMKY-DETAILY.md, krok A): číslování, nepřečíslování po smazání, ruční číslo,
 * Zpět / Vpřed, kopie, otočení směru se skupinou, zachování obsahu skici, migrace.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createFloor, createProject } from '../model/factory';
import type { MarkPage, Project } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { eraseInPage, markCode, markContent, MARK_PREFIX, MARK_PX, nextMarkNumber } from '../core/marks';
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
    expect(setMarkNumber(a, 2)).toContain('už má jiná značka');
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
    setMarkDir(a, { on: true, style: 'arrow', angle: 0 });
    store.set({ selection: { kind: 'mark', id: a } });
    rotateSelection(90);
    expect(f().marks![a]!.dir).toMatchObject({ on: true, style: 'arrow', angle: 90 });
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
    setMarkDir(id, { on: true, angle: 0 });
    const handle = at(3000 + MARK_PX.dirLen / Z, 1000);
    selectTool.down!(handle);
    selectTool.drag!(at(3000, 1000 + 200));
    selectTool.drag!(at(3000, 1000 + MARK_PX.dirLen / Z));
    selectTool.up!(at(3000, 1000 + MARK_PX.dirLen / Z));
    expect(f().marks![id]!.dir!.angle).toBe(90);
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
