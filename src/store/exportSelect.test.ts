/**
 * Výběr prvků pro export (core/exportSelect.ts, EXPORT-NAVRH.md) a role kót (core/dimRole.ts):
 * tabulka „druh prvku × výstup (PDF / DXF)“, rozsah (projekt, podlaží, místnost s okolím, výřez), vrstvy,
 * hlavní × pracovní kóta, názvy hladin DXF.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Id } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { categoryOn, dimCategory, dxfLayerName, EXPORT_CATEGORIES, partOn, selectExport, type ExportCategory, type ExportFormat, type ExportItem, type ExportSpec } from '../core/exportSelect';
import { defaultMain, isMainDim } from '../core/dimRole';
import { dimKey, type DimTarget } from '../core/dimLock';
import { SYS } from '../core/layers';
import { protrusionsOf } from '../core/protrusion';
import { migrateProject } from '../persistence/migrate';
import {
  addDrawArc,
  addDrawCircle,
  addDrawDouble,
  addDrawLine,
  addFreeDim,
  addLine,
  addMark,
  addOpening,
  addRoom,
  addStair,
  addStroke,
  addText,
  addWall,
  deleteSelection,
  renameLayer,
  setLayerVisible,
  toggleDimMain
} from './actions';
import { store } from './store';

const f = () => store.floor()!;
const P = () => store.get().project!;
const fresh = () => store.openProject(createProject({ name: 't' }));
const WALL = (y = 0) => addWall({ x: 0, y }, null, { x: 4000, y }, null, false, { thickness: 300, side: 1 })!;

const sel = (spec: Partial<ExportSpec> & { format: ExportFormat }): ExportItem[] => selectExport(P(), { scope: { kind: 'project' }, ...spec })[0]!.items;
const has = (items: ExportItem[], kind: string, id: Id) => items.find(i => i.kind === kind && i.id === id);

/** Každý druh prvku: [kind v exportu, id, očekávaná kategorie]. */
function makeAll(): Record<string, [string, Id, ExportCategory | null]> {
  const w = WALL();
  const op = addOpening(w, 'window', 0.3)!;
  const v = -200;
  addLine({ x: 2500, y: 0 }, null, { x: 2500, y: v }, null);
  addLine({ x: 2500, y: v }, null, { x: 3500, y: v }, null);
  addLine({ x: 3500, y: v }, null, { x: 3500, y: 0 }, null);
  const pr = protrusionsOf(f())[0]!.id;
  return {
    stěna: ['wall', w, 'walls'],
    'kóty stěny': ['wallDims', w, null],
    otvor: ['opening', op, 'openings'],
    výstupek: ['protrusion', pr, 'protrusions'],
    čára: ['drawing', addDrawLine({ x: 0, y: 2000 }, { x: 3000, y: 2000 })!, 'drawing'],
    kruh: ['drawing', addDrawCircle({ x: 6000, y: 0 }, 500)!, 'drawing'],
    oblouk: ['drawing', addDrawArc({ x: 6000, y: 2000 }, { x: 7000, y: 2000 }, 300)!, 'drawing'],
    'dvojitá čára (překlad)': ['drawing', addDrawDouble({ x: 0, y: 3000 }, { x: 3000, y: 3000 }, 250, 1)!, 'lintels'],
    schodiště: ['stair', addStair({ x: 0, y: 6000 }, { x: 1000, y: 9000 })!, 'stairs'],
    místnost: ['room', addRoom({ x: 8000, y: 6000 })!, 'rooms'],
    text: ['text', addText({ x: 8000, y: 3000 })!, 'texts'],
    'volná kóta': ['dim', addFreeDim({ x: 0, y: -1000 }, { x: 2000, y: -1000 })!, 'mainDims'],
    'ruční tah': ['stroke', addStroke([{ x: 10000, y: 0 }, { x: 11000, y: 500 }, { x: 12000, y: 0 }], 25)!, 'strokes'],
    poznámka: ['mark', addMark({ x: 12000, y: 6000 })!, 'marks']
  };
}

