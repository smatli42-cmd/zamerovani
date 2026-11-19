/**
 * Vrstvy (zadání „Vrstvy“ krok 1, rozhodnutí uživatele 2026-11-19): pravidla 1–7 pro každý druh prvku, migrace
 * starého projektu, export JSON a centrální funkce pro export (pravidlo 10). Pravidla jen v core/layers.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createFloor, createProject } from '../model/factory';
import type { Floor, Id, Project, Pt } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { elementLayer, elementLayers, layerContents, layersOf, SYS, viewFloor, type ElemKind } from '../core/layers';
import { protrusionsOf } from '../core/protrusion';
import { snapPoint } from '../core/snapping';
import { selectInRect } from '../core/rectSelect';
import { pickAny } from '../tools/pick';
import { migrateProject } from '../persistence/migrate';
import {
  addDrawArc,
  addDrawCircle,
  addDrawDouble,
  addDrawLine,
  addFreeDim,
  addLayer,
  addLine,
  addOpening,
  addRoom,
  addStair,
  addText,
  addWall,
  deleteLayer,
  deleteSelection,
  duplicateSelection,
  moveLayerTo,
  moveNode,
  moveSelectionToLayer,
  renameLayer,
  setActiveLayer,
  setLayerColor,
  setLayerLocked,
  setLayerVisible,
  setRevealEnabled
} from './actions';
import { store, type SingleSelection } from './store';

const f = () => store.floor()!;
const P = () => store.get().project!;
const fresh = () => store.openProject(createProject({ name: 't' }));
const layerName = (id: Id) => layersOf(P()).find(l => l.id === id)!.name;

/** Prvek ke zkoušce: druh výběru, id, bod na prvku (ťuknutí). */
interface Made {
  kind: SingleSelection['kind'];
  id: Id;
  at: Pt;
}

const WALL = () => addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;

/** Každý druh prvku (zadání: stěna, otvor, ostění, výstupek, čára, dvojitá čára, oblouk / kruh, kóta, text, štítek, schodiště). */
const MAKERS: Record<string, () => Made> = {
  stěna: () => ({ kind: 'wall', id: WALL(), at: { x: 2000, y: 0 } }),
  otvor: () => {
    const w = WALL();
    return { kind: 'opening', id: addOpening(w, 'window', 0.5)!, at: { x: 2000, y: 0 } };
  },
  ostění: () => {
    const w = WALL();
    const id = addOpening(w, 'window', 0.5)!;
    setRevealEnabled(id, true);
    expect(f().openings[id]!.reveal).toBeTruthy();
    return { kind: 'opening', id, at: { x: 2000, y: 0 } };
  },
  výstupek: () => {
    WALL();
    // výstupek na volné straně líce (tělo stěny roste na stranu y > 0)
    const v = -200;
    addLine({ x: 1500, y: 0 }, null, { x: 1500, y: v }, null);
    addLine({ x: 1500, y: v }, null, { x: 2500, y: v }, null);
    addLine({ x: 2500, y: v }, null, { x: 2500, y: 0 }, null);
    const pr = protrusionsOf(f())[0];
    expect(pr).toBeTruthy();
    return { kind: 'protrusion', id: pr!.id, at: { x: 2000, y: v / 2 } };
  },
  čára: () => ({ kind: 'drawing', id: addDrawLine({ x: 0, y: 2000 }, { x: 3000, y: 2000 })!, at: { x: 1500, y: 2000 } }),
  'dvojitá čára': () => ({ kind: 'drawing', id: addDrawDouble({ x: 0, y: 3000 }, { x: 3000, y: 3000 }, 250, 1), at: { x: 1500, y: 3000 } }),
  kruh: () => ({ kind: 'drawing', id: addDrawCircle({ x: 6000, y: 0 }, 500), at: { x: 6500, y: 0 } }),
  oblouk: () => ({ kind: 'drawing', id: addDrawArc({ x: 6000, y: 2000 }, { x: 7000, y: 2000 }, 300), at: { x: 6000, y: 2000 } }),
  kóta: () => ({ kind: 'dim', id: addFreeDim({ x: 0, y: -1000 }, { x: 2000, y: -1000 })!, at: { x: 1000, y: -1000 } }),
  text: () => ({ kind: 'text', id: addText({ x: 8000, y: 3000 }), at: { x: 8000, y: 3000 } }),
  'štítek místnosti': () => ({ kind: 'room', id: addRoom({ x: 8000, y: 6000 }), at: { x: 8000, y: 6000 } }),
  schodiště: () => ({ kind: 'stair', id: addStair({ x: 0, y: 6000 }, { x: 1000, y: 9000 })!, at: { x: 500, y: 7500 } })
};

