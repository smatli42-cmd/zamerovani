import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor, Pt } from '../model/types';
import { bodyNormal, bodySnapPoints, findBodyAt, initialSide, orientLoopOutward, wallBodies } from './wallBody';

function floorWith(nodes: Record<string, [number, number]>): Floor {
  const f = createFloor('t');
  for (const [id, [x, y]] of Object.entries(nodes)) f.nodes[id] = { id, x, y };
  return f;
}

const has = (pts: Pt[], x: number, y: number) => pts.some(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);

describe('tělo stěny', () => {
  it('samostatná stěna: obdélník tloušťky na straně side, oba líce a obě čela', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0] });
    const w = createWall('a', 'b', 0, 200, 1); // normal(1,0) = (0,1) → tělo do +y
    f.walls[w.id] = w;
    const body = wallBodies(f).get(w.id)!;
    expect(has(body.poly, 0, 0) && has(body.poly, 1000, 0) && has(body.poly, 1000, 200) && has(body.poly, 0, 200)).toBe(true);
    expect(body.edges).toHaveLength(4);
    w.side = -1;
    const flipped = wallBodies(f).get(w.id)!;
    expect(has(flipped.poly, 0, -200) && has(flipped.poly, 1000, -200)).toBe(true);
  });

  it('čára bez tloušťky (tvar) nemá tělo', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0] });
    const w = createWall('a', 'b');
    f.walls[w.id] = w;
    expect(wallBodies(f).size).toBe(0);
  });

  it('roh L s různými tloušťkami: vnější roh v průsečíku vnějších líců, spoj se nekreslí', () => {
    // místnost vpravo dole od rohu (0,0); stěny: horní (0,0)→(1000,0) tělo nahoru 300, levá (0,0)→(0,1000) tělo doleva 200
    const f = floorWith({ c: [0, 0], r: [1000, 0], d: [0, 1000] });
    const top = createWall('c', 'r', 0, 300, -1);
    const left = createWall('c', 'd', 0, 200, 1); // normal(0,1) = (-1,0) → doleva
    f.walls[top.id] = top;
    f.walls[left.id] = left;
    const bodies = wallBodies(f);
    const tb = bodies.get(top.id)!;
    const lb = bodies.get(left.id)!;
    expect(has(tb.poly, -200, -300)).toBe(true);
    expect(has(lb.poly, -200, -300)).toBe(true);
    // horní stěna má čelo jen na volném konci vpravo (3 čáry), stejně levá dole
    expect(tb.edges).toHaveLength(3);
    expect(lb.edges).toHaveLength(3);
  });

  it('napojení T: konec příčky končí na líci průchozí stěny, průchozí stěna se nepřeruší', () => {
    // průchozí stěna rozdělená v bodě m: (0,0)–(1000,0)–(2000,0), tělo nahoru 300; příčka m→(1000,1000) tl. 100
    const f = floorWith({ a: [0, 0], m: [1000, 0], b: [2000, 0], p: [1000, 1000] });
    const w1 = createWall('a', 'm', 0, 300, -1);
    const w2 = createWall('m', 'b', 0, 300, -1);
    const st = createWall('m', 'p', 0, 100, 1); // normal(0,1) = (-1,0) → doleva
    for (const w of [w1, w2, st]) f.walls[w.id] = w;
    const bodies = wallBodies(f);
    // vnější líc průchozí stěny pokračuje rovně přes bod m
    expect(has(bodies.get(w1.id)!.poly, 1000, -300)).toBe(true);
    expect(has(bodies.get(w2.id)!.poly, 1000, -300)).toBe(true);
    // příčka začíná na líci (y = 0) – body (1000,0) a (900,0)
    const sb = bodies.get(st.id)!;
    expect(has(sb.poly, 1000, 0) && has(sb.poly, 900, 0)).toBe(true);
    // nad koncem příčky nezůstane nevyplněné místo (bod těla průchozí stěny nad příčkou leží v některém těle)
    expect(findBodyAt(f, { x: 960, y: -20 })).not.toBeNull();
    expect(findBodyAt(f, { x: 940, y: -280 })).not.toBeNull();
  });

  it('ťuknutí do těla najde stěnu', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0] });
    const w = createWall('a', 'b', 0, 200, 1);
    f.walls[w.id] = w;
    expect(findBodyAt(f, { x: 500, y: 100 })?.id).toBe(w.id);
    expect(findBodyAt(f, { x: 500, y: -100 })).toBeNull();
  });

  it('body pro přichytávání: vnější rohy a středy čel volných konců', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0] });
    const w = createWall('a', 'b', 0, 200, 1);
    f.walls[w.id] = w;
    const pts = bodySnapPoints(f);
    expect(has(pts, 0, 200) && has(pts, 1000, 200) && has(pts, 0, 100) && has(pts, 1000, 100)).toBe(true);
  });
});

describe('strana těla', () => {
  it('navazující stěna pokračuje na stejné straně tahu', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0], c: [1000, 1000] });
    const w1 = createWall('a', 'b', 0, 300, -1);
    f.walls[w1.id] = w1;
    const w2 = createWall('b', 'c', 0, 300);
    expect(initialSide(f, w2)).toBe(-1);
    const w3 = createWall('c', 'b', 0, 300); // nakreslená proti směru tahu
    expect(initialSide(f, w3)).toBe(1);
  });

  it('uzavřená místnost: těla všech stěn se natočí ven, ručně přehozená zůstane', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0], c: [1000, 1000], d: [0, 1000] });
    const ids = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a']
    ].map(([p, q]) => {
      const w = createWall(p!, q!, 0, 300, 1);
      f.walls[w.id] = w;
      return w.id;
    });
    f.walls[ids[1]!]!.sideLocked = true; // pravá stěna ručně dovnitř (side 1 = normal(0,1) = (-1,0) → dovnitř)
    expect(orientLoopOutward(f, ids[3]!)).toBe(true);
    expect(bodyNormal(f, f.walls[ids[0]!]!)!.y).toBeLessThan(0); // horní ven (nahoru)
    expect(bodyNormal(f, f.walls[ids[2]!]!)!.y).toBeGreaterThan(0); // dolní ven (dolů)
    expect(bodyNormal(f, f.walls[ids[3]!]!)!.x).toBeLessThan(0); // levá ven (doleva)
    expect(f.walls[ids[1]!]!.side).toBe(1); // zamčená beze změny
  });

  it('otevřený tah smyčku nenajde', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0], c: [1000, 1000] });
    const w1 = createWall('a', 'b', 0, 300);
    const w2 = createWall('b', 'c', 0, 300);
    f.walls[w1.id] = w1;
    f.walls[w2.id] = w2;
    expect(orientLoopOutward(f, w2.id)).toBe(false);
  });
});
