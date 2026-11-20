/**
 * Přichycení posouvaného prvku (přání uživatele 2026-11-20: schodiště, pak i kresba) – JEDINÉ místo: co se posouvá
 * (`movingGeom`), k čemu se přichytává (`moveSnapTargets`) i jak (`snapMove`). Je to jen pomůcka při tažení:
 * prvek si nic nepamatuje (žádná vazba).
 *
 * Posouvá se: schodiště, kresba (čára, obdélník, kruh, oblouk, dvojitá čára), ruční tah a skupina z nich (štítek,
 * text a volná kóta ve skupině jedou s ní, samy hrany nemají). Skupina se stěnou / rohem / otvorem / výstupkem se
 * nepřichytává (stěny mají vlastní pravidla tažení).
 * - Hrana prvku rovnoběžná s hranou cíle (líc stěny – oba líce i čela, čára bez tloušťky, rovný úsek kresby,
 *   hrana schodiště, delší úsek ručního tahu) a vedle ní (překrývají se podél) se k ní dorazí, když je blíž než tolerance.
 * - Dvě takové hrany v různých směrech se dorazí obě (prvek zapadne do rohu).
 * - Když žádná hrana nesedí, přichytí se bod prvku na roh / bod cíle; prvek bez rovných hran (kruh, oblouk) i bodem
 *   kolmo na hranu cíle.
 * Cíle ve skrytých vrstvách se neberou (volající předá pohled `store.view('snap')`); posouvané prvky cílem nejsou.
 */
import type { Drawing, Floor, Id, Pt, Stair, Stroke } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { wallBodies } from './wallBody';
import { drawingPaths, drawingSnapPoints, drawingsOf } from './drawing';
import { flightPolygon, isArcFlight } from './stairFlight';
import { strokesOf } from './strokes';

export interface SnapGeom {
  pts: Pt[];
  segs: [Pt, Pt][];
}

export interface MoveSnapResult {
  /** Posun po přichycení (mm). */
  delta: Pt;
  /** Přichyceno (k hraně nebo bodu)? */
  snapped: boolean;
  /** Hrany / body cíle, ke kterým se přichytilo (náhled). */
  hits: [Pt, Pt][];
}

/** Hrany a rohy obrysu (uzavřené mnohoúhelníky). */
export function outlineGeom(polys: readonly Pt[][]): SnapGeom {
  const pts: Pt[] = [];
  const segs: [Pt, Pt][] = [];
  for (const poly of polys) {
    poly.forEach((p, i) => {
      pts.push(p);
      const q = poly[(i + 1) % poly.length]!;
      if (dist(p, q) > 1) segs.push([p, q]);
    });
  }
  return { pts, segs };
}

/**
 * Schodiště: rameno po oblouku dává jen body (jeho obrys je z krátkých úseků – jako rovné hrany by se přichytávaly
 * k přímkám, které ve výkresu nejsou).
 */
function stairSnapGeom(s: Stair): SnapGeom {
  if (s.outline) return outlineGeom([s.outline]);
  const straight = outlineGeom([...s.flights.filter(f => !isArcFlight(f)).map(flightPolygon), ...s.landings.map(l => l.pts).filter(p => p.length >= 3)]);
  for (const f of s.flights) if (isArcFlight(f)) straight.pts.push(...flightPolygon(f));
  return straight;
}

/** Kresba: rovné úseky (i druhá čára dvojité čáry); oblouk a kruh jen body. */
function drawingSnapGeom(d: Drawing): SnapGeom {
  const segs: [Pt, Pt][] = [];
  for (const path of drawingPaths(d)) for (const sg of path) if (sg.s === 0 && dist(sg.a, sg.b) > 1) segs.push([sg.a, sg.b]);
  return { pts: drawingSnapPoints(d), segs };
}

/** Úsek ručního tahu je hrana až od této délky (tah od ruky má body po ~1 px – ty hrany nedávají). */
const STROKE_EDGE = 100;