/** Výchozí vrstva nového prvku (pravidlo 4, schválená tabulka). */
const DEFAULT: Record<string, Id> = {
  stěna: SYS.stavba,
  otvor: SYS.stavba,
  ostění: SYS.stavba,
  výstupek: SYS.stavba,
  čára: SYS.kresba,
  'dvojitá čára': SYS.kresba,
  kruh: SYS.kresba,
  oblouk: SYS.kresba,
  kóta: SYS.koty,
  text: SYS.popisky,
  'štítek místnosti': SYS.popisky,
  schodiště: SYS.stavba
};

const layerOf = (m: Made) => elementLayer(f(), m.kind as ElemKind, m.id);
const exists = (fl: Floor, m: Made): boolean => {
  switch (m.kind) {
    case 'wall': return !!fl.walls[m.id];
    case 'opening': return !!fl.openings[m.id];
    case 'protrusion': return !!(fl.protrusions?.[m.id] ?? fl.cornerProtrusions?.[m.id] ?? fl.endProtrusions?.[m.id]);
    case 'drawing': return !!fl.drawings?.[m.id];
    case 'dim': return !!fl.dims?.[m.id];
    case 'text': return !!fl.texts[m.id];
    case 'room': return !!fl.rooms[m.id];
    case 'stair': return !!fl.stairs?.[m.id];
    default: return false;
  }
};
const picked = (m: Made) => {
  const hit = pickAny(store.view('pick')!, m.at, store.get().camera, null);
  return hit?.kind === m.kind && hit.id === m.id;
};
const inRect = (m: Made) => selectInRect(store.view('pick')!, { x1: -20000, y1: -20000, x2: 20000, y2: 20000 }, false).some(i => i.kind === m.kind && i.id === m.id);

/** Změna prvku přímo v datech (posun / vlastnost) – musí ji zastavit zámek vrstvy. */
function touch(fl: Floor, m: Made): void {
  switch (m.kind) {
    case 'wall': fl.nodes[fl.walls[m.id]!.b]!.x += 100; break;
    case 'opening': fl.openings[m.id]!.width += 100; break;
    case 'protrusion': fl.protrusions![m.id]!.name = 'x'; break;
    case 'drawing': fl.drawings![m.id]!.pts[0]!.x += 100; break;
    case 'dim': fl.dims![m.id]!.offset += 100; break;
    case 'text': fl.texts[m.id]!.x += 100; break;
    case 'room': fl.rooms[m.id]!.x += 100; break;
    case 'stair': fl.stairs![m.id]!.flights[0]!.a.x += 100; break;
  }
}

beforeEach(() => {
  fresh();
  store.set({ camera: { x: 0, y: 0, zoom: 0.15 }, selection: null, lockBlock: null });
});