beforeEach(() => fresh());

describe('tabulka druh prvku × výstup (EXPORT-NAVRH.md)', () => {
  // druh prvku → [PDF, DXF] ve výchozím obsahu
  const EXPECT: Record<string, [boolean, boolean]> = {
    stěna: [true, true],
    'kóty stěny': [true, true],
    otvor: [true, true],
    výstupek: [true, true],
    čára: [true, true],
    kruh: [true, true],
    oblouk: [true, true],
    'dvojitá čára (překlad)': [true, true],
    schodiště: [true, true],
    místnost: [true, true],
    text: [true, true],
    'volná kóta': [true, true],
    'ruční tah': [true, true],
    poznámka: [true, true]
  };
  for (const [name, [pdf, dxf]] of Object.entries(EXPECT)) {
    it(`${name}: PDF ${pdf ? '✔' : '✗'}, DXF ${dxf ? '✔' : '✗'}, správná kategorie`, () => {
      const all = makeAll();
      const [kind, id, cat] = all[name]!;
      const p = has(sel({ format: 'pdf' }), kind, id);
      const d = has(sel({ format: 'dxf' }), kind, id);
      expect(!!p).toBe(pdf);
      expect(!!d).toBe(dxf);
      expect((p ?? d)?.category ?? null).toBe(cat);
    });
  }

  it('vypnutá kategorie prvek vyřadí (u každého druhu)', () => {
    const all = makeAll();
    for (const [name, [kind, id, cat]] of Object.entries(all)) {
      if (!cat) continue;
      const items = sel({ format: 'pdf', content: { [cat]: false } });
      expect(has(items, kind, id), name).toBeFalsy();
    }
  });

  it('výchozí obsah: pracovní kóty v PDF vypnuté, v DXF zapnuté na vypnuté hladině; fotky a skici do DXF nikdy', () => {
    expect(categoryOn('pdf', undefined, 'workDims')).toBe(false);
    expect(categoryOn('pdf', { workDims: true }, 'workDims')).toBe(true);
    expect(categoryOn('dxf', undefined, 'workDims')).toBe(true);
    expect(EXPORT_CATEGORIES.find(c => c.id === 'workDims')!.dxfLayerOff).toBe(true);
    expect(categoryOn('pdf', undefined, 'photos')).toBe(true);
    expect(categoryOn('dxf', undefined, 'photos')).toBe(false);
    expect(categoryOn('dxf', { photos: true }, 'photos')).toBe(false);
  });

  it('části prvku: ostění, šrafa, fotky poznámky', () => {
    makeAll();
    const pdf = selectExport(P(), { format: 'pdf', scope: { kind: 'project' } })[0]!;
    expect(partOn(pdf, 'reveals')).toBe(true);
    expect(partOn(pdf, 'hatch')).toBe(true);
    expect(partOn(pdf, 'photos')).toBe(true);
    const dxf = selectExport(P(), { format: 'dxf', scope: { kind: 'project' }, content: { reveals: false } })[0]!;
    expect(partOn(dxf, 'reveals')).toBe(false);
    expect(partOn(dxf, 'photos')).toBe(false);
  });

  it('výstupek v rohu a na konci stěny jdou se stěnou jako výstupky', () => {
    const w1 = WALL();
    const w2 = WALL(5000);
    store.edit(fl => {
      fl.cornerProtrusions = { cp: { id: 'cp', node: fl.walls[w1]!.b, walls: [w1, w2] } as never };
      fl.endProtrusions = { ep: { id: 'ep', wallId: w2 } as never };
    });
    const items = sel({ format: 'dxf' });
    expect(has(items, 'protrusion', 'cp')?.category).toBe('protrusions');
    expect(has(items, 'protrusion', 'ep')?.category).toBe('protrusions');
  });
});

