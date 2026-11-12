/**
 * Tělo stěny s tloušťkou: obrys (mnohoúhelník) a čáry k vykreslení, napojení stěn v rozích a T,
 * výchozí strana těla („ven od místnosti“) a body pro přichytávání.
 *
 * Stěna je čára líce a→b (rovná nebo oblouková – `sagitta`); tělo leží na straně `side`
 * (1 = ve směru normal(tečny a→b)) v šířce `thickness`. Oblouk se kreslí jako lomená čára.
 * Napojení v rohu: konce stěn kolem rohu se seřadí podle úhlu tečny a sousední hranice se protnou
 * (jako „miter“ v Revitu) – funguje pro L, T i X a různé tloušťky. Čáry uvnitř spojů se nekreslí.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { arcGeometry } from './arc';
import { add, centroid, dist, dot, normal, scale, sub, unit } from './geometry';
import { wallSegments } from './floorQueries';

/** Má stěna tělo? (rovné i obloukové stěny s tloušťkou; kruhy a čáry bez tloušťky ne) */
export const hasBody = (w: Wall): boolean => w.thickness > 0 && w.radius === undefined && w.a !== w.b;

/**
 * Rozsah těla kolmo k ose stěny jako posun podél normal(a→b): líc side 1 = [0, t], side −1 = [−t, 0],
 * osa uprostřed = [−t/2, t/2].
 */
export function bodyRange(w: Wall): [number, number] {
  const t = w.thickness;
  if (w.axis === 'center') return [-t / 2, t / 2];
  return w.side === 1 ? [0, t] : [-t, 0];
}

/** Kde začíná tělo měřeno od osy podél `bodyNormal` (líc = 0, osa uprostřed = −t/2); tělo je [start, start + t]. */
export const bodyStart = (w: Wall): number => (w.axis === 'center' ? -w.thickness / 2 : 0);

/** Jednotkový vektor od čáry líce směrem do těla stěny (u oblouku v jeho vrcholu = kolmo k tětivě). */
export function bodyNormal(floor: Floor, w: Wall): Pt | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  return scale(normal(unit(a, b)), w.side);
}

/** Čára líce jako body s tečnami (směr a→b); rovná stěna = 2 body, oblouk = lomená čára. */
export function facePath(a: Pt, b: Pt, sagitta: number, steps = 32): { pts: Pt[]; tans: Pt[] } {
  const g = arcGeometry(a, b, sagitta);
  if (!g) {
    const u = unit(a, b);
    return { pts: [a, b], tans: [u, u] };
  }
  const pts: Pt[] = [];
  const tans: Pt[] = [];
  const sgn = Math.sign(g.sweep) || 1;
  for (let i = 0; i <= steps; i++) {
    const ang = g.start + (g.sweep * i) / steps;
    pts.push(i === 0 ? a : i === steps ? b : { x: g.center.x + g.r * Math.cos(ang), y: g.center.y + g.r * Math.sin(ang) });
    tans.push({ x: -Math.sin(ang) * sgn, y: Math.cos(ang) * sgn });
  }
  return { pts, tans };
}

/** Bod na čáře líce v poloze s (0–1) a směr do těla v tom místě. */
export function facePointAt(floor: Floor, w: Wall, s: number): { pt: Pt; into: Pt } | null {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1e-6) return null;
  const path = facePath(a, b, w.sagitta ?? 0, 64);
  const i = Math.max(0, Math.min(path.pts.length - 1, Math.round(s * (path.pts.length - 1))));
  if (path.pts.length === 2) {
    return { pt: { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, into: scale(normal(path.tans[0]!), w.side) };
  }
  return { pt: path.pts[i]!, into: scale(normal(path.tans[i]!), w.side) };
}

export interface WallBody {
  wallId: Id;
  /** Obrys těla (pro výplň a zásah ťuknutím). */
  poly: Pt[];
  /** Čáry k vykreslení: oba líce a čela volných konců (spoje se nekreslí). */
  edges: [Pt, Pt][];
  /** Body pro přichytávání: vnější rohy konců a středy čel volných konců. */
  snaps: Pt[];
  /**
   * Oba líce jako lomené čáry ve směru a→b (po napojení v rozích): [0] = líc na záporné straně normal(a→b),
   * [1] = na kladné straně. Pro kóty líc–líc u osy uprostřed (2b).
   */
  faces: [Pt[], Pt[]];
}