describe('model a migrace', () => {
  it('nový projekt má výchozí sadu: systémové Stavba, Kóty, Popisky, Kresba + Elektro, Voda, Topení, Nábytek, Poznámky', () => {
    const ls = layersOf(P());
    expect(ls.map(l => l.name).sort()).toEqual(['Elektro', 'Kresba', 'Kóty', 'Nábytek', 'Popisky', 'Poznámky', 'Stavba', 'Topení', 'Voda'].sort());
    expect(ls.filter(l => l.system).map(l => l.id).sort()).toEqual([SYS.stavba, SYS.koty, SYS.popisky, SYS.kresba].sort());
    expect(new Set(ls.map(l => l.order)).size).toBe(ls.length);
    expect(P().activeLayer).toBe(SYS.kresba);
  });

  it('starý projekt (verze 27) se otevře beze ztráty: vrstvy doplněné, prvky podle druhu, nic nezmizí', () => {
    for (const make of Object.values(MAKERS)) make();
    const old = JSON.parse(JSON.stringify(P())) as Project & Record<string, unknown>;
    delete old.layers;
    delete old.activeLayer;
    old.schema = 27;
    for (const fl of old.floors) for (const rec of [fl.walls, fl.rooms, fl.texts, fl.drawings ?? {}, fl.dims ?? {}, fl.stairs ?? {}]) for (const el of Object.values(rec)) delete (el as { layerId?: Id }).layerId;
    const m = migrateProject(old);
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.layers!.length).toBe(9);
    const fl = m.floors[0]!;
    const counts = (x: Floor) => [x.walls, x.openings, x.rooms, x.texts, x.drawings, x.dims, x.stairs, x.protrusions].map(r => Object.keys(r ?? {}).length);
    expect(counts(fl)).toEqual(counts(f()));
    for (const w of Object.values(fl.walls)) expect(w.layerId).toBe(SYS.stavba);
    for (const d of Object.values(fl.drawings!)) expect(d.layerId).toBe(SYS.kresba);
    for (const d of Object.values(fl.dims!)) expect(d.layerId).toBe(SYS.koty);
    for (const t of Object.values(fl.texts)) expect(t.layerId).toBe(SYS.popisky);
    for (const r of Object.values(fl.rooms)) expect(r.layerId).toBe(SYS.popisky);
    for (const s of Object.values(fl.stairs!)) expect(s.layerId).toBe(SYS.stavba);
  });

  it('pravidlo 9: záloha JSON nese vrstvy i layerId u každého prvku a po načtení se nezmění', () => {
    for (const make of Object.values(MAKERS)) make();
    const json = JSON.parse(JSON.stringify(P())) as Project;
    expect(json.layers).toEqual(P().layers);
    for (const rec of [json.floors[0]!.walls, json.floors[0]!.rooms, json.floors[0]!.texts, json.floors[0]!.drawings!, json.floors[0]!.dims!, json.floors[0]!.stairs!]) {
      for (const el of Object.values(rec)) expect((el as { layerId?: Id }).layerId).toBeTruthy();
    }
    expect(migrateProject(json)).toEqual(json);
  });
});