describe('hlavní × pracovní kóta (KOTY-ZAMEK-EXPORT.md B)', () => {
  const T: [DimTarget, boolean][] = [
    [{ kind: 'wall-length', wallId: 'w', move: 'both' }, true],
    [{ kind: 'wall-face-length', wallId: 'w', face: 0 }, true],
    [{ kind: 'circle-diameter', wallId: 'w' }, true],
    [{ kind: 'wall-sagitta', wallId: 'w' }, true],
    [{ kind: 'free-dim', dimId: 'd', move: 'a' }, true],
    [{ kind: 'opening-offset', openingId: 'o', ref: 'a' }, false],
    [{ kind: 'opening-width', openingId: 'o' }, false],
    [{ kind: 'opening-gap', firstId: 'o', secondId: 'p' }, false],
    [{ kind: 'opening-reveal', openingId: 'o', part: 'depth' } as DimTarget, false],
    [{ kind: 'wall-thickness', wallId: 'w' }, false],
    [{ kind: 'comp-gap', wallId: 'w', side: 'left' } as DimTarget, false],
    [{ kind: 'junction-gap', wallId: 'w', nodeId: 'n', to: 'prev' }, false],
    [{ kind: 'protrusion-dim', protrusionId: 'p', dim: 'width' }, false],
    [{ kind: 'protrusion-sagitta', protrusionId: 'p', seg: 0 }, false],
    [{ kind: 'corner-dim', protrusionId: 'p', dim: 'a' }, false],
    [{ kind: 'end-dim', protrusionId: 'p', dim: 'over' } as unknown as DimTarget, false],
    [{ kind: 'stair-dim', stairId: 's', flightId: 'f', dim: 'length' } as DimTarget, false]
  ];
  for (const [t, main] of T) it(`${t.kind}: výchozí ${main ? 'hlavní' : 'pracovní'}`, () => expect(defaultMain(t)).toBe(main));

  it('ruční přepsání jedním ťuknutím, zpět na výchozí smaže záznam; Zpět vrátí', () => {
    const w = WALL();
    const t: DimTarget = { kind: 'wall-length', wallId: w, move: 'both' };
    expect(isMainDim(f(), t)).toBe(true);
    toggleDimMain(t);
    expect(isMainDim(f(), t)).toBe(false);
    expect(f().dimRoles?.[dimKey(t)]?.main).toBe(false);
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'project' } })[0]!;
    expect(dimCategory(fe, t)).toBeNull();
    const fd = selectExport(P(), { format: 'dxf', scope: { kind: 'project' } })[0]!;
    expect(dimCategory(fd, t)).toBe('workDims');
    toggleDimMain(t);
    expect(f().dimRoles).toBeUndefined();
    store.undo();
    expect(isMainDim(f(), t)).toBe(false);
  });

  it('volná kóta přepnutá na pracovní jde do kategorie pracovních kót; se smazáním prvku role zaniká', () => {
    const d = addFreeDim({ x: 0, y: -1000 }, { x: 2000, y: -1000 })!;
    toggleDimMain({ kind: 'free-dim', dimId: d, move: 'b' });
    expect(has(sel({ format: 'dxf' }), 'dim', d)?.category).toBe('workDims');
    expect(has(sel({ format: 'pdf' }), 'dim', d)).toBeFalsy();
    store.set({ selection: { kind: 'dim', id: d } as never });
    deleteSelection();
    expect(f().dimRoles).toBeUndefined();
  });

  it('záloha a migrace: role kót se uloží, starší projekt beze změny (SCHEMA 36)', () => {
    expect(SCHEMA_VERSION).toBe(36);
    const w = WALL();
    toggleDimMain({ kind: 'wall-length', wallId: w, move: 'both' });
    const back = migrateProject(JSON.parse(JSON.stringify(P())));
    expect(back.floors[0]!.dimRoles).toEqual(f().dimRoles);
  });
});