/** Ruční tah: konce a delší rovné úseky (tvary Pera – čára, obdélník). */
function strokeSnapGeom(s: Stroke): SnapGeom {
  const segs: [Pt, Pt][] = [];
  const pts: Pt[] = [];
  if (s.pts.length) pts.push(s.pts[0]!, s.pts[s.pts.length - 1]!);
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1]!;
    const b = s.pts[i]!;
    if (dist(a, b) >= STROKE_EDGE) {
      segs.push([a, b]);
      pts.push(a, b);
    }
  }
  return { pts, segs };
}

export function stairGeom(floor: Floor, id: Id): SnapGeom | null {
  const s = floor.stairs?.[id];
  return s ? stairSnapGeom(s) : null;
}

/** Druhy prvků s vlastní geometrií přichycení. */
const SNAP_KINDS = ['stair', 'drawing', 'stroke'] as const;
/** Druhy, které ve skupině jen jedou s ní (hrany nemají). */
const RIDE_KINDS = ['room', 'text', 'dim', 'mark'];

function itemGeom(floor: Floor, kind: string, id: Id): SnapGeom | null {
  if (kind === 'stair') return stairGeom(floor, id);
  if (kind === 'drawing') {
    const d = floor.drawings?.[id];
    return d ? drawingSnapGeom(d) : null;
  }
  if (kind === 'stroke') {
    const s = floor.strokes?.[id];
    return s ? strokeSnapGeom(s) : null;
  }
  return null;
}

/**
 * Geometrie posouvaných prvků; null = nepřichytává se (skupina se stěnou, rohem, otvorem, výstupkem, nebo bez hran
 * i bodů).
 */
export function movingGeom(floor: Floor, items: readonly { kind: string; id: Id }[]): SnapGeom | null {
  const pts: Pt[] = [];
  const segs: [Pt, Pt][] = [];
  for (const it of items) {
    if (RIDE_KINDS.includes(it.kind)) continue;
    if (!(SNAP_KINDS as readonly string[]).includes(it.kind)) return null;
    const g = itemGeom(floor, it.kind, it.id);
    if (!g) continue;
    pts.push(...g.pts);
    segs.push(...g.segs);
  }
  return pts.length || segs.length ? { pts, segs } : null;
}

/**
 * Cíle přichycení: těla stěn (oba líce, čela), stěny bez tloušťky (čára), kresba, schodiště a ruční tahy kromě
 * posouvaných `skip`. Nový druh cíle přidat jen sem.
 */
export function moveSnapTargets(floor: Floor, skip: readonly { kind: string; id: Id }[]): SnapGeom {
  const skipped = new Set(skip.map(i => `${i.kind}:${i.id}`));
  const pts: Pt[] = [];
  const segs: [Pt, Pt][] = [];
  const take = (g: SnapGeom) => {
    pts.push(...g.pts);
    segs.push(...g.segs);
  };
  const bodies = wallBodies(floor);
  for (const w of Object.values(floor.walls)) {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    // oblouk a kruh: jen konce (tělo z krátkých úseků by dalo falešné přímky; střed kruhu není bod stěny)
    if (w.radius !== undefined || !a || !b) continue;
    pts.push(a, b);
    if (w.sagitta) continue;
    const body = bodies.get(w.id);
    if (body) take({ pts: body.poly, segs: body.edges });
    else segs.push([a, b]);
  }
  for (const d of drawingsOf(floor)) if (!skipped.has(`drawing:${d.id}`)) take(drawingSnapGeom(d));
  for (const s of Object.values(floor.stairs ?? {})) if (!skipped.has(`stair:${s.id}`)) take(stairSnapGeom(s));
  for (const s of strokesOf(floor)) if (!skipped.has(`stroke:${s.id}`)) take(strokeSnapGeom(s));
  // úseky kratší než 1 mm nemají spolehlivý směr
  return { pts, segs: segs.filter(([a, b]) => dist(a, b) > 1) };
}

/** Rovnoběžnost hran: do ~1,5°. */
const PARALLEL = Math.sin((1.5 * Math.PI) / 180);
/** Druhá hrana musí mít jiný směr (aspoň ~20°), aby šla dorazit zároveň s první. */
const CROSSING = Math.sin((20 * Math.PI) / 180);

const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