describe.each(Object.keys(MAKERS))('%s', name => {
  it('pravidlo 4: nový prvek dostane výchozí vrstvu', () => {
    const m = MAKERS[name]!();
    expect(layerOf(m)).toBe(DEFAULT[name]);
  });

  it('pravidlo 1: skrytá vrstva – nevybere se (ťuknutím ani obdélníkem), nechytá, nesmaže se, nekreslí se', () => {
    const m = MAKERS[name]!();
    expect(picked(m)).toBe(true);
    const l = layerOf(m)!;
    setActiveLayer(SYS.kresba === l ? SYS.stavba : SYS.kresba);
    expect(setLayerVisible(l, false)).toBe(true);
    expect(picked(m)).toBe(false);
    expect(inRect(m)).toBe(false);
    expect(exists(store.view('snap')!, m)).toBe(false);
    // výběr prvku skryté vrstvy se zruší → mazání nic nesmaže
    store.set({ selection: { kind: m.kind, id: m.id } as SingleSelection });
    expect(store.get().selection).toBeNull();
    deleteSelection();
    expect(exists(f(), m)).toBe(true);
    // export / kreslení: vrstva ve výstupu chybí
    expect(layerContents(P(), f()).some(g => g.items.some(i => i.kind === m.kind && i.id === m.id))).toBe(false);
  });

  it('pravidlo 2: zamčená vrstva – vidět a chytá, ale nevybere se a úprava ani smazání neprojde', () => {
    const m = MAKERS[name]!();
    const l = layerOf(m)!;
    setLayerLocked(l, true);
    expect(exists(store.view('snap')!, m)).toBe(true);
    expect(layerContents(P(), f()).some(g => g.items.some(i => i.kind === m.kind && i.id === m.id))).toBe(true);
    expect(picked(m)).toBe(false);
    expect(inRect(m)).toBe(false);
    store.set({ selection: { kind: m.kind, id: m.id } as SingleSelection });
    expect(store.get().selection).toBeNull();
    const before = f();
    expect(store.edit(fl => touch(fl, m))).toBe(false);
    expect(store.get().lockBlock?.text).toContain(layerName(l));
    expect(f()).toBe(before);
    // smazání (i kdyby se k němu akce dostala) zastaví zámek
    expect(store.edit(fl => {
      if (m.kind === 'wall') delete fl.walls[m.id];
      else if (m.kind === 'opening') delete fl.openings[m.id];
      else if (m.kind === 'protrusion') delete fl.protrusions![m.id];
      else if (m.kind === 'drawing') delete fl.drawings![m.id];
      else if (m.kind === 'dim') delete fl.dims![m.id];
      else if (m.kind === 'text') delete fl.texts[m.id];
      else if (m.kind === 'room') delete fl.rooms[m.id];
      else if (m.kind === 'stair') delete fl.stairs![m.id];
    })).toBe(false);
    expect(exists(f(), m)).toBe(true);
    // po odemčení jde upravit
    setLayerLocked(l, false);
    expect(store.edit(fl => touch(fl, m))).toBe(true);
  });

  it('pravidlo 3 + 6: přesun do jiné vrstvy jedním krokem, Zpět / Vpřed', () => {
    const m = MAKERS[name]!();
    store.set({ selection: { kind: m.kind, id: m.id } as SingleSelection });
    const r = moveSelectionToLayer('elektro');
    if (m.kind === 'opening' || m.kind === 'protrusion') {
      // otvor, ostění a výstupek nemají vlastní vrstvu – samostatně se nepřesunou, jdou se stěnou
      expect(r).toEqual({ moved: 0, skipped: 1 });
      expect(layerOf(m)).toBe(SYS.stavba);
      const w = m.kind === 'opening' ? f().openings[m.id]!.wallId : f().protrusions![m.id]!.wallId;
      store.set({ selection: { kind: 'wall', id: w } });
      moveSelectionToLayer('elektro');
      expect(layerOf(m)).toBe('elektro');
    } else {
      expect(r.moved).toBe(1);
      expect(layerOf(m)).toBe('elektro');
    }
    store.undo();
    expect(layerOf(m)).toBe(DEFAULT[name]);
    store.redo();
    expect(layerOf(m)).toBe('elektro');
  });

  it('pravidlo 5: kopie zůstane ve vrstvě originálu', () => {
    const m = MAKERS[name]!();
    const owner: SingleSelection = m.kind === 'opening' ? { kind: 'wall', id: f().openings[m.id]!.wallId } : m.kind === 'protrusion' ? { kind: 'wall', id: f().protrusions![m.id]!.wallId } : ({ kind: m.kind, id: m.id } as SingleSelection);
    store.set({ selection: owner });
    moveSelectionToLayer('voda');
    const before = new Set(allIds(f(), m.kind));
    store.set({ selection: m.kind === 'opening' || m.kind === 'protrusion' ? owner : ({ kind: m.kind, id: m.id } as SingleSelection) });
    duplicateSelection();
    const copies = allIds(f(), m.kind).filter(id => !before.has(id));
    expect(copies.length).toBeGreaterThan(0);
    for (const id of copies) expect(elementLayer(f(), m.kind as ElemKind, id)).toBe('voda');
  });
});

function allIds(fl: Floor, kind: SingleSelection['kind']): Id[] {
  switch (kind) {
    case 'wall': return Object.keys(fl.walls);
    case 'opening': return Object.keys(fl.openings);
    case 'protrusion': return Object.keys(fl.protrusions ?? {});
    case 'drawing': return Object.keys(fl.drawings ?? {});
    case 'dim': return Object.keys(fl.dims ?? {});
    case 'text': return Object.keys(fl.texts);
    case 'room': return Object.keys(fl.rooms);
    case 'stair': return Object.keys(fl.stairs ?? {});
    default: return [];
  }
}

