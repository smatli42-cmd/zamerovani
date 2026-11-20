/**
 * Kresba (core/drawing.ts, store/actions/drawings.ts): dvojitá čára, samostatná čára, tvary.
 * Tabulka „pravidlo × typ prvku“ – KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md. Osa Y míří dolů.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Floor, Pt } from '../model/types';
import { drawingPaths } from '../core/drawing';
import { migrateProject } from '../persistence/migrate';
import { drawDoubleTool, drawLineTool } from '../tools/drawTools';
import { arcTool, circleTool, rectTool } from '../tools/shapeTools';
import { createWall } from '../model/factory';
import { pickAny } from '../tools/pick';
import { selectTool } from '../tools/selectTool';
import type { PointerInput, Tool } from '../tools/types';
import { addDrawArc, addDrawCircle, addDrawDouble, addDrawRect, addOpening, addWall, deleteSelection, duplicateSelection, groupOrigin, moveGroup, rotateSelection, setDrawingBulge, updateDrawing } from './actions';
import { store } from './store';

const f = (): Floor => store.floor()!;
const drawings = () => Object.values(f().drawings ?? {});
const Z = 0.2; // px na mm
const at = (p: Pt): PointerInput => ({ world: p, screen: { x: p.x * Z, y: p.y * Z }, device: 'pen' });

function stroke(tool: Tool, pts: Pt[]) {
  tool.down?.(at(pts[0]!));
  for (const p of pts.slice(1)) tool.drag?.(at(p));
  tool.up?.(at(pts[pts.length - 1]!));
}

/** Stěna S z (0,0) do (5000,0), tloušťka 300, tělo y ∈ [0, 300]. */
function wallS(): string {
  return addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
}

/** Stěny, rohy a výstupky – to, co kresba nikdy nesmí změnit. */
const structure = () => JSON.stringify({ n: f().nodes, w: f().walls, o: f().openings, p: f().protrusions ?? {}, c: f().cornerProtrusions ?? {}, e: f().endProtrusions ?? {} });

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'drawDouble' });
  store.updateSettings({ snap: true, doubleWidth: 250, doubleEnds: 'closed', doubleStyle: 'dashdot2', drawColor: 'black' });
});

