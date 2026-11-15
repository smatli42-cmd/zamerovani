/**
 * D4 – ruční dělení stěny (rozhodnutí uživatele 2026-11-15): nástroj Rozdělit, ťuknutím na dvě části, v režimu
 * S mezerou dvěma ťuknutími vyjme úsek. Prvky nesené stěnou podle F4. Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addCircleWalls, addOpening, addWall, cutWallSegment, setDimLock, splitWall } from './actions';
import { store } from './store';
import { splitTool } from '../tools/splitTool';
import type { PointerInput } from '../tools/types';

const f = () => store.floor()!;
const walls = () => Object.values(f().walls).filter(w => w.thickness > 0);
const spans = () =>
  walls()
    .map(w => [f().nodes[w.a]!.x, f().nodes[w.b]!.x].map(Math.round).sort((p, q) => p - q))
    .sort((p, q) => p[0]! - q[0]!);

function wall() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
  return addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
}

describe('D4: rozdělit stěnu', () => {
  it('ťuknutí rozdělí stěnu na dvě v bodě po 10 mm od rohu A', () => {
    const W = wall();
    expect(splitWall(W, { x: 1234, y: 40 }).result).toBe('ok');
    expect(spans()).toEqual([
      [0, 1230],
      [1230, 4000]
    ]);
  });

  it('jeden krok Zpět vrátí celou stěnu', () => {
    const W = wall();
    splitWall(W, { x: 1234, y: 40 });
    store.undo();
    expect(spans()).toEqual([[0, 4000]]);
  });

  it('zarovnání s jiným rohem (svisle pod rohem jiné stěny)', () => {
    const W = wall();
    addWall({ x: 1500, y: 2000 }, null, { x: 1500, y: 3000 }, null, false, { thickness: 0 });
    splitWall(W, { x: 1488, y: 0 }, 50);
    expect(spans()).toEqual([
      [0, 1500],
      [1500, 4000]
    ]);
  });

  it('u konce stěny se nerozdělí; kruh rozdělit nejde', () => {
    const W = wall();
    expect(splitWall(W, { x: 2, y: 0 }).result).toBe('end');
    expect(spans()).toEqual([[0, 4000]]);
    addCircleWalls({ x: 9000, y: 0 }, 1000, 'solid');
    const circle = Object.values(f().walls).find(w => w.radius !== undefined)!;
    expect(splitWall(circle.id, { x: 10000, y: 0 }).result).toBe('circle');
  });

  it('F4: otvor na části zůstane, otvor přes dělicí bod se smaže (hlášení počtu)', () => {
    const W = wall();
    const keep = addOpening(W, 'window', 0.2)!; // kolem x = 800
    const lost = addOpening(W, 'door', 0.6)!; // kolem x = 2400
    const r = splitWall(W, { x: 2400, y: 0 });
    expect(r).toEqual({ result: 'ok', removed: 1 });
    expect(f().openings[keep]).toBeDefined();
    expect(f().openings[lost]).toBeUndefined();
  });

  it('oblouková stěna se rozdělí na dva oblouky', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1, sagitta: 1000 })!;
    expect(splitWall(A, { x: 2000, y: 1100 }).result).toBe('ok');
    expect(walls()).toHaveLength(2);
    expect(walls().every(w => !!w.sagitta)).toBe(true);
  });
});

describe('D4: rozdělit s mezerou (vyjmout úsek)', () => {
  it('úsek mezi dvěma místy zmizí, otvor v něm také (F4)', () => {
    const W = wall();
    const inGap = addOpening(W, 'opening', 0.375)!; // kolem x = 1500
    const r = cutWallSegment(W, { x: 1000, y: 0 }, { x: 2000, y: 0 });
    expect(r).toEqual({ result: 'ok', removed: 1 });
    expect(spans()).toEqual([
      [0, 1000],
      [2000, 4000]
    ]);
    expect(f().openings[inGap]).toBeUndefined();
  });

  it('pořadí ťuknutí nevadí; příčka napojená v úseku se jen odpojí', () => {
    const W = wall();
    const P = addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -2000 }, null, false, { thickness: 100 })!;
    expect(f().nodes[f().walls[P]!.a]!.host).toBe(W);
    cutWallSegment(W, { x: 2000, y: 0 }, { x: 1000, y: 0 });
    expect(f().walls[P]).toBeDefined();
    expect(f().nodes[f().walls[P]!.a]!.host).toBeUndefined();
  });

  it('úsek až ke konci stěnu jen zkrátí; přes celou stěnu se neprovede', () => {
    const W = wall();
    expect(cutWallSegment(W, { x: 3000, y: 0 }, { x: 3998, y: 0 }).result).toBe('ok');
    expect(spans()).toEqual([[0, 3000]]);
    const W2 = walls()[0]!.id;
    expect(cutWallSegment(W2, { x: 1, y: 0 }, { x: 2999, y: 0 }).result).toBe('whole');
  });

  it('jeden krok Zpět', () => {
    const W = wall();
    cutWallSegment(W, { x: 1000, y: 0 }, { x: 2000, y: 0 });
    store.undo();
    expect(spans()).toEqual([[0, 4000]]);
  });
});

describe('D4: nástroj Rozdělit', () => {
  const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * 0.1, y: y * 0.1 }, device: 'pen' });
  const tap = (x: number, y: number) => {
    splitTool.down!(at(x, y));
    splitTool.up?.(at(x, y));
  };

  it('režim Rozdělit: ťuknutí na stěnu ji rozdělí; ťuknutí mimo stěnu nic nezmění', () => {
    wall();
    store.set({ tool: 'split' });
    store.updateSettings({ splitGap: false });
    tap(5000, 5000);
    expect(spans()).toHaveLength(1);
    tap(2000, 100); // do těla stěny
    expect(spans()).toEqual([
      [0, 2000],
      [2000, 4000]
    ]);
  });

  it('režim S mezerou: dvě ťuknutí na téže stěně vyjmou úsek', () => {
    wall();
    store.set({ tool: 'split' });
    store.updateSettings({ splitGap: true });
    tap(1000, 0);
    expect(spans()).toHaveLength(1);
    tap(1600, 0);
    expect(spans()).toEqual([
      [0, 1000],
      [1600, 4000]
    ]);
    store.updateSettings({ splitGap: false });
  });
});

describe('D4 – po kontrole revieweru a rozhodnutí uživatele 2026-11-15', () => {
  it('dělení v místě příčky napojené na čáru stěny: roh příčky je rohem obou částí (T)', () => {
    const W = wall();
    const P = addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -2000 }, null, false, { thickness: 100 })!;
    const m = f().walls[P]!.a;
    expect(f().nodes[m]!.host).toBe(W);
    expect(splitWall(W, { x: 1503, y: 0 }).result).toBe('ok');
    expect(f().nodes[m]!.host).toBeUndefined();
    expect(Object.values(f().walls).filter(w => w.a === m || w.b === m)).toHaveLength(3);
    expect(Object.keys(f().nodes).filter(id => Math.abs(f().nodes[id]!.x - 1500) < 1 && Math.abs(f().nodes[id]!.y) < 1)).toHaveLength(1);
  });

  it('dělení v místě příčky napojené na líc: bod se posune na okraj jejího těla, příčka zůstane napojená', () => {
    const W = wall(); // tělo y ∈ [0, 300], vnější líc y = 300
    const P = addWall({ x: 2000, y: 300 }, null, { x: 2000, y: 2300 }, null, false, { thickness: 100 })!;
    const m = f().walls[P]!.a;
    expect(f().nodes[m]).toMatchObject({ host: W, hostFace: 1 });
    expect(splitWall(W, { x: 2000, y: 150 }).result).toBe('ok');
    const host = f().nodes[m]!.host;
    expect(host).toBeDefined();
    expect(f().walls[host!]).toBeDefined();
    // dělicí bod je o tloušťku příčky vedle (1900 nebo 2100), ne v jejím rohu
    const cut = spans().find(s => s[0] === 0)![1]!;
    expect([1900, 2100]).toContain(cut);
  });

  it('oblouk větší než půlkruh: dělení ve vrcholu i vyjmutí úseku podle polohy po oblouku', async () => {
    const { wallFrame } = await import('../core/protrusion');
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 200, side: 1, sagitta: 1800 })!;
    const fr = wallFrame(f(), f().walls[A]!)!;
    const L = fr.len;
    expect(splitWall(A, fr.at(L / 2).p).result).toBe('ok');
    store.undo();
    // vyjmout úsek mezi čtvrtinou a polovinou délky oblouku – zbylé části mají dohromady 3/4 délky
    expect(cutWallSegment(A, fr.at(L / 4).p, fr.at(L / 2).p).result).toBe('ok');
    const rest = Object.values(f().walls).reduce((s, w) => s + wallFrame(f(), w)!.len, 0);
    expect(rest).toBeCloseTo((3 * L) / 4, -1);
  });

  it('vyjmout úsek ze stěny se zamčenou délkou nejde (hlášení), dělení ano (zámek přejde na části)', () => {
    const W = wall();
    setDimLock({ kind: 'wall-length', wallId: W, move: 'both' }, true);
    expect(cutWallSegment(W, { x: 3000, y: 0 }, { x: 3999, y: 0 }).result).toBe('locked');
    expect(store.get().lockBlock?.text).toContain('délka stěny');
    expect(spans()).toEqual([[0, 4000]]);
    expect(splitWall(W, { x: 2000, y: 0 }).result).toBe('ok');
  });

  it('zamčený odstup okna od rohu A: dělení mezi rohem a oknem se neprovede (rozhodnutí uživatele)', () => {
    const W = wall();
    const op = addOpening(W, 'window', 0.75)!;
    setDimLock({ kind: 'opening-offset', openingId: op, ref: 'a' }, true);
    expect(splitWall(W, { x: 1000, y: 0 }).result).toBe('locked');
    expect(spans()).toEqual([[0, 4000]]);
  });
});
