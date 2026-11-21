/**
 * Plocha místnosti (rozhodnutí uživatele 2026-11-21) – JEDINÉ místo pravidla:
 * světlá plocha podlahy = souvislý volný prostor kolem štítku mezi tělesy (bez tloušťky stěn, i u stěny kreslené
 * vnějším lícem). Tělesa = těla stěn s výstupky (výstupek, výstupek v rohu, výstupek na konci – `WallBody.adds`)
 * bez vybrání (`WallBody.holes`, i vybrání v rohu) – výstupek do místnosti se tak odečte, vybrání přičte; příčka
 * nebo sloup uvnitř místnosti se odečte. Otvory (dveře, okna, průchody, niky) plochu nemění – tělo stěny je
 * pro výpočet celé (otvory těla nedělí). Stěna bez tloušťky (čára) je hranice s nulovou šířkou. Oblouky jako
 * lomené čáry (jako tělo stěny). Vrstvy ani jejich skrytí výpočet nemění (fyzická plocha).
 *
 * Výpočet je přesný pro lomené čáry: rovina se rozdělí svislými pásy v x všech vrcholů a průsečíků hran, v pásu
 * se hrany nekříží – buňky mezi sousedními hranami jsou lichoběžníky. Volné buňky (mimo tělesa) se spojí, když
 * mezi nimi není hranice (stejný pás) nebo sdílejí hranici pásu delší než `MIN_GAP` (sousední pásy) – štěrbina
 * mezi tělesy po zaokrouhlení (spoj rohu) tak místnost „neprosákne“. Když se prostor od štítku dostane mimo
 * výkres, obrys není uzavřený → null.
 */
import type { Floor, Pt } from '../model/types';
import { arcPolyline, circlePolyline } from './arc';
import { pointInPolygon, wallBodies } from './wallBody';
import { hasBody } from './wallFace';

/** Nejmenší průchod mezi buňkami (mm) – užší štěrbina místnost nespojí. */
const MIN_GAP = 0.5;
/** Svislice blíž než tohle (mm) se berou jako jedna (spoj těl spočítaný z každé stěny zvlášť). */
const X_TOL = 0.05;

interface Edge {
  a: Pt;
  b: Pt;
  /** Hranice bez tloušťky (stěna-čára): přes ni se buňky nespojí, i když jsou obě volné. */
  barrier: boolean;
}

interface Cell {
  /** Spodní / horní hrana (index do `edges`), −1 = neomezeno. */
  lo: number;
  hi: number;
  free: boolean;
  /** Oddělená od spodní sousední buňky hranicí bez tloušťky. */
  barrierBelow: boolean;
}

interface Slab {
  x0: number;
  x1: number;
  cells: Cell[];
}

interface Arrangement {
  edges: Edge[];
  slabs: Slab[];
  /** Svislé hranice bez tloušťky podle x (rozsahy y). */
  vBarriers: { x: number; y0: number; y1: number }[];
}

const yAt = (e: Edge, x: number): number => {
  const dx = e.b.x - e.a.x;
  if (Math.abs(dx) < 1e-12) return (e.a.y + e.b.y) / 2;
  return e.a.y + ((x - e.a.x) / dx) * (e.b.y - e.a.y);
};

function ringEdges(ring: Pt[], out: Edge[], barrier = false, closed = true): void {
  const n = ring.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) out.push({ a, b, barrier });
  }
}

/** x průsečíku dvou úseček (vnitřního), jinak null. */
function crossX(e: Edge, f: Edge): number | null {
  const rx = e.b.x - e.a.x;
  const ry = e.b.y - e.a.y;
  const sx = f.b.x - f.a.x;
  const sy = f.b.y - f.a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = f.a.x - e.a.x;
  const qy = f.a.y - e.a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return e.a.x + t * rx;
}

/** Těleso jedné stěny: tělo a výstupky bez jejích vybrání (vybrání v rohu má každá z obou stěn rohu). */
interface Solid {
  rings: Pt[][];
  holes: Pt[][];
  box: [number, number, number, number];
}

const boxOf = (rings: Pt[][]): Solid['box'] => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (const q of r) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  return [x0, y0, x1, y1];
};

