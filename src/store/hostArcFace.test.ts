/**
 * Napojení stěny na LÍC obloukové stěny (fronta kroků bod 2): líc oblouku je soustředný oblouk, roh na něm
 * má `Node.hostFace` stejně jako u rovné stěny a drží se ho i po změně vzepětí, tloušťky, strany a osy.
 * Osa Y dolů; oblouková stěna A z (0,0) do (4000,0), vzepětí 800, tloušťka 300.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { arcGeometry } from '../core/arc';
import { facePointAt } from '../core/wallFace';
import { hostAxisPoint, wallNodes } from '../core/floorQueries';
import { wallBodies } from '../core/wallBody';
import { mergeArcAt, splitWallAt } from '../core/topology';
import { addWall, flipWallSide, setWallAxis, setWallSagitta, setWallThickness, splitWall } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const add = (p: Pt, v: Pt, k: number) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

function arcHost(opts: { axis?: 'center'; side?: 1 | -1; sagitta?: number } = {}) {
  store.openProject(createProject({ name: 't' }));
  return addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1, sagitta: 800, ...opts })!;
}

/** Střed a poloměr osy oblouku. */
function geo(id: string) {
  const w = f().walls[id]!;
  const [a, b] = wallNodes(f(), w)!;
  return arcGeometry(a, b, w.sagitta!)!;
}

/** Vrchol osy oblouku a směr do těla v něm. */
function apex(id: string) {
  return facePointAt(f(), f().walls[id]!, 0.5)!;
}

