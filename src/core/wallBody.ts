/**
 * Tělo stěny s tloušťkou: obrys (mnohoúhelník) a čáry k vykreslení, napojení stěn v rozích a T
 * a body pro přichytávání. Výstupky v těle a ořez hran uvnitř spojů: core/wallBodyEdges.ts.
 * Tvar a líce stěny: core/wallFace.ts; strana těla: core/wallSide.ts.
 *
 * Stěna je čára líce a→b (rovná nebo oblouková – `sagitta`); tělo leží na straně `side`
 * (1 = ve směru normal(tečny a→b)) v šířce `thickness`. Oblouk se kreslí jako lomená čára.
 * Napojení v rohu: konce stěn kolem rohu se seřadí podle úhlu tečny a sousední hranice se protnou
 * (jako „miter“ v Revitu) – funguje pro L, T i X a různé tloušťky. Čáry uvnitř spojů se nekreslí.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { arcGeometry } from './arc';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { junctionPoints } from './floorQueries';
import { bodyRange, facePath, faceSpan, hasBody } from './wallFace';
import { applyProtrusions, clipInsideEdges } from './wallBodyEdges';

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
  /** Výstupky (přidané plochy) a vybrání (odebrané plochy) – uzavřené obrysy (sekce I katalogu). */
  adds: Pt[][];
  holes: Pt[][];
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
/** Mezipaměť pro hotové (zmrazené) výkresy – tělo se za snímek čte mnohokrát (kreslení, zásah perem, kóty). */
const bodiesCache = new WeakMap<Floor, Map<Id, WallBody>>();

export function wallBodies(floor: Floor): Map<Id, WallBody> {
  const frozen = Object.isFrozen(floor);
  const cached = frozen ? bodiesCache.get(floor) : undefined;
  if (cached) return cached;
  const result = computeWallBodies(floor);
  if (frozen) bodiesCache.set(floor, result);
  return result;
}