describe('dvojitá čára (krok 0, KRESLENI-PREKLADU.md)', () => {
  it('od líce podél stěny: vzdálenost čar = tloušťka stěny, druhá čára v těle; stěna, rohy a výstupky beze změny', () => {
    wallS();
    const before = structure();
    stroke(drawDoubleTool, [{ x: 1000, y: 0 }, { x: 1500, y: 0 }, { x: 2200, y: 0 }]);
    expect(structure()).toBe(before);
    const [d] = drawings();
    expect(d).toMatchObject({ shape: 'double', width: 300, side: 1, closedEnds: true, style: 'dashdot2' });
    expect(d!.pts).toEqual([{ x: 1000, y: 0 }, { x: 2200, y: 0 }]);
  });

  it('ve volném místě: vzdálenost z volby nástroje, strana podle odchýlení pera', () => {
    // konec se přichytí vodorovně (do 4°), pero je o 60 mm nad čarou
    stroke(drawDoubleTool, [{ x: 0, y: 2000 }, { x: 1000, y: 2000 }, { x: 1000, y: 1940 }]);
    const [d] = drawings();
    expect(d).toMatchObject({ shape: 'double', width: 250 });
    // pero nad čarou (−y) = proti normal(a→b) = (0, 1)
    expect(d!.side).toBe(-1);
  });

  it('ťuknutí na čáru překladu nad otvorem vybere překlad (kresba leží nad otvorem)', () => {
    const w = wallS();
    addOpening(w, 'door', 0.4);
    const id = addDrawDouble({ x: 1500, y: 0 }, { x: 2600, y: 0 }, 300, 1)!;
    expect(pickAny(f(), { x: 2000, y: 0 }, store.get().camera)).toEqual({ kind: 'drawing', id });
  });

  it('mazání, kopírování, Zpět / Vpřed', () => {
    const id = addDrawDouble({ x: 0, y: 0 }, { x: 1000, y: 0 }, 250, 1)!;
    store.set({ selection: { kind: 'drawing', id } });
    duplicateSelection();
    expect(drawings()).toHaveLength(2);
    expect(drawings()[1]!.pts[0]).toEqual({ x: 300, y: 300 });
    store.set({ selection: { kind: 'drawing', id } });
    deleteSelection();
    expect(f().drawings![id]).toBeUndefined();
    store.undo();
    expect(f().drawings![id]).toBeDefined();
    store.redo();
    expect(f().drawings![id]).toBeUndefined();
  });

  it('posun tažením (výběr, skupina) a otočení', () => {
    const id = addDrawDouble({ x: 0, y: 0 }, { x: 1000, y: 0 }, 250, 1)!;
    moveGroup(groupOrigin(f(), [{ kind: 'drawing', id }]), 100, 200);
    expect(f().drawings![id]!.pts).toEqual([{ x: 100, y: 200 }, { x: 1100, y: 200 }]);
    store.set({ selection: { kind: 'drawing', id } });
    rotateSelection(90);
    const p = f().drawings![id]!.pts;
    expect(p[0]!.x).toBeCloseTo(p[1]!.x);
  });

  it('tažení už vybrané kresby nástrojem Vybrat ji posune', () => {
    const id = addDrawDouble({ x: 0, y: 0 }, { x: 1000, y: 0 }, 250, 1)!;
    store.set({ tool: 'select', selection: { kind: 'drawing', id } });
    stroke(selectTool, [{ x: 500, y: 0 }, { x: 500, y: 300 }, { x: 500, y: 500 }]);
    expect(f().drawings![id]!.pts[0]).toEqual({ x: 0, y: 500 });
  });

  it('úchyt druhé čáry mění vzdálenost čar (a stranu)', () => {
    const id = addDrawDouble({ x: 0, y: 0 }, { x: 1000, y: 0 }, 250, 1)!;
    store.set({ tool: 'select', selection: { kind: 'drawing', id } });
    stroke(selectTool, [{ x: 500, y: 250 }, { x: 500, y: 300 }, { x: 500, y: 400 }]);
    expect(f().drawings![id]).toMatchObject({ width: 400, side: 1 });
  });

  it('uložení: kresba projde migrací beze změny (schéma 17+)', () => {
    const id = addDrawDouble({ x: 0, y: 0 }, { x: 1000, y: 0 }, 250, 1)!;
    updateDrawing(id, { closedEnds: false });
    const p = migrateProject(JSON.parse(JSON.stringify(store.get().project)));
    expect(p.floors[0]!.drawings![id]).toEqual(f().drawings![id]);
    expect(p.schema).toBeGreaterThanOrEqual(17);
  });
});

