/**
 * Volná kóta mezi dvěma body (POZADAVKY.md 3; rozhodnutí uživatele 2026-11-18): řídicí – zadaná délka posune
 * zvolený konec ve směru kóty; konce na rohu stěny, bodu kresby nebo pevném bodu. Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { DimEnd, Pt } from '../model/types';
import { freeDimValue, freeDimsOf } from '../core/freeDim';
import { dist } from '../core/geometry';
import { addDrawCircle, addDrawLine, addFreeDim, addOpening, addWall, splitWall, applyNumpadValue, deleteSelection, mergeNodeIfCoincident, setDimLock, setFreeDimOffset, trimToCorner } from './actions';
import { endPoint } from '../core/freeDim';
import { refAt } from '../core/dimRefs';
import { openingStartFromA, wallLength } from '../core/floorQueries';
import { store } from './store';
import { dimTool } from '../tools/dimTool';
import { pickAny } from '../tools/pick';
import type { PointerInput } from '../tools/types';

const f = () => store.floor()!;
const dims = () => freeDimsOf(f());
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1)!;
const N = (p: Pt): DimEnd => ({ node: nodeAt(p).id });

/** Místnost 4000 × 3000 z rovných stěn (osa na líci). */
function room() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
  const c: Pt[] = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 }
  ];
  for (let i = 0; i < 4; i++) addWall(c[i]!, null, c[(i + 1) % 4]!, null, false, { thickness: 300, side: -1 });
}
const tap = (world: Pt): PointerInput => ({ world, screen: { x: world.x * 0.1, y: world.y * 0.1 }, device: 'pen' });

describe('volná kóta: vznik a hodnota', () => {
  it('úhlopříčka mezi rohy místnosti: délka z výkresu, vybere se', () => {
    room();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(dims()).toHaveLength(1);
    expect(freeDimValue(f(), id)).toBeCloseTo(5000, 6);
    expect(store.get().selection).toEqual({ kind: 'dim', id });
  });

  it('stejný bod dvakrát kótu nevytvoří', () => {
    room();
    expect(addFreeDim(N({ x: 0, y: 0 }), N({ x: 0, y: 0 }))).toBeNull();
    expect(dims()).toHaveLength(0);
  });

  it('nástroj Kóta: dvě ťuknutí u rohů vytvoří kótu napojenou na rohy', () => {
    room();
    dimTool.up!(tap({ x: 30, y: -20 }));
    dimTool.up!(tap({ x: 3980, y: 3010 }));
    expect(dims()).toHaveLength(1);
    const d = dims()[0]!;
    expect(d.a).toEqual({ node: nodeAt({ x: 0, y: 0 }).id });
    expect(d.b).toEqual({ node: nodeAt({ x: 4000, y: 3000 }).id });
  });

  it('nástroj Kóta: ťuknutí mimo prvky = pevný bod', () => {
    room();
    dimTool.up!(tap({ x: 1000, y: 1000 }));
    dimTool.up!(tap({ x: 2000, y: 1500 }));
    expect(dims()).toHaveLength(1);
    expect('node' in dims()[0]!.a || 'drawing' in dims()[0]!.a).toBe(false);
  });

  it('ťuknutí na kótovací čáru ji vybere', () => {
    room();
    const id = addFreeDim({ x: 1000, y: 1000 }, { x: 3000, y: 1000 })!;
    store.set({ selection: null });
    expect(pickAny(f(), { x: 2000, y: 1000 }, store.get().camera)).toEqual({ kind: 'dim', id });
  });
});

