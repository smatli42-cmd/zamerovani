/**
 * D11 (držení směru při tažení konce), D12 (posun stěny), D13 / C2/16 (kolmice s ikonou ⊥) –
 * podle KRESLENI-EDITACE-KONCU.md: zachycení, držení (hystereze), uvolnění, návrat do pásma,
 * výběr čáry tažením u rohu dvou stěn, volná délka se zarážkami, kolmice.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { nodeDragLines, resolveDragPoint, wallMoveLines, type DragParams } from './dragResolve';

const P: DragParams = { capture: 100, release: 200 };

function floorWith(nodes: Record<string, [number, number]>, walls: [string, string][]): { f: Floor; ids: string[] } {
  const f = createFloor('t');
  for (const [id, [x, y]] of Object.entries(nodes)) f.nodes[id] = { id, x, y };
  const ids = walls.map(([a, b]) => {
    const w = createWall(a, b, 0, 200, 1);
    f.walls[w.id] = w;
    return w.id;
  });
  return { f, ids };
}

describe('D11: tažení konce drží původní směr', () => {
  // jedna stěna z (0,0) do (3000,0); táhne se konec e
  const { f, ids } = floorWith({ s: [0, 0], e: [3000, 0] }, [['s', 'e']]);
  const lines = (c: { x: number; y: number }) => nodeDragLines(f, 'e', c, 300);

  it('zachycení: kousek vedle původní přímky → bod na přímce, délka volná', () => {
    const c = { x: 3600, y: 90 };
    const r = resolveDragPoint(c, lines(c), null, P);
    expect(r.line?.id).toBe(`orig:${ids[0]}`);
    expect(r.point.x).toBeCloseTo(3600, 6);
    expect(r.point.y).toBeCloseTo(0, 6);
  });

  it('původní směr má větší zachycení (1,5×): 140 mm vedle se ještě zachytí', () => {
    const c = { x: 3600, y: 140 };
    expect(resolveDragPoint(c, lines(c), null, P).line?.id).toBe(`orig:${ids[0]}`);
  });

  it('držení: zachycená čára se drží až do poloměru uvolnění (2× × 1,5)', () => {
    const c = { x: 3600, y: 280 };
    expect(resolveDragPoint(c, lines(c), null, P).line).toBeNull(); // bez zámku by se nezachytila
    const r = resolveDragPoint(c, lines(c), `orig:${ids[0]}`, P);
    expect(r.line?.id).toBe(`orig:${ids[0]}`);
    expect(r.point.y).toBeCloseTo(0, 6);
  });

  it('uvolnění po vychýlení a návrat do pásma', () => {
    const far = { x: 3600, y: 400 };
    const r1 = resolveDragPoint(far, lines(far), `orig:${ids[0]}`, P);
    expect(r1.line).toBeNull();
    expect(r1.point).toEqual(far);
    const back = { x: 3700, y: 50 };
    expect(resolveDragPoint(back, lines(back), null, P).line?.id).toBe(`orig:${ids[0]}`);
  });
});

describe('D11: roh dvou napojených stěn – směr se vybere tažením po pomocné čáře', () => {
  // L-roh: A (ax)–c podél x, B (by)–c podél y; táhne se společný roh c
  const { f, ids } = floorWith({ ax: [3000, 0], c: [0, 0], by: [0, -3000] }, [['ax', 'c'], ['by', 'c']]);
  const [A, B] = ids;

  it('po přímce A (vodorovně) se zachytí čára A', () => {
    const c = { x: -500, y: 40 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'c', c, 300), null, P);
    expect(r.line?.id).toBe(`orig:${A}`);
    expect(r.point.y).toBeCloseTo(0, 6);
  });

  it('po přímce B (svisle) se zachytí čára B', () => {
    const c = { x: 40, y: 600 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'c', c, 300), null, P);
    expect(r.line?.id).toBe(`orig:${B}`);
    expect(r.point.x).toBeCloseTo(0, 6);
  });

  it('mimo obě čáry se bod pohybuje volně', () => {
    const c = { x: 700, y: 800 };
    expect(resolveDragPoint(c, nodeDragLines(f, 'c', c, 300), null, P).line).toBeNull();
  });
});

describe('D13 / C2/16: kolmice k jiné stěně s ikonou ⊥', () => {
  // šikmá stěna A z (0,0) do (2000,300); svislá stěna W v x = 3000; konec A se táhne k W
  const { f, ids } = floorWith({ s: [0, 0], e: [2000, 300], w1: [3000, -2000], w2: [3000, 2000] }, [['s', 'e'], ['w1', 'w2']]);
  const [A, W] = ids;

  it('v blízkosti pravého úhlu se poloha přichytí a čára nese ⊥; konec dosedne na stěnu', () => {
    const c = { x: 2960, y: 60 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'e', c, 300), null, P);
    expect(r.line?.id).toBe(`wperp:${A}:${W}`);
    expect(r.line?.perpTo).toBe(W);
    // kolmice k W přes pevný konec (0,0) = vodorovná y = 0; pata na W = (3000, 0)
    expect(r.point.x).toBeCloseTo(3000, 6);
    expect(r.point.y).toBeCloseTo(0, 6);
  });

  it('mimo toleranci se kolmice nezachytí (ikona zmizí)', () => {
    const c = { x: 2960, y: 900 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'e', c, 300), null, P);
    expect(r.line?.perpTo).toBeUndefined();
  });

  it('daleko od stěny se kolmice k ní nenabízí', () => {
    const c = { x: 1000, y: 0 };
    expect(nodeDragLines(f, 'e', c, 300).some(l => l.perpTo === W)).toBe(false);
  });
});

describe('D13: dvě rovnoběžné stěny – kolmice k té blízké (chyba nalezená při ověření v prohlížeči)', () => {
  // vzdálená svislá stěna V v x = 9000 je rovnoběžná s blízkou W v x = 3000; kolmice k oběma splývají
  const { f, ids } = floorWith({ s: [0, 0], e: [2000, 400], v1: [9000, -2000], v2: [9000, 2000], w1: [3000, -2000], w2: [3000, 2000] }, [['s', 'e'], ['v1', 'v2'], ['w1', 'w2']]);
  it('u stěny W se zachytí kolmice s ⊥ a konec dosedne na W', () => {
    const c = { x: 2960, y: 40 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'e', c, 300), null, P);
    expect(r.line?.perpTo).toBe(ids[2]);
    expect(r.point.x).toBeCloseTo(3000, 6);
    expect(r.point.y).toBeCloseTo(0, 6);
  });
});

describe('D11: zarážka – průsečík původního směru s jinou stěnou', () => {
  const { f, ids } = floorWith({ s: [0, 0], e: [2000, 0], w1: [3000, -2000], w2: [3000, 2000] }, [['s', 'e'], ['w1', 'w2']]);
  it('délka se přichytí přesně na stěnu W', () => {
    const c = { x: 3060, y: 30 };
    const r = resolveDragPoint(c, nodeDragLines(f, 'e', c, 300), null, P);
    expect(r.line?.id).toBe(`orig:${ids[0]}`);
    expect(r.point).toEqual({ x: 3000, y: 0 });
  });
});

describe('D12: posun celé stěny', () => {
  const { f, ids } = floorWith({ a: [0, 0], b: [3000, 0] }, [['a', 'b']]);
  const grab = { x: 1500, y: 0 };
  it('posun skoro kolmo se přichytí na kolmici (rovnoběžné odsunutí)', () => {
    const r = resolveDragPoint({ x: 1560, y: 800 }, wallMoveLines(f, ids[0]!, grab), null, P);
    expect(r.line?.id).toBe('offset');
    expect(r.point.x).toBeCloseTo(1500, 6);
  });
  it('posun skoro podél stěny se přichytí na její směr', () => {
    const r = resolveDragPoint({ x: 2500, y: 70 }, wallMoveLines(f, ids[0]!, grab), null, P);
    expect(r.line?.id).toBe('along');
    expect(r.point.y).toBeCloseTo(0, 6);
  });
  it('jinak je posun volný', () => {
    const c = { x: 2500, y: 900 };
    expect(resolveDragPoint(c, wallMoveLines(f, ids[0]!, grab), null, P)).toEqual({ point: c, line: null });
  });
});
