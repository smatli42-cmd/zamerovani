/**
 * Kóta polohy napojení na průběžné stěně (fronta kroků POSTUP.md: od zrušení dělení se poloha příčky nekótovala).
 * Osa Y dolů. Průběžná stěna A (0,0)–(4000,0), tloušťka 300; příčka B z (1000,0) „nahoru“ do (1000,−2000).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { hostedChain } from '../core/hosting';
import { addOpening, addWall, applyNumpadValue } from './actions';
import { openTarget, pressKey } from './numpadController';
import { store } from './store';

const f = () => store.floor()!;
function tee() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
  const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -2000 }, null, false, { thickness: 100, side: -1 })!;
  return { A, B, m: f().walls[B]!.a, far: f().walls[B]!.b };
}

describe('kóta polohy napojení', () => {
  it('řetěz napojení na průběžné stěně: poloha od rohu A', () => {
    const { A, m } = tee();
    expect(hostedChain(f(), A)).toEqual([{ nodeId: m, at: 1000 }]);
  });

  it('zadání 1500 od rohu A posune příčku celou (volný konec jde s ní), napojení zůstane, jeden krok Zpět', () => {
    const { A, m, far } = tee();
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' }, 1500)).toBe(true);
    expect(f().nodes[m]).toMatchObject({ x: 1500, y: 0, host: A });
    expect(f().nodes[far]).toMatchObject({ x: 1500, y: -2000 });
    store.undo();
    expect(f().nodes[m]).toMatchObject({ x: 1000, y: 0 });
  });

  it('zadání k rohu B (od posledního napojení) a pořadí napojení se nemění', () => {
    const { A, m } = tee();
    const C = addWall({ x: 3000, y: 0 }, null, { x: 3000, y: -1000 }, null, false, { thickness: 100, side: -1 })!;
    const mc = f().walls[C]!.a;
    expect(hostedChain(f(), A).map(c => c.nodeId)).toEqual([m, mc]);
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: mc, to: 'next' }, 500)).toBe(true);
    expect(f().nodes[mc]).toMatchObject({ x: 3500, y: 0 });
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: mc, to: 'prev' }, 3100)).toBe(false); // za roh B
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' }, 3600)).toBe(false); // za další napojení
  });

  it('příčka mezi dvěma rovnoběžnými stěnami se posune celá (oba konce napojené)', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const D = addWall({ x: 0, y: -3000 }, null, { x: 4000, y: -3000 }, null, false, { thickness: 300, side: -1 })!;
    const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -3000 }, null, false, { thickness: 100, side: -1 })!;
    const w = f().walls[B]!;
    expect(f().nodes[w.b]!.host).toBe(D);
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: w.a, to: 'prev' }, 2000)).toBe(true);
    expect(f().nodes[w.a]).toMatchObject({ x: 2000, y: 0, host: A });
    expect(f().nodes[w.b]).toMatchObject({ x: 2000, y: -3000, host: D });
  });

  it('konec příčky v rohu dalších stěn zůstane, příčka se natočí', () => {
    const { A, m, far } = tee();
    addWall({ x: 1000, y: -2000 }, far, { x: 2000, y: -2000 }, null, false, { thickness: 100, side: 1 });
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' }, 1200)).toBe(true);
    expect(f().nodes[m]).toMatchObject({ x: 1200, y: 0 });
    expect(f().nodes[far]).toMatchObject({ x: 1000, y: -2000 });
  });

  it('konec příčky napojený na šikmou stěnu zůstane na ní (průsečík ve směru příčky)', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const D = addWall({ x: 0, y: -3000 }, null, { x: 4000, y: -4000 }, null, false, { thickness: 300, side: -1 })!;
    const B = addWall({ x: 1000, y: 0 }, null, { x: 1000, y: -3250 }, null, false, { thickness: 100, side: -1 })!;
    const w = f().walls[B]!;
    expect(f().nodes[w.b]!.host).toBe(D);
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: w.a, to: 'prev' }, 2000)).toBe(true);
    expect(f().nodes[w.b]!.host).toBe(D);
    expect(f().nodes[w.b]!.x).toBeCloseTo(2000, 3);
    expect(f().nodes[w.b]!.y).toBeCloseTo(-3500, 3);
  });

  it('natočená příčka ztratí změřenou délku', () => {
    const { A, B, m, far } = tee();
    addWall({ x: 1000, y: -2000 }, far, { x: 2000, y: -2000 }, null, false, { thickness: 100, side: 1 });
    store.edit(fl => {
      fl.walls[B]!.measured = 2000;
    });
    applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' }, 1200);
    expect(f().walls[B]!.measured).toBeNull();
  });

  it('příčku nejde posunout do otvoru v průběžné stěně', () => {
    const { A, m } = tee();
    store.set({ selection: null });
    addOpening(A, 'door', 0.5);
    const op = Object.values(f().openings)[0]!;
    expect(op).toBeTruthy();
    expect(applyNumpadValue({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' }, 2000)).toBe(false);
  });

  it('oblouková stěna řetěz nemá; NumPad jde po úsecích: od A → další napojení → k rohu B → konec', () => {
    const { A, m } = tee();
    const C = addWall({ x: 3000, y: 0 }, null, { x: 3000, y: -1000 }, null, false, { thickness: 100, side: -1 })!;
    const mc = f().walls[C]!.a;
    openTarget({ kind: 'junction-gap', wallId: A, nodeId: m, to: 'prev' });
    expect(store.get().numpad?.buffer).toBe('1000');
    pressKey('NEXT');
    expect(store.get().numpad?.target).toEqual({ kind: 'junction-gap', wallId: A, nodeId: mc, to: 'prev' });
    expect(store.get().numpad?.buffer).toBe('2000');
    pressKey('NEXT');
    expect(store.get().numpad?.target).toEqual({ kind: 'junction-gap', wallId: A, nodeId: mc, to: 'next' });
    pressKey('NEXT');
    expect(store.get().numpad).toBeNull();
    const R = addWall({ x: 0, y: 5000 }, null, { x: 4000, y: 5000 }, null, false, { thickness: 300, side: 1, sagitta: 500 })!;
    expect(hostedChain(f(), R)).toEqual([]);
  });
});