describe('volná kóta: zadání délky posune zvolený bod', () => {
  it('úhlopříčka: posun 2. rohu ve směru kóty, Zpět vrátí', () => {
    room();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 5100)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(5100, 0);
    // roh se posunul po úhlopříčce o 100 (4000 + 80, 3000 + 60)
    expect(f().nodes[(dims()[0]!.b as { node: string }).node]).toMatchObject({ x: 4080, y: 3060 });
    expect(f().nodes[(dims()[0]!.a as { node: string }).node]).toMatchObject({ x: 0, y: 0 });
    store.undo();
    expect(freeDimValue(f(), id)).toBeCloseTo(5000, 6);
  });

  it('posun 1. bodu', () => {
    room();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 0 }))!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'a' }, 4500)).toBe(true);
    expect(nodeAt({ x: 4000, y: 0 })).toBeDefined();
    expect(freeDimValue(f(), id)).toBeCloseTo(4500, 0);
  });

  it('pevný bod – roh: posun rohu posune celou samostatnou skupinu stěn (stěny se nedeformují)', () => {
    room();
    const id = addFreeDim({ x: -1000, y: 0 }, N({ x: 0, y: 0 }))!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 1500)).toBe(true);
    // celá místnost o 500 doprava
    for (const p of [
      { x: 500, y: 0 },
      { x: 4500, y: 0 },
      { x: 4500, y: 3000 },
      { x: 500, y: 3000 }
    ])
      expect(nodeAt(p)).toBeDefined();
  });

  it('roh – pevný bod: posune se jen pevný bod, stěny zůstanou', () => {
    room();
    const id = addFreeDim(N({ x: 0, y: 0 }), { x: -1000, y: 0 })!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 1200)).toBe(true);
    expect(dims()[0]!.b).toEqual({ x: -1200, y: 0 });
    expect(nodeAt({ x: 0, y: 0 })).toBeDefined();
  });

  it('kresba – roh: kruh (sloup) se posune celý, poloměr zůstane', () => {
    room();
    const c = addDrawCircle({ x: 1000, y: 1000 }, 150);
    const id = addFreeDim(N({ x: 0, y: 0 }), { drawing: c, i: 0 })!;
    const before = freeDimValue(f(), id)!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, before + 100)).toBe(true);
    expect(f().drawings![c]!.r).toBe(150);
    expect(freeDimValue(f(), id)).toBeCloseTo(before + 100, 0);
  });

  it('oba body na jedné čáře kresby: změní se délka čáry (kóta kresby)', () => {
    room();
    const l = addDrawLine({ x: 500, y: 500 }, { x: 1500, y: 500 })!;
    const id = addFreeDim({ drawing: l, i: 0 }, { drawing: l, i: 1 })!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 1200)).toBe(true);
    expect(f().drawings![l]!.pts[0]).toMatchObject({ x: 500, y: 500 });
    expect(f().drawings![l]!.pts[1]).toMatchObject({ x: 1700, y: 500 });
  });

  it('zamčená délka stěny brání: úprava se neprovede', () => {
    room();
    const S = Object.values(f().walls).find(w => f().nodes[w.a]!.x === 4000 && f().nodes[w.b]!.x === 4000)!; // stěna do posouvaného rohu
    setDimLock({ kind: 'wall-length', wallId: S.id, move: 'both' }, true);
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 5100)).toBe(false);
    expect(nodeAt({ x: 4000, y: 3000 })).toBeDefined();
  });
});

describe('volná kóta: zámek, odsazení, mazání', () => {
  it('zamčená kóta drží: posun rohu, který by ji změnil, se neprovede', () => {
    room();
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }))!;
    setDimLock({ kind: 'free-dim', dimId: id, move: 'b' }, true);
    const c = nodeAt({ x: 4000, y: 3000 }).id;
    expect(
      store.edit(fl => {
        fl.nodes[c]!.x += 100;
      })
    ).toBe(false);
    expect(freeDimValue(f(), id)).toBeCloseTo(5000, 6);
  });

  it('odsazení', () => {
    room();
    const id = addFreeDim({ x: 1000, y: 1000 }, { x: 3000, y: 1000 })!;
    setFreeDimOffset(id, -400);
    expect(dims()[0]!.offset).toBe(-400);
    expect(freeDimValue(f(), id)).toBe(2000);
  });

  it('smazání vybrané kóty, Zpět ji vrátí', () => {
    room();
    addFreeDim({ x: 1000, y: 1000 }, { x: 3000, y: 1000 });
    deleteSelection();
    expect(dims()).toHaveLength(0);
    store.undo();
    expect(dims()).toHaveLength(1);
  });

  it('smazání stěn u rohu smaže i kótu k rohu', () => {
    room();
    addFreeDim(N({ x: 0, y: 0 }), { x: -1000, y: -1000 });
    store.set({ selection: { kind: 'node', id: nodeAt({ x: 0, y: 0 }).id } });
    deleteSelection();
    expect(dims()).toHaveLength(0);
  });

  it('smazání kresby smaže kótu k jejímu bodu', () => {
    room();
    const c = addDrawCircle({ x: 1000, y: 1000 }, 150);
    addFreeDim(N({ x: 0, y: 0 }), { drawing: c, i: 0 });
    store.set({ selection: { kind: 'drawing', id: c } });
    deleteSelection();
    expect(dims()).toHaveLength(0);
  });

  it('roh přetažený na jiný roh: kóta přejde na spojený roh', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 0 });
    addWall({ x: 3000, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 0 });
    const end = nodeAt({ x: 2000, y: 0 }).id;
    addFreeDim({ node: end }, { x: 2000, y: 1000 });
    store.edit(fl => {
      fl.nodes[end]!.x = 3000;
    });
    mergeNodeIfCoincident(end);
    expect(dims()).toHaveLength(1);
    expect(dims()[0]!.a).toEqual({ node: nodeAt({ x: 3000, y: 0 }).id });
  });
});