/** Délka lomené čáry. */
export const polylineLength = (pts: readonly Pt[]): number => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1]!, p) : 0), 0);

/**
 * Délka líce ve směru a→b: u rovné stěny se znaménkem (průmět na osu) – líc „přetočený“ napojením
 * (sousední stěny ho celý překryjí) vyjde ≤ 0; u oblouku délka lomené čáry.
 */
export function faceSpan(w: Wall, a: Pt, b: Pt, pts: readonly Pt[]): number {
  if (w.sagitta || pts.length < 2) return polylineLength(pts);
  return dot(sub(pts[pts.length - 1]!, pts[0]!), unit(a, b));
}

/** Délka líce stěny (face 0 / 1 jako ve `WallBody.faces`, viz `faceSpan`); null = stěna bez těla. */
export function faceLength(floor: Floor, wallId: Id, face: 0 | 1): number | null {
  const w = floor.walls[wallId];
  const body = wallBodies(floor).get(wallId);
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  return body && w && a && b ? faceSpan(w, a, b, body.faces[face]) : null;
}

interface End {
  wall: Wall;
  atA: boolean;
  node: Pt;
  /** Směr od rohu podél stěny (tečna). */
  d: Pt;
  /** normal(d) */
  n: Pt;
  /** Hranice těla jako posun podél n (jedna z nich je líc = 0). */
  lo: number;
  hi: number;
  ang: number;
  /** Oblouková stěna: střed kružnice (hranice těla jsou soustředné kružnice). */
  center?: Pt;
  loPt?: Pt;
  hiPt?: Pt;
  free?: boolean;
  /** Virtuální konec průběžné stěny v napojeném rohu (T bez dělení, core/hosting.ts). */
  virtual?: boolean;
}

/** Hranice těla u konce: přímka (rovná stěna) nebo kružnice (oblouková). */
type Boundary = { kind: 'line'; p: Pt; d: Pt } | { kind: 'circle'; c: Pt; r: number };

function boundaryOf(e: End, off: number): Boundary {
  const p = add(e.node, scale(e.n, off));
  return e.center ? { kind: 'circle', c: e.center, r: dist(e.center, p) } : { kind: 'line', p, d: e.d };
}

/** Průsečík přímek p + s·d a q + t·e (null u rovnoběžných). */
function intersectLines(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < 1e-9) return null;
  const w = sub(q, p);
  const t = (w.x * e.y - w.y * e.x) / cross;
  return add(p, scale(d, t));
}

function lineCircle(p: Pt, d: Pt, c: Pt, r: number): Pt[] {
  const f = sub(p, c);
  const b = dot(f, d);
  const disc = b * b - (dot(f, f) - r * r);
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [add(p, scale(d, -b - sq)), add(p, scale(d, -b + sq))];
}

function circleCircle(c1: Pt, r1: number, c2: Pt, r2: number): Pt[] {
  const dd = dist(c1, c2);
  if (dd < 1e-6 || dd > r1 + r2 || dd < Math.abs(r1 - r2)) return []; // soustředné (tatáž kružnice) nebo bez průsečíku
  const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = scale(sub(c2, c1), 1 / dd);
  const m = add(c1, scale(u, a));
  const v = normal(u);
  return [add(m, scale(v, h)), add(m, scale(v, -h))];
}

/** Průsečík dvou hranic nejbližší rohu (přímka × přímka / kružnice, kružnice × kružnice). */
function intersectBoundaries(b1: Boundary, b2: Boundary, near: Pt): Pt | null {
  let pts: Pt[];
  if (b1.kind === 'line' && b2.kind === 'line') {
    const x = intersectLines(b1.p, b1.d, b2.p, b2.d);
    pts = x ? [x] : [];
  } else if (b1.kind === 'line' && b2.kind === 'circle') pts = lineCircle(b1.p, b1.d, b2.c, b2.r);
  else if (b1.kind === 'circle' && b2.kind === 'line') pts = lineCircle(b2.p, b2.d, b1.c, b1.r);
  else if (b1.kind === 'circle' && b2.kind === 'circle') pts = circleCircle(b1.c, b1.r, b2.c, b2.r);
  else pts = [];
  let best: Pt | null = null;
  for (const q of pts) if (!best || dist(q, near) < dist(best, near)) best = q;
  return best;
}