describe('samostatná čára a tvary (krok 2) – nikdy stěna ani výstupek', () => {
  it('čára od líce stěny zpět na týž líc (gesto výstupku) zůstane kresbou: žádný výstupek, stěna beze změny', () => {
    wallS();
    const before = structure();
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 2350, y: 0 }, { x: 2350, y: -200 }]);
    stroke(drawLineTool, [{ x: 2350, y: -200 }, { x: 2650, y: -200 }]);
    stroke(drawLineTool, [{ x: 2650, y: -200 }, { x: 2650, y: 0 }]);
    expect(structure()).toBe(before);
    const [d] = drawings();
    expect(d).toMatchObject({ shape: 'line' });
    expect(d!.pts).toEqual([{ x: 2350, y: 0 }, { x: 2350, y: -200 }, { x: 2650, y: -200 }, { x: 2650, y: 0 }]);
  });

  it('přichycení na protější líc stěny je jen pomůcka – bod přesně na líci, nic se nenapojí', () => {
    wallS();
    const before = structure();
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 1000, y: 1000 }, { x: 1000, y: 600 }, { x: 1000, y: 305 }]);
    expect(structure()).toBe(before);
    expect(drawings()[0]!.pts[1]).toEqual({ x: 1000, y: 300 });
  });

  it('lomená čára navazuje na svůj konec; úsek zpět do počátku ji uzavře (šrafa pak jde zapnout)', () => {
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    stroke(drawLineTool, [{ x: 1000, y: 0 }, { x: 1000, y: 800 }]);
    stroke(drawLineTool, [{ x: 1000, y: 800 }, { x: 0, y: 0 }]);
    expect(drawings()).toHaveLength(1);
    expect(drawings()[0]).toMatchObject({ shape: 'line', closed: true });
    updateDrawing(drawings()[0]!.id, { hatch: 'diag' });
    expect(drawings()[0]!.hatch).toBe('diag');
  });

  it('obdélník přiložený k líci stěny (dřív výstupek, katalog I1.2) je kresba – stěna i výstupky beze změny', () => {
    wallS();
    const before = structure();
    store.set({ tool: 'rect' });
    stroke(rectTool, [{ x: 2350, y: 0 }, { x: 2500, y: -100 }, { x: 2650, y: -200 }]);
    expect(structure()).toBe(before);
    expect(drawings()[0]).toMatchObject({ shape: 'rect' });
  });

  it('kruh a oblouk jsou kresba; stěna, na kterou dosednou, se nerozdělí', () => {
    wallS();
    const before = structure();
    store.set({ tool: 'circle' });
    stroke(circleTool, [{ x: 1000, y: -1000 }, { x: 1300, y: -1000 }, { x: 1500, y: -1000 }]);
    store.set({ tool: 'arc' });
    stroke(arcTool, [{ x: 3000, y: 0 }, { x: 3500, y: -100 }, { x: 4000, y: 0 }]);
    expect(structure()).toBe(before);
    expect(drawings().map(d => d.shape)).toEqual(['circle', 'arc']);
    expect(drawings()[0]!.r).toBe(500);
  });

  it('úchyt rohu obdélníku: obdélník zůstane obdélníkem', () => {
    store.set({ tool: 'rect' });
    stroke(rectTool, [{ x: 0, y: 0 }, { x: 400, y: 300 }]);
    const id = drawings()[0]!.id;
    store.set({ tool: 'select', selection: { kind: 'drawing', id } });
    stroke(selectTool, [{ x: 400, y: 300 }, { x: 500, y: 400 }, { x: 600, y: 500 }]);
    expect(drawings()[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 0, y: 500 }]);
  });
});

describe('připomínky uživatele 2026-11-17', () => {
  /** Místnost mezi dvěma stěnami: S (líc y = 0, tělo nahoru), T (líc y = 3000, tělo dolů). */
  function twoWalls() {
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 3000 }, null, { x: 5000, y: 3000 }, null, false, { thickness: 300, side: 1 });
  }

  it('dvojitá čára je ve výchozím stavu jen dvě čáry (otevřené konce, bez šrafy)', () => {
    store.updateSettings({ doubleEnds: 'open' });
    stroke(drawDoubleTool, [{ x: 0, y: 5000 }, { x: 1000, y: 5000 }]);
    const [d] = drawings();
    expect(d!.closedEnds).toBeUndefined();
    expect(drawingPaths(d!)).toHaveLength(2);
  });

  for (const tool of ['drawDouble', 'drawLine'] as const) {
    it(`${tool}: od líce jedné stěny kolmo k protější – pomocná čára platí až k líci, konec kolmo na líci`, () => {
      twoWalls();
      store.set({ tool });
      const t = tool === 'drawDouble' ? drawDoubleTool : drawLineTool;
      // pero se mírně odchyluje od svislice (12 mm) a končí kousek před lícem
      stroke(t, [{ x: 1000, y: 0 }, { x: 1006, y: 1500 }, { x: 1012, y: 2985 }]);
      expect(drawings()[0]!.pts).toEqual([{ x: 1000, y: 0 }, { x: 1000, y: 3000 }]);
    });
  }

  it('totéž ke stěně bez tloušťky (čára stěny)', () => {
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 3000 }, null, { x: 5000, y: 3000 }, null, false, {});
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 1000, y: 0 }, { x: 1006, y: 1500 }, { x: 1012, y: 2985 }]);
    expect(drawings()[0]!.pts).toEqual([{ x: 1000, y: 0 }, { x: 1000, y: 3000 }]);
  });
});