describe('vrstvy (katalog V10, rozhodnutí 2026-11-23)', () => {
  it('výchozí = viditelné vrstvy; sada může vybrat i skrytou', () => {
    const w = WALL();
    setLayerVisible(SYS.stavba, false);
    expect(has(sel({ format: 'pdf' }), 'wall', w)).toBeFalsy();
    expect(has(sel({ format: 'pdf', layers: [SYS.stavba, SYS.koty] }), 'wall', w)).toBeTruthy();
    expect(has(sel({ format: 'pdf', layers: [SYS.stavba, SYS.koty] }), 'wallDims', w)).toBeTruthy();
    expect(has(sel({ format: 'pdf', layers: [SYS.koty] }), 'wallDims', w)).toBeFalsy();
  });

  it('hladina DXF = podlaží + vrstva + kategorie; přejmenování vrstvy se projeví', () => {
    const t = addText({ x: 0, y: 0 })!;
    const it0 = has(sel({ format: 'dxf' }), 'text', t)!;
    const name = () => dxfLayerName(P(), f(), it0.layerId, it0.category!);
    expect(name()).toMatch(/_Popisky_Texty$/);
    store.edit(fl => void (fl.name = '1. NP'));
    expect(name()).toBe('1.NP_Popisky_Texty');
    const s = addStroke([{ x: 0, y: 0 }, { x: 500, y: 500 }], 20)!;
    const st = has(sel({ format: 'dxf' }), 'stroke', s)!;
    renameLayer(st.layerId, 'Voda: rozvody');
    expect(dxfLayerName(P(), f(), st.layerId, 'strokes')).toBe('1.NP_Voda rozvody_Kresba od ruky');
    expect(dxfLayerName(P(), f(), st.layerId, 'Okolí')).toBe('1.NP_Okolí');
  });
});