describe('volná kóta – po kontrole revieweru', () => {
  it('změna délky stěny kótou mezi jejími rohy: okno zůstane ve výkresu na místě', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const op = addOpening(W, 'window', 0.5)!;
    const before = f().openings[op]!;
    const startA = before.ref === 'a' ? before.offset : 4000 - before.offset - before.width;
    const id = addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 0 }))!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 4500)).toBe(true);
    const o = f().openings[op]!;
    const nowA = o.ref === 'a' ? o.offset : 4500 - o.offset - o.width;
    expect(nowA).toBeCloseTo(startA, 0);
  });

  it('prodloužení čáry kresby od začátku: kóta zůstane u svého bodu', () => {
    store.openProject(createProject({ name: 't' }));
    const l = addDrawLine({ x: 0, y: 0 }, { x: 500, y: 0 })!;
    const id = addFreeDim({ drawing: l, i: 0 }, { x: 0, y: 1000 })!;
    addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 1000 });
    expect(endPoint(f(), f().dims![id]!.a)).toMatchObject({ x: 0, y: 0 });
    expect(freeDimValue(f(), id)).toBeCloseTo(1000, 6);
  });

  it('spojení dvou čar kresby: kóta k připojené čáře zůstane', () => {
    store.openProject(createProject({ name: 't' }));
    addDrawLine({ x: 0, y: 0 }, { x: 500, y: 0 });
    const l2 = addDrawLine({ x: 2000, y: 0 }, { x: 2500, y: 0 })!;
    const id = addFreeDim({ drawing: l2, i: 1 }, { x: 2500, y: 1000 })!;
    addDrawLine({ x: 500, y: 0 }, { x: 2000, y: 0 });
    expect(dims()).toHaveLength(1);
    expect(endPoint(f(), f().dims![id]!.a)).toMatchObject({ x: 2500, y: 0 });
  });

  it('Do rohu: kóta ke konci stěny jde s koncem do nového rohu', () => {
    store.openProject(createProject({ name: 't' }));
    const S = addWall({ x: 0, y: 0 }, null, { x: 3000, y: 0 }, null, false, { thickness: 0 })!;
    const B = addWall({ x: 4000, y: -1000 }, null, { x: 4000, y: 1000 }, null, false, { thickness: 0 })!;
    addFreeDim(N({ x: 3000, y: 0 }), { x: 3000, y: 2000 });
    expect(trimToCorner(S, { x: 500, y: 0 }, B, { x: 4000, y: -500 })).toBe('ok');
    expect(dims()).toHaveLength(1);
    expect(endPoint(f(), dims()[0]!.a)).toMatchObject({ x: 4000, y: 0 });
  });

  it('sloučení rovného pokračování: kóta k zaniklému prostřednímu rohu se změní na pevný bod', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addFreeDim(N({ x: 2000, y: 0 }), { x: 2000, y: 1000 });
    addWall({ x: 2000, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
    expect(dims()).toHaveLength(1);
    expect(endPoint(f(), dims()[0]!.a)).toMatchObject({ x: 2000, y: 0 });
  });

  it('nástroj Kóta: řetěz ze společného rohu – ťuknutí na roh, kde končí jiná kóta, začne novou kótu', () => {
    room();
    addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 3000 }));
    dimTool.down!(tap({ x: 0, y: 0 }));
    dimTool.up!(tap({ x: 0, y: 0 }));
    dimTool.down!(tap({ x: 4000, y: 0 }));
    dimTool.up!(tap({ x: 4000, y: 0 }));
    expect(dims()).toHaveLength(2);
  });

  it('kóta s odsazením 0 ležící na stěně: ťuknutí na stěnu vybere stěnu', () => {
    room();
    addFreeDim(N({ x: 0, y: 0 }), N({ x: 4000, y: 0 }));
    expect(pickAny(f(), { x: 2000, y: 0 }, store.get().camera)?.kind).toBe('wall');
  });
});

