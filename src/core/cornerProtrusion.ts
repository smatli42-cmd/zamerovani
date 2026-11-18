/**
 * Výstupek přes roh dvou rovných stěn (KATALOG-STEN.md I1.11; rozhodnutí uživatele 2026-11-15: vnitřní i vnější
 * roh, i roh u napojení T, drží se rohu; když stěny přestanou tvořit roh, výstupek se jen nekreslí a vrátí se, až roh
 * znovu vznikne). Vybrání v rohu (`mode: 'subtract'`, rozhodnutí uživatele 2026-11-18): stejný prvek, obrys vede
 * tělem obou stěn (vnitřní roh – zářez do obou stěn, vnější roh – ukousnutý / zkosený roh) a plocha se z těl vyřízne.
 *
 * Souřadnice rohu: X = průsečík líců obou stěn, které se v rohu potkávají (vnitřní nebo vnější roh),
 * e1 / e2 = jednotkové směry stěn od rohu; bod p = X + s·e1 + t·e2. Obrys začíná na líci první stěny (t = 0)
 * a končí na líci druhé (s = 0) – kreslí se dvěma čarami přes vnitřní roh, třemi a více kolem vnějšího.
 * Při posunu stěn nebo změně tloušťky se X i směry přepočítají, výstupek zůstane přilepený na lících se stejnými
 * rozměry.
 */
import type { CornerProtrusion, CornerPt, Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { faceOffset, findFaceNear, wallFrame } from './protrusion';
import { hasBody } from './wallFace';
import { findBodyAt, pointInPolygon, wallBodies, type WallBody } from './wallBody';

/** Výstupky přes roh podlaží (pole chybí u starších dat). */
export const cornerProtrusionsOf = (floor: Floor): CornerProtrusion[] => Object.values(floor.cornerProtrusions ?? {});

export interface CornerFrame {
  /** Průsečík líců v rohu. */
  X: Pt;
  e1: Pt;
  e2: Pt;
}

type CornerKey = Pick<CornerProtrusion, 'node' | 'walls' | 'sides' | 'dirs' | 'mode'>;

/**
 * Rovná stěna s tělem v rohu `node`: buď v něm končí (směr od rohu ke vzdálenému konci), nebo je roh napojený
 * doprostřed ní (T bez dělení, směr `dir` vůči a→b). Vrací směr od rohu a bod líce `side` na přímce stěny.
 */
function wallAt(floor: Floor, w: Wall | undefined, node: Id, dir: 1 | -1, side: 1 | -1): { d: Pt; p: Pt } | null {
  if (!w || !hasBody(w) || w.sagitta) return null;
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || dist(a, b) < 1) return null;
  const ab = unit(a, b);
  let d: Pt;
  if (w.a === node) d = ab;
  else if (w.b === node) d = scale(ab, -1);
  else if (floor.nodes[node]?.host === w.id) d = scale(ab, dir);
  else return null;
  // přímka líce: osa stěny posunutá o faceOffset podél normal(a→b) – i u napojeného rohu, který leží na líci
  return { d, p: add(a, scale(normal(ab), faceOffset(w, side))) };
}

/** Souřadnice rohu; null = stěny už rohem nejsou (smazané, rozpojené, oblouk, bez tloušťky, v přímce). */
export function cornerFrame(floor: Floor, cp: CornerKey): CornerFrame | null {
  if (cp.walls[0] === cp.walls[1]) return null;
  const one = wallAt(floor, floor.walls[cp.walls[0]], cp.node, cp.dirs[0], cp.sides[0]);
  const two = wallAt(floor, floor.walls[cp.walls[1]], cp.node, cp.dirs[1], cp.sides[1]);
  if (!one || !two) return null;
  const den = one.d.x * two.d.y - one.d.y * two.d.x;
  if (Math.abs(den) < 1e-6) return null; // stěny v přímce – žádný roh
  const wq = sub(two.p, one.p);
  const k = (wq.x * two.d.y - wq.y * two.d.x) / den;
  return { X: add(one.p, scale(one.d, k)), e1: one.d, e2: two.d };
}

