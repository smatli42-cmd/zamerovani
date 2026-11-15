/**
 * I1.11 – výstupek přes roh (rozhodnutí uživatele 2026-11-15: vnitřní i vnější roh, drží se rohu, zatím jen
 * výstupek). Osa Y dolů. Stěna S z (0,0) do (4000,0), tloušťka 300, tělo y ∈ [−300, 0]; stěna L z (0,0) do (0,3000),
 * tloušťka 300, tělo x ∈ [−300, 0]. Místnost leží v kladném x a y; vnitřní roh líců (0,0), vnější (−300,−300).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { cornerOutline, cornerProtrusionsOf } from '../core/cornerProtrusion';
import { splitWallAt } from '../core/topology';
import { findBodyAt, wallBodies } from '../core/wallBody';
import { addLine, addWall, applyNumpadValue, deleteSelection, duplicateSelection, mergeNodeIfCoincident, setCornerProtrusionDim, trimToCorner } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const corners = () => cornerProtrusionsOf(f());

function room() {
  store.openProject(createProject({ name: 't' }));
  const S = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
  const L = addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 })!;
  return { S, L, c: f().walls[S]!.a };
}
const polyline = (pts: Pt[]) => {
  for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
};
/** Kreslí se nějaká hrana těla (kterékoli stěny) přes úsečku p–q (střed úsečky do 0,5 mm)? */
function edgeOver(p: Pt, q: Pt): boolean {
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  for (const body of wallBodies(f()).values()) {
    for (const [a, b] of body.edges) {
      const d = { x: b.x - a.x, y: b.y - a.y };
      const len2 = d.x * d.x + d.y * d.y;
      if (len2 < 1e-9) continue;
      const t = ((mid.x - a.x) * d.x + (mid.y - a.y) * d.y) / len2;
      if (t < 0 || t > 1) continue;
      if (Math.hypot(a.x + d.x * t - mid.x, a.y + d.y * t - mid.y) < 0.5) return true;
    }
  }
  return false;
}
const inner = () => polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);

describe('I1.11: výstupek přes vnitřní roh dvěma čarami', () => {
  it('vznikne jeden výstupek v rohu, čáry zmizí, vybere se', () => {
    const { S, L } = room();
    inner();
    expect(corners()).toHaveLength(1);
    const cp = corners()[0]!;
    expect(cp.walls).toEqual([S, L]);
    expect(Object.keys(f().walls)).toHaveLength(2);
    expect(store.get().selection).toEqual({ kind: 'protrusion', id: cp.id });
    expect(cp.pts).toEqual([
      { s: 600, t: 0 },
      { s: 600, t: 400 },
      { s: 0, t: 400 }
    ]);
  });

  it('plocha patří stěně, líce obou stěn se v rohu pod výstupkem nekreslí, obrys ano', () => {
    const { S } = room();
    inner();
    expect(findBodyAt(f(), { x: 300, y: 200 })?.id).toBe(S);
    expect(edgeOver({ x: 0, y: 0 }, { x: 600, y: 0 })).toBe(false); // líc S
    expect(edgeOver({ x: 0, y: 0 }, { x: 0, y: 400 })).toBe(false); // líc L
    expect(edgeOver({ x: 600, y: 0 }, { x: 600, y: 400 })).toBe(true);
    expect(edgeOver({ x: 600, y: 400 }, { x: 0, y: 400 })).toBe(true);
    expect(edgeOver({ x: 600, y: 0 }, { x: 4000, y: 0 })).toBe(true); // zbytek líce S
  });

  it('jedna čára nebo čáry nekončící na líci druhé stěny zůstanou čarami', () => {
    room();
    polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 200, y: 400 }]);
    expect(corners()).toHaveLength(0);
    expect(Object.keys(f().walls)).toHaveLength(4);
  });

  it('drží se rohu: posun rohu (stěny se pootočí) – výstupek zůstane na lících se stejnými rozměry; Zpět vrátí', () => {
    const { S, L, c } = room();
    inner();
    const before = cornerOutline(f(), corners()[0]!)!;
    store.edit(fl => {
      fl.nodes[c]!.x += 100;
      fl.nodes[c]!.y += 50;
    });
    const o = cornerOutline(f(), corners()[0]!)!;
    const n = f().nodes[c]!;
    // čáry líců vedou rohem (líce místnosti jsou čáry stěn): začátek 600 od rohu po S, konec 400 od rohu po L
    const far = (w: string) => f().nodes[f().walls[w]!.b]!;
    const onLine = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    expect(Math.hypot(o[0]!.x - n.x, o[0]!.y - n.y)).toBeCloseTo(600, 6);
    expect(onLine(o[0]!, n, far(S))).toBeLessThan(1e-6);
    expect(Math.hypot(o[2]!.x - n.x, o[2]!.y - n.y)).toBeCloseTo(400, 6);
    expect(onLine(o[2]!, n, far(L))).toBeLessThan(1e-6);
    store.undo();
    expect(cornerOutline(f(), corners()[0]!)).toEqual(before);
  });

  it('drží se rohu: změna tloušťky stěny s tělem dovnitř posune výstupek s lícem', () => {
    const { L } = room();
    inner();
    // tělo L dovnitř místnosti (x ∈ [0, 300]) → líc u výstupku je x = 300
    store.edit(fl => {
      fl.walls[L]!.side = -1;
      fl.walls[L]!.sideLocked = true;
    });
    const o = cornerOutline(f(), corners()[0]!)!;
    expect(o[o.length - 1]).toMatchObject({ x: 300 });
    expect(o[0]!.x).toBeCloseTo(900, 6); // 600 od rohu líců (300, 0)
  });

  it('změna délky stěny kótou na vzdáleném konci: výstupek v rohu zůstane na místě (pravidlo prvků nesených stěnou)', () => {
    const { S } = room();
    inner();
    const before = cornerOutline(f(), corners()[0]!)!;
    expect(applyNumpadValue({ kind: 'wall-length', wallId: S, move: { nodeId: f().walls[S]!.b } }, 5000)).toBe(true);
    expect(cornerOutline(f(), corners()[0]!)).toEqual(before);
  });

  it('rozměr podél stěny z panelu', () => {
    room();
    inner();
    setCornerProtrusionDim(corners()[0]!.id, 'a', 800);
    expect(corners()[0]!.pts).toEqual([
      { s: 800, t: 0 },
      { s: 800, t: 400 },
      { s: 0, t: 400 }
    ]);
  });
});