describe('pravidlo 1 a 2 přes vazby', () => {
  it('skrytá stěna se nechytá: roh skryté stěny se k bodu nepřichytí, zamčené ano', () => {
    WALL();
    const raw = { x: 4040, y: 30 };
    const opts = { nodeTol: 200, snap: true } as Parameters<typeof snapPoint>[2];
    expect(snapPoint(store.view('snap')!, raw, opts).node).toBeTruthy();
    setLayerLocked(SYS.stavba, true);
    expect(snapPoint(store.view('snap')!, raw, opts).node).toBeTruthy();
    setLayerLocked(SYS.stavba, false);
    setLayerVisible(SYS.stavba, false);
    expect(snapPoint(store.view('snap')!, raw, opts).node).toBeFalsy();
  });

  it('skrytá stěna se dál počítá do geometrie a úprava viditelného prvku jí smí pohnout (sdílený roh)', () => {
    const a = WALL();
    const b = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false)!;
    store.set({ selection: { kind: 'wall', id: b } });
    moveSelectionToLayer('elektro');
    setLayerVisible(SYS.stavba, false);
    const shared = f().walls[b]!.a;
    expect(f().walls[a]!.b).toBe(shared);
    moveNode(shared, { x: 4500, y: 0 });
    expect(f().nodes[shared]!.x).toBe(4500);
  });

  it('úprava odemčeného prvku, která by pohnula prvkem v zamčené vrstvě, se neprovede (sdílený roh)', () => {
    const a = WALL();
    const b = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false)!;
    store.set({ selection: { kind: 'wall', id: b } });
    moveSelectionToLayer('elektro');
    setLayerLocked(SYS.stavba, true);
    const shared = f().walls[b]!.a;
    moveNode(shared, { x: 4500, y: 0 });
    expect(f().nodes[shared]!.x).toBe(4000);
    expect(store.get().lockBlock?.text).toContain('Stavba');
    expect(f().walls[a]).toBeTruthy();
  });

  it('nový otvor na stěně zamčené vrstvy nevznikne', () => {
    const w = WALL();
    setLayerLocked(SYS.stavba, true);
    expect(addOpening(w, 'door', 0.5)).toBeNull();
    expect(Object.keys(f().openings)).toHaveLength(0);
  });

  it('pravidlo 8: volná kóta ke skryté stěně zůstane vidět a jde vybrat; skrytá vrstva Kóty ji skryje', () => {
    const w = WALL();
    const nodes = f().walls[w]!;
    const d = addFreeDim({ node: nodes.a }, { node: nodes.b }, -800)!;
    setLayerVisible(SYS.stavba, false);
    expect(layerContents(P(), f()).find(g => g.layer.id === SYS.koty)!.items).toContainEqual({ kind: 'dim', id: d });
    expect(pickAny(store.view('pick')!, { x: 2000, y: -800 }, store.get().camera, null)).toEqual({ kind: 'dim', id: d });
    setLayerVisible(SYS.stavba, true);
    setLayerVisible(SYS.koty, false);
    expect(pickAny(store.view('pick')!, { x: 2000, y: -800 }, store.get().camera, null)).not.toEqual({ kind: 'dim', id: d });
  });

  it('automatické kóty: ve vrstvě Kóty, jen u viditelné stěny', () => {
    const w = WALL();
    const koty = () => layerContents(P(), f()).find(g => g.layer.id === SYS.koty)?.items ?? [];
    expect(koty()).toContainEqual({ kind: 'wallDims', id: w });
    setLayerVisible(SYS.stavba, false);
    expect(koty()).not.toContainEqual({ kind: 'wallDims', id: w });
    setLayerVisible(SYS.stavba, true);
    setLayerVisible(SYS.koty, false);
    expect(layerContents(P(), f()).some(g => g.layer.id === SYS.koty)).toBe(false);
  });
});

describe('pravidlo 4: aktivní vrstva', () => {
  it('kresba jde do aktivní uživatelské vrstvy, u aktivní systémové do Kresby; stěna, kóta, text, štítek a schodiště mají pevnou', () => {
    setActiveLayer('elektro');
    const d = addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    expect(f().drawings![d]!.layerId).toBe('elektro');
    const w = addWall({ x: 0, y: 1000 }, null, { x: 1000, y: 1000 }, null, false)!;
    expect(f().walls[w]!.layerId).toBe(SYS.stavba);
    const t = addText({ x: 0, y: 5000 });
    const r = addRoom({ x: 3000, y: 5000 });
    const k = addFreeDim({ x: 0, y: 9000 }, { x: 900, y: 9000 })!;
    const st = addStair({ x: 5000, y: 0 }, { x: 6000, y: 3000 })!;
    expect(f().texts[t]!.layerId).toBe(SYS.popisky);
    expect(f().rooms[r]!.layerId).toBe(SYS.popisky);
    expect(f().dims![k]!.layerId).toBe(SYS.koty);
    expect(f().stairs![st]!.layerId).toBe(SYS.stavba);
    setActiveLayer(SYS.stavba);
    const d2 = addDrawLine({ x: 0, y: 2000 }, { x: 1000, y: 2000 })!;
    expect(f().drawings![d2]!.layerId).toBe(SYS.kresba);
  });

  it('aktivní vrstvu nejde skrýt; volba aktivní vrstvy není v historii', () => {
    setActiveLayer('voda');
    expect(setLayerVisible('voda', false)).toBe(false);
    expect(store.get().canUndo).toBe(false);
  });
});

