/**
 * A2 – kreslení řetězem (rozhodnutí uživatele 2026-11-15): další tah navazuje na konec poslední stěny – perem se
 * táhne odkudkoli na plátně, tah se přenese do konce poslední stěny. Řetěz končí uzavřením (konec na existujícím
 * rohu / stěně), ťuknutím, tlačítkem Ukončit nebo změnou nástroje. Délka se zadává ťuknutím na kótu (A10, jako
 * dřív), tloušťka tlačítky mezi tahy (B6).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addWall, applyNumpadValue, setActiveWallThickness } from '../store/actions';
import { store } from '../store/store';
import { lineTool, wallTool } from './wallTool';
import type { PointerInput } from './types';

const Z = 0.1;
const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
/** Tah perem z (x0, y0) o (dx, dy). */
function stroke(x0: number, y0: number, dx: number, dy: number, tool = wallTool) {
  tool.down!(at(x0, y0));
  tool.drag!(at(x0 + dx / 2, y0 + dy / 2));
  tool.drag!(at(x0 + dx, y0 + dy));
  tool.up!(at(x0 + dx, y0 + dy));
}
function open(chain = true) {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'wall' });
  store.updateSettings({ snap: true, wallShape: 'straight', wallAxis: 'face', wallChain: chain });
}
const f = () => store.floor()!;
const walls = () => Object.values(f().walls);
const ends = () => walls().map(w => [f().nodes[w.a]!, f().nodes[w.b]!].map(n => ({ x: Math.round(n.x), y: Math.round(n.y) })));

describe('A2: kreslení řetězem', () => {
  it('další tah navazuje na konec poslední stěny, i když pero začne jinde', () => {
    open();
    stroke(0, 0, 3000, 0);
    stroke(20000, 20000, 0, 2000); // pero úplně jinde – tah dolů o 2000
    expect(walls()).toHaveLength(2);
    expect(ends()[1]).toEqual([
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 }
    ]);
    expect(walls()[1]!.a).toBe(walls()[0]!.b); // společný roh
  });

  it('uzavření do začátku řetěz ukončí (místnost ze čtyř tahů)', () => {
    open();
    stroke(0, 0, 3000, 0);
    stroke(9000, 9000, 0, 2000);
    stroke(9000, 9000, -3000, 0);
    expect(store.get().chainNode).not.toBeNull();
    stroke(9000, 9000, 0, -2000); // konec v počátečním rohu
    expect(walls()).toHaveLength(4);
    expect(store.get().chainNode).toBeNull();
    // další tah už nenavazuje – začne tam, kde je pero
    stroke(10000, 0, 1000, 0);
    expect(ends()[4]![0]).toEqual({ x: 10000, y: 0 });
  });

  it('ťuknutí bez tažení řetěz ukončí', () => {
    open();
    stroke(0, 0, 3000, 0);
    wallTool.down!(at(8000, 8000));
    wallTool.up!(at(8000, 8000));
    expect(store.get().chainNode).toBeNull();
  });

  it('tlačítko Ukončit (chainNode = null): další stěna začne u pera', () => {
    open();
    stroke(0, 0, 3000, 0);
    store.set({ chainNode: null });
    stroke(5000, 5000, 1000, 0);
    expect(ends()[1]![0]).toEqual({ x: 5000, y: 5000 });
  });

  it('změna tloušťky mezi tahy (B6): řetěz pokračuje, další stěna má novou tloušťku', () => {
    open();
    setActiveWallThickness(300);
    stroke(0, 0, 3000, 0);
    setActiveWallThickness(150);
    stroke(9000, 9000, 0, 2000);
    expect(walls().map(w => w.thickness)).toEqual([300, 150]);
    expect(walls()[1]!.a).toBe(walls()[0]!.b);
  });

  it('délka zadaná kótou (A10) posune konec; řetěz pokračuje z nového konce', () => {
    open();
    stroke(0, 0, 3000, 0);
    const w = walls()[0]!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: w.id, move: { nodeId: w.b } }, 3250)).toBe(true);
    stroke(9000, 9000, 0, 2000);
    expect(ends()[1]).toEqual([
      { x: 3250, y: 0 },
      { x: 3250, y: 2000 }
    ]);
  });

  it('Zpět po poslední stěně: roh řetězu zmizel → další tah začne u pera', () => {
    open();
    stroke(0, 0, 3000, 0);
    stroke(9000, 9000, 0, 2000);
    store.undo();
    stroke(5000, 5000, 1000, 0);
    expect(ends()[1]![0]).toEqual({ x: 5000, y: 5000 });
  });

  it('vypnutý řetěz: každý tah začíná u pera (jako dřív)', () => {
    open(false);
    stroke(0, 0, 3000, 0);
    expect(store.get().chainNode).toBeNull();
    stroke(5000, 5000, 0, 2000);
    expect(ends()[1]![0]).toEqual({ x: 5000, y: 5000 });
  });

  it('nástroj Čára řetězem nekreslí', () => {
    open();
    store.set({ tool: 'line' });
    stroke(0, 0, 3000, 0, lineTool);
    stroke(5000, 5000, 0, 2000, lineTool);
    expect(ends()[1]![0]).toEqual({ x: 5000, y: 5000 });
  });
});

describe('A2: konec řetězu a navazování (po kontrole revieweru)', () => {
  it('konec napojený na stěnu (T) řetěz ukončí', () => {
    open();
    addWall({ x: 0, y: 3000 }, null, { x: 6000, y: 3000 }, null, false, { thickness: 0 });
    stroke(1000, 0, 2000, 0);
    stroke(9000, 9000, 0, 3000); // konec na stěně y = 3000
    expect(store.get().chainNode).toBeNull();
  });

  it('konec na líci stěny s tloušťkou řetěz ukončí', () => {
    open();
    // stěna W: čára y = 3000, tělo dolů y ∈ [3000, 3300], vnější líc y = 3300
    addWall({ x: 0, y: 3000 }, null, { x: 6000, y: 3000 }, null, false, { thickness: 300, side: 1 });
    stroke(1000, 6000, 1000, 0);
    stroke(9000, 9000, 0, -2700); // z (2000, 6000) nahoru k vnějšímu líci
    const last = walls()[walls().length - 1]!;
    expect(f().nodes[last.b]!.y).toBeCloseTo(3300, 0);
    expect(store.get().chainNode).toBeNull();
  });

  it('rovné pokračování se sloučí a řetěz pokračuje z konce sloučené stěny', () => {
    open();
    stroke(0, 0, 2000, 0);
    stroke(9000, 9000, 1000, 0); // rovně dál – sloučí se do jedné stěny 0–3000
    expect(walls().filter(w => w.thickness > 0)).toHaveLength(1);
    stroke(9000, 9000, 0, 2000);
    expect(ends()[1]).toEqual([
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 }
    ]);
  });
});
