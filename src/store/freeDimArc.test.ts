/**
 * Volná kóta k oblouku (fronta bod 2; rozhodnutí uživatele 2026-11-19: bod na oblouku, vrchol a střed přednostně;
 * měří se k bodu, od rovné hrany kolmo; zadaná délka posune celou stěnu / kresbu). Osa Y dolů.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { DimEnd, Pt } from '../model/types';
import { endPoint, freeDimValue, freeDimsOf } from '../core/freeDim';
import { refAt, refLabel } from '../core/dimRefs';
import { dist } from '../core/geometry';
import { addDrawArc, addDrawCircle, addFreeDim, addWall, applyNumpadValue, deleteSelection, duplicateSelection, moveNode, setDimLock, setWallSagitta, splitWall } from './actions';
import { ownProtEnd } from '../core/protrusionDimMove';
import { store } from './store';

const f = () => store.floor()!;
const set = (id: string, move: 'a' | 'b', v: number) => applyNumpadValue({ kind: 'free-dim', dimId: id, move }, v);
const near = (p: Pt | null, q: Pt) => expect(dist(p!, q)).toBeLessThan(0.5);

/**
 * Oblouková stěna bez tloušťky (0,0)→(4000,0), vzepětí 1000: vrchol (2000, 1000), střed (2000, −1500), r 2500;
 * pod ní rovná stěna y = 3000.
 */
function arcPlan() {
  store.openProject(createProject({ name: 't' }));
  const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { sagitta: 1000 })!;
  const S = addWall({ x: 0, y: 3000 }, null, { x: 4000, y: 3000 }, null, false)!;
  return { A, S };
}

