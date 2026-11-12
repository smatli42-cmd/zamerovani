/**
 * T bez dělení (požadavek uživatele 2026-11-12, katalog C2/5 „A se nepřerušuje“): napojená stěna průběžnou
 * stěnu nedělí, průběžná zůstává jedna a jde posunout celá – napojená stěna ji sleduje.
 * Osa Y dolů; průběžná stěna A z (0,0) do (4000,0), příčka B z (1000,0) „nahoru“ do (1000,−2000).
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createWall } from '../model/factory';
import { componentNodes } from '../core/components';
import { bodyNormal } from '../core/wallBody';
import { joinSplitWalls, migrateProject } from '../persistence/migrate';
import { addWall, applyWallLength, deleteSelection, duplicateSelection, moveGroup, groupOrigin, moveNode, mergeNodeIfCoincident, rotateSelection, setWallNoJoin, setWallSagitta } from './actions';
import { store } from './store';

function tee() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -2000 }, null, false, { thickness: 100, side: -1 })!;
  return { A, B, m: store.floor()!.walls[B]!.a };
}
const f = () => store.floor()!;
const moveWall = (id: string, dx: number, dy: number) => moveGroup(groupOrigin(f(), [{ kind: 'wall', id }]), dx, dy);

describe('T bez dělení', () => {
  it('napojení stěnu nerozdělí: dvě stěny, roh B je napojený na A', () => {
    const { A, m } = tee();
    expect(Object.keys(f().walls)).toHaveLength(2);
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 0, host: A });
  });

  it('posun průběžné stěny kolmo: B ji sleduje (prodlouží se), stále napojená', () => {
    const { A, B, m } = tee();
    moveWall(A, 0, 500);
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 500, host: A });
    expect(f().nodes[f().walls[B]!.b]).toMatchObject({ x: 1000, y: -2000 });
  });

  it('posun průběžné stěny podél sebe: napojení zůstane na místě', () => {
    const { A, m } = tee();
    moveWall(A, 300, 0);
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 0, host: A });
  });

  it('posun celé skupiny (A i B): vše se posune spolu, napojení zůstane', () => {
    const { A, B, m } = tee();
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: A }, { kind: 'wall', id: B }]), 200, 200);
    expect(f().nodes[m]).toMatchObject({ x: 1200, y: 200, host: A });
  });

  it('rozpojení konce B (Nespojený) odpojí B i fyzicky; zpět Spojený napojí znovu', () => {
    const { A, B } = tee();
    setWallNoJoin(B, 'a', true);
    expect(f().nodes[f().walls[B]!.a]!.host).toBeUndefined();
    moveWall(A, 0, 500);
    expect(f().nodes[f().walls[B]!.a]).toMatchObject({ x: 1000, y: 0 }); // B nesleduje
    moveWall(A, 0, -500);
    setWallNoJoin(B, 'a', false);
    expect(f().nodes[f().walls[B]!.a]!.host).toBe(A);
    expect(Object.keys(f().walls)).toHaveLength(2); // stěna A se ani teď nerozdělila

  });

  it('roh B odtažený ze stěny se odpojí, přetažený zpět na stěnu se napojí', () => {
    const { A, m } = tee();
    moveNode(m, { x: 1000, y: -300 });
    expect(f().nodes[m]!.host).toBeUndefined();
    moveNode(m, { x: 2000, y: 0 });
    mergeNodeIfCoincident(m);
    expect(f().nodes[m]!.host).toBe(A);
    expect(Object.keys(f().walls)).toHaveLength(2);
  });

  it('smazání průběžné stěny zruší napojení', () => {
    const { A, B } = tee();
    store.set({ selection: { kind: 'wall', id: A } });
    deleteSelection();
    expect(f().nodes[f().walls[B]!.a]!.host).toBeUndefined();
  });

  it('kopie: s průběžnou stěnou se napojení zkopíruje, samotná příčka je samostatná', () => {
    const { A, B } = tee();
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: A }, { kind: 'wall', id: B }] } });
    duplicateSelection();
    const hosted = Object.values(f().nodes).filter(n => n.host);
    expect(hosted).toHaveLength(2);
    expect(new Set(hosted.map(n => n.host)).size).toBe(2);
    store.set({ selection: { kind: 'wall', id: B } });
    duplicateSelection();
    expect(Object.values(f().nodes).filter(n => n.host)).toHaveLength(2);
  });

  it('skupina: příčka patří do skupiny průběžné stěny (žádné kóty odstupu mezi nimi)', () => {
    const { A, B } = tee();
    expect(componentNodes(f(), B).has(f().walls[A]!.a)).toBe(true);
  });

  it('místnost uzavřená přes napojené rohy: těla se natočí ven', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: -1000, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: -3000 }, null, false, { thickness: 200 });
    addWall({ x: 0, y: -3000 }, null, { x: 3000, y: -3000 }, null, false, { thickness: 200 });
    const last = addWall({ x: 3000, y: -3000 }, null, { x: 3000, y: 0 }, null, false, { thickness: 200 })!;
    expect(Object.keys(f().walls)).toHaveLength(4);
    const top = Object.values(f().walls).find(w => f().nodes[w.a]!.y === -3000 && f().nodes[w.b]!.y === -3000)!;
    expect(bodyNormal(f(), top)!.y).toBeLessThan(0); // tělo horní stěny ven z místnosti (−y)
    expect(bodyNormal(f(), f().walls[last]!)!.x).toBeGreaterThan(0); // pravá stěna ven (+x)
  });
});

describe('migrace 7 → 8: rozdělená stěna se spojí zpět', () => {
  function oldFloor() {
    const fl = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['m', 1000, 0], ['b', 3000, 0], ['p', 1000, -2000]] as const) fl.nodes[id] = { id, x, y };
    const A1 = createWall('a', 'm', 0, 300, 1);
    A1.measured = 1000;
    const A2 = createWall('m', 'b', 0, 300, 1);
    A2.measured = 2000;
    const B = createWall('m', 'p', 0, 100, -1);
    for (const w of [A1, A2, B]) fl.walls[w.id] = w;
    fl.openings.o = { id: 'o', wallId: A2.id, kind: 'window', number: 'O1', width: 800, height: 1500, sill: 900, depth: 0, offset: 500, ref: 'a' } as never;
    return { fl, A1, A2, B };
  }

  it('A1 + A2 → jedna stěna, roh m napojený, změřené délky sečtené, okno na stejném místě', () => {
    const { fl, B } = oldFloor();
    const g = joinSplitWalls(fl);
    expect(Object.keys(g.walls)).toHaveLength(2);
    const A = Object.values(g.walls).find(w => w.id !== B.id)!;
    expect(A.measured).toBe(3000);
    expect(g.nodes.m!.host).toBe(A.id);
    const op = g.openings.o!;
    expect(op.wallId).toBe(A.id);
    // okno bylo 500 od m (= 1500 od a)
    const start = op.ref === 'a' ? op.offset : 3000 - op.offset - 800;
    expect(g.nodes[A.a]!.x === 0 ? start : 3000 - start - 800).toBe(1500);
  });

  it('po odpojení zbylé rozdělení (jen dvě části v řadě) se také spojí', () => {
    const { fl, B } = oldFloor();
    delete fl.walls[B.id];
    const g = joinSplitWalls(fl);
    expect(Object.keys(g.walls)).toHaveLength(1);
    expect(g.nodes.m).toBeUndefined();
  });

  it('části s jinou tloušťkou nebo stranou se nespojí', () => {
    const { fl, A2 } = oldFloor();
    fl.walls[A2.id]!.thickness = 200;
    expect(Object.keys(joinSplitWalls(fl).walls)).toHaveLength(3);
  });

  it('migrateProject ze schématu 7 spojí, ze schématu 8 nechá být', () => {
    const { fl } = oldFloor();
    expect(Object.keys(migrateProject({ schema: 7, id: 'p', floors: [fl] }).floors[0]!.walls)).toHaveLength(2);
    expect(Object.keys(migrateProject({ schema: 8, id: 'p', floors: [fl] }).floors[0]!.walls)).toHaveLength(3);
  });
});

describe('T bez dělení – nálezy revieweru', () => {
  it('Zpět a Vpřed po posunu průběžné stěny vrátí i napojený roh', () => {
    const { A, m } = tee();
    moveWall(A, 0, 500);
    store.undo();
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 0, host: A });
    store.redo();
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 500, host: A });
  });

  it('délka příčky mezi dvěma stěnami: protější průběžná stěna se posune, příčka zůstane napojená', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 200 });
    const bottom = addWall({ x: 0, y: 3000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 200 })!;
    const P = addWall({ x: 2000, y: 0 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100 })!;
    const pb = f().walls[P]!.b;
    expect(f().nodes[pb]!.host).toBe(bottom);
    expect(applyWallLength(P, 3500, { nodeId: pb })).toBe(true);
    const g = f();
    expect(g.nodes[pb]).toMatchObject({ x: 2000, y: 3500, host: bottom });
    expect(g.nodes[g.walls[bottom]!.a]!.y).toBeCloseTo(3500, 3);
    expect(g.nodes[g.walls[bottom]!.b]!.y).toBeCloseTo(3500, 3);
  });

  it('průběžná stěna změněná na oblouk se v napojených rozích rozdělí a rohy leží na oblouku', () => {
    const { A, B } = tee();
    addWall({ x: 3000, y: 0 }, null, { x: 3000, y: -2000 }, null, false, { thickness: 100, side: -1 });
    setWallSagitta(A, 500);
    const g = f();
    expect(Object.values(g.nodes).some(n => n.host)).toBe(false);
    const arcs = Object.values(g.walls).filter(w => w.sagitta);
    expect(arcs).toHaveLength(3); // oblouk rozdělený ve dvou rozích
    const mB = g.nodes[g.walls[B]!.a]!;
    expect(arcs.some(w => w.a === mB.id || w.b === mB.id)).toBe(true);
  });

  it('otočení výběru (T celé) o 30°: napojení zůstane', () => {
    const { A, B, m } = tee();
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: A }, { kind: 'wall', id: B }] } });
    rotateSelection(30);
    expect(f().nodes[m]!.host).toBe(A);
  });
});

describe('migrace 7 → 8 – nálezy revieweru', () => {
  it('staré křížení „+“ (4 části) → 3 stěny, společný roh napojený na jednu průběžnou', () => {
    const fl = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['m', 1000, 0], ['b', 2000, 0], ['p', 1000, -1000], ['q', 1000, 1000]] as const) fl.nodes[id] = { id, x, y };
    for (const [s, e] of [['a', 'm'], ['m', 'b'], ['p', 'm'], ['m', 'q']] as const) {
      const w = createWall(s, e, 0, 200, 1);
      fl.walls[w.id] = w;
    }
    const g = joinSplitWalls(fl);
    expect(Object.keys(g.walls)).toHaveLength(3);
    expect(g.nodes.m!.host).toBeDefined();
    expect(Object.values(g.walls).filter(w => w.a === 'm' || w.b === 'm')).toHaveLength(2);
    // opakovaná migrace nic nemění
    expect(JSON.stringify(joinSplitWalls(g))).toBe(JSON.stringify(g));
  });

  it('rozdělená čára bez tloušťky se spojí také', () => {
    const fl = createFloor('t');
    for (const [id, x, y] of [['a', 0, 0], ['m', 1000, 0], ['b', 2000, 0], ['p', 1000, -1000]] as const) fl.nodes[id] = { id, x, y };
    for (const [s, e] of [['a', 'm'], ['m', 'b'], ['m', 'p']] as const) {
      const w = createWall(s, e, 0, 0, 1);
      fl.walls[w.id] = w;
    }
    const g = joinSplitWalls(fl);
    expect(Object.keys(g.walls)).toHaveLength(2);
    expect(g.nodes.m!.host).toBeDefined();
  });
});