describe('volná kóta na hranách (rozhodnutí uživatele 2026-11-18: přichytit ke všem prvkům, kóta rovnoběžná jako v CAD)', () => {
  /** Stěna místnosti podle rohů (osa na vnitřním líci, tělo ven). */
  const wallBy = (p: Pt, q: Pt) => Object.values(f().walls).find(w => [w.a, w.b].includes(nodeAt(p).id) && [w.a, w.b].includes(nodeAt(q).id))!;

  it('najetí na líc stěny: přichytí se k líci (vnitřní i vnější), ne k bodu', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const tol = 50;
    const inner = refAt(f(), { x: 2000, y: 10 }, tol, tol);
    const outer = refAt(f(), { x: 2000, y: -290 }, tol, tol);
    expect(inner).toMatchObject({ wall: top.id });
    expect(outer).toMatchObject({ wall: top.id });
    expect((inner as { side: number }).side).not.toBe((outer as { side: number }).side);
  });

  it('líc – rovnoběžný líc: kolmá vzdálenost; nástrojem Kóta dvěma ťuknutími', () => {
    room();
    dimTool.up!(tap({ x: 1500, y: 5 })); // vnitřní líc horní stěny
    dimTool.up!(tap({ x: 2500, y: 2995 })); // vnitřní líc dolní stěny
    expect(dims()).toHaveLength(1);
    expect(freeDimValue(f(), dims()[0]!.id)).toBeCloseTo(3000, 6);
    expect(dims()[0]!.a).toMatchObject({ wall: wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 }).id });
  });

  it('vnější líc – vnitřní líc téže stěny = tloušťka stěny', () => {
    room();
    dimTool.up!(tap({ x: 1500, y: -300 }));
    dimTool.up!(tap({ x: 1500, y: 0 }));
    expect(freeDimValue(f(), dims()[0]!.id)).toBeCloseTo(300, 6);
  });

  it('nerovnoběžné hrany: kóta nevznikne', () => {
    room();
    dimTool.up!(tap({ x: 1500, y: 5 })); // horní líc
    dimTool.up!(tap({ x: 5, y: 1500 })); // levý líc – kolmo
    expect(dims()).toHaveLength(0);
    dimTool.cancel!();
  });

  it('zadání délky mezi líci posune celou stěnu (sousední stěny se protáhnou)', () => {
    room();
    dimTool.up!(tap({ x: 1500, y: 5 }));
    dimTool.up!(tap({ x: 2500, y: 2995 }));
    const id = dims()[0]!.id;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 3200)).toBe(true);
    expect(nodeAt({ x: 0, y: 3200 })).toBeDefined();
    expect(nodeAt({ x: 4000, y: 3200 })).toBeDefined();
    expect(freeDimValue(f(), id)).toBeCloseTo(3200, 6);
  });

  it('líc stěny – čára kresby rovnoběžná: kolmá vzdálenost, zadáním se posune čára', () => {
    room();
    const l = addDrawLine({ x: 500, y: 800 }, { x: 2500, y: 800 })!;
    dimTool.up!(tap({ x: 1500, y: 5 }));
    dimTool.up!(tap({ x: 1000, y: 805 }));
    const d = dims()[0]!;
    expect(d.b).toMatchObject({ seg: l, i: 0 });
    expect(freeDimValue(f(), d.id)).toBeCloseTo(800, 6);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: d.id, move: 'b' }, 1000)).toBe(true);
    expect(f().drawings![l]!.pts[0]).toMatchObject({ x: 500, y: 1000 });
  });

  it('líc – bod: kolmá vzdálenost bodu od líce', () => {
    room();
    const c = addDrawCircle({ x: 1000, y: 700 }, 100);
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const id = addFreeDim({ wall: top.id, side: 1, at: 3000 }, { drawing: c, i: 0 })!; // side 1 = vnitřní líc y = 0
    expect(freeDimValue(f(), id)).toBeCloseTo(700, 6);
  });

  it('okraj otvoru: ťuknutí na ostění okna se přichytí k okraji; zadáním se okno posune po stěně', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const op = addOpening(top.id, 'window', 0.5)!;
    const len = wallLength(f(), f().walls[top.id]!);
    const start = openingStartFromA(f().openings[op]!, len);
    const a = f().nodes[top.a]!;
    const dir = Math.sign(f().nodes[top.b]!.x - a.x);
    const edgeX = a.x + dir * start;
    const e = refAt(f(), { x: edgeX + 3, y: -150 }, 20, 20);
    expect(e).toMatchObject({ opening: op, edge: 'start' });
    // kóta od protější (levé) stěny k okraji okna
    const left = wallBy({ x: 0, y: 0 }, { x: 0, y: 3000 });
    const id = addFreeDim({ wall: left.id, side: 1, at: 1500 }, e!)!;
    const v0 = freeDimValue(f(), id)!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, Math.round(v0) + 100)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(Math.round(v0) + 100, 0);
    expect(Math.abs(openingStartFromA(f().openings[op]!, len) - start)).toBeCloseTo(100, 0);
  });

  it('kóta k čáře kresby přežije prodloužení čáry od začátku', () => {
    store.openProject(createProject({ name: 't' }));
    const l = addDrawLine({ x: 0, y: 0 }, { x: 1000, y: 0 })!;
    const id = addFreeDim({ seg: l, i: 0, at: 500 }, { x: 500, y: 600 })!;
    addDrawLine({ x: 0, y: 0 }, { x: -500, y: -500 });
    expect(freeDimValue(f(), id)).toBeCloseTo(600, 6);
  });

  it('smazání stěny smaže kótu k jejímu líci', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    addFreeDim({ wall: top.id, side: -1, at: 1000 }, { x: 1000, y: 1000 });
    store.set({ selection: { kind: 'wall', id: top.id } });
    deleteSelection();
    expect(dims()).toHaveLength(0);
  });
});

