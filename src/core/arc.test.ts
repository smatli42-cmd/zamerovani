import { describe, expect, it } from 'vitest';
import { createCircleWall, createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { arcGeometry, arcPolyline, nearestOnArc, splitArcSagittas } from './arc';
import { componentGap, setComponentGap } from './components';
import { dist } from './geometry';
import { splitWallsAtNode } from './topology';

describe('oblouk', () => {
  it('poloměr, střed a vrchol podle tětivy a vzepětí', () => {
    const g = arcGeometry({ x: 0, y: 0 }, { x: 1000, y: 0 }, 500)!; // půlkruh
    expect(g.r).toBeCloseTo(500);
    expect(g.center.x).toBeCloseTo(500);
    expect(g.center.y).toBeCloseTo(0);
    expect(g.apex.y).toBeCloseTo(500);
  });

  it('body oblouku leží na kružnici a vyklenutí míří na správnou stranu', () => {
    for (const sag of [200, -200, 700]) {
      const a = { x: 0, y: 0 };
      const b = { x: 1000, y: 0 };
      const g = arcGeometry(a, b, sag)!;
      const pts = arcPolyline(a, b, sag);
      for (const p of pts) expect(dist(p, g.center)).toBeCloseTo(g.r, 3);
      const far = pts.reduce((m, p) => (Math.abs(p.y) > Math.abs(m.y) ? p : m));
      expect(Math.sign(far.y)).toBe(Math.sign(sag));
      expect(Math.abs(far.y)).toBeCloseTo(Math.abs(sag), 0);
    }
  });

  it('nejbližší bod na oblouku je přesný, mimo oblouk se bere krajní bod', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const near = nearestOnArc({ x: 500, y: 900 }, a, b, 500);
    expect(near.distance).toBeCloseTo(400);
    expect(near.point.y).toBeCloseTo(500);
    const outside = nearestOnArc({ x: 500, y: -300 }, a, b, 500);
    expect(outside.distance).toBeCloseTo(Math.hypot(500, 300));
  });

  it('rozdělení oblouku zachová poloměr obou částí', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const g = arcGeometry(a, b, 300)!;
    const pt = nearestOnArc({ x: 300, y: 500 }, a, b, 300).point;
    const [s1, s2] = splitArcSagittas(a, b, 300, pt)!;
    expect(arcGeometry(a, pt, s1)!.r).toBeCloseTo(g.r, 3);
    expect(arcGeometry(pt, b, s2)!.r).toBeCloseTo(g.r, 3);
    expect(Math.sign(s1)).toBe(1);
    expect(Math.sign(s2)).toBe(1);
  });
});

function arcRoom(): Floor {
  const f = createFloor('t');
  f.nodes.A = { id: 'A', x: 0, y: 0 };
  f.nodes.B = { id: 'B', x: 4000, y: 0 };
  f.nodes.C = { id: 'C', x: 4000, y: 3000 };
  f.nodes.D = { id: 'D', x: 0, y: 3000 };
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['D', 'A']] as const) {
    const w = createWall(a, b);
    f.walls[w.id] = w;
  }
  const arc = createWall('C', 'D', 800); // dolní stěna jako oblouk
  f.walls[arc.id] = arc;
  return f;
}

describe('oblouková stěna', () => {
  it('uzel na oblouku ji rozdělí na dvě oblouky na téže kružnici', () => {
    const f = arcRoom();
    const arc = Object.values(f.walls).find(w => w.sagitta)!;
    const g = arcGeometry(f.nodes[arc.a]!, f.nodes[arc.b]!, arc.sagitta!)!;
    // bod napojení příčky přesně na oblouku (v 1/3 tětivy)
    const p = nearestOnArc({ x: 2700, y: 3600 }, f.nodes.C!, f.nodes.D!, arc.sagitta!).point;
    f.nodes.P = { id: 'P', x: Math.round(p.x), y: Math.round(p.y) };
    f.nodes.T = { id: 'T', x: 2700, y: 1000 };
    const partition = createWall('T', 'P');
    f.walls[partition.id] = partition;
    splitWallsAtNode(f, 'P');
    const parts = Object.values(f.walls).filter(w => w.sagitta);
    expect(parts).toHaveLength(2);
    for (const w of parts) {
      const gg = arcGeometry(f.nodes[w.a]!, f.nodes[w.b]!, w.sagitta!)!;
      expect(gg.r).toBeCloseTo(g.r, 0);
      expect(dist(gg.center, g.center)).toBeLessThan(2);
    }
  });
});

describe('odstup skupiny stěn', () => {
  function roomWithColumn(): { f: Floor; wallId: string } {
    const f = createFloor('t');
    const pts: Record<string, [number, number]> = { A: [0, 0], B: [5000, 0], C: [5000, 4000], D: [0, 4000], P: [1000, 1500], Q: [1400, 1500], R: [1400, 1700], S: [1000, 1700] };
    for (const [id, [x, y]] of Object.entries(pts)) f.nodes[id] = { id, x, y };
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'], ['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'P']] as const) {
      const w = createWall(a, b);
      f.walls[w.id] = w;
    }
    const wallId = Object.values(f.walls).find(w => w.a === 'P' && w.b === 'Q')!.id;
    return { f, wallId };
  }

  it('sloup z čtyř stěn má odstupy ke stěnám místnosti', () => {
    const { f, wallId } = roomWithColumn();
    expect(componentGap(f, wallId, 'left')!.value).toBeCloseTo(1000);
    expect(componentGap(f, wallId, 'right')!.value).toBeCloseTo(3600);
    expect(componentGap(f, wallId, 'top')!.value).toBeCloseTo(1500);
    expect(componentGap(f, wallId, 'bottom')!.value).toBeCloseTo(2300);
  });

  it('zadání odstupu posune celý sloup a jeho rozměry se nezmění', () => {
    const { f, wallId } = roomWithColumn();
    expect(setComponentGap(f, wallId, 'left', 600)).toBe(true);
    expect(f.nodes.P).toMatchObject({ x: 600, y: 1500 });
    expect(f.nodes.Q).toMatchObject({ x: 1000, y: 1500 });
    expect(componentGap(f, wallId, 'left')!.value).toBeCloseTo(600);
  });

  it('stěna místnosti nemá odstupy, protože celé stavba je jedna skupina', () => {
    const { f } = roomWithColumn();
    const outer = Object.values(f.walls).find(w => w.a === 'A')!;
    expect(componentGap(f, outer.id, 'left')).toBeNull();
  });
});

describe('kruhová stěna', () => {
  it('sloup z kruhu má odstupy ke stěnám a posune se jako celek', () => {
    const f = createFloor('t');
    const pts: Record<string, [number, number]> = { A: [0, 0], B: [4000, 0], C: [4000, 3000], D: [0, 3000], M: [1500, 1500] };
    for (const [id, [x, y]] of Object.entries(pts)) f.nodes[id] = { id, x, y };
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) {
      const w = createWall(a, b);
      f.walls[w.id] = w;
    }
    const circle = createCircleWall('M', 200);
    f.walls[circle.id] = circle;
    expect(componentGap(f, circle.id, 'left')!.value).toBeCloseTo(1300);
    expect(componentGap(f, circle.id, 'right')!.value).toBeCloseTo(2300);
    expect(setComponentGap(f, circle.id, 'left', 1000)).toBe(true);
    expect(f.nodes.M).toMatchObject({ x: 1200, y: 1500 });
    expect(circle.radius).toBe(200);
  });
});