describe('kóta k obloukové stěně', () => {
  it('přichycení: vrchol a střed přednostně, jinde bod na oblouku', () => {
    const { A } = arcPlan();
    const apex = refAt(f(), { x: 2010, y: 1005 }, 30, 30)!;
    expect(apex).toMatchObject({ arcWall: A, side: 0 });
    near(endPoint(f(), apex), { x: 2000, y: 1000 });
    expect(refAt(f(), { x: 2005, y: -1490 }, 30, 30)).toEqual({ center: A });
    // jinde na oblouku: bod pod perem (na oblouku)
    const q = { x: 2000 - 2500 * Math.sin(0.4), y: -1500 + 2500 * Math.cos(0.4) };
    const e = refAt(f(), { x: 2000 + (q.x - 2000) * 1.004, y: -1500 + (q.y + 1500) * 1.004 }, 3, 30)!; // 10 mm vně
    expect('arcWall' in e).toBe(true);
    near(endPoint(f(), e), q);
    expect(refLabel(e)).toBe('bod na oblouku');
    expect(refLabel({ center: A })).toBe('střed oblouku');
  });

  it('kóta od vrcholu k rovné stěně měří kolmo; zadaná délka posune celou obloukovou stěnu', () => {
    const { A, S } = arcPlan();
    const apex = refAt(f(), { x: 2000, y: 1000 }, 30, 30)!;
    const id = addFreeDim(apex, { wall: S, side: 0, at: 500 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(2000, 3);
    set(id, 'a', 2500);
    expect(freeDimValue(f(), id)).toBeCloseTo(2500, 3);
    const w = f().walls[A]!;
    near(f().nodes[w.a]!, { x: 0, y: -500 });
    near(f().nodes[w.b]!, { x: 4000, y: -500 });
    expect(w.sagitta).toBe(1000); // tvar oblouku zůstal
  });

  it('kóta od středu oblouku k rohu: 2500 (poloměr)', () => {
    const { A } = arcPlan();
    const n = Object.values(f().nodes).find(x => dist(x, { x: 0, y: 0 }) < 1)!;
    const id = addFreeDim({ center: A }, { node: n.id })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(2500, 3);
  });

  it('líc stěny s tloušťkou: bod na líci (soustředný oblouk)', () => {
    store.openProject(createProject({ name: 't' }));
    const A = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { sagitta: 1000, thickness: 300, side: 1 })!;
    // ťukání svisle přes vrchol: najdou se oba líce (body podél oblouku mimo vrchol – tolerance bodu 0)
    const ends = new Map<number, DimEnd>();
    for (let y = 700; y <= 1600; y += 10) {
      const e = refAt(f(), { x: 2100, y }, 0, 8);
      if (e && 'arcWall' in e) ends.set(e.side, e);
    }
    expect(ends.size).toBe(2);
    const pts = [...ends.values()].map(e => endPoint(f(), e)!);
    // body leží na kružnicích se středem (2000, −1500), poloměry se liší o tloušťku
    const rs = pts.map(p => dist(p, { x: 2000, y: -1500 })).sort((a, b) => a - b);
    expect([...ends.values()].every(e => 'arcWall' in e && e.arcWall === A)).toBe(true);
    expect(rs[rs.length - 1]! - rs[0]!).toBeCloseTo(300, 1);
    // každý líc leží na kružnici o poloměru podle svého posunu od osy (strana jako u rovné stěny)
    for (const [side, e] of ends) {
      const off = side === 1 ? 300 : 0; // osa na líci, tělo na straně 1 (vně oblouku – normála tečny míří od středu)
      expect(dist(endPoint(f(), e)!, { x: 2000, y: -1500 })).toBeCloseTo(2500 + off, 1);
    }
  });

  it('dělení oblouku: kóta k bodu na druhé části se přepojí, délka zůstane', () => {
    const { A, S } = arcPlan();
    const q = { x: 2000 + 2500 * Math.sin(0.5), y: -1500 + 2500 * Math.cos(0.5) }; // na pravé polovině
    const e = refAt(f(), q, 3, 30)!;
    const id = addFreeDim(e, { wall: S, side: 0, at: 3000 })!;
    const v = freeDimValue(f(), id)!;
    splitWall(A, { x: 2000, y: 1000 });
    expect(Object.keys(f().walls).length).toBe(3);
    expect(freeDimValue(f(), id)).toBeCloseTo(v, 1);
  });

  it('smazání obloukové stěny kótu smaže', () => {
    const { A, S } = arcPlan();
    addFreeDim({ center: A }, { wall: S, side: 0, at: 0 });
    store.set({ selection: { kind: 'wall', id: A } });
    deleteSelection();
    expect(freeDimsOf(f())).toHaveLength(0);
  });

  it('kopie obloukové stěny s kótou: bod na oblouku i střed jedou s kopií', () => {
    const { A } = arcPlan();
    const apex = refAt(f(), { x: 2000, y: 1000 }, 30, 30)!;
    const id = addFreeDim(apex, { center: A })!;
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: A }, { kind: 'dim', id }] } });
    duplicateSelection();
    const sel = store.get().selection;
    const cid = sel?.kind === 'multi' ? sel.items.find(i => i.kind === 'dim')!.id : '';
    const c = f().dims![cid]!;
    expect('arcWall' in c.a && c.a.arcWall !== A).toBe(true);
    expect('center' in c.b && c.b.center !== A).toBe(true);
    expect(freeDimValue(f(), cid)).toBeCloseTo(2500, 3);
  });
});

