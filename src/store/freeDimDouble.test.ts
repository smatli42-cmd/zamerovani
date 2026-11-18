/**
 * Volná kóta ke druhé čáře dvojité čáry a k jejím uzavřeným koncům (fronta: doplnění volné kóty). Úseky dvojité
 * čáry: 0 = první čára (pts), 1 = druhá čára, 2 = konec u bodu 1, 3 = konec u bodu 0 (jen s uzavřenými konci).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { freeDimValue } from '../core/freeDim';
import { refAt } from '../core/dimRefs';
import { doubleOffset } from '../core/drawing';
import { dist } from '../core/geometry';
import { addDrawDouble, addFreeDim, addWall, applyNumpadValue, setDimLock } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const nodeAt = (p: Pt) => Object.values(f().nodes).find(n => dist(n, p) < 1)!;

/** Vodorovná stěna y = 0 (tělo nahoru) a dvojitá čára (0,1000)–(2000,1000) šířky 300; `y2` = y druhé čáry. */
function setup(closedEnds = false) {
  store.openProject(createProject({ name: 't' }));
  addWall({ x: -1000, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
  const d = addDrawDouble({ x: 0, y: 1000 }, { x: 2000, y: 1000 }, 300, 1);
  if (closedEnds) store.edit(fl => void (fl.drawings![d]!.closedEnds = true));
  const wall = Object.values(f().walls)[0]!;
  return { d, wall, y2: doubleOffset(f().drawings![d]!)![0].y };
}

describe('volná kóta: druhá čára dvojité čáry', () => {
  it('ťuknutí u druhé čáry se přichytí k úseku 1', () => {
    const { d, y2 } = setup();
    expect(refAt(f(), { x: 1000, y: y2 + 5 }, 20, 20)).toMatchObject({ seg: d, i: 1 });
    expect(refAt(f(), { x: 1000, y: 1005 }, 20, 20)).toMatchObject({ seg: d, i: 0 });
  });

  it('kóta líc stěny – druhá čára: kolmá vzdálenost; zadáním se posune celá dvojitá čára', () => {
    const { d, wall, y2 } = setup();
    const id = addFreeDim({ wall: wall.id, side: 1, at: 1000 }, { seg: d, i: 1, at: 500 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(y2, 6);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, y2 + 200)).toBe(true);
    expect(f().drawings![d]!.pts[0]!.y).toBeCloseTo(1200, 6);
    expect(f().drawings![d]!.width).toBe(300);
  });

  it('kóta mezi první a druhou čárou = šířka: posun 2. čáry mění šířku, první čára stojí', () => {
    const { d } = setup();
    const id = addFreeDim({ seg: d, i: 0, at: 500 }, { seg: d, i: 1, at: 500 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(300, 6);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 450)).toBe(true);
    expect(f().drawings![d]!.width).toBe(450);
    expect(f().drawings![d]!.pts[0]!.y).toBeCloseTo(1000, 6);
  });

  it('kóta mezi čarami: posun 1. čáry mění šířku, druhá čára stojí', () => {
    const { d, y2 } = setup();
    const id = addFreeDim({ seg: d, i: 0, at: 500 }, { seg: d, i: 1, at: 500 })!;
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'a' }, 400)).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(400, 6);
    expect(f().drawings![d]!.width).toBe(400);
    expect(doubleOffset(f().drawings![d]!)![0].y).toBeCloseTo(y2, 6);
  });

  it('uzavřené konce: přichycení ke konci u bodu 1 (úsek 2), zadáním se posune bod konce', () => {
    const { d, y2 } = setup(true);
    const mid = (1000 + y2) / 2;
    expect(refAt(f(), { x: 2003, y: mid }, 20, 20)).toMatchObject({ seg: d, i: 2 });
    expect(refAt(f(), { x: -3, y: mid }, 20, 20)).toMatchObject({ seg: d, i: 3 });
    const id = addFreeDim({ seg: d, i: 3, at: 100 }, { seg: d, i: 2, at: 100 })!;
    expect(freeDimValue(f(), id)).toBeCloseTo(2000, 6);
    expect(applyNumpadValue({ kind: 'free-dim', dimId: id, move: 'b' }, 2500)).toBe(true);
    expect(f().drawings![d]!.pts[1]!.x).toBeCloseTo(2500, 6);
    expect(f().drawings![d]!.pts[0]!.x).toBeCloseTo(0, 6);
  });

  it('bez uzavřených konců se ke koncům nepřichytí', () => {
    const { d, y2 } = setup();
    const e = refAt(f(), { x: 2003, y: (1000 + y2) / 2 }, 20, 20);
    expect(!!e && 'seg' in e && e.seg === d && e.i >= 2).toBe(false);
  });

  it('posun celé kresby: kóta zůstane na druhé čáře (znovunapojení ji nepřehodí na první)', () => {
    const { d, wall } = setup();
    const id = addFreeDim({ wall: wall.id, side: 1, at: 1000 }, { seg: d, i: 1, at: 500 })!;
    store.edit(fl => fl.drawings![d]!.pts.forEach(p => void (p.y += 100)));
    expect(f().dims![id]!.b).toMatchObject({ seg: d, i: 1 });
  });

  it('zamčená kóta ke druhé čáře: posun stěny potáhne dvojitou čáru (pevné spojení)', () => {
    const { d, wall, y2 } = setup();
    const id = addFreeDim({ wall: wall.id, side: 1, at: 1000 }, { seg: d, i: 1, at: 500 })!;
    setDimLock({ kind: 'free-dim', dimId: id, move: 'b' }, true);
    const a = nodeAt({ x: -1000, y: 0 }).id;
    const b = nodeAt({ x: 4000, y: 0 }).id;
    expect(store.edit(fl => [a, b].forEach(n => void (fl.nodes[n]!.y -= 100)))).toBe(true);
    expect(freeDimValue(f(), id)).toBeCloseTo(y2, 3);
    expect(f().drawings![d]!.pts[0]!.y).toBeCloseTo(900, 3);
  });

  it('vypnutí uzavřených konců: kóta ke konci zanikne (i zamčená nezablokuje), Zpět ji vrátí', () => {
    const { d } = setup(true);
    const id = addFreeDim({ seg: d, i: 3, at: 100 }, { seg: d, i: 2, at: 100 })!;
    setDimLock({ kind: 'free-dim', dimId: id, move: 'b' }, true);
    expect(store.edit(fl => void delete fl.drawings![d]!.closedEnds)).toBe(true);
    expect(f().dims?.[id]).toBeUndefined();
    store.undo();
    expect(f().dims?.[id]).toBeDefined();
  });

  it('posun celé dvojité čáry přesně o šířku: kóta zůstane na druhé čáře', () => {
    const { d, wall, y2 } = setup();
    const id = addFreeDim({ wall: wall.id, side: 1, at: 1000 }, { seg: d, i: 1, at: 500 })!;
    const dy = y2 - 1000;
    store.edit(fl => fl.drawings![d]!.pts.forEach(p => void (p.y += dy)));
    expect(f().dims![id]!.b).toMatchObject({ seg: d, i: 1 });
  });
});