describe('pravidlo 6: operace s vrstvami jsou v historii Zpět / Vpřed', () => {
  const snapshot = () => JSON.stringify(P().layers);
  const ops: [string, () => void][] = [
    ['vytvoření', () => void addLayer('Plyn', '#ff0000')],
    ['přejmenování', () => void renameLayer('elektro', 'Silnoproud')],
    ['barva', () => setLayerColor('voda', '#00ff00')],
    ['pořadí', () => moveLayerTo('poznamky', 0)],
    ['viditelnost', () => void setLayerVisible('nabytek', false)],
    ['zámek', () => setLayerLocked('topeni', true)],
    ['smazání', () => void deleteLayer('nabytek', undefined)]
  ];
  it.each(ops)('%s', (_n, op) => {
    const before = snapshot();
    op();
    const after = snapshot();
    expect(after).not.toBe(before);
    store.undo();
    expect(snapshot()).toBe(before);
    store.redo();
    expect(snapshot()).toBe(after);
  });

  it('pořadí řídí kreslení: přesunutá vrstva je ve výstupu na novém místě', () => {
    moveLayerTo(SYS.koty, 0);
    expect(layerContents(P(), f())[0]!.layer.id).toBe(SYS.koty);
  });
});

describe('pravidlo 7: smazání vrstvy', () => {
  it('systémovou vrstvu smazat ani přejmenovat nejde', () => {
    for (const id of Object.values(SYS)) {
      expect(deleteLayer(id, null)).toBe(false);
      expect(renameLayer(id, 'X')).toBe(false);
    }
    expect(layersOf(P())).toHaveLength(9);
  });

  it('neprázdnou bez volby nesmaže (nikdy potichu); přesun obsahu do zvolené vrstvy na všech podlažích', () => {
    setActiveLayer('elektro');
    const d1 = addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    // druhé podlaží
    store.editProject(p => void p.floors.push({ ...createFloor('2.NP'), drawings: { x1: { id: 'x1', shape: 'line', pts: [{ x: 0, y: 0 }, { x: 500, y: 0 }], layerId: 'elektro' } } }));
    setActiveLayer(SYS.kresba);
    expect(deleteLayer('elektro', undefined)).toBe(false);
    expect(store.get().lockBlock?.text).toContain('není prázdná');
    expect(deleteLayer('elektro', 'voda')).toBe(true);
    expect(f().drawings![d1]!.layerId).toBe('voda');
    expect(P().floors[1]!.drawings!.x1!.layerId).toBe('voda');
    expect(layersOf(P()).some(l => l.id === 'elektro')).toBe(false);
    store.undo();
    expect(f().drawings![d1]!.layerId).toBe('elektro');
  });

  it('smazání i s obsahem: prvky vrstvy zmizí (i stěna s otvory a kótou k ní), ostatní zůstanou', () => {
    const w = WALL();
    addOpening(w, 'door', 0.5);
    const keep = addDrawLine({ x: 0, y: 3000 }, { x: 1000, y: 3000 })!;
    const nodes = f().walls[w]!;
    addFreeDim({ node: nodes.a }, { node: nodes.b }, -500);
    store.set({ selection: { kind: 'wall', id: w } });
    moveSelectionToLayer('nabytek');
    expect(deleteLayer('nabytek', null)).toBe(true);
    expect(f().walls[w]).toBeUndefined();
    expect(Object.keys(f().openings)).toHaveLength(0);
    expect(Object.keys(f().dims ?? {})).toHaveLength(0);
    expect(f().drawings![keep]).toBeTruthy();
  });

  it('zamčenou vrstvu smazat nejde; obsah zamčené vrstvy Kóty zastaví smazání vrstvy s měřenou stěnou', () => {
    setLayerLocked('voda', true);
    expect(deleteLayer('voda', null)).toBe(false);
    setLayerLocked('voda', false);
    const w = WALL();
    const nodes = f().walls[w]!;
    addFreeDim({ node: nodes.a }, { node: nodes.b }, -500);
    store.set({ selection: { kind: 'wall', id: w } });
    moveSelectionToLayer('voda');
    setLayerLocked(SYS.koty, true);
    expect(deleteLayer('voda', null)).toBe(false);
    expect(f().walls[w]).toBeTruthy();
  });
});