describe('lomená čára – navazování (nálezy kontroly)', () => {
  it('po otevření uzavřené čáry s ohnutým uzavíracím úsekem je nově navázaný úsek rovný', () => {
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    stroke(drawLineTool, [{ x: 1000, y: 0 }, { x: 1000, y: 800 }]);
    stroke(drawLineTool, [{ x: 1000, y: 800 }, { x: 0, y: 0 }]);
    const id = drawings()[0]!.id;
    setDrawingBulge(id, 2, 200);
    updateDrawing(id, { closed: false });
    stroke(drawLineTool, [{ x: 1000, y: 800 }, { x: 2000, y: 800 }]);
    expect(drawings()[0]!.pts.every(p => !p.s)).toBe(true);
  });

  it('úsek z konce jedné čáry na konec druhé obě spojí do jedné', () => {
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    stroke(drawLineTool, [{ x: 0, y: 2000 }, { x: 1000, y: 2000 }]);
    stroke(drawLineTool, [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }]);
    expect(drawings()).toHaveLength(1);
    const chain = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }];
    const pts = drawings()[0]!.pts;
    expect([chain, [...chain].reverse()]).toContainEqual(pts);
    // a uzavřít
    stroke(drawLineTool, [{ x: 0, y: 2000 }, { x: 0, y: 0 }]);
    expect(drawings()[0]!.closed).toBe(true);
  });

  it('nástroj Čára: tah z konce vybrané čáry kreslí dál (úchyt kresby bere jen nástroj Vybrat)', () => {
    store.set({ tool: 'drawLine' });
    stroke(drawLineTool, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    store.set({ selection: { kind: 'drawing', id: drawings()[0]!.id } });
    stroke(drawLineTool, [{ x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 1000, y: 1000 }]);
    expect(drawings()[0]!.pts).toHaveLength(3);
  });
});

describe('migrace 17 → 18: tvary ze stěn na kresbu', () => {
  function legacy(build: (fl: Floor) => void) {
    store.openProject(createProject({ name: 'old' }));
    const fl = JSON.parse(JSON.stringify(f())) as Floor;
    build(fl);
    const raw = { ...JSON.parse(JSON.stringify(store.get().project)), schema: 17, floors: [fl] };
    return migrateProject(raw).floors[0]!;
  }
  const node = (fl: Floor, id: string, x: number, y: number) => (fl.nodes[id] = { id, x, y });
  const wall = (fl: Floor, id: string, a: string, b: string, extra: object = {}) => (fl.walls[id] = { ...createWall(a, b), id, ...extra });
  function rectLoop(fl: Floor, k: string, x: number, y: number, w: number, h: number) {
    node(fl, k + 1, x, y);
    node(fl, k + 2, x + w, y);
    node(fl, k + 3, x + w, y + h);
    node(fl, k + 4, x, y + h);
    for (let i = 1; i <= 4; i++) wall(fl, `${k}w${i}`, k + i, k + ((i % 4) + 1));
  }

  it('volný obdélník, kruh a oblouk → kresba; rovná čára zůstane stěnou', () => {
    const out = legacy(fl => {
      rectLoop(fl, 'r', 0, 0, 400, 300);
      node(fl, 'c', 2000, 0);
      fl.walls.circ = { ...createWall('c', 'c'), id: 'circ', radius: 250 };
      node(fl, 'a1', 0, 1000);
      node(fl, 'a2', 1000, 1000);
      wall(fl, 'arc', 'a1', 'a2', { sagitta: 200, style: 'dashed' });
      node(fl, 'l1', 0, 2000);
      node(fl, 'l2', 1000, 2000);
      wall(fl, 'line', 'l1', 'l2');
    });
    expect(Object.keys(out.walls)).toEqual(['line']);
    expect(Object.keys(out.nodes).sort()).toEqual(['l1', 'l2']);
    const ds = Object.values(out.drawings ?? {});
    expect(ds.map(d => d.shape).sort()).toEqual(['arc', 'circle', 'rect']);
    expect(ds.find(d => d.shape === 'arc')).toMatchObject({ style: 'dashed', pts: [{ x: 0, y: 1000, s: 200 }, { x: 1000, y: 1000 }] });
  });

  it('zůstane stěnami: obdélník se štítkem místnosti uvnitř, oblouk napojený na jinou čáru, obdélník s otvorem, kruh se zámkem kóty', () => {
    const out = legacy(fl => {
      rectLoop(fl, 'r', 0, 0, 4000, 3000);
      fl.rooms.rm = { ...Object.values(fl.rooms)[0], id: 'rm', x: 2000, y: 1500 } as Floor['rooms'][string];
      node(fl, 'a1', 0, 5000);
      node(fl, 'a2', 1000, 5000);
      node(fl, 'a3', 1000, 6000);
      wall(fl, 'arc', 'a1', 'a2', { sagitta: 200 });
      wall(fl, 'tail', 'a2', 'a3');
      rectLoop(fl, 'q', 8000, 0, 2000, 2000);
      fl.openings.op = { id: 'op', wallId: 'qw1' } as Floor['openings'][string];
      // kruh se zamčeným průměrem (zámek by převodem zmizel)
      node(fl, 'c', 20000, 0);
      fl.walls.circ = { ...createWall('c', 'c'), id: 'circ', radius: 250 };
      fl.dimLocks = { 'circle-diameter:circ': { kind: 'circle-diameter', wallId: 'circ' } };
    });
    expect(Object.keys(out.walls)).toHaveLength(4 + 2 + 4 + 1);
    expect(out.dimLocks?.['circle-diameter:circ']).toBeDefined();
    expect(Object.values(out.drawings ?? {})).toHaveLength(0);
  });
});