/** Cílové hrany s předpočteným směrem, normálou a délkou (počítá se jednou za tažení). */
interface PrepSeg {
  seg: [Pt, Pt];
  u: Pt;
  n: Pt;
  len: number;
}
const prepCache = new WeakMap<SnapGeom, PrepSeg[]>();
function prepared(t: SnapGeom): PrepSeg[] {
  let out = prepCache.get(t);
  if (!out) {
    out = t.segs.filter(([a, b]) => dist(a, b) > 1).map(seg => {
      const u = unit(seg[0], seg[1]);
      return { seg, u, n: normal(u), len: dist(seg[0], seg[1]) };
    });
    prepCache.set(t, out);
  }
  return out;
}

interface EdgeHit {
  n: Pt;
  d: number;
  target: [Pt, Pt];
}

/**
 * Posun `delta` upravený tak, aby se posouvaná geometrie přichytila k cílům (do vzdálenosti `tol` mm).
 * Bez přichycení vrací `delta` beze změny a `snapped: false`.
 */
export function snapMove(moving: SnapGeom, targets: SnapGeom, delta: Pt, tol: number): MoveSnapResult {
  const hits: EdgeHit[] = [];
  for (const [a0, b0] of moving.segs) {
    const a = add(a0, delta);
    const b = add(b0, delta);
    const um = unit(a, b);
    for (const { seg: t, u: ut, n, len } of prepared(targets)) {
      if (Math.abs(cross(um, ut)) > PARALLEL) continue;
      const d = dot(sub(t[0], a), n);
      if (Math.abs(d) > tol) continue;
      // hrany musí ležet vedle sebe (překryv podél, s rezervou tolerance), ne jen na stejné přímce daleko od sebe
      const s1 = dot(sub(a, t[0]), ut);
      const s2 = dot(sub(b, t[0]), ut);
      if (Math.max(s1, s2) < -tol || Math.min(s1, s2) > len + tol) continue;
      hits.push({ n, d, target: t });
    }
  }
  if (hits.length) {
    hits.sort((p, q) => Math.abs(p.d) - Math.abs(q.d));
    const h1 = hits[0]!;
    const h2 = hits.find(h => Math.abs(cross(h.n, h1.n)) > CROSSING);
    let c = scale(h1.n, h1.d);
    let both = false;
    if (h2) {
      // c · n1 = d1, c · n2 = d2; u ostrého úhlu by roh „skočil“ daleko – pak jen první hrana
      const det = h1.n.x * h2.n.y - h1.n.y * h2.n.x;
      const c2 = { x: (h1.d * h2.n.y - h1.n.y * h2.d) / det, y: (h1.n.x * h2.d - h1.d * h2.n.x) / det };
      if (Math.hypot(c2.x, c2.y) <= 2 * tol) {
        c = c2;
        both = true;
      }
    }
    return { delta: add(delta, c), snapped: true, hits: both ? [h1.target, h2!.target] : [h1.target] };
  }
  // roh na roh
  let best: { c: Pt; q: Pt; e: number } | null = null;
  for (const p0 of moving.pts) {
    const p = add(p0, delta);
    for (const q of targets.pts) {
      const e = dist(p, q);
      if (e <= tol && (!best || e < best.e)) best = { c: sub(q, p), q, e };
    }
  }
  if (best) return { delta: add(delta, best.c), snapped: true, hits: [[best.q, best.q]] };
  // bod na hranu jen u prvku bez rovných hran (kruh, oblouk): bod se dorazí kolmo na nejbližší hranu
  let foot: { c: Pt; t: [Pt, Pt]; e: number } | null = null;
  if (!moving.segs.length) for (const p0 of moving.pts) {
    const p = add(p0, delta);
    for (const { seg: t, u, n, len } of prepared(targets)) {
      const along = dot(sub(p, t[0]), u);
      if (along < 0 || along > len) continue;
      const d = dot(sub(t[0], p), n);
      if (Math.abs(d) <= tol && (!foot || Math.abs(d) < foot.e)) foot = { c: scale(n, d), t, e: Math.abs(d) };
    }
  }
  if (foot) return { delta: add(delta, foot.c), snapped: true, hits: [foot.t] };
  return { delta, snapped: false, hits: [] };
}