export const cornerToWorld = (f: CornerFrame, q: CornerPt): Pt => add(f.X, add(scale(f.e1, q.s), scale(f.e2, q.t)));

export function worldToCorner(f: CornerFrame, p: Pt): CornerPt {
  const v = sub(p, f.X);
  const den = f.e1.x * f.e2.y - f.e1.y * f.e2.x;
  return { s: (v.x * f.e2.y - v.y * f.e2.x) / den, t: (f.e1.x * v.y - f.e1.y * v.x) / den };
}

/**
 * Je roh pořád roh? V místě X musí být volno (žádné tělo stěny – např. třetí stěna dodatečně napojená do rohu)
 * a pod oběma úseky líců od X k obrysu musí být tělo své stěny. U vybrání naopak: plocha u X i podél líců leží
 * v tělech obou stěn rohu. `bodies` = těla stěn (při jejich výpočtu se předávají rozpracovaná, jinak se spočítají).
 */
function cornerValid(cp: CornerKey & { pts: CornerPt[] }, f: CornerFrame, bodies: Map<Id, WallBody>): boolean {
  const pts = cp.pts.map(q => cornerToWorld(f, q));
  const area = [f.X, ...pts];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const recess = cp.mode === 'subtract';
  const polys = [...bodies.values()].map(b => b.poly);
  const own = [bodies.get(cp.walls[0])?.poly, bodies.get(cp.walls[1])?.poly].filter((p): p is Pt[] => !!p);
  // bod plochy výstupku těsně u X (u vnitřního rohu mezi stěnami, u vnějšího vně; u vybrání v těle stěn rohu)
  const diag = add(f.e1, f.e2);
  const near = [add(f.X, scale(diag, 3)), add(f.X, scale(diag, -3))].find(q => pointInPolygon(q, area));
  if (!near) return false;
  if (recess ? !own.some(p => pointInPolygon(near, p)) : polys.some(p => pointInPolygon(near, p))) return false;
  if (recess) {
    // naproti vybrání (u vnitřního rohu v místnosti) je volno – třetí stěna napojená do rohu roh ruší
    const sg = dot(sub(near, f.X), diag) > 0 ? -1 : 1;
    for (const [a, b] of [[5, 20], [20, 5], [15, 15]] as const) {
      const opp = add(f.X, scale(add(scale(f.e1, a), scale(f.e2, b)), sg));
      if (polys.some(p => pointInPolygon(opp, p))) return false;
    }
    // obrys vede tělem stěn rohu (po zúžení stěny pod hloubku vybrání by ji prořízl – pak se nekreslí)
    const inOwn = (q: Pt) => own.some(p => pointInPolygon(q, p) || onBoundary(q, p));
    for (let i = 0; i + 1 < pts.length; i++) {
      if (!inOwn(scale(add(pts[i]!, pts[i + 1]!), 0.5))) return false;
      if (i > 0 && !inOwn(pts[i]!)) return false;
    }
  }
  // do plochy výstupku nesmí zasahovat tělo jiné stěny (třetí stěna napojená do rohu): rohy a body na hranách těla
  for (const b of bodies.values()) {
    if (b.wallId === cp.walls[0] || b.wallId === cp.walls[1]) continue;
    const n = b.poly.length;
    for (let k = 0; k < n; k++) {
      const p = b.poly[k]!;
      const q = b.poly[(k + 1) % n]!;
      for (const t of [0, 0.25, 0.5, 0.75]) {
        const s = add(p, scale(sub(q, p), t));
        if (pointInPolygon(s, area) && !onBoundary(s, area)) return false;
      }
    }
  }
  for (const [i, end, e] of [
    [0, first, f.e1],
    [1, last, f.e2]
  ] as const) {
    const body = bodies.get(cp.walls[i]);
    if (!body || dist(f.X, end) < 1) return false;
    const mid = scale(add(f.X, end), 0.5);
    const n = normal(e);
    // výstupek: tělo je na straně mimo plochu; vybrání: plocha leží v těle
    const out = [add(mid, n), add(mid, scale(n, -1))].find(q => pointInPolygon(q, area) === recess);
    if (!out || !pointInPolygon(out, body.poly)) return false;
  }
  return true;
}