function computeWallBodies(floor: Floor): Map<Id, WallBody> {
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

  // T bez dělení: v napojeném rohu dostane průběžná stěna (rovná i oblouk) dva virtuální konce (k a, k b) – napojení
  // se spočítá stejně jako u stěny rozdělené v tom místě, ale stěna zůstane jedna (líce se jen přeruší)
  const virtualByHost = new Map<Id, { t: number; toA: End; toB: End }[]>();
  // body uprostřed stěny: napojené rohy (T bez dělení) a křížení dvou stěn (C1.5, počítá se z geometrie)
  // body ve stejném místě jsou sloučené (tři stěny v bodě, T na kříži = jeden spoj)
  const junctions: { key: Id; node: Pt; wallId: Id }[] = [];
  for (const j of junctionPoints(floor)) for (const wid of j.walls) junctions.push({ key: j.key, node: j.pt, wallId: wid });
  for (const { key, node, wallId } of junctions) {
    const h = floor.walls[wallId];
    if (!h || !hasBody(h) || h.a === key || h.b === key) continue;
    const a = floor.nodes[h.a];
    const b = floor.nodes[h.b];
    if (!a || !b || dist(a, b) < 1) continue;
    // směr stěny v rohu: u rovné a→b, u oblouku tečna (hranice těla jsou soustředné kružnice)
    const g = arcGeometry(a, b, h.sagitta ?? 0);
    let u = unit(a, b);
    if (g) {
      const ang = Math.atan2(node.y - g.center.y, node.x - g.center.x);
      const sgn = Math.sign(g.sweep) || 1;
      u = { x: -Math.sin(ang) * sgn, y: Math.cos(ang) * sgn };
    }
    const c = g ? { center: g.center } : {};
    const [r0, r1] = bodyRange(h);
    const toB: End = { wall: h, atA: true, node, d: u, n: normal(u), lo: r0, hi: r1, ang: Math.atan2(u.y, u.x), virtual: true, ...c };
    const mu = scale(u, -1);
    const toA: End = { wall: h, atA: false, node, d: mu, n: normal(mu), lo: -r1, hi: -r0, ang: Math.atan2(mu.y, mu.x), virtual: true, ...c };
    const t = g ? (paramOnArc(a, b, h.sagitta ?? 0)?.(node) ?? 0) : dot(sub(node, a), u) / dist(a, b);
    (virtualByHost.get(h.id) ?? virtualByHost.set(h.id, []).get(h.id)!).push({ t, toA, toB });
    (byNode.get(key) ?? byNode.set(key, []).get(key)!).push(toA, toB);
  }
  for (const list of virtualByHost.values()) list.sort((p, q) => p.t - q.t);

  // hrany odskoku (C1.11): stěny v přímce s různou tloušťkou / stranou – líce se neprotnou, schod mezi nimi
  // patří ke konci stěny, jejíž líc je od rohu dál (její čelo zůstalo odkryté)
  const steps: { wallId: Id; a: Pt; b: Pt }[] = [];
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
    // u spoje uprostřed stěn (křížení, T bez dělení) se líce protnou vždy – i ostré křížení bez čar uvnitř
    const limit = ends.some(e => e.virtual) ? Infinity : 4 * Math.max(...ends.map(e => e.wall.thickness));
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i]!;
      const next = ends[(i + 1) % ends.length]!;
      const p = add(node, scale(e.n, e.hi));
      const q = add(node, scale(next.n, next.lo));
      // u obloukové stěny se počítá se skutečnou kružnicí líce (ne s tečnou)
      const x = intersectBoundaries(boundaryOf(e, e.hi), boundaryOf(next, next.lo), node);
      // (téměř) rovné pokračování – i naměřené stěny skoro v přímce a rovná stěna s tečně navazujícím obloukem:
      // líce se napojí jen průsečíkem u rohu (do tloušťky), jinak vznikne odskok (C1.11) místo líce protaženého za roh
      const straight = !e.virtual && !next.virtual && dot(e.d, next.d) < -0.99;
      const pairLimit = straight ? Math.max(Math.abs(e.hi), Math.abs(next.lo)) + 1 : limit;
      if (x && dist(x, node) <= pairLimit) {
        e.hiPt = x;
        next.loPt = x;
      } else {
        e.hiPt = p;
        next.loPt = q;
        // odskok: schod mezi konci líců patří stěně, jejíž líc je od rohu dál
        if (straight && dist(p, q) > 0.5) {
          steps.push({ wallId: (dist(p, node) >= dist(q, node) ? e : next).wall.id, a: p, b: q });
        }
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
    let faceLo = loLine;
    if (virt?.length) {
      // průběžná stěna s napojenými rohy (rovná i oblouk): líce se v místě napojení přeruší jen tam,
      // kde vznikla mezera (na straně napojené stěny); jinak pokračují jednou čarou.
      // líc lo (směr a→b): A.lo → toA.hi | toB.lo → … → B.hi; líc hi: A.hi → toA.lo | toB.hi → … → B.lo
      const pieces = (off: number, starts: Pt[], ends: Pt[]): Pt[][] => {
        const out: Pt[][] = [];
        for (let i = 0; i < starts.length; i++) {
          const seg = [starts[i]!, ...curve(off, starts[i]!, ends[i]!), ends[i]!];
          const last = out[out.length - 1];
          if (last && dist(last[last.length - 1]!, starts[i]!) < 1e-6) {
            // bez mezery pokračuje líc dál; u rovné stěny jednou úsečkou (bod napojení vypadne)
            if (!eA.wall.sagitta) last.pop();
            last.push(...seg.slice(1));
          }
          else out.push(seg);
        }
        return out;
      };
      const loP = pieces(eA.lo, [A.lo, ...virt.map(v => v.toB.loPt!)], [...virt.map(v => v.toA.hiPt!), B.hi]);
      const hiP = pieces(eA.hi, [A.hi, ...virt.map(v => v.toB.hiPt!)], [...virt.map(v => v.toA.loPt!), B.lo]);
      for (const line of [...loP, ...hiP]) for (let i = 0; i + 1 < line.length; i++) edges.push([line[i]!, line[i + 1]!]);
      faceLo = loP.flat();
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
    out.set(eA.wall.id, { wallId: eA.wall.id, poly, edges, snaps, faces: [faceLo, [...hiLine].reverse()], adds: [], holes: [] });
  }
  for (const s of steps) out.get(s.wallId)?.edges.push([s.a, s.b]);
  // Spoje uprostřed stěn (křížení, T bez dělení, 3+ stěny v bodě, ostré úhly, oblouk protnutý dvakrát):
  // napojení podle sousedních konců nemusí stačit – kreslené hrany zúčastněných stěn se ořežou o těla
  // ostatních stěn, zůstane jen to, co má aspoň jednu stranu venku (žádná čára uvnitř, C1.5).
  const involved = new Set<Id>();
  for (const j of junctions) {
    involved.add(j.wallId);
    for (const e of byNode.get(j.key) ?? []) involved.add(e.wall.id);
  }
  if (involved.size) clipInsideEdges(out, involved);
  applyProtrusions(floor, out);
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
    const inBody = pointInPolygon(p, body.poly) && !body.holes.some(h => pointInPolygon(p, h));
    if (inBody || body.adds.some(a => pointInPolygon(p, a))) return floor.walls[body.wallId] ?? null;
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