describe('pravidlo 10: prvky pro export podle zvolených vrstev', () => {
  it('jen zvolené a viditelné vrstvy, v pořadí kreslení; otvor a výstupek s vrstvou stěny', () => {
    for (const make of Object.values(MAKERS)) make();
    const all = layerContents(P(), f());
    expect(all.map(g => g.layer.order)).toEqual([...all.map(g => g.layer.order)].sort((a, b) => a - b));
    const stavba = all.find(g => g.layer.id === SYS.stavba)!.items;
    expect(stavba.filter(i => i.kind === 'opening')).toHaveLength(Object.keys(f().openings).length);
    expect(stavba.filter(i => i.kind === 'protrusion')).toHaveLength(1);
    const only = layerContents(P(), f(), [SYS.kresba, SYS.popisky]);
    expect(only.map(g => g.layer.id)).toEqual([SYS.kresba, SYS.popisky]);
    expect(only[0]!.items).toHaveLength(Object.keys(f().drawings!).length);
    setLayerVisible(SYS.popisky, false);
    expect(layerContents(P(), f(), [SYS.kresba, SYS.popisky]).map(g => g.layer.id)).toEqual([SYS.kresba]);
  });

  it('výstupek v rohu leží ve dvou stěnách – je skrytý, když je skrytá kterákoli z nich', () => {
    const fl: Floor = {
      ...createFloor('x'),
      walls: { a: { id: 'a', a: 'n1', b: 'n2', thickness: 300, side: 1, label: { type: null, material: '', note: '' }, layerId: SYS.stavba }, b: { id: 'b', a: 'n2', b: 'n3', thickness: 300, side: 1, label: { type: null, material: '', note: '' }, layerId: 'elektro' } },
      cornerProtrusions: { c: { id: 'c', node: 'n2', walls: ['a', 'b'], sides: [1, 1], dirs: [1, 1], pts: [], name: '', material: '', note: '' } }
    };
    expect(elementLayers(fl, 'protrusion', 'c').sort()).toEqual(['elektro', SYS.stavba].sort());
    const p = { layers: layersOf(P()).map(l => (l.id === 'elektro' ? { ...l, visible: false } : l)) };
    expect(viewFloor(p, fl, 'pick').cornerProtrusions!.c).toBeUndefined();
  });
});

describe('nové kusy z prvku zůstanou v jeho vrstvě', () => {
  it('rozdělená stěna: obě části ve vrstvě původní stěny', async () => {
    const { splitWall } = await import('./actions');
    const w = WALL();
    store.set({ selection: { kind: 'wall', id: w } });
    moveSelectionToLayer('elektro');
    splitWall(w, { x: 2000, y: 0 });
    const walls = Object.values(f().walls);
    expect(walls.length).toBe(2);
    for (const x of walls) expect(x.layerId).toBe('elektro');
  });

  it('oříznutá čára kresby: kusy ve vrstvě původní čáry', async () => {
    const { trimDrawingAt } = await import('./actions');
    setActiveLayer('voda');
    addDrawLine({ x: 0, y: 0 }, { x: 3000, y: 0 });
    addDrawLine({ x: 1000, y: -500 }, { x: 1000, y: 500 });
    addDrawLine({ x: 2000, y: -500 }, { x: 2000, y: 500 });
    const id = Object.values(f().drawings!).find(d => d.pts[0]!.y === 0 && d.pts[1]!.y === 0)!.id;
    trimDrawingAt(id, { x: 1500, y: 0 });
    expect(Object.values(f().drawings!).length).toBe(4);
    for (const d of Object.values(f().drawings!)) expect(d.layerId).toBe('voda');
  });
});