/** Leží bod na obvodu mnohoúhelníku (do 1 mm)? */
function onBoundary(p: Pt, poly: readonly Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const d = sub(poly[(i + 1) % poly.length]!, a);
    const len2 = dot(d, d);
    const t = len2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / len2)) : 0;
    if (dist(p, add(a, scale(d, t))) < 1) return true;
  }
  return false;
}

/** Obrys (nakreslená lomená čára) ve výkresu; null = roh už neexistuje (výstupek se nekreslí). */
export function cornerOutline(floor: Floor, cp: CornerProtrusion, bodies?: Map<Id, WallBody>): Pt[] | null {
  const f = cornerFrame(floor, cp);
  if (!f || !cornerValid(cp, f, bodies ?? wallBodies(floor))) return null;
  return cp.pts.map(q => cornerToWorld(f, q));
}

/** Plocha výstupku: obrys uzavřený přes roh X (podél obou líců). */
export function cornerPolygon(floor: Floor, cp: CornerProtrusion, bodies?: Map<Id, WallBody>): Pt[] | null {
  const outline = cornerOutline(floor, cp, bodies);
  const f = outline && cornerFrame(floor, cp);
  return outline && f ? [f.X, ...outline] : null;
}

/** Rozměry: délka podél líce první stěny (`a`) a druhé stěny (`b`) od rohu. */
export function cornerDims(cp: CornerProtrusion): { a: number; b: number } {
  return { a: cp.pts[0]!.s, b: cp.pts[cp.pts.length - 1]!.t };
}

/**
 * Změní rozměr podél líce první (`a`) / druhé (`b`) stěny: kladné souřadnice s (resp. t) se zvětší v poměru
 * (u vnějšího rohu zůstane obtočení na druhé straně stejné). false = nesmyslná hodnota.
 */
export function setCornerDim(floor: Floor, id: Id, dim: 'a' | 'b', value: number): boolean {
  const cp = floor.cornerProtrusions?.[id];
  if (!cp || !Number.isFinite(value) || value < 10) return false;
  const cur = cornerDims(cp)[dim];
  if (cur < 1e-6) return false;
  const k = value / cur;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  cp.pts = cp.pts.map(q => (dim === 'a' ? { s: q.s > 0 ? r1(q.s * k) : q.s, t: q.t } : { s: q.s, t: q.t > 0 ? r1(q.t * k) : q.t }));
  return true;
}

/** Roh dvou stěn: společný konec, nebo konec jedné napojený doprostřed druhé (T bez dělení). */
function commonNode(floor: Floor, w1: Wall, w2: Wall): Id | null {
  for (const n of [w1.a, w1.b]) if (n === w2.a || n === w2.b) return n;
  for (const n of [w1.a, w1.b]) if (floor.nodes[n]?.host === w2.id) return n;
  for (const n of [w2.a, w2.b]) if (floor.nodes[n]?.host === w1.id) return n;
  return null;
}

/**
 * Lomená čára nakreslená čarami: začíná na líci jedné stěny a končí na líci druhé stěny téhož rohu (i u napojení T),
 * oba líce se v rohu potkávají (vnitřní nebo vnější roh) a čára vede celá mimo těla stěn → výstupek přes roh, celá
 * v tělech stěn → vybrání v rohu (stačí i jedna čára – zkosení vnějšího rohu). Jinak null.
 */