describe('kóta k oblouku kresby', () => {
  it('oblouk kresby: vrchol a střed; zadaná délka posune celou kresbu', () => {
    store.openProject(createProject({ name: 't' }));
    const d = addDrawArc({ x: 0, y: 0 }, { x: 2000, y: 0 }, 500);
    const pts0 = f().drawings![d]!.pts.map(p => ({ x: p.x, y: p.y }));
    const apex = refAt(f(), { x: 1000, y: 500 }, 30, 30)!;
    expect(apex).toMatchObject({ arcSeg: d, i: 0 });
    near(endPoint(f(), apex), { x: 1000, y: 500 });
    // střed: r = 1000²/(2·500)/… = 1250 → střed (1000, −750)
    expect(refAt(f(), { x: 1000, y: -750 }, 30, 30)).toEqual({ center: d, i: 0 });
    const id = addFreeDim(apex, { x: 1000, y: 2000 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(1500, 3);
    set(id, 'a', 1000);
    expect(freeDimValue(f(), id)).toBeCloseTo(1000, 3);
    near(f().drawings![d]!.pts[0]!, { x: pts0[0]!.x, y: pts0[0]!.y + 500 });
  });

  it('oblouk kresby: kóta mezi vrcholem a středem téže kresby nejde zadat (nic se nezmění)', () => {
    store.openProject(createProject({ name: 't' }));
    const d = addDrawArc({ x: 0, y: 0 }, { x: 2000, y: 0 }, 500);
    const id = addFreeDim(refAt(f(), { x: 1000, y: 500 }, 30, 30)!, { center: d, i: 0 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(1250, 3);
    set(id, 'a', 1500);
    expect(freeDimValue(f(), id)).toBeCloseTo(1250, 3);
  });

  it('kruh kresby: bod na kružnici; střed = bod kresby', () => {
    store.openProject(createProject({ name: 't' }));
    const d = addDrawCircle({ x: 0, y: 0 }, 1000);
    const q = { x: 1000 * Math.cos(1), y: 1000 * Math.sin(1) };
    const e = refAt(f(), q, 3, 30)!;
    expect('arcSeg' in e && e.arcSeg === d).toBe(true);
    near(endPoint(f(), e), q);
    expect(refAt(f(), { x: 3, y: 3 }, 30, 30)).toEqual({ drawing: d, i: 0 });
    const id = addFreeDim(e, { x: q.x * 3, y: q.y * 3 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(2000, 1);
  });
});

describe('kóta k oblouku po úpravách oblouku (nálezy revieweru)', () => {
  /** Bod blízko rohu B (u konce oblouku) – dřív kóta zmizela, když se oblouk zkrátil. */
  function nearB() {
    const { A, S } = arcPlan();
    const q = { x: 2000 + 2500 * Math.sin(0.85), y: -1500 + 2500 * Math.cos(0.85) };
    const e = refAt(f(), q, 3, 30)!;
    const id = addFreeDim(e, { wall: S, side: 0, at: 3500 })!;
    return { A, S, id };
  }

  it('změna vzepětí: bod jede úměrně po oblouku, kóta zůstane', () => {
    const { A, id } = nearB();
    setWallSagitta(A, 300);
    expect(f().dims![id]).toBeDefined();
    const p = endPoint(f(), f().dims![id]!.a)!;
    // bod leží na novém oblouku blízko konce B
    expect(p.x).toBeGreaterThan(3000);
    expect(freeDimValue(f(), id)).not.toBeNull();
  });

  it('posun rohu B (oblouk se zkrátí): kóta zůstane', () => {
    const { A, id } = nearB();
    moveNode(f().walls[A]!.b, { x: 3000, y: 0 });
    expect(f().dims![id]).toBeDefined();
    expect(freeDimValue(f(), id)).not.toBeNull();
  });

  it('narovnání stěny: konec přejde na líc rovné stěny', () => {
    const { A, id } = nearB();
    setWallSagitta(A, 0);
    const e = f().dims![id]!.a;
    expect('wall' in e && e.wall === A).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(3000, 3); // rovnoběžné líce y = 0 a y = 3000
  });

  it('dělení oblouku: bod na první části zůstane, délka stejná', () => {
    const { A, S } = arcPlan();
    const q = { x: 2000 - 2500 * Math.sin(0.5), y: -1500 + 2500 * Math.cos(0.5) };
    const id = addFreeDim(refAt(f(), q, 3, 30)!, { wall: S, side: 0, at: 1000 })!;
    const v = freeDimValue(f(), id)!;
    splitWall(A, { x: 2000, y: 1000 });
    expect(freeDimValue(f(), id)).toBeCloseTo(v, 1);
  });

  it('zamčená kóta k oblouku: posun obloukové stěny jinou kótou se zastaví', () => {
    const { A, S } = arcPlan();
    const apex = refAt(f(), { x: 2000, y: 1000 }, 30, 30)!;
    const locked = addFreeDim(apex, { wall: S, side: 0, at: 500 })!;
    setDimLock({ kind: 'free-dim', dimId: locked, move: 'a' }, true);
    const other = addFreeDim({ center: A }, { x: 2000, y: -3000 })!;
    set(other, 'a', 1000);
    expect(freeDimValue(f(), locked)).toBeCloseTo(2000, 3);
  });

  it('bod na oblouku vůči rohu téže stěny: zadání nic nezmění (posun celé stěny délku nemění)', () => {
    const { A } = arcPlan();
    const apex = refAt(f(), { x: 2000, y: 1000 }, 30, 30)!;
    const id = addFreeDim(apex, { node: f().walls[A]!.a })!;
    const v = freeDimValue(f(), id)!;
    set(id, 'a', v + 500);
    expect(freeDimValue(f(), id)).toBeCloseTo(v, 3);
    expect(f().nodes[f().walls[A]!.a]).toMatchObject({ x: 0, y: 0 });
  });

  it('kresba: smazaný vrchol lomené čáry před obloukem – kóta zůstane na stejném oblouku', () => {
    store.openProject(createProject({ name: 't' }));
    const d = addDrawArc({ x: 0, y: 0 }, { x: 2000, y: 0 }, 500);
    // lomená čára: přímý úsek + oblouk (úsek 1)
    store.edit(fl => {
      const dr = fl.drawings![d]!;
      dr.shape = 'line';
      dr.pts = [{ x: -1000, y: 0 }, { x: 0, y: 0, s: 500 }, { x: 2000, y: 0 }];
    });
    const apex = refAt(f(), { x: 1000, y: 500 }, 30, 30)!;
    expect(apex).toMatchObject({ arcSeg: d, i: 1 });
    const id = addFreeDim(apex, { x: 1000, y: 2000 })!;
    store.edit(fl => {
      fl.drawings![d]!.pts.shift(); // oblouk je teď úsek 0
    });
    expect(f().dims![id]!.a).toMatchObject({ arcSeg: d, i: 0 });
    expect(freeDimValue(f(), id)).toBeCloseTo(1500, 3);
  });

  it('kopie oblouku kresby s kótou', () => {
    store.openProject(createProject({ name: 't' }));
    const d = addDrawArc({ x: 0, y: 0 }, { x: 2000, y: 0 }, 500);
    const id = addFreeDim(refAt(f(), { x: 1000, y: 500 }, 30, 30)!, { center: d, i: 0 })!;
    store.set({ selection: { kind: 'multi', items: [{ kind: 'drawing', id: d }, { kind: 'dim', id }] } });
    duplicateSelection();
    const c = freeDimsOf(f()).find(x => x.id !== id)!;
    expect('arcSeg' in c.a && c.a.arcSeg !== d).toBe(true);
    expect('center' in c.b && c.b.center !== d).toBe(true);
    expect(freeDimValue(f(), c.id)).toBeCloseTo(1250, 3);
  });

  it('výstupek na obloukové stěně: bod na líci / střed téže stěny = „na témž výstupku“', () => {
    const { A } = arcPlan();
    store.edit(fl => {
      (fl.protrusions ??= {}).p1 = { id: 'p1', wallId: A, side: 1, pts: [] } as never;
    });
    expect(ownProtEnd(f(), 'p1', { arcWall: A, side: 0, at: 100 })).toBe(true);
    expect(ownProtEnd(f(), 'p1', { center: A })).toBe(true);
    expect(ownProtEnd(f(), 'p1', { center: 'jiná' })).toBe(false);
  });
});