describe('rozsah', () => {
  /** Dvě místnosti vedle sebe (4000 × 3000 a 3000 × 3000), mezi nimi 400 mm (dvě stěny po 200). */
  function twoRooms() {
    const rect = (x0: number, x1: number) => {
      const p = [
        { x: x0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: 3000 },
        { x: x0, y: 3000 }
      ];
      for (let i = 0; i < 4; i++) addWall(p[i]!, null, p[(i + 1) % 4]!, null, false, { thickness: 200, side: -1 });
    };
    rect(0, 4000);
    rect(4400, 7400);
    const far = addWall({ x: 20000, y: 0 }, null, { x: 24000, y: 0 }, null, false, { thickness: 200, side: 1 })!;
    const a = addRoom({ x: 2000, y: 1500 })!;
    const b = addRoom({ x: 5900, y: 1500 })!;
    return { a, b, far };
  }

  it('místnost: její stěny plně, sousední šedě jako okolí bez kót, vzdálené ne; štítek jen vybrané', () => {
    const { a, b, far } = twoRooms();
    const tIn = addText({ x: 1000, y: 1000 })!;
    const tOther = addText({ x: 5900, y: 1000 })!;
    const items = selectExport(P(), { format: 'pdf', scope: { kind: 'rooms', floorId: f().id, roomIds: [a] } })[0]!;
    const walls = items.items.filter(i => i.kind === 'wall');
    expect(walls.filter(i => !i.context)).toHaveLength(4);
    expect(walls.filter(i => i.context).length).toBeGreaterThan(0);
    expect(has(items.items, 'wall', far)).toBeFalsy();
    for (const c of walls.filter(i => i.context)) expect(has(items.items, 'wallDims', c.id)).toBeFalsy();
    expect(has(items.items, 'room', a)).toBeTruthy();
    expect(has(items.items, 'room', b)).toBeFalsy();
    expect(has(items.items, 'text', tIn)).toBeTruthy();
    expect(has(items.items, 'text', tOther)).toBeFalsy();
    expect(items.clip).toBeTruthy();
  });

  it('místnost: otvor ve stěně místnosti plně, v sousední stěně jako okolí', () => {
    const { a } = twoRooms();
    const own = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.a]!.x === 0)!;
    const op = addOpening(own.id, 'window', 0.5)!;
    const items = selectExport(P(), { format: 'dxf', scope: { kind: 'rooms', floorId: f().id, roomIds: [a] } })[0]!.items;
    expect(has(items, 'opening', op)?.context).toBeUndefined();
    const other = Object.values(f().walls).find(w => f().nodes[w.a]!.x === 4400 && f().nodes[w.b]!.x === 4400)!;
    const op2 = addOpening(other.id, 'window', 0.5)!;
    const items2 = selectExport(P(), { format: 'dxf', scope: { kind: 'rooms', floorId: f().id, roomIds: [a] } })[0]!.items;
    expect(has(items2, 'opening', op2)?.context).toBe(true);
  });

  it('výřez obdélníkem: jen prvky, kterých se dotkne; ořez = výřez', () => {
    const { far } = twoRooms();
    const t = addText({ x: 21000, y: 500 })!;
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'rect', floorId: f().id, rect: { x1: 19000, y1: -1000, x2: 25000, y2: 1000 } } })[0]!;
    expect(fe.items.filter(i => i.kind === 'wall').map(i => i.id)).toEqual([far]);
    expect(has(fe.items, 'text', t)).toBeTruthy();
    expect(has(fe.items, 'wallDims', far)).toBeTruthy();
    expect(fe.clip).toEqual({ x1: 19000, y1: -1000, x2: 25000, y2: 1000 });
  });

  it('podlaží: jen zvolená, celý projekt všechna', () => {
    WALL();
    store.edit(() => undefined);
    const p = P();
    expect(selectExport(p, { format: 'dxf', scope: { kind: 'project' } })).toHaveLength(p.floors.length);
    expect(selectExport(p, { format: 'dxf', scope: { kind: 'floors', floorIds: [] } })).toHaveLength(0);
    expect(selectExport(p, { format: 'dxf', scope: { kind: 'floors', floorIds: [p.floors[0]!.id] } })).toHaveLength(1);
  });
});

