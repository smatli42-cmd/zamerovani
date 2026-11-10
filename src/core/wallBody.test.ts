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

describe('překlopení těla perem při kreslení', () => {
  it('odchýlení pera nad / pod čáru určí stranu, malé odchýlení stranu nemění', async () => {
    const { sideFromPen } = await import('./wallBody');
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 }; // normal(1,0) = (0,1) → side 1 = +y
    expect(sideFromPen(a, b, { x: 1000, y: 5 }, 50, null)).toBeNull();
    expect(sideFromPen(a, b, { x: 1000, y: 80 }, 50, null)).toBe(1);
    expect(sideFromPen(a, b, { x: 1000, y: -80 }, 50, 1)).toBe(-1);
    expect(sideFromPen(a, b, { x: 1000, y: -10 }, 50, -1)).toBe(-1);
  });
});

describe('oblouková stěna s tloušťkou', () => {
  it('tělo sleduje oblouk: u vrcholu je tělo za lícem, tětiva v těle není', () => {
    const f = floorWith({ a: [0, 0], b: [2000, 0] });
    const w = createWall('a', 'b', 400, 200, 1); // vyklenutí i tělo do +y
    f.walls[w.id] = w;
    expect(findBodyAt(f, { x: 1000, y: 500 })?.id).toBe(w.id); // vrchol 400, tělo 400–600
    expect(findBodyAt(f, { x: 1000, y: 300 })).toBeNull(); // uvnitř oblouku (místnost)
    expect(findBodyAt(f, { x: 1000, y: 0 })).toBeNull(); // tětiva
  });

  it('napojení rovné stěny na oblouk: spoj bez mezery, čela jen na volných koncích', () => {
    const f = floorWith({ a: [0, 0], b: [2000, 0], c: [2000, -1500] });
    const arc = createWall('a', 'b', 400, 200, 1);
    const st = createWall('b', 'c', 0, 200, 1);
    f.walls[arc.id] = arc;
    f.walls[st.id] = st;
    const bodies = wallBodies(f);
    expect(bodies.get(arc.id)!.edges.length).toBeGreaterThan(10); // lomená čára oblouku
    // volný konec oblouku v bodě a má čelo, napojený konec v b ne
    const caps = (id: string) => bodies.get(id)!.snaps.length;
    expect(caps(arc.id)).toBeGreaterThan(0);
  });
});

describe('oblouková stěna v uzavřené místnosti', () => {
  it('po uzavření se tělo i vyklenutí otočí ven', () => {
    const f = floorWith({ a: [0, 0], b: [3000, 0], c: [3000, 2000], d: [0, 2000] });
    // horní stěna a→b: normal(1,0) = (0,1) = dovnitř místnosti; oblouk i tělo zatím dovnitř
    const top = createWall('a', 'b', 300, 200, 1);
    const others = [
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a']
    ].map(([p, q]) => createWall(p!, q!, 0, 200, 1));
    for (const w of [top, ...others]) f.walls[w.id] = w;
    expect(orientLoopOutward(f, others[2]!.id)).toBe(true);
    expect(top.side).toBe(-1);
    expect(top.sagitta).toBe(-300); // vyklenutí nahoru = ven
  });
});

describe('napojení stěny na obloukovou stěnu (přesně na kružnici líce)', async () => {
  const { splitWallAt } = await import('./topology');
  /** Půlkruh se středem (0,0), r = 1000 (líc), tělo 200 dovnitř; rozdělený v bodě M na líci. */
  function arcWithNode(angleDeg: number) {
    const f = floorWith({ L: [-1000, 0], R: [1000, 0] });
    const arc = createWall('L', 'R', -1000, 200, 1); // vyklenutí nahoru (−y), tělo ke středu
    f.walls[arc.id] = arc;
    const a = (angleDeg * Math.PI) / 180;
    f.nodes.M = { id: 'M', x: 1000 * Math.cos(a), y: -1000 * Math.sin(a) };
    splitWallAt(f, arc.id, 'M');
    return f;
  }
  const r = (p: Pt) => Math.hypot(p.x, p.y);

  it('stěna z líce ven: její hrany končí na vnějším líci, nezajedou do těla oblouku', () => {
    const f = arcWithNode(45);
    const m = f.nodes.M!;
    f.nodes.P = { id: 'P', x: m.x + 800, y: m.y };
    const st = createWall('M', 'P', 0, 200, -1); // tělo nahoru
    f.walls[st.id] = st;
    const body = wallBodies(f).get(st.id)!;
    for (const p of body.poly) expect(r(p)).toBeGreaterThan(1000 - 1);
  });

  it('stěna z líce dovnitř přes tělo: začíná na vnitřním líci oblouku', () => {
    const f = arcWithNode(135);
    const m = f.nodes.M!;
    f.nodes.P = { id: 'P', x: m.x, y: m.y + 1200 };
    const st = createWall('M', 'P', 0, 200, -1); // normal(0,1) = (−1,0) → tělo doprava (−1 = +x)
    f.walls[st.id] = st;
    const body = wallBodies(f).get(st.id)!;
    // rohy na začátku stěny (blízko M) leží na vnitřním líci (r = 800)
    const near = body.poly.filter(p => Math.abs(p.y - m.y) < 400 && !(Math.abs(p.x - m.x) < 1 && Math.abs(p.y - m.y) < 1));
    expect(near.length).toBeGreaterThan(0);
    for (const p of near) expect(Math.abs(r(p) - 800)).toBeLessThan(1);
    // bod těla oblouku mezi vnitřním a vnějším lícem nad příčkou patří oblouku (ne mezera)
    const mid = { x: m.x + 100 * Math.SQRT1_2 + 30, y: m.y + 100 * Math.SQRT1_2 };
    expect(findBodyAt(f, mid)).not.toBeNull();
  });
});