describe('šrafy uzavřených tvarů (krok 3)', () => {
  const ids = () => {
    const rect = addDrawRect({ x: 0, y: 0 }, { x: 400, y: 300 })!;
    const circ = addDrawCircle({ x: 2000, y: 0 }, 300)!;
    const arc = addDrawArc({ x: 0, y: 2000 }, { x: 1000, y: 2000 }, 200)!;
    const dOpen = addDrawDouble({ x: 0, y: 4000 }, { x: 1000, y: 4000 }, 250, 1)!;
    updateDrawing(dOpen, { closedEnds: false });
    const dClosed = addDrawDouble({ x: 0, y: 5000 }, { x: 1000, y: 5000 }, 250, 1)!;
    return { rect, circ, arc, dOpen, dClosed };
  };

  it('výchozí bez šrafy; zapne se jen u uzavřeného tvaru (obdélník, kruh, dvojitá s uzavřenými konci)', () => {
    const k = ids();
    for (const d of drawings()) expect(d.hatch).toBeUndefined();
    for (const id of Object.values(k)) updateDrawing(id, { hatch: 'cross', hatchColor: 'red' });
    const d = f().drawings!;
    expect([d[k.rect]!.hatch, d[k.circ]!.hatch, d[k.dClosed]!.hatch]).toEqual(['cross', 'cross', 'cross']);
    expect(d[k.dClosed]!.hatchColor).toBe('red');
    expect(d[k.arc]!.hatch).toBeUndefined();
    expect(d[k.dOpen]!.hatch).toBeUndefined();
  });

  it('otevřením tvaru šrafa zmizí; vypnutí šrafy', () => {
    const k = ids();
    updateDrawing(k.dClosed, { hatch: 'dots' });
    updateDrawing(k.dClosed, { closedEnds: false });
    expect(f().drawings![k.dClosed]!.hatch).toBeUndefined();
    updateDrawing(k.rect, { hatch: 'solid' });
    updateDrawing(k.rect, { hatch: null });
    expect(f().drawings![k.rect]!.hatch).toBeUndefined();
  });

  it('šrafovaný tvar přes stěnu: stěna se nemění, ťuknutí dovnitř tvaru mimo stěnu ho vybere', () => {
    wallS();
    const before = structure();
    const id = addDrawRect({ x: 1000, y: -500 }, { x: 1600, y: 200 })!;
    updateDrawing(id, { hatch: 'diag', color: 'blue' });
    expect(structure()).toBe(before);
    expect(pickAny(f(), { x: 1300, y: -300 }, store.get().camera)).toEqual({ kind: 'drawing', id });
  });

  it('šrafa a barvy se uloží a projdou migrací; kopie je převezme', () => {
    const id = addDrawCircle({ x: 0, y: 0 }, 300)!;
    updateDrawing(id, { hatch: 'diag', hatchColor: 'green', color: 'gray' });
    store.set({ selection: { kind: 'drawing', id } });
    duplicateSelection();
    expect(drawings()[1]).toMatchObject({ hatch: 'diag', hatchColor: 'green', color: 'gray' });
    const p = migrateProject(JSON.parse(JSON.stringify(store.get().project)));
    expect(p.floors[0]!.drawings![id]).toMatchObject({ hatch: 'diag', hatchColor: 'green', color: 'gray' });
  });
});