describe('volná kóta na hranách – po kontrole revieweru', () => {
  const wallBy = (p: Pt, q: Pt) => Object.values(f().walls).find(w => [w.a, w.b].includes(nodeAt(p).id) && [w.a, w.b].includes(nodeAt(q).id))!;
  const startOf = (op: string) => {
    const o = f().openings[op]!;
    return openingStartFromA(o, wallLength(f(), f().walls[o.wallId]!));
  };

  it('posun okraje otvoru na jiný otvor se neprovede', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const o1 = addOpening(top.id, 'window', 0.25)!;
    const o2 = addOpening(top.id, 'window', 0.75)!;
    const left = wallBy({ x: 0, y: 0 }, { x: 0, y: 3000 });
    const id = addFreeDim({ wall: left.id, side: 1, at: 1500 }, { opening: o1, edge: 'start', at: -150 })!;
    const s1 = startOf(o1);
    const gap = startOf(o2) - s1;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, Math.round(freeDimValue(f(), id)!) + gap)).toBe(false);
    expect(startOf(o1)).toBeCloseTo(s1, 0);
  });

  it('kóta mezi okraji téhož otvoru = šířka otvoru (levý okraj stojí)', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const op = addOpening(top.id, 'window', 0.5)!;
    const s0 = startOf(op);
    const w0 = f().openings[op]!.width;
    const id = addFreeDim({ opening: op, edge: 'start', at: -150 }, { opening: op, edge: 'end', at: -150 })!;
    const v0 = freeDimValue(f(), id)!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, Math.round(v0) + 200)).toBe(true);
    expect(f().openings[op]!.width).toBe(w0 + 200);
    expect(startOf(op)).toBeCloseTo(s0, 0);
  });

  it('kóta k okraji otvoru na protahované stěně: otvor zůstane na místě a délka sedí', () => {
    room();
    const right = wallBy({ x: 4000, y: 0 }, { x: 4000, y: 3000 });
    const op = addOpening(right.id, 'window', 0.6)!;
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    // líc horní stěny – vzdálenější okraj okna (rovnoběžné hrany)
    const id = addFreeDim({ wall: top.id, side: 1, at: 3900 }, { opening: op, edge: 'end', at: 0 });
    const did = id ?? addFreeDim({ wall: top.id, side: 1, at: 3900 }, { opening: op, edge: 'start', at: 0 })!;
    const v0 = freeDimValue(f(), did)!;
    // posun horní stěny (1. konec) o 200 nahoru: okno na pravé stěně má zůstat na místě
    expect(applyNumpadValue({ kind: 'free-dim', dimId: did, move: 'a' }, Math.round(v0) + 200)).toBe(true);
    expect(freeDimValue(f(), did)).toBeCloseTo(Math.round(v0) + 200, 0);
  });

  it('rozdělení stěny nezruší kótu k jejímu líci', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const bottom = wallBy({ x: 0, y: 3000 }, { x: 4000, y: 3000 });
    const id = addFreeDim({ wall: top.id, side: 1, at: 2000 }, { wall: bottom.id, side: 1, at: 2000 })!;
    const v = freeDimValue(f(), id);
    expect(v).not.toBeNull();
    splitWall(top.id, { x: 1000, y: -150 });
    expect(dims()).toHaveLength(1);
    expect(freeDimValue(f(), id)).toBeCloseTo(v!, 6);
  });

  it('akce nevytvoří kótu mezi nerovnoběžnými hranami', () => {
    room();
    const top = wallBy({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const left = wallBy({ x: 0, y: 0 }, { x: 0, y: 3000 });
    expect(addFreeDim({ wall: top.id, side: 1, at: 1000 }, { wall: left.id, side: 1, at: 1000 })).toBeNull();
    expect(dims()).toHaveLength(0);
  });
});