describe('napojení na líc obloukové stěny', () => {
  it('stěna ukončená na líci oblouku se na něj napojí: roh na líci (soustředný oblouk), oblouk se nedělí', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const onFace = add(pt, into, 300);
    const C = addWall(add(pt, into, 2300), null, onFace, null, false, { thickness: 150 })!;
    expect(Object.keys(f().walls)).toHaveLength(2);
    const n = f().nodes[f().walls[C]!.b]!;
    expect(n.host).toBe(A);
    expect(n.hostFace).toBe(1);
    const g = geo(A);
    expect(Math.abs(Math.hypot(n.x - g.center.x, n.y - g.center.y) - g.r)).toBeCloseTo(300, 3);
    expect(Math.hypot(n.x - onFace.x, n.y - onFace.y)).toBeLessThan(1);
    // bod na ose proti napojení (graf místností) leží radiálně na ose
    const ax = hostAxisPoint(f(), n);
    expect(Math.hypot(ax.x - pt.x, ax.y - pt.y)).toBeLessThan(1);
  });

  it('i na protější líc (osa uprostřed, oba líce ±150)', () => {
    const A = arcHost({ axis: 'center' });
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, -2150), null, add(pt, into, -150), null, false, { thickness: 150 })!;
    const n = f().nodes[f().walls[C]!.b]!;
    expect(n).toMatchObject({ host: A, hostFace: -1 });
    const g = geo(A);
    expect(Math.abs(Math.hypot(n.x - g.center.x, n.y - g.center.y) - g.r)).toBeCloseTo(150, 3);
  });

  it('stěna vedoucí z líce do těla a přes osu se na líc nenapojí (křížení)', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 300), null, add(pt, into, -1500), null, false, { thickness: 150 })!;
    expect(f().nodes[f().walls[C]!.a]!.hostFace).toBeUndefined();
  });

  it('změna vzepětí, tloušťky a osy: roh jede s lícem, vzdálený konec zůstane', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const far = add(pt, into, 2300);
    const C = addWall(far, null, add(pt, into, 300), null, false, { thickness: 150 })!;
    const check = (off: number) => {
      const n = f().nodes[f().walls[C]!.b]!;
      const g = geo(A);
      expect(n.host).toBe(A);
      expect(Math.abs(Math.hypot(n.x - g.center.x, n.y - g.center.y) - g.r)).toBeCloseTo(off, 0);
      const fe = f().nodes[f().walls[C]!.a]!;
      expect(Math.hypot(fe.x - far.x, fe.y - far.y)).toBeLessThan(1);
    };
    setWallSagitta(A, 600);
    check(300);
    setWallThickness(A, 200);
    check(200);
    setWallAxis(A, 'center');
    check(100);
  });

  it('přehození strany oblouku: líc na straně napojení je teď čára stěny → roh na ní', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 2300), null, add(pt, into, 300), null, false, { thickness: 150 })!;
    flipWallSide(A);
    const n = f().nodes[f().walls[C]!.b]!;
    expect(n.host).toBe(A);
    expect(Math.hypot(n.x - pt.x, n.y - pt.y)).toBeLessThan(1);
  });

  it('tělo napojené stěny začíná na líci oblouku', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 2300), null, add(pt, into, 300), null, false, { thickness: 150 })!;
    const g = geo(A);
    const poly = wallBodies(f()).get(C)!.poly;
    const near = Math.min(...poly.map(p => Math.abs(Math.hypot(p.x - g.center.x, p.y - g.center.y) - g.r)));
    expect(near).toBeGreaterThan(299);
  });

  it('líc oblouku je v místě napojení přerušený (pod napojenou stěnou se nekreslí)', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 2300), null, add(pt, into, 300), null, false, { thickness: 150 })!;
    const n = f().nodes[f().walls[C]!.b]!;
    const segDist = (p: Pt, a: Pt, b: Pt) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    };
    const bodies = wallBodies(f());
    // střed šířky napojené stěny na líci (body jejího těla u líce)
    const g = geo(A);
    const atFace = bodies.get(C)!.poly.filter(p => Math.abs(Math.hypot(p.x - g.center.x, p.y - g.center.y) - g.r - 300) < 5);
    const mid = { x: (Math.min(...atFace.map(p => p.x)) + Math.max(...atFace.map(p => p.x))) / 2, y: n.y };
    expect(bodies.get(A)!.edges.filter(([p, q]) => segDist(mid, p, q) < 20)).toHaveLength(0);
    // protější líc (čára oblouku) pokračuje bez přerušení
    expect(bodies.get(A)!.edges.some(([p, q]) => segDist(pt, p, q) < 1)).toBe(true);
  });

  it('rozdělení a sloučení oblouku (i s částí vedenou opačně) zachová roh na líci', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 2300), null, add(pt, into, 300), null, false, { thickness: 150 })!;
    const nid = f().walls[C]!.b;
    const at = { ...f().nodes[nid]! };
    const cut = facePointAt(f(), f().walls[A]!, 0.25)!.pt;
    store.edit(fl => {
      fl.nodes.cut = { id: 'cut', x: cut.x, y: cut.y };
      const parts = splitWallAt(fl, A, 'cut')!;
      // část s napojením obrátit (konce, vzepětí, strana i strana líce napojeného rohu)
      const w = fl.walls[parts[1]]!;
      [w.a, w.b] = [w.b, w.a];
      w.sagitta = -w.sagitta!;
      w.side = w.side === 1 ? -1 : 1;
      const n = fl.nodes[nid]!;
      expect(n.host).toBe(w.id);
      n.hostFace = n.hostFace === 1 ? -1 : 1;
    });
    expect(Math.hypot(f().nodes[nid]!.x - at.x, f().nodes[nid]!.y - at.y)).toBeLessThan(1);
    store.edit(fl => void expect(mergeArcAt(fl, 'cut')).toBe(true));
    const n = f().nodes[nid]!;
    expect(Object.keys(f().walls)).toHaveLength(2);
    expect(n.host).toBeDefined();
    expect(Math.hypot(n.x - at.x, n.y - at.y)).toBeLessThan(1);
  });
  it('oblouk prohnutý na druhou stranu se stranou −1: napojení na líc a změna vzepětí na opačnou stranu', () => {
    const A = arcHost({ sagitta: -800, side: -1 });
    const { pt, into } = apex(A);
    const far = add(pt, into, 2300);
    const C = addWall(far, null, add(pt, into, 300), null, false, { thickness: 150 })!;
    const n = f().nodes[f().walls[C]!.b]!;
    expect(n).toMatchObject({ host: A, hostFace: -1 });
    expect(Math.abs(Math.hypot(n.x - geo(A).center.x, n.y - geo(A).center.y) - geo(A).r)).toBeCloseTo(300, 3);
    setWallSagitta(A, -400);
    const m = f().nodes[f().walls[C]!.b]!;
    expect(m.host).toBe(A);
    expect(Math.abs(Math.hypot(m.x - geo(A).center.x, m.y - geo(A).center.y) - geo(A).r)).toBeCloseTo(300, 0);
  });

  it('Rozdělit v místě stěny napojené na líc oblouku: bod dělení na okraji jejího těla, stěna zůstane napojená', () => {
    const A = arcHost();
    const { pt, into } = apex(A);
    const C = addWall(add(pt, into, 2300), null, add(pt, into, 300), null, false, { thickness: 150 })!;
    expect(splitWall(A, pt).result).toBe('ok');
    const n = f().nodes[f().walls[C]!.b]!;
    expect(n.host).toBeDefined();
    expect(n.hostFace).toBeDefined();
    expect(Object.keys(f().walls)).toHaveLength(3);
  });

  it('vnitřní líc velmi malého oblouku (tloušťka ≥ poloměr) se nenabízí – napojení zůstane na čáře', () => {
    store.openProject(createProject({ name: 't' }));
    // půlkruh o poloměru 200, tělo 300 dovnitř
    const A = addWall({ x: 0, y: 0 }, null, { x: 400, y: 0 }, null, false, { thickness: 300, side: 1, sagitta: 200 })!;
    const g = geo(A);
    const { into } = apex(A);
    expect(Math.hypot(into.x, into.y)).toBeCloseTo(1, 6);
    // roh na líci by ležel za středem – stěna z dálky k vrcholu oblouku se nenapojí na neexistující líc
    const C = addWall({ x: g.center.x, y: g.center.y + 5000 }, null, { x: g.center.x, y: g.center.y + 100 }, null, false, { thickness: 100 })!;
    expect(f().nodes[f().walls[C]!.b]!.hostFace).toBeUndefined();
  });
});
