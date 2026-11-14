/**
 * Napojení nové stěny na LÍC průběžné stěny (oba líce, i u osy uprostřed) – roh mimo osu (`Node.hostFace`).
 * Osa Y dolů; průběžná stěna A z (0,0) do (4000,0), tloušťka 300, tělo y ∈ [0, 300] (vnější líc y = 300).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { wallBodies } from '../core/wallBody';
import { hostedChain } from '../core/hosting';
import { wallLength } from '../core/floorQueries';
import { addWall, duplicateSelection, flipWallSide, groupOrigin, moveGroup, setWallAxis, setWallNoJoin, setWallThickness } from './actions';
import { store } from './store';

const f = () => store.floor()!;

function host(opts: { axis?: 'center' } = {}) {
  store.openProject(createProject({ name: 't' }));
  return addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1, ...opts })!;
}

describe('napojení na líc průběžné stěny', () => {
  it('stěna začatá na vnějším líci se na něj napojí: roh na líci, A se nedělí, délka = viditelná délka', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    expect(Object.keys(f().walls)).toHaveLength(2);
    const m = f().walls[C]!.a;
    expect(f().nodes[m]).toMatchObject({ x: 2000, y: 300, host: A, hostFace: 1 });
    expect(wallLength(f(), f().walls[C]!)).toBe(2000);
    // kóta polohy napojení na průběžné stěně
    expect(hostedChain(f(), A)).toEqual([{ nodeId: m, at: 2000 }]);
  });

  it('tělo napojené stěny začíná na líci, líc průběžné stěny je v místě napojení přerušený', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    const bodies = wallBodies(f());
    const c = bodies.get(C)!;
    expect(Math.min(...c.poly.map(p => p.y))).toBeCloseTo(300, 6);
    // hrany A na vnějším líci (y = 300) nepřecházejí přes šířku stěny C
    const crossing = bodies.get(A)!.edges.filter(([p, q]) => Math.abs(p.y - 300) < 1e-6 && Math.abs(q.y - 300) < 1e-6 && Math.min(p.x, q.x) < 2000 && Math.max(p.x, q.x) > 2000);
    expect(crossing).toHaveLength(0);
  });

  it('stěna ukončená na líci se také napojí (konec kreslení)', () => {
    const A = host();
    const C = addWall({ x: 1000, y: 2300 }, null, { x: 1000, y: 300 }, null, false, { thickness: 150 })!;
    expect(f().nodes[f().walls[C]!.b]).toMatchObject({ x: 1000, y: 300, host: A, hostFace: 1 });
  });

  it('napojení na čáru (osu) stěny zůstává jako dřív – bez hostFace', () => {
    const A = host();
    const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -2000 }, null, false, { thickness: 100 })!;
    const n = f().nodes[f().walls[B]!.a]!;
    expect(n).toMatchObject({ x: 1000, y: 0, host: A });
    expect(n.hostFace).toBeUndefined();
  });

  it('změna tloušťky průběžné stěny: roh jede s lícem, vzdálený konec zůstane', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    setWallThickness(A, 200);
    const w = f().walls[C]!;
    expect(f().nodes[w.a]).toMatchObject({ x: 2000, y: 200, host: A, hostFace: 1 });
    expect(f().nodes[w.b]).toMatchObject({ x: 2000, y: 2300 });
    expect(wallLength(f(), w)).toBe(2100);
  });

  it('přehození strany průběžné stěny: líc na straně napojení je teď čára stěny → roh na ní', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    flipWallSide(A);
    expect(f().nodes[f().walls[C]!.a]).toMatchObject({ x: 2000, y: 0, host: A });
  });

  it('posun průběžné stěny kolmo: roh na líci ji sleduje', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: A }]), 0, 100);
    expect(f().nodes[f().walls[C]!.a]).toMatchObject({ x: 2000, y: 400, host: A, hostFace: 1 });
  });

  it('osa uprostřed: napojení na oba líce (±150)', () => {
    const A = host({ axis: 'center' });
    const C = addWall({ x: 1000, y: 150 }, null, { x: 1000, y: 1150 }, null, false, { thickness: 100 })!;
    const D = addWall({ x: 3000, y: -150 }, null, { x: 3000, y: -1150 }, null, false, { thickness: 100 })!;
    expect(f().nodes[f().walls[C]!.a]).toMatchObject({ host: A, hostFace: 1, y: 150 });
    expect(f().nodes[f().walls[D]!.a]).toMatchObject({ host: A, hostFace: -1, y: -150 });
    expect(Object.keys(f().walls)).toHaveLength(3);
  });

  it('změna osy průběžné stěny líc → střed: roh jede s lícem', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    setWallAxis(A, 'center');
    expect(f().nodes[f().walls[C]!.a]).toMatchObject({ x: 2000, y: 150, host: A, hostFace: 1 });
  });

  it('kopie průběžné stěny s napojenou stěnou: kopie zůstane napojená na líc', () => {
    const A = host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: A }, { kind: 'wall', id: C }] } });
    duplicateSelection();
    const onFace = Object.values(f().nodes).filter(n => n.hostFace === 1);
    expect(onFace).toHaveLength(2);
    expect(new Set(onFace.map(n => n.host)).size).toBe(2);
  });

  it('stěna vedoucí z líce do těla a přes osu se na líc nenapojí (bylo by to křížení)', () => {
    host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: -1700 }, null, false, { thickness: 150 })!;
    expect(f().nodes[f().walls[C]!.a]!.hostFace).toBeUndefined();
  });

  it('odpojení konce (Nespojený) zruší napojení i stranu líce', () => {
    host();
    const C = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 150 })!;
    setWallNoJoin(C, 'a', true);
    const n = f().nodes[f().walls[C]!.a]!;
    expect(n.host).toBeUndefined();
    expect(n.hostFace).toBeUndefined();
  });
});
