/**
 * Testy z příkladů C2/1–11 v KATALOG-STEN.md (napojení stěn).
 *
 * Souřadnice: katalog má osu Y NAHORU, vnitřní roh místnosti (0,0), místnost v kladném x a y, tělo roste ven.
 * Aplikace má osu Y DOLŮ, proto se každé katalogové (x, y) píše jako (x, −y): místnost leží v kladném x a záporném y,
 * těla stěn rostou do kladného y (stěna podél osy x) a do záporného x (stěna podél osy y).
 * Strana těla: `normal(u) = (−u.y, u.x)`, side = +1 / −1 vůči ní.
 *
 * Co aplikace dnes nedělá, je označeno `it.fails` / `it.todo` s komentářem „podle katalogu má být…, aplikace dělá…“.
 * Nic se tu neopravuje (zadání ZADANI-AUDIT-STEN.md, fáze 2).
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor, Pt } from '../model/types';
import { findBodyAt, wallBodies } from './wallBody';

function floorWith(nodes: Record<string, [number, number]>): Floor {
  const f = createFloor('t');
  for (const [id, [x, y]] of Object.entries(nodes)) f.nodes[id] = { id, x, y };
  return f;
}

const has = (pts: Pt[], x: number, y: number) => pts.some(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);

/** Prochází nějaká vykreslená hrana vnitřkem sjednoceného těla (tj. je uvnitř těl „čára uvnitř“)? */
function hasLineInsideUnion(f: Floor): boolean {
  for (const body of wallBodies(f).values()) {
    for (const [a, b] of body.edges) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const s of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
        const p = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
        if (findBodyAt(f, { x: p.x + nx * 0.5, y: p.y + ny * 0.5 }) && findBodyAt(f, { x: p.x - nx * 0.5, y: p.y - ny * 0.5 })) return true;
      }
    }
  }
  return false;
}

const hasEdge = (f: Floor, x1: number, y1: number, x2: number, y2: number): boolean => {
  const near = (p: Pt, x: number, y: number) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
  for (const body of wallBodies(f).values()) for (const [a, b] of body.edges) if ((near(a, x1, y1) && near(b, x2, y2)) || (near(a, x2, y2) && near(b, x1, y1))) return true;
  return false;
};

/** Příklady 1/2/7/8/9: vnitřní roh (0,0); A podél osy x (tělo +y), B podél osy y nahoru (tělo −x). */
function corner(tA: number, tB: number, sideB: 1 | -1 = -1): { f: Floor; A: string; B: string } {
  const f = floorWith({ c: [0, 0], ax: [3000, 0], by: [0, -3000] });
  const A = createWall('c', 'ax', 0, tA, 1);
  const B = createWall('c', 'by', 0, tB, sideB);
  f.walls[A.id] = A;
  f.walls[B.id] = B;
  return { f, A: A.id, B: B.id };
}