export function cornerFromPolyline(floor: Floor, pts: readonly Pt[], tol = 1.5): Omit<CornerProtrusion, 'id' | 'name' | 'material' | 'note'> | null {
  if (pts.length < 2) return null;
  const s = findFaceNear(floor, pts[0]!, tol, undefined, true);
  const e = findFaceNear(floor, pts[pts.length - 1]!, tol, undefined, true);
  if (!s || !e || s.wall.id === e.wall.id) return null;
  const node = commonNode(floor, s.wall, e.wall);
  const c = node && floor.nodes[node];
  if (!node || !c) return null;
  // směr podél průběžné stěny (T): ke straně, na které leží začátek / konec čáry
  const dirOf = (w: Wall, p: Pt): 1 | -1 => {
    const a = floor.nodes[w.a]!;
    const b = floor.nodes[w.b]!;
    return dot(sub(p, c), unit(a, b)) >= 0 ? 1 : -1;
  };
  const base: CornerKey = {
    node,
    walls: [s.wall.id, e.wall.id],
    sides: [s.side, e.side],
    dirs: [dirOf(s.wall, pts[0]!), dirOf(e.wall, pts[pts.length - 1]!)]
  };
  const f = cornerFrame(floor, base);
  if (!f) return null;
  const q = pts.map(p => worldToCorner(f, p));
  // začátek na líci první stěny (t = 0), konec na líci druhé (s = 0), oba od rohu dál
  if (Math.abs(q[0]!.t) > tol || Math.abs(q[q.length - 1]!.s) > tol || q[0]!.s < 10 || q[q.length - 1]!.t < 10) return null;
  q[0] = { s: q[0]!.s, t: 0 };
  q[q.length - 1] = { s: 0, t: q[q.length - 1]!.t };
  // čára vede celá mimo těla stěn (výstupek), nebo celá v tělech (vybrání): vnitřní body i středy úseků
  const inBody: boolean[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    inBody.push(!!findBodyAt(floor, scale(add(pts[i]!, pts[i + 1]!), 0.5)));
    if (i > 0) inBody.push(!!findBodyAt(floor, pts[i]!));
  }
  const recess = inBody.every(Boolean);
  if (!recess && inBody.some(Boolean)) return null;
  // výstupek aspoň dvěma čarami (jedna čára přes vnitřní roh zůstane čarou)
  if (!recess && pts.length < 3) return null;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const out = { ...base, ...(recess ? { mode: 'subtract' as const } : {}), pts: q.map(p => ({ s: r1(p.s), t: r1(p.t) })) };
  // líce se v X opravdu potkávají a roh je volný (jinak by obrys vedl přes tělo)
  return cornerValid(out, f, wallBodies(floor)) ? out : null;
}

/** Úsek líce stěny `i` (0 / 1) zakrytý výstupkem: od rohu X po začátek / konec obrysu (body ve výkresu). */
export function cornerFaceCover(floor: Floor, cp: CornerProtrusion, i: 0 | 1): [Pt, Pt] | null {
  const f = cornerFrame(floor, cp);
  if (!f) return null;
  const q = i === 0 ? cp.pts[0]! : cp.pts[cp.pts.length - 1]!;
  return [f.X, cornerToWorld(f, q)];
}

/**
 * O kolik mm přečnívá konec obrysu výstupků přes roh na líci stěny `wallId` za její osu (0…délka) – pro pravidlo
 * „prvky nesené stěnou při změně délky zůstanou na místě; když se nevejdou, úprava se neprovede“.
 */
export function cornerOverhang(floor: Floor, wallId: Id): number {
  const w = floor.walls[wallId];
  const fr = w && wallFrame(floor, w);
  if (!fr) return 0;
  let out = 0;
  for (const cp of cornerProtrusionsOf(floor)) {
    const i = cp.walls.indexOf(wallId);
    const cover = i >= 0 ? cornerFaceCover(floor, cp, i as 0 | 1) : null;
    if (!cover) continue;
    // přečnívání jen ve směru od rohu (u vnějšího rohu leží roh X i krátký obrys před začátkem osy – to nevadí)
    const uX = fr.project(cover[0]).u;
    const u = fr.project(cover[1]).u;
    out = Math.max(out, u < uX ? -u : u - fr.len);
  }
  return out;
}