describe('rozsah místnosti – průběžná stěna a sporné situace (kontrola revieweru)', () => {
  /**
   * Obrys 12000 × 3000 (stěny 200 ven), příčka x = 4000 napojená doprostřed horní a dolní stěny (stěny se nedělí):
   * místnost A vlevo (štítek), prostor B vpravo bez štítku.
   */
  function hall() {
    const p = [
      { x: 0, y: 0 },
      { x: 12000, y: 0 },
      { x: 12000, y: 3000 },
      { x: 0, y: 3000 }
    ];
    for (let i = 0; i < 4; i++) addWall(p[i]!, null, p[(i + 1) % 4]!, null, false, { thickness: 200, side: -1 });
    const top = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.b]!.y === 0)!.id;
    const outer = new Set(Object.keys(f().walls));
    addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 100, side: 1 });
    const part = Object.keys(f().walls).find(id => !outer.has(id))!;
    const a = addRoom({ x: 2000, y: 1500 })!;
    return { top, part, a };
  }
  const roomA = (a: Id, format: ExportFormat = 'pdf') => selectExport(P(), { format, scope: { kind: 'rooms', floorId: f().id, roomIds: [a] } })[0]!;

  it('průběžná stěna nezvětší rozsah: ořez kolem místnosti A, okno v části B jen okolí, jeho kóty ne', () => {
    const { top, part, a } = hall();
    expect(Object.keys(f().walls)).toHaveLength(5); // příčka stěnu nedělí
    const left = addOpening(top, 'window', 0.15)!;
    const right = addOpening(top, 'window', 0.8)!;
    const fe = roomA(a);
    expect(fe.clip!.x2).toBeLessThan(6000);
    expect(has(fe.items, 'wall', top)?.context).toBeUndefined();
    expect(has(fe.items, 'wall', part)?.context).toBeUndefined();
    expect(has(fe.items, 'opening', left)?.context).toBeUndefined();
    expect(has(fe.items, 'opening', right)).toBeFalsy(); // daleko od místnosti (mimo okolí 1 m)
    const fd = { ...fe, content: { workDims: true } };
    expect(dimCategory(fd, { kind: 'opening-width', openingId: left })).toBe('workDims');
    expect(dimCategory(fd, { kind: 'opening-width', openingId: right })).toBeNull();
    expect(dimCategory(fd, { kind: 'opening-gap', firstId: left, secondId: right })).toBeNull();
    expect(dimCategory(fe, { kind: 'wall-length', wallId: top, move: 'both' })).toBe('mainDims');
  });

  it('okno na průběžné stěně těsně za příčkou je okolí (šedě, bez kót)', () => {
    const { top, a } = hall();
    const near = addOpening(top, 'window', 4700 / 12000)!;
    const fe = roomA(a, 'dxf');
    expect(has(fe.items, 'opening', near)?.context).toBe(true);
    expect(dimCategory(fe, { kind: 'opening-width', openingId: near })).toBeNull();
  });

  it('volné prvky všech druhů: v místnosti ano, v prostoru B bez štítku ne, vnější kóta ano', () => {
    const { a } = hall();
    const inA = {
      text: addText({ x: 1000, y: 1000 })!,
      drawing: addDrawLine({ x: 500, y: 500 }, { x: 1500, y: 500 })!,
      stair: addStair({ x: 2500, y: 500 }, { x: 3500, y: 2500 })!,
      stroke: addStroke([{ x: 600, y: 2000 }, { x: 900, y: 2300 }], 20)!,
      mark: addMark({ x: 3000, y: 2800 })!,
      dim: addFreeDim({ x: 0, y: 0 }, { x: 4000, y: 0 }, -500)!
    };
    const inB = {
      text: addText({ x: 4600, y: 1000 })!,
      drawing: addDrawLine({ x: 4400, y: 600 }, { x: 4600, y: 600 })!,
      stroke: addStroke([{ x: 4500, y: 2000 }, { x: 4600, y: 2300 }], 20)!
    };
    const items = roomA(a).items;
    for (const [k, id] of Object.entries(inA)) expect(has(items, k, id), `${k} v A`).toBeTruthy();
    for (const [k, id] of Object.entries(inB)) expect(has(items, k, id), `${k} v B`).toBeFalsy();
  });

  it('místnost bez uzavřeného obrysu: jen její štítek', () => {
    WALL();
    const r = addRoom({ x: 2000, y: 1500 })!;
    const t = addText({ x: 2000, y: 1000 })!;
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'rooms', floorId: f().id, roomIds: [r] } })[0]!;
    expect(fe.items.map(i => i.kind)).toEqual(['room']);
    expect(has(fe.items, 'text', t)).toBeFalsy();
  });

  it('výřez zasahující jen do těla stěny (ne do čáry líce) stěnu vezme', () => {
    const w = WALL(); // líc y = 0, tělo 0..300
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'rect', floorId: f().id, rect: { x1: 1000, y1: 100, x2: 2000, y2: 200 } } })[0]!;
    expect(has(fe.items, 'wall', w)).toBeTruthy();
  });

  it('role kóty přepojené na jiného souseda zaniká (vložený otvor mezi dva)', () => {
    const w = WALL();
    const o1 = addOpening(w, 'window', 0.15)!;
    const o2 = addOpening(w, 'window', 0.85)!;
    const gap: DimTarget = { kind: 'opening-gap', firstId: o1, secondId: o2 };
    toggleDimMain(gap);
    expect(isMainDim(f(), gap)).toBe(true);
    addOpening(w, 'window', 0.5);
    expect(f().dimRoles?.[dimKey(gap)]).toBeUndefined();
  });
});