describe('C2/1: L-roh, obě stěny 300, 90°', () => {
  it('vnější roh (−300, −300 katalog = −300, 300 aplikace), vnitřní roh přesný, žádná čára uvnitř', () => {
    const { f, A, B } = corner(300, 300);
    const b = wallBodies(f);
    expect(has(b.get(A)!.poly, -300, 300)).toBe(true);
    expect(has(b.get(B)!.poly, -300, 300)).toBe(true);
    expect(has(b.get(A)!.poly, 0, 0) && has(b.get(B)!.poly, 0, 0)).toBe(true);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/2: L-roh, A = 300, B = 100', () => {
  it('A končí na x = −100, B na y = −300 (katalog) a překryv je jeden celek bez čáry', () => {
    const { f, A, B } = corner(300, 100);
    const b = wallBodies(f);
    expect(has(b.get(A)!.poly, -100, 300) || has(b.get(B)!.poly, -100, 300)).toBe(true); // vnější roh (−100, 300)
    expect(Math.min(...b.get(A)!.poly.map(p => p.x))).toBeCloseTo(-100, 2); // A končí na x = −100
    expect(Math.max(...b.get(B)!.poly.map(p => p.y))).toBeCloseTo(300, 2); // B končí na y = 300 (katalog −300)
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/3: L-roh, úhel 60°, obě 200', () => {
  it('vnější roh = průsečík odsazených čar, vnitřní roh ve sdíleném bodě líců', () => {
    // A: (0,0)→(3000,0), tělo +y; B: (0,0)→ směr 60° od A do místnosti = (cos60, −sin60), tělo na vnější straně
    const f = floorWith({ c: [0, 0], ax: [3000, 0], bp: [1500, -2598.076211353316] });
    const A = createWall('c', 'ax', 0, 200, 1);
    const B = createWall('c', 'bp', 0, 200, -1);
    f.walls[A.id] = A;
    f.walls[B.id] = B;
    const b = wallBodies(f);
    // odsazená čára A: y = 200; odsazená čára B: 0,866·x + 0,5·y = −200 → x = −346,41
    expect(has(b.get(A.id)!.poly, -346.4101615, 200)).toBe(true);
    expect(has(b.get(B.id)!.poly, -346.4101615, 200)).toBe(true);
    expect(has(b.get(A.id)!.poly, 0, 0) && has(b.get(B.id)!.poly, 0, 0)).toBe(true);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/4: volný konec, tloušťka 200', () => {
  it('konec je úsečka délky 200 kolmá ke stěně v bodě čáry líce', () => {
    const f = floorWith({ a: [0, 0], b: [1000, 0] });
    const w = createWall('a', 'b', 0, 200, 1);
    f.walls[w.id] = w;
    expect(hasEdge(f, 1000, 0, 1000, 200)).toBe(true);
    expect(hasEdge(f, 0, 0, 0, 200)).toBe(true);
    expect(wallBodies(f).get(w.id)!.edges).toHaveLength(4);
  });
});

describe('C2/5: T-napojení, A = 300 průchozí, B = 100 dosedá z místnosti', () => {
  it('A se nepřerušuje, B končí na vnitřním líci A (y = 0), mezi nimi žádná čára', () => {
    // A rozdělená v bodě napojení m (aplikace dělí stěnu tam, kde leží roh): (0,0)–(1000,0)–(2000,0), tělo +y
    // B: m → (1000, −1500) do místnosti (aplikace y dolů), tloušťka 100, tělo −x
    const f = floorWith({ a: [0, 0], m: [1000, 0], b: [2000, 0], p: [1000, -1500] });
    const A1 = createWall('a', 'm', 0, 300, 1);
    const A2 = createWall('m', 'b', 0, 300, 1);
    const B = createWall('m', 'p', 0, 100, -1);
    for (const w of [A1, A2, B]) f.walls[w.id] = w;
    const bodies = wallBodies(f);
    // vnější líc A pokračuje rovně přes m
    expect(has(bodies.get(A1.id)!.poly, 1000, 300) && has(bodies.get(A2.id)!.poly, 1000, 300)).toBe(true);
    // B končí na y = 0
    expect(Math.max(...bodies.get(B.id)!.poly.map(p => p.y))).toBeCloseTo(0, 2);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/6: odskok – dvě stěny v přímce, 300 a 200', () => {
  function offset() {
    const f = floorWith({ a: [0, 0], m: [1000, 0], b: [2000, 0] });
    const w1 = createWall('a', 'm', 0, 300, 1);
    const w2 = createWall('m', 'b', 0, 200, 1);
    f.walls[w1.id] = w1;
    f.walls[w2.id] = w2;
    return f;
  }
  it('zůstávají dvě samostatné stěny a mezi nimi není dělicí čára přes tělo', () => {
    const f = offset();
    expect(Object.keys(f.walls)).toHaveLength(2);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
  // Podle katalogu je u spoje na vnější straně hrana odskoku 100 mm, aplikace ji nekreslí
  // (naměřeno: chybí úsek (1000,200)–(1000,300), AUDIT-STEN.md, C1.11).
  it.fails('C2/6: hrana odskoku (1000,200)–(1000,300) se kreslí', () => {
    expect(hasEdge(offset(), 1000, 200, 1000, 300)).toBe(true);
  });
});

describe('C2/7: změna tloušťky A z 300 na 200', () => {
  it('líc zůstane, vnější roh se přesune na (−300, −200 katalog = 200 aplikace), rohy se nehýbou', () => {
    const { f, A, B } = corner(300, 300);
    const before = JSON.stringify(f.nodes);
    f.walls[A]!.thickness = 200;
    expect(JSON.stringify(f.nodes)).toBe(before);
    const b = wallBodies(f);
    expect(has(b.get(A)!.poly, -300, 200)).toBe(true);
    expect(has(b.get(B)!.poly, -300, 200)).toBe(true);
    expect(has(b.get(A)!.poly, 0, 0)).toBe(true);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/8: přehození strany B v příkladu 1', () => {
  it('napojení se přepočítá a po vrácení strany je výsledek stejný jako původně', () => {
    const { f, B } = corner(300, 300);
    const original = JSON.stringify([...wallBodies(f).values()].map(b => b.poly));
    f.walls[B]!.side = 1; // tělo B roste do místnosti (+x)
    const flipped = wallBodies(f).get(B)!;
    expect(findBodyAt(f, { x: 150, y: -1000 })?.id).toBe(B);
    expect(findBodyAt(f, { x: -150, y: -1000 })).toBeNull();
    expect(Math.min(...flipped.poly.map(p => p.x))).toBeGreaterThanOrEqual(-0.01);
    f.walls[B]!.side = -1;
    expect(JSON.stringify([...wallBodies(f).values()].map(b => b.poly))).toBe(original);
  });
  it('po přehození strany není uvnitř sjednocených těl žádná čára', () => {
    const { f, B } = corner(300, 300);
    f.walls[B]!.side = 1;
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/9: přesunutí konce stěny A tažením po její přímce', () => {
  it('B drží druhý konec a otáčí se, roh zůstane čistý', () => {
    const { f, A, B } = corner(300, 300);
    f.nodes.c!.x = 400; // společný roh se posune po přímce A
    const b = wallBodies(f);
    expect(f.nodes.by).toEqual({ id: 'by', x: 0, y: -3000 }); // druhý konec B drží
    expect(has(b.get(A)!.poly, 400, 0) && has(b.get(B)!.poly, 400, 0)).toBe(true);
    // vnější roh leží na vnější čáře A (y = 300), 300 mm od čáry líce B
    const shared = b.get(A)!.poly.filter(p => b.get(B)!.poly.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 0.01) && Math.abs(p.y - 300) < 0.01);
    expect(shared).toHaveLength(1);
    const o = shared[0]!;
    const len = Math.hypot(400, 3000);
    const ux = -400 / len;
    const uy = -3000 / len; // směr B od rohu
    expect(Math.abs((o.x - 400) * -uy + o.y * ux)).toBeCloseTo(300, 1);
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/10: odpojení v rohu (C1.6)', () => {
  // Příklad 1 (L-roh 300 + 300) s příznakem „nespojovat konec“ u B v rohu: dvě samostatná těla s čárou mezi nimi,
  // každé dojde ke své čáře líce (A po x = 0, B po y = 0 – katalog i aplikace).
  it('C2/10: po vypnutí spojení v rohu mají obě stěny vlastní čela a čáru mezi sebou', () => {
    const { f, A, B } = corner(300, 300);
    f.walls[B]!.noJoinA = true; // B začíná v rohu c
    const b = wallBodies(f);
    // B dojde ke své čáře líce: čelo kolmo na B v y = 0, tj. od (0,0) do (−300,0)
    expect(hasEdge(f, 0, 0, -300, 0)).toBe(true);
    // A zůstává spojený sám se sebou (jediný spojený konec = vlastní čelo kolmo na A: x = 0)
    expect(hasEdge(f, 0, 0, 0, 300)).toBe(true);
    // vnější roh se nevytvoří
    expect(has(b.get(A)!.poly, -300, 300)).toBe(false);
    expect(has(b.get(B)!.poly, -300, 300)).toBe(false);
    // těla se nepřekrývají → žádná čára uvnitř sjednocení
    expect(hasLineInsideUnion(f)).toBe(false);
  });
});

describe('C2/11: křížení, A = 300 a B = 100', () => {
  function cross() {
    const f = floorWith({ a: [0, 0], b: [1000, 0], c: [500, -500], d: [500, 500] });
    const A = createWall('a', 'b', 0, 300, 1);
    const B = createWall('c', 'd', 0, 100, 1);
    f.walls[A.id] = A;
    f.walls[B.id] = B;
    return f;
  }
  it('obě stěny zůstanou samostatné a nepřerušené', () => {
    expect(Object.keys(cross().walls)).toHaveLength(2);
  });
  // Podle katalogu se těla sloučí do jednoho obrysu bez čar uvnitř křížení; aplikace kreslí obě stěny
  // celé včetně hran uvnitř křížení (naměřeno 4 + 4 hrany, AUDIT-STEN.md, C1.5).
  it.fails('C2/11: uvnitř křížení není žádná čára', () => {
    expect(hasLineInsideUnion(cross())).toBe(false);
  });
});