/** Obrysy těl všech stěn s tloušťkou. */
export function wallBodies(floor: Floor): Map<Id, WallBody> {
  const byNode = new Map<Id, End[]>();
  const items: { eA: End; eB: End; path: { pts: Pt[]; tans: Pt[] } }[] = [];
  for (const w of Object.values(floor.walls)) {
    if (!hasBody(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b || dist(a, b) < 1) continue;
    const path = facePath(a, b, w.sagitta ?? 0);
    const center = arcGeometry(a, b, w.sagitta ?? 0)?.center;
    const tA = path.tans[0]!;
    const tB = path.tans[path.tans.length - 1]!;
    const [r0, r1] = bodyRange(w);
    const mk = (atA: boolean): End => {
      const d = atA ? tA : scale(tB, -1);
      const n = normal(d);
      // u konce B míří n opačně než normal(a→b)
      const lo = atA ? r0 : -r1;
      const hi = atA ? r1 : -r0;
      return { wall: w, atA, node: atA ? a : b, d, n, lo, hi, ang: Math.atan2(d.y, d.x), ...(center ? { center } : {}) };
    };
    const eA = mk(true);
    const eB = mk(false);
    items.push({ eA, eB, path });
    for (const [id, e] of [[w.a, eA], [w.b, eB]] as const) (byNode.get(id) ?? byNode.set(id, []).get(id)!).push(e);
  }

  // T bez dělení: v napojeném rohu dostane průběžná rovná stěna dva virtuální konce (k a, k b) – napojení
  // se spočítá stejně jako u stěny rozdělené v tom místě, ale stěna zůstane jedna (líce se jen přeruší)
  const virtualByHost = new Map<Id, { t: number; toA: End; toB: End }[]>();
  for (const node of Object.values(floor.nodes)) {
    const h = node.host ? floor.walls[node.host] : undefined;
    if (!h || !hasBody(h) || h.sagitta || h.a === node.id || h.b === node.id) continue;
    const a = floor.nodes[h.a];
    const b = floor.nodes[h.b];
    if (!a || !b || dist(a, b) < 1) continue;
    const u = unit(a, b);
    const [r0, r1] = bodyRange(h);
    const toB: End = { wall: h, atA: true, node, d: u, n: normal(u), lo: r0, hi: r1, ang: Math.atan2(u.y, u.x), virtual: true };
    const mu = scale(u, -1);
    const toA: End = { wall: h, atA: false, node, d: mu, n: normal(mu), lo: -r1, hi: -r0, ang: Math.atan2(mu.y, mu.x), virtual: true };
    const t = dot(sub(node, a), u) / dist(a, b);
    (virtualByHost.get(h.id) ?? virtualByHost.set(h.id, []).get(h.id)!).push({ t, toA, toB });
    (byNode.get(node.id) ?? byNode.set(node.id, []).get(node.id)!).push(toA, toB);
  }
  for (const list of virtualByHost.values()) list.sort((p, q) => p.t - q.t);

  for (const all of byNode.values()) {
    const node = all[0]!.node;
    const closeFree = (e: End) => {
      e.loPt = add(node, scale(e.n, e.lo));
      e.hiPt = add(node, scale(e.n, e.hi));
      e.free = true;
    };
    // „nespojovat konec“: takový konec má vlastní čelo a do napojení ostatních nevstupuje
    const ends = all.filter(e => e.virtual || !(e.atA ? e.wall.noJoinA : e.wall.noJoinB));
    for (const e of all) if (!ends.includes(e)) closeFree(e);
    if (ends.length === 0) continue;
    if (ends.length === 1) {
      closeFree(ends[0]!);
      continue;
    }
    ends.sort((p, q) => p.ang - q.ang);
    const limit = 4 * Math.max(...ends.map(e => e.wall.thickness));
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i]!;
      const next = ends[(i + 1) % ends.length]!;
      const p = add(node, scale(e.n, e.hi));
      const q = add(node, scale(next.n, next.lo));
      // u obloukové stěny se počítá se skutečnou kružnicí líce (ne s tečnou)
      const x = intersectBoundaries(boundaryOf(e, e.hi), boundaryOf(next, next.lo), node);
      if (x && dist(x, node) <= limit) {
        e.hiPt = x;
        next.loPt = x;
      } else {
        e.hiPt = p;
        next.loPt = q;
      }
    }
  }

  const out = new Map<Id, WallBody>();
  for (const { eA, eB, path } of items) {
    const A = { lo: eA.loPt!, hi: eA.hiPt! };
    const B = { lo: eB.loPt!, hi: eB.hiPt! };
    // vnitřní body obou hranic (u oblouku), v rámci konce A: hranice „lo“ vede k B.hi, „hi“ od B.lo;
    // u napojení se oblouk ořízne – vynechají se body ležící za koncovým bodem hranice
    const mids = path.pts.slice(1, -1);
    const midT = path.tans.slice(1, -1);
    const n = path.pts.length - 1;
    const param = paramOnArc(path.pts[0]!, path.pts[n]!, eA.wall.sagitta ?? 0);
    const curve = (off: number, from: Pt, to: Pt) => {
      const pts = mids.map((p, i) => add(p, scale(normal(midT[i]!), off)));
      if (!param) return pts;
      const s0 = param(from);
      const s1 = param(to);
      return pts.filter((_, i) => {
        const si = (i + 1) / n;
        return si > s0 + 1e-6 && si < s1 - 1e-6;
      });
    };
    const loLine = [A.lo, ...curve(eA.lo, A.lo, B.hi), B.hi];
    const hiLine = [B.lo, ...curve(eA.hi, A.hi, B.lo).reverse(), A.hi];
    const edges: [Pt, Pt][] = [];
    const virt = virtualByHost.get(eA.wall.id);
    if (virt?.length) {
      // průběžná stěna s napojenými rohy: líce se v místě napojení přeruší (mezi stěnami žádná čára)
      // líc lo (směr a→b): A.lo → toA.hi | toB.lo → … → B.hi; líc hi: A.hi → toA.lo | toB.hi → … → B.lo
      const lo: Pt[] = [A.lo];
      // líc se přeruší jen tam, kde vznikla mezera (na straně napojené stěny); jinak pokračuje jednou čarou
      let loStart = A.lo;
      let hiStart = A.hi;
      for (const v of virt) {
        if (dist(v.toA.hiPt!, v.toB.loPt!) > 1e-6) {
          edges.push([loStart, v.toA.hiPt!]);
          loStart = v.toB.loPt!;
        }
        if (dist(v.toA.loPt!, v.toB.hiPt!) > 1e-6) {
          edges.push([hiStart, v.toA.loPt!]);
          hiStart = v.toB.hiPt!;
        }
        lo.push(v.toA.hiPt!, v.toB.loPt!);
      }
      edges.push([loStart, B.hi], [hiStart, B.lo]);
      loLine.splice(0, loLine.length, ...lo, B.hi);
    } else for (const line of [loLine, hiLine]) for (let i = 0; i + 1 < line.length; i++) edges.push([line[i]!, line[i + 1]!]);
    // nulové úseky (napojení bez přerušení líce) se nekreslí
    for (let i = edges.length - 1; i >= 0; i--) if (dist(edges[i]![0], edges[i]![1]) < 1e-6) edges.splice(i, 1);
    if (eA.free) edges.push([A.hi, A.lo]);
    if (eB.free) edges.push([B.hi, B.lo]);
    // u napojeného konce vede obrys přes roh – jinak by u T zůstal mezi šikmým řezem a příčkou nevyplněný klín
    const poly = [...loLine, ...(eB.free ? [] : [eB.node]), ...hiLine, ...(eA.free ? [] : [eA.node])];
    const snaps: Pt[] = [];
    for (const [e, pts] of [
      [eA, [A.lo, A.hi]],
      [eB, [B.lo, B.hi]]
    ] as const) {
      for (const p of pts) if (dist(p, e.node) >= 1) snaps.push(p);
      if (e.free) snaps.push({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
    }
    // líc „lo“ (od konce A) leží na straně, kam míří normal(a→b) × znaménko lo; lo ≤ hi, takže lo = záporná strana
    out.set(eA.wall.id, { wallId: eA.wall.id, poly, edges, snaps, faces: [loLine, [...hiLine].reverse()] });
  }
  return out;
}

/** Poloha bodu podél oblouku a→b (0 = a, 1 = b) podle úhlu; null u rovné stěny. */
function paramOnArc(a: Pt, b: Pt, sagitta: number): ((p: Pt) => number) | null {
  const g = arcGeometry(a, b, sagitta);
  if (!g) return null;
  const TWO_PI = Math.PI * 2;
  const span = Math.abs(g.sweep);
  return (p: Pt) => {
    const ang = Math.atan2(p.y - g.center.y, p.x - g.center.x);
    let rel = g.sweep >= 0 ? ang - g.start : g.start - ang;
    rel = ((rel % TWO_PI) + TWO_PI) % TWO_PI;
    // kousek před začátkem oblouku = záporná poloha
    if (rel > span + (TWO_PI - span) / 2) rel -= TWO_PI;
    return rel / span;
  };
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Stěna, do jejíhož těla padne bod (null = žádná). */
export function findBodyAt(floor: Floor, p: Pt): Wall | null {
  for (const body of wallBodies(floor).values()) {
    if (pointInPolygon(p, body.poly)) return floor.walls[body.wallId] ?? null;
  }
  return null;
}

/** Body těl pro přichytávání: vnější rohy konců (mimo rohy líce) a středy čel volných konců. */
export function bodySnapPoints(floor: Floor): Pt[] {
  const out: Pt[] = [];
  for (const body of wallBodies(floor).values()) {
    for (const p of body.snaps) if (!out.some(q => dist(q, p) < 1)) out.push(p);
  }
  return out;
}

/**
 * Výchozí strana těla nové stěny: navazuje-li stěna na konec jediné jiné stěny, pokračuje na stejné straně
 * (tělo se drží „venku“ podél celého tahu); jinak ven od středu ostatních rohů.
 */
export function initialSide(floor: Floor, wall: Wall): 1 | -1 {
  const a = floor.nodes[wall.a];
  const b = floor.nodes[wall.b];
  if (!a || !b) return 1;
  return initialSideAt(floor, a, b, wall.a, wall.b, wall.id);
}

/**
 * Výchozí strana těla pro stěnu z bodu `a` do `b` (i pro stěnu, která se teprve kreslí):
 * `aId`/`bId` = rohy, na které se konce napojují (null = nový roh).
 */
export function initialSideAt(floor: Floor, a: Pt, b: Pt, aId: Id | null, bId: Id | null, excludeWallId?: Id): 1 | -1 {
  const others = Object.values(floor.walls).filter(w => w.id !== excludeWallId && hasBody(w));
  for (const [id, atStart] of [[aId, true], [bId, false]] as const) {
    if (!id) continue;
    const at = others.filter(w => w.a === id || w.b === id);
    if (at.length !== 1) continue;
    const w = at[0]!;
    // tah p→q→r: stejná strana; protisměrně opačná
    const sameDir = (atStart && w.b === id) || (!atStart && w.a === id);
    return sameDir ? w.side : w.side === 1 ? -1 : 1;
  }
  const rest = Object.values(floor.nodes).filter(n => n.id !== aId && n.id !== bId && dist(n, a) > 1 && dist(n, b) > 1);
  if (rest.length === 0 || dist(a, b) < 1) return 1;
  const c = centroid(rest);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return dot(sub(mid, c), normal(unit(a, b))) >= 0 ? 1 : -1;
}

/**
 * Uzavřela stěna místnost (smyčku stěn s tloušťkou)? Pak se těla všech stěn smyčky natočí ven z ní
 * (kromě stěn s ručně přehozenou stranou). Vrací true, pokud smyčku našla.
 */
export function orientLoopOutward(floor: Floor, wallId: Id): boolean {
  const start = floor.walls[wallId];
  if (!start || !hasBody(start)) return false;
  const adj = new Map<Id, { wall: Wall; to: Id }[]>();
  // průběžné stěny s napojenými rohy (T bez dělení) se v grafu rozdělí virtuálně
  for (const { wall: w, from, to } of wallSegments(floor)) {
    if (w.id === wallId || !hasBody(w)) continue;
    (adj.get(from) ?? adj.set(from, []).get(from)!).push({ wall: w, to });
    (adj.get(to) ?? adj.set(to, []).get(to)!).push({ wall: w, to: from });
  }
  // nejkratší cesta b → a (bez nové stěny)
  const prev = new Map<Id, { from: Id; wall: Wall }>();
  const queue = [start.b];
  const seen = new Set([start.b]);
  while (queue.length && !seen.has(start.a)) {
    const id = queue.shift()!;
    for (const e of adj.get(id) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, { from: id, wall: e.wall });
      queue.push(e.to);
    }
  }
  if (!seen.has(start.a)) return false;
  const loopWalls: Wall[] = [start];
  const polyIds: Id[] = [start.a];
  for (let id = start.a; id !== start.b; ) {
    const p = prev.get(id)!;
    loopWalls.push(p.wall);
    polyIds.push(p.from);
    id = p.from;
  }
  const poly = polyIds.map(id => floor.nodes[id]!).filter(Boolean);
  if (poly.length < 3) return false;
  for (const w of new Set(loopWalls)) {
    // ručně zvolená strana se nemění; u osy uprostřed se strana jen pamatuje pro návrat na líc (B4) – také ne
    if (w.sideLocked || w.axis === 'center') continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    const bn = bodyNormal(floor, w);
    if (!a || !b || !bn) continue;
    const probe = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, bn);
    if (pointInPolygon(probe, poly)) {
      w.side = w.side === 1 ? -1 : 1;
      if (w.sagitta) w.sagitta = -w.sagitta;
    }
  }
  return true;
}