describe('nálezy kontroly kroku 1', () => {
  it('navázání čáry kresby jen na čáru ve vrstvě nové kresby (ne v jiné, skryté ani zamčené)', () => {
    setActiveLayer('elektro');
    const e = addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    setActiveLayer('voda');
    const v = addDrawLine({ x: 1000, y: 0 }, { x: 1000, y: 1000 })!;
    expect(v).not.toBe(e);
    expect(f().drawings![v]!.layerId).toBe('voda');
    expect(f().drawings![e]!.pts).toHaveLength(2);
    // ve stejné vrstvě naváže
    const v2 = addDrawLine({ x: 1000, y: 1000 }, { x: 0, y: 1000 })!;
    expect(v2).toBe(v);
    // zamčená vrstva: nová čára vznikne samostatně, zamčená se nezmění
    setLayerLocked('voda', true);
    const v3 = addDrawLine({ x: 0, y: 1000 }, { x: 0, y: 2000 })!;
    expect(v3).not.toBe(v);
    expect(f().drawings![v3]).toBeTruthy();
  });

  it('stěny v různých vrstvách se neslučují; pokračování zamčené stěny vznikne samostatně', () => {
    const w = WALL();
    store.set({ selection: { kind: 'wall', id: w } });
    moveSelectionToLayer('elektro');
    const n = addWall({ x: 4000, y: 0 }, f().walls[w]!.b, { x: 6000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    expect(n).not.toBe(w);
    expect(f().walls[n]!.layerId).toBe(SYS.stavba);
    expect(f().walls[w]!.layerId).toBe('elektro');
    // zamčená Stavba: další rovné pokračování stavby se nesloučí, ale vznikne
    setLayerLocked(SYS.stavba, true);
    const m = addWall({ x: 6000, y: 0 }, f().walls[n]!.b, { x: 8000, y: 0 }, null, false, { thickness: 300, side: 1 });
    expect(m).toBeTruthy();
    expect(m).not.toBe(n);
  });

  it('ořez kresby nebere skrytou čáru jako hranici', async () => {
    const { trimDrawingAt } = await import('./actions');
    const h = addDrawLine({ x: 0, y: 0 }, { x: 3000, y: 0 })!;
    setActiveLayer('elektro');
    addDrawLine({ x: 1000, y: -500 }, { x: 1000, y: 500 });
    setActiveLayer(SYS.kresba);
    setLayerVisible('elektro', false);
    // bez hranice zmizí celý úsek
    expect(trimDrawingAt(h, { x: 2000, y: 0 })).toBe('ok');
    expect(Object.values(f().drawings!).filter(d => d.layerId === SYS.kresba)).toHaveLength(0);
  });

  it('nový prvek do skryté vrstvy ji zobrazí (prvek nezmizí); Zpět vrátí obojí', () => {
    setLayerVisible(SYS.koty, false);
    addFreeDim({ x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(layersOf(P()).find(l => l.id === SYS.koty)!.visible).toBe(true);
    store.undo();
    expect(layersOf(P()).find(l => l.id === SYS.koty)!.visible).toBe(false);
    expect(Object.keys(f().dims ?? {})).toHaveLength(0);
  });

  it('zamčená vrstva Kóty nebrání rozdělení stěny, na jejíž líc vede kóta (kóta se jen přepojí)', async () => {
    const { splitWall } = await import('./actions');
    const w = WALL();
    const nodes = f().walls[w]!;
    addFreeDim({ node: nodes.a }, { x: 3000, y: -1000 }, 0);
    addFreeDim({ wall: w, side: 1, at: 1000 } as never, { x: 1000, y: 2000 }, 0);
    setLayerLocked(SYS.koty, true);
    splitWall(w, { x: 2000, y: 0 });
    expect(Object.keys(f().walls)).toHaveLength(2);
  });

  it('nástroj Do rohu k hraně: zamčená stěna smí být hranou (nemění se)', async () => {
    const { trimToEdge } = await import('./actions');
    const a = WALL();
    const b = addWall({ x: 5000, y: -2000 }, null, { x: 5000, y: 2000 }, null, false, { thickness: 300, side: 1 })!;
    store.set({ selection: { kind: 'wall', id: b } });
    moveSelectionToLayer('elektro');
    setLayerLocked('elektro', true);
    expect(trimToEdge(a, { x: 1000, y: 0 }, b)).toBe('ok');
    expect(f().nodes[f().walls[a]!.b]!.x).toBeGreaterThan(4000);
  });
});
