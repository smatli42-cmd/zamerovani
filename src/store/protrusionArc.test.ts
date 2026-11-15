/**
 * Výstupek a vybrání na obloukové stěně (požadavek uživatele 2026-11-13, obrázek: na oblouku nefungovalo;
 * katalog I1.11 to měl „později“). Obrys se kreslí nástrojem Čára od líce oblouku zpět na týž líc.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { faceOffset, profileToWorld, protrusionOutline, protrusionPolygon, wallFrame } from '../core/protrusion';
import { protrusionArcHandles, protrusionDims } from '../core/protrusionEdit';
import { splitWallAt } from '../core/topology';
import { findBodyAt, pointInPolygon, wallBodies } from '../core/wallBody';
import { addLine, addWall, applyNumpadValue, deleteSelection, duplicateSelection, groupOrigin, moveGroup, setWallSagitta } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const prots = () => Object.values(f().protrusions ?? {});

/** Oblouková stěna (0,0)–(4000,0), vzepětí 1000, tloušťka 300; vrací bod na líci `side` v poloze u a vzdálenosti v. */
function arcWall() {
  store.openProject(createProject({ name: 't' }));
  const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1, sagitta: 1000 })!;
  const w = () => f().walls[W]!;
  const at = (side: 1 | -1, u: number, v: number): Pt => profileToWorld(wallFrame(f(), w())!, w(), side, { u, v });
  return { W, at };
}
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};