/**
 * Strana těla podle polohy pera při kreslení: když se pero odchýlí od (přichycené) čáry stěny
 * o víc než `threshold` (mm), tělo se překlopí na stranu pera; jinak zůstane `current` (null = automaticky).
 */
export function sideFromPen(start: Pt, end: Pt, pen: Pt, threshold: number, current: 1 | -1 | null): 1 | -1 | null {
  if (dist(start, end) < 1) return current;
  const off = dot(sub(pen, end), normal(unit(start, end)));
  if (Math.abs(off) <= threshold) return current;
  return off > 0 ? 1 : -1;
}

/**
 * Navazuje kreslená stěna `from`→`to` rovně na volný konec existující stěny se stejnou tloušťkou
 * v rohu `nodeId` (pokračování stejným směrem)? Vrací tu stěnu – kreslená se s ní sloučí do jedné.
 */
export function straightContinuation(floor: Floor, nodeId: Id | null, from: Pt, to: Pt, thickness: number, excludeWallId?: Id, throughT = false): Wall | null {
  // throughT (migrace): i čáry bez tloušťky
  if (!nodeId || (thickness <= 0 && !throughT) || dist(from, to) < 1) return null;
  // roh napojený doprostřed jiné stěny (T bez dělení) není volný konec
  if (!throughT && floor.nodes[nodeId]?.host) return null;
  const at = Object.values(floor.walls).filter(w => w.id !== excludeWallId && (w.a === nodeId || w.b === nodeId));
  if (!throughT && at.length !== 1) return null;
  const d1 = unit(from, to);
  for (const o of at) {
    if ((!throughT && !hasBody(o)) || o.thickness !== thickness || o.sagitta || o.radius !== undefined || o.a === o.b) continue;
    const far = floor.nodes[o.a === nodeId ? o.b : o.a];
    if (!far) continue;
    const d2 = unit(from, far);
    const cross = d1.x * d2.y - d1.y * d2.x;
    // opačné směry od rohu = rovné pokračování
    if (cross < 0.002 && cross > -0.002 && dot(d1, d2) < -0.999) return o;
  }
  return null;
}