describe('I1.11: výstupek kolem vnějšího rohu', () => {
  it('čtyři čáry z vnějšího líce S kolem rohu na vnější líc L', () => {
    const { S } = room();
    polyline([
      { x: 600, y: -300 },
      { x: 600, y: -700 },
      { x: -700, y: -700 },
      { x: -700, y: 400 },
      { x: -300, y: 400 }
    ]);
    expect(corners()).toHaveLength(1);
    const cp = corners()[0]!;
    expect(cp.pts[0]).toEqual({ s: 900, t: 0 });
    expect(cp.pts[cp.pts.length - 1]).toEqual({ s: 0, t: 700 });
    expect(findBodyAt(f(), { x: -500, y: -500 })?.id).toBe(S);
    expect(edgeOver({ x: -300, y: -300 }, { x: 600, y: -300 })).toBe(false); // vnější líc S pod výstupkem
    expect(edgeOver({ x: -300, y: -300 }, { x: -300, y: 400 })).toBe(false); // vnější líc L
  });
});

describe('I1.11 a F4: smazání, dělení a kopie stěn rohu', () => {
  it('smazání jedné ze stěn smaže výstupek; Zpět ho vrátí', () => {
    const { L } = room();
    inner();
    store.set({ selection: { kind: 'wall', id: L } });
    deleteSelection();
    expect(corners()).toHaveLength(0);
    store.undo();
    expect(corners()).toHaveLength(1);
  });

  it('smazání vybraného výstupku', () => {
    room();
    inner();
    deleteSelection();
    expect(corners()).toHaveLength(0);
    expect(Object.keys(f().walls)).toHaveLength(2);
  });

  it('rozdělení stěny mimo výstupek: výstupek přejde na část v rohu a zůstane na místě', () => {
    const { S, L } = room();
    inner();
    const before = cornerOutline(f(), corners()[0]!)!;
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 2000, y: 0 };
      splitWallAt(fl, S, 'm');
    });
    const cp = corners()[0]!;
    expect(cp.walls[1]).toBe(L);
    expect(f().walls[cp.walls[0]]!.b).toBe('m');
    expect(cornerOutline(f(), cp)).toEqual(before);
  });

  it('rozdělení stěny v šířce výstupku: výstupek zanikne (F4 – přes dělicí bod)', () => {
    const { S } = room();
    inner();
    store.edit(fl => {
      fl.nodes.m = { id: 'm', x: 300, y: 0 };
      splitWallAt(fl, S, 'm');
    });
    expect(corners()).toHaveLength(0);
  });

  it('Do rohu: zkrácení vzdáleného konce stěny výstupek nechá, odříznutí rohu ho smaže (F4)', () => {
    const { S } = room();
    inner();
    const B = addWall({ x: 2000, y: -2000 }, null, { x: 2000, y: -500 }, null, false, { thickness: 300 })!;
    expect(trimToCorner(S, { x: 500, y: 0 }, B, { x: 2000, y: -1000 })).toBe('ok');
    expect(corners()).toHaveLength(1);
    store.undo();
    // ponechat pravou část S → roh se stěnou L se odřízne
    expect(trimToCorner(S, { x: 3000, y: 0 }, B, { x: 2000, y: -1000 })).toBe('ok');
    expect(corners()).toHaveLength(0);
  });

  it('kopie obou stěn zkopíruje i výstupek v rohu', () => {
    const { S, L } = room();
    inner();
    store.set({ selection: { kind: 'multi', items: [{ kind: 'wall', id: S }, { kind: 'wall', id: L }] } });
    duplicateSelection();
    expect(corners()).toHaveLength(2);
  });
});