function build(floor: Floor): Arrangement {
  const solids: Solid[] = [];
  const edges: Edge[] = [];
  for (const b of wallBodies(floor).values()) {
    const rings = [b.poly, ...b.adds];
    solids.push({ rings, holes: b.holes, box: boxOf(rings) });
    for (const r of [...rings, ...b.holes]) ringEdges(r, edges);
  }
  // stěny bez tloušťky = hranice s nulovou šířkou (kruh a oblouk jemněji – plocha kruhové místnosti)
  const vBarriers: Arrangement['vBarriers'] = [];
  for (const w of Object.values(floor.walls)) {
    if (hasBody(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    const line = w.radius !== undefined ? circlePolyline(a, w.radius, 720) : w.sagitta ? arcPolyline(a, b, w.sagitta, 360) : [a, b];
    const from = edges.length;
    ringEdges(line, edges, true, w.radius !== undefined);
    for (const e of edges.slice(from)) {
      if (Math.abs(e.b.x - e.a.x) <= X_TOL) vBarriers.push({ x: (e.a.x + e.b.x) / 2, y0: Math.min(e.a.y, e.b.y), y1: Math.max(e.a.y, e.b.y) });
    }
  }
  const inSolid = (p: Pt): boolean =>
    solids.some(
      s =>
        p.x >= s.box[0] && p.x <= s.box[2] && p.y >= s.box[1] && p.y <= s.box[3] && s.rings.some(r => pointInPolygon(p, r)) && !s.holes.some(h => pointInPolygon(p, h))
    );

  // hrany podle začátku v x – průchod zleva doprava (průsečíky i hrany v pásu jen mezi hranami, které se v x překrývají)
  const minX = (e: Edge) => Math.min(e.a.x, e.b.x);
  const maxX = (e: Edge) => Math.max(e.a.x, e.b.x);
  const order = edges.map((_, i) => i).sort((i, j) => minX(edges[i]!) - minX(edges[j]!));

  // svislice pásů: vrcholy a průsečíky, blízké sloučené
  const xsRaw: number[] = [];
  for (const e of edges) xsRaw.push(e.a.x, e.b.x);
  let active: number[] = [];
  for (const i of order) {
    const e = edges[i]!;
    const ex0 = minX(e);
    active = active.filter(j => maxX(edges[j]!) >= ex0);
    const ey0 = Math.min(e.a.y, e.b.y);
    const ey1 = Math.max(e.a.y, e.b.y);
    for (const j of active) {
      const f = edges[j]!;
      if (Math.max(f.a.y, f.b.y) < ey0 || Math.min(f.a.y, f.b.y) > ey1) continue;
      const x = crossX(e, f);
      if (x !== null) xsRaw.push(x);
    }
    active.push(i);
  }
  xsRaw.sort((p, q) => p - q);
  const xs: number[] = [];
  for (const x of xsRaw) if (!xs.length || x - xs[xs.length - 1]! > X_TOL) xs.push(x);

  const slabs: Slab[] = [];
  let next = 0;
  active = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const x0 = xs[k]!;
    const x1 = xs[k + 1]!;
    const xm = (x0 + x1) / 2;
    while (next < order.length && minX(edges[order[next]!]!) <= x0 + X_TOL) active.push(order[next++]!);
    active = active.filter(i => maxX(edges[i]!) >= x1 - X_TOL);
    // hrany přes celý pás (s tolerancí sloučených svislic), seřazené podle y uprostřed
    const span = active
      .filter(i => Math.abs(edges[i]!.b.x - edges[i]!.a.x) > X_TOL)
      .map(i => ({ i, y: yAt(edges[i]!, xm), barrier: edges[i]!.barrier }))
      .sort((p, q) => p.y - q.y);
    // shodné hrany (společná hrana dvou těl, čára na líci) = jedna hranice
    const seps: { i: number; y: number; barrier: boolean }[] = [];
    for (const sp of span) {
      const last = seps[seps.length - 1];
      if (last && sp.y - last.y < 1e-6) last.barrier ||= sp.barrier;
      else seps.push({ ...sp });
    }
    const cells: Cell[] = [];
    for (let c = 0; c <= seps.length; c++) {
      const lo = c > 0 ? seps[c - 1]! : null;
      const hi = c < seps.length ? seps[c]! : null;
      const free = !lo || !hi ? true : !inSolid({ x: xm, y: (lo.y + hi.y) / 2 });
      cells.push({ lo: lo ? lo.i : -1, hi: hi ? hi.i : -1, free, barrierBelow: !!lo?.barrier });
    }
    slabs.push({ x0, x1, cells });
  }
  return { edges, slabs, vBarriers };
}

/**
 * Cache podle vstupů výpočtu (immer nechává nezměněné části stejné): posun štítku, text, kóty ani kresba
 * výpočet nespustí znovu.
 */
const cache = new WeakMap<object, { nodes: object; prot: unknown; corner: unknown; end: unknown; arr: Arrangement }>();
function arrangement(floor: Floor): Arrangement {
  const c = cache.get(floor.walls);
  if (c && c.nodes === floor.nodes && c.prot === floor.protrusions && c.corner === floor.cornerProtrusions && c.end === floor.endProtrusions) return c.arr;
  const arr = build(floor);
  cache.set(floor.walls, { nodes: floor.nodes, prot: floor.protrusions, corner: floor.cornerProtrusions, end: floor.endProtrusions, arr });
  return arr;
}

/** Rozsah buňky v y na svislici x (neomezená strana = ±∞). */
function cellRange(arr: Arrangement, c: Cell, x: number): [number, number] {
  return [c.lo < 0 ? -Infinity : yAt(arr.edges[c.lo]!, x), c.hi < 0 ? Infinity : yAt(arr.edges[c.hi]!, x)];
}

/** Délka průchodu mezi dvěma rozsahy na svislici x (bez svislých hranic bez tloušťky). */
function passLength(arr: Arrangement, x: number, a: [number, number], b: [number, number]): number {
  let lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  if (!(hi - lo > MIN_GAP)) return 0;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return Infinity;
  // odečíst svislé hranice bez tloušťky na této svislici – zbylý nejdelší úsek
  const bars = arr.vBarriers.filter(v => Math.abs(v.x - x) <= X_TOL && v.y1 > lo && v.y0 < hi).sort((p, q) => p.y0 - q.y0);
  let best = 0;
  for (const v of bars) {
    best = Math.max(best, v.y0 - lo);
    lo = Math.max(lo, v.y1);
  }
  return Math.max(best, hi - lo);
}

/**
 * Světlá plocha místnosti kolem bodu (štítku) v mm²; null = bod leží v tělese nebo prostor kolem něj není
 * uzavřený (prosákne mimo výkres).
 */
export function roomArea(floor: Floor, p: Pt): number | null {
  // bod přesně na svislici pásu nebo na hraně → o kousek vedle (výsledek je pro celý souvislý prostor stejný)
  for (const d of [0, 0.37, -0.37]) {
    const r = areaFrom(floor, { x: p.x + d, y: p.y + d * 0.61 });
    if (r !== undefined) return r;
  }
  return null;
}

/** undefined = bod leží na hranici pásu / buňky (zkusit vedle). */
function areaFrom(floor: Floor, p: Pt): number | null | undefined {
  const arr = arrangement(floor);
  const { slabs } = arr;
  if (!slabs.length || p.x <= slabs[0]!.x0 || p.x >= slabs[slabs.length - 1]!.x1) return null;
  const k0 = slabs.findIndex(s => p.x > s.x0 && p.x < s.x1);
  if (k0 < 0) return undefined;
  const c0 = slabs[k0]!.cells.findIndex(c => {
    const [lo, hi] = cellRange(arr, c, p.x);
    return p.y > lo && p.y < hi;
  });
  if (c0 < 0) return undefined;
  if (!slabs[k0]!.cells[c0]!.free) return null;

  const seen = new Set<string>();
  const stack: [number, number][] = [[k0, c0]];
  seen.add(`${k0}:${c0}`);
  let area = 0;
  const visit = (k: number, c: number) => {
    const key = `${k}:${c}`;
    if (seen.has(key) || !slabs[k]!.cells[c]!.free) return;
    seen.add(key);
    stack.push([k, c]);
  };
  while (stack.length) {
    const [k, c] = stack.pop()!;
    const s = slabs[k]!;
    const cell = s.cells[c]!;
    // neomezená buňka nebo průchod přes kraj výkresu → obrys není uzavřený
    if (cell.lo < 0 || cell.hi < 0) return null;
    const outside: [number, number] = [-Infinity, Infinity];
    if (k === 0 && passLength(arr, s.x0, cellRange(arr, cell, s.x0), outside) > MIN_GAP) return null;
    if (k === slabs.length - 1 && passLength(arr, s.x1, cellRange(arr, cell, s.x1), outside) > MIN_GAP) return null;
    const [l0, h0] = cellRange(arr, cell, s.x0);
    const [l1, h1] = cellRange(arr, cell, s.x1);
    area += ((h0 - l0 + (h1 - l1)) / 2) * (s.x1 - s.x0);
    // stejný pás: přes hranu, která není hranicí bez tloušťky
    if (c > 0 && !cell.barrierBelow) visit(k, c - 1);
    if (c + 1 < s.cells.length && !s.cells[c + 1]!.barrierBelow) visit(k, c + 1);
    // sousední pásy: společný úsek svislice
    for (const [kn, x] of [
      [k - 1, s.x0],
      [k + 1, s.x1]
    ] as const) {
      const ns = slabs[kn];
      if (!ns) continue;
      const mine = cellRange(arr, cell, x);
      ns.cells.forEach((other, j) => {
        if (other.free && passLength(arr, x, mine, cellRange(arr, other, x)) > MIN_GAP) visit(kn, j);
      });
    }
  }
  return area;
}

/** Plocha pro štítek: „12,45 m²“ (mm² → m², dvě desetinná místa, desetinná čárka). */
export function formatArea(mm2: number): string {
  return `${(mm2 / 1e6).toFixed(2).replace('.', ',')} m²`;
}