describe('výstupek na obloukové stěně', () => {
  for (const side of [1, -1] as const) {
    it(`výstupek ven na líci ${side}: jeden prvek, plocha patří stěně, líc pod ním se nekreslí`, () => {
      const { W, at } = arcWall();
      polyline([at(side, 2000, 0), at(side, 2000, 400), at(side, 2500, 400), at(side, 2500, 0)]);
      expect(Object.keys(f().walls)).toEqual([W]);
      expect(prots()).toHaveLength(1);
      const p = prots()[0]!;
      expect(p).toMatchObject({ mode: 'add', side });
      const d = protrusionDims(f(), p)!;
      // šířka po líci (I1.8): u oblouku 500 po ose × poměr poloměrů líce a osy; rohy čáry se zaokrouhlí na mm
      const k = wallFrame(f(), f().walls[W]!)!.faceScale(faceOffset(f().walls[W]!, side));
      if (side === 1) expect(k).not.toBeCloseTo(1, 2); // líc −1 je u side 1 přímo osa
      expect(Math.abs(d.width - 500 * k)).toBeLessThan(3);
      expect(Math.abs(d.depth - 400)).toBeLessThan(3);
      expect(findBodyAt(f(), at(side, 2250, 200))?.id).toBe(W);
      // líc uprostřed výstupku: žádná kreslená hrana
      const mid = at(side, 2250, 0);
      const edges = wallBodies(f()).get(W)!.edges;
      const onMid = edges.some(([a, b]) => {
        const t = ((mid.x - a.x) * (b.x - a.x) + (mid.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1);
        return t >= 0 && t <= 1 && Math.hypot(a.x + (b.x - a.x) * t - mid.x, a.y + (b.y - a.y) * t - mid.y) < 3;
      });
      expect(onMid).toBe(false);
      // plocha uzavřená po oblouku líce
      expect(pointInPolygon(at(side, 2250, 5), protrusionPolygon(f(), p)!)).toBe(true);
    });
  }

  it('vybrání do těla oblouku', () => {
    const { W, at } = arcWall();
    polyline([at(1, 1000, 0), at(1, 1000, -150), at(1, 1600, -150), at(1, 1600, 0)]);
    expect(prots()[0]).toMatchObject({ mode: 'subtract' });
    expect(findBodyAt(f(), at(1, 1300, -50))).toBeNull();
    expect(findBodyAt(f(), at(1, 1300, -250))?.id).toBe(W);
  });

  it('posun obloukové stěny nese výstupek', () => {
    const { W, at } = arcWall();
    polyline([at(1, 2000, 0), at(1, 2000, 400), at(1, 2500, 400), at(1, 2500, 0)]);
    const before = at(1, 2000, 400);
    moveGroup(groupOrigin(f(), [{ kind: 'wall', id: W }]), 1000, 0);
    const after = at(1, 2000, 400);
    expect(after.x - before.x).toBeCloseTo(1000, 3);
    expect(prots()).toHaveLength(1);
  });

  const tooth = (at: (s: 1 | -1, u: number, v: number) => Pt) => polyline([at(1, 2000, 0), at(1, 2000, 400), at(1, 2500, 400), at(1, 2500, 0)]);

  it('rozdělení obloukové stěny: výstupek přejde na část, na které leží, a zůstane na místě (I1.13)', () => {
    const { W, at } = arcWall();
    tooth(at);
    const corner = at(1, 2000, 400);
    store.edit(fl => {
      const m = at(-1, 1000, 0); // bod na ose oblouku? – líc −1 je u side 1 osa (posun 0)
      fl.nodes.m = { id: 'm', x: m.x, y: m.y };
      splitWallAt(fl, W, 'm');
    });
    expect(prots()).toHaveLength(1);
    const p = prots()[0]!;
    expect(f().walls[p.wallId]!.a).toBe('m');
    const w = f().walls[p.wallId]!;
    const now = profileToWorld(wallFrame(f(), w)!, w, p.side, p.pts[1]!);
    expect(Math.hypot(now.x - corner.x, now.y - corner.y)).toBeLessThan(1);
  });

  it('změna vzepětí stěny: výstupek drží poměrné místo; oblouk → rovná nezůstane za koncem; Zpět vrátí', () => {
    const { W, at } = arcWall();
    tooth(at);
    const u0 = prots()[0]!.pts[0]!.u;
    const len0 = wallFrame(f(), f().walls[W]!)!.len;
    setWallSagitta(W, 0);
    const len1 = wallFrame(f(), f().walls[W]!)!.len;
    expect(prots()[0]!.pts[0]!.u).toBeCloseTo((u0 * len1) / len0, 0);
    expect(Math.max(...prots()[0]!.pts.map(q => q.u))).toBeLessThan(len1);
    store.undo();
    expect(prots()[0]!.pts[0]!.u).toBeCloseTo(u0, 3);
  });

  it('smazání obloukové stěny smaže výstupek; kopie ho zkopíruje', () => {
    const { W, at } = arcWall();
    tooth(at);
    store.set({ selection: { kind: 'wall', id: W } });
    duplicateSelection();
    expect(prots()).toHaveLength(2);
    store.undo();
    store.set({ selection: { kind: 'wall', id: W } });
    deleteSelection();
    expect(prots()).toHaveLength(0);
  });

  it('záporné vzepětí a osa uprostřed', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1, sagitta: -800, axis: 'center' })!;
    const w = f().walls[W]!;
    const at = (u: number, v: number) => profileToWorld(wallFrame(f(), w)!, w, 1, { u, v });
    polyline([at(1500, 0), at(1500, 300), at(1900, 300), at(1900, 0)]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ side: 1, mode: 'add' });
    expect(findBodyAt(f(), at(1700, 150))?.id).toBe(W);
  });

  it('uzavření místnosti překlopí oblouk ven: výstupek se překlopí s ním a zůstane na svém (vnějším) líci (I1.7)', () => {
    const { W, at } = arcWall();
    // oblouk i tělo míří do budoucí místnosti (+y); strana není ručně zvolená → automatika ji smí otočit
    store.edit(fl => {
      delete fl.walls[W]!.sideLocked;
    });
    tooth(at); // výstupek na vypouklém (vnějším) líci, s obloukem na čele
    const id = prots()[0]!.id;
    expect(applyNumpadValue({ kind: 'protrusion-sagitta', protrusionId: id, seg: 1 }, 100)).toBe(true);
    const outline0 = protrusionOutline(f(), prots()[0]!)!;
    const arc0 = protrusionArcHandles(f(), prots()[0]!)[0]!.at;
    const inside0 = at(1, 2250, 200); // bod uvnitř výstupku
    const mirror = (p: Pt): Pt => ({ x: p.x, y: -p.y });
    for (const [a, b] of [
      [{ x: 4000, y: 0 }, { x: 4000, y: 3000 }],
      [{ x: 4000, y: 3000 }, { x: 0, y: 3000 }],
      [{ x: 0, y: 3000 }, { x: 0, y: 0 }]
    ] as const) addWall(a, null, b, null, false, { thickness: 300 });
    expect(f().walls[W]!.sagitta).toBe(-1000); // oblouk se překlopil ven z místnosti
    const p = prots()[0]!;
    expect(p.side).toBe(-1);
    // celý výstupek je zrcadlem podle tětivy – zůstal na vnějším líci, venku z místnosti
    protrusionOutline(f(), p)!.forEach((q, i) => {
      const e = mirror(outline0[i]!);
      expect(Math.hypot(q.x - e.x, q.y - e.y)).toBeLessThan(1);
    });
    const arc1 = protrusionArcHandles(f(), p)[0]!.at;
    expect(Math.hypot(arc1.x - mirror(arc0).x, arc1.y - mirror(arc0).y)).toBeLessThan(1);
    expect(findBodyAt(f(), mirror(inside0))?.id).toBe(W);
    store.undo();
    expect(prots()[0]!.side).toBe(1);
    store.redo();
    expect(prots()[0]!.side).toBe(-1);
  });
});