describe('výstupek tvaru U nakreslený v rohu (chyba od uživatele 2026-11-15)', () => {
  it('na sousední stěně, ke které je jen přisazený, nezůstane čára', () => {
    room();
    // U od líce S podél líce L a zpět na líc S
    polyline([{ x: 0, y: 0 }, { x: 0, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 0 }]);
    expect(Object.keys(f().walls)).toHaveLength(2);
    expect(edgeOver({ x: 0, y: 50 }, { x: 0, y: 350 })).toBe(false);
    expect(edgeOver({ x: 600, y: 0 }, { x: 600, y: 400 })).toBe(true);
  });
});

describe('I1.11 – po kontrole revieweru a rozhodnutí uživatele 2026-11-15', () => {
  it('roh u napojení T (příčka doprostřed průběžné stěny): výstupek vznikne na obou stranách příčky', () => {
    store.openProject(createProject({ name: 't' }));
    const H = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 })!;
    const P = addWall({ x: 2000, y: 0 }, null, { x: 2000, y: 3000 }, null, false, { thickness: 100, side: 1 })!; // tělo x ∈ [1900, 2000]
    expect(f().nodes[f().walls[P]!.a]!.host).toBe(H);
    polyline([{ x: 2600, y: 0 }, { x: 2600, y: 400 }, { x: 2000, y: 400 }]);
    polyline([{ x: 1300, y: 0 }, { x: 1300, y: 400 }, { x: 1900, y: 400 }]);
    expect(corners()).toHaveLength(2);
    expect(corners().map(c => c.walls)).toEqual([
      [H, P],
      [H, P]
    ]);
    expect(corners().map(c => c.dirs[0])).toEqual([1, -1]);
    expect(findBodyAt(f(), { x: 2300, y: 200 })?.id).toBe(H);
    expect(findBodyAt(f(), { x: 1600, y: 200 })?.id).toBe(H);
    expect(edgeOver({ x: 2000, y: 0 }, { x: 2600, y: 0 })).toBe(false);
    expect(edgeOver({ x: 2000, y: 0 }, { x: 2000, y: 400 })).toBe(false);
  });

  it('třetí stěna napojená dodatečně do rohu: výstupek se skryje, Zpět ho vrátí', () => {
    const { c } = room();
    inner();
    addWall({ x: 0, y: 0 }, c, { x: 1500, y: 1500 }, null, false, { thickness: 200 });
    expect(cornerOutline(f(), corners()[0]!)).toBeNull();
    expect(corners()).toHaveLength(1); // záznam zůstane – vrátí se, až roh znovu vznikne
    store.undo();
    expect(cornerOutline(f(), corners()[0]!)).not.toBeNull();
  });

  it('sloučení stěny rohu s rovným pokračováním: výstupek přejde na sloučenou stěnu a zůstane na místě', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 300, side: -1 });
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
    addWall({ x: 2500, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
    inner();
    const before = cornerOutline(f(), corners()[0]!)!;
    addWall({ x: 2000, y: 0 }, null, { x: 2500, y: 0 }, null, false, { thickness: 300, side: -1 });
    expect(Object.values(f().walls).filter(w => w.thickness > 0)).toHaveLength(2); // S + mezera + T = jedna stěna
    expect(corners()).toHaveLength(1);
    const after = cornerOutline(f(), corners()[0]!)!;
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i]!.x, 6);
      expect(p.y).toBeCloseTo(before[i]!.y, 6);
    });
  });

  it('roh přetažený na jiný roh: výstupek patří spojenému rohu a dál se kreslí', () => {
    const { c } = room();
    inner();
    const Z = addWall({ x: -2000, y: -2000 }, null, { x: 0, y: 0.5 }, null, false, { thickness: 0 })!;
    const zEnd = f().walls[Z]!.b;
    store.edit(fl => {
      fl.nodes[c]!.y = 0.5;
    });
    mergeNodeIfCoincident(c);
    const cp = corners()[0]!;
    expect([c, zEnd]).toContain(cp.node);
    expect(f().nodes[cp.node]).toBeDefined();
    expect(cornerOutline(f(), cp)).not.toBeNull();
  });

  it('zkrácení stěny kótou pod rozměr výstupku v rohu se neprovede (prvek by přečníval)', () => {
    const { S } = room();
    inner();
    expect(applyNumpadValue({ kind: 'wall-length', wallId: S, move: { nodeId: f().walls[S]!.b } }, 400)).toBe(false);
    expect(Math.round(f().nodes[f().walls[S]!.b]!.x)).toBe(4000);
  });

  it('vybrání hned vedle výstupku v rohu si nechá boční čáru', () => {
    room();
    inner();
    polyline([{ x: 600, y: 0 }, { x: 600, y: -100 }, { x: 900, y: -100 }, { x: 900, y: 0 }]);
    expect(Object.values(f().protrusions ?? {})).toHaveLength(1);
    expect(edgeOver({ x: 600, y: -10 }, { x: 600, y: -90 })).toBe(true);
    expect(edgeOver({ x: 900, y: -10 }, { x: 900, y: -90 })).toBe(true);
  });
});
