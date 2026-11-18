/**
 * Hrana výstupku / vybrání jako konec volné kóty (rozhodnutí uživatele 2026-11-18 – výstupek se chová jako část
 * stěny). Jediné místo pro všechny čtyři druhy: výstupek a vybrání na stěně (`Floor.protrusions`), výstupek /
 * vybrání v rohu (`cornerProtrusions`), výstupek na konci stěny (`endProtrusions`).
 *
 * Hrany = rovné úseky otevřeného obrysu (oblouky ne; výstupek na obloukové stěně ne). Zadaná délka kóty (posun hrany):
 * - oba konce kóty na témž výstupku → posune se jen hrana (změní se rozměr výstupku),
 * - hrana rovnoběžná se stěnou výstupku na stěně / na konci stěny (čelní) → posune se celá stěna i s výstupkem,
 * - jinak (boční hrana, každá hrana výstupku v rohu, hrana za čelem stěny) → posune se jen hrana; když by tím
 *   změnila zamčený rozměr výstupku, posune se celek: výstupek na stěně po stěně, u rohu stěna, se kterou je hrana
 *   rovnoběžná (výstupek se drží rohu), u konce stěny konec stěny (stěna se prodlouží / zkrátí).
 * Body obrysu na líci zůstanou na líci (posouvají se jen podél něj).
 */
import type { CornerPt, DimEnd, Floor, Id, Node, Pt, ProfilePt } from '../model/types';
import { dot, normal, unit } from './geometry';
import { cornerDims, cornerFrame, cornerOutline, worldToCorner } from './cornerProtrusion';
import { endDims, endFrame, endOutline } from './endProtrusion';
import { cornersOf, protrusionExtent } from './protrusion';
import { protrusionDims, protrusionFits, rescaleArcs } from './protrusionEdit';
import { moveNodeWithRubberBand } from './solver';
import { dimKey, type DimTarget } from './dimLock';
import { parallel, protById, protSeg, type ProtKind } from './dimRefs';

/**
 * Je druhý konec kóty „na témž výstupku“? Hrana téhož výstupku, nebo líc / roh stěny, která výstupek nese
 * (kóta hloubky od líce, rozměr v rohu) – pak se mění jen rozměr výstupku.
 */
export function ownProtEnd(floor: Floor, id: Id, other: DimEnd): boolean {
  if ('prot' in other) return other.prot === id;
  const k = protById(floor, id);
  if (!k) return false;
  const walls = k.kind === 'corner' ? k.p.walls : [k.p.wallId];
  if ('wall' in other) return walls.includes(other.wall);
  if ('node' in other) return walls.some(w => [floor.walls[w]?.a, floor.walls[w]?.b].includes(other.node));
  return false;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Posun bodu na líci po líci (směr `faceDir`) tak, aby ležel na hraně posunuté o `disp` (normála hrany `ne`):
 * průsečík líce s posunutou přímkou hrany – platí i pro šikmé hrany (zkosení). null = hrana rovnoběžná s lícem.
 */
function slideOnFace(disp: Pt, ne: Pt, faceDir: Pt): number | null {
  const den = dot(faceDir, ne);
  return Math.abs(den) < 0.05 ? null : dot(disp, ne) / den;
}

/**
 * Posuny obou koncových bodů hrany `i` (ve výkresu): každý bod jede po své sousední hraně (krajní bod po líci
 * `faceFirst` / `faceLast`), aby sousední hrany zůstaly na svých přímkách – hrana se posune o `disp` kolmo na sebe
 * (jako odsazení hrany v CAD). null = sousední hrana je s posouvanou rovnoběžná (bod by musel z ní sjet).
 */
function edgePointMoves(pts: Pt[], i: number, disp: Pt, faceFirst: Pt, faceLast: Pt): [Pt, Pt] | null {
  const ne = normal(unit(pts[i]!, pts[i + 1]!));
  const last = pts.length - 1;
  const along = (j: number, nb: number, face: Pt): Pt | null => {
    const dir = j === 0 || j === last ? face : unit(pts[j]!, pts[nb]!);
    const t = slideOnFace(disp, ne, dir);
    return t === null ? null : { x: dir.x * t, y: dir.y * t };
  };
  const m0 = along(i, i - 1, faceFirst);
  const m1 = along(i + 1, i + 2, faceLast);
  return m0 && m1 ? [m0, m1] : null;
}

/** Posun celé stěny o (dx, dy) – oba rohy, sousední stěny se protáhnou (jako konec kóty na líci). */
function moveWall(floor: Floor, wallId: Id, dx: number, dy: number): boolean {
  const w = floor.walls[wallId];
  const na = w && floor.nodes[w.a];
  const nb = w && floor.nodes[w.b];
  if (!w || !na || !nb) return false;
  moveNodeWithRubberBand(floor, na, nb, dx, dy);
  moveNodeWithRubberBand(floor, nb, na, dx, dy);
  return true;
}

/** Zamčené rozměry výstupku (hodnoty) – pro rozhodnutí „posune se celek“. */
function lockedDims(floor: Floor, k: ProtKind): Record<string, number> {
  const out: Record<string, number> = {};
  const locks = floor.dimLocks ?? {};
  const vals: Record<string, number> | null = k.kind === 'wall' ? protrusionDims(floor, k.p) : k.kind === 'corner' ? cornerDims(k.p) : endDims(k.p);
  if (!vals) return out;
  for (const [dim, v] of Object.entries(vals)) {
    const t = (k.kind === 'wall'
      ? { kind: 'protrusion-dim', protrusionId: k.p.id, dim }
      : k.kind === 'corner'
      ? { kind: 'corner-dim', protrusionId: k.p.id, dim }
      : { kind: 'end-dim', protrusionId: k.p.id, dim }) as DimTarget;
    if (locks[dimKey(t)]) out[dim] = v;
  }
  return out;
}

/** Obrys ve výkresu (uzavírá se po líci rovně) – pro kontrolu tvaru. */
function worldOutline(floor: Floor, k: ProtKind): Pt[] | null {
  if (k.kind === 'wall') return cornersOf(floor, k.p)?.pts ?? null;
  return k.kind === 'corner' ? cornerOutline(floor, k.p) : endOutline(floor, k.p);
}

function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/**
 * Dává výstupek po posunu smysl? Obrys se nepřetočil (hrany se nepřekřížily), výstupek na stěně se vejde na stěnu
 * a nepřekryje souseda (`protrusionFits`) a má šířku aspoň 10 mm, výstupek v rohu má rozměry aspoň 10 mm,
 * výstupek v rohu / na konci se dál kreslí.
 */
function stillValid(floor: Floor, k: ProtKind, area0: number): boolean {
  const o = worldOutline(floor, k);
  if (!o) return false;
  const a1 = signedArea(o);
  if (Math.sign(a1) !== Math.sign(area0) || Math.abs(a1) < 100) return false;
  if (k.kind === 'wall') {
    const e = protrusionExtent(k.p);
    return e.u1 - e.u0 >= 10 && protrusionFits(floor, k.p);
  }
  if (k.kind === 'corner') {
    const d = cornerDims(k.p);
    return d.a >= 10 && d.b >= 10;
  }
  return true;
}

/**
 * Posune hranu `i` výstupku `id` o (dx, dy) podle pravidel nahoře. `sameElement` = druhý konec kóty je na témž
 * výstupku nebo na jeho stěně. false = nejde (výsledek nedává smysl).
 */
export function moveProtEdge(floor: Floor, id: Id, i: number, dx: number, dy: number, sameElement: boolean): boolean {
  const k = protById(floor, id);
  const sg = protSeg(floor, id, i);
  const o0 = k && worldOutline(floor, k);
  if (!k || !sg || !o0) return false;
  const area0 = signedArea(o0);
  const ed = unit(sg[0], sg[1]);
  const disp = { x: dx, y: dy };

  if (k.kind === 'wall') {
    const c = cornersOf(floor, k.p);
    if (!c) return false;
    const d = unit(floor.nodes[c.w.a]!, floor.nodes[c.w.b]!);
    if (!sameElement && parallel(ed, d)) return moveWall(floor, c.w.id, dx, dy); // čelní hrana
    const du = dot(disp, d);
    const before = k.p.pts;
    const nd = normal(d);
    const edge = (): boolean => {
      const mv = edgePointMoves(c.pts, i, disp, d, d);
      if (!mv) return false;
      const moved = before.map((q, j): ProfilePt => {
        if (j !== i && j !== i + 1) return q;
        const m = mv[j - i]!;
        return { ...q, u: r1(q.u + dot(m, d)), v: r1(q.v + k.p.side * dot(m, nd)) };
      });
      // sousední oblouky se mění s délkou své tětivy (jako při změně šířky výstupku)
      k.p.pts = rescaleArcs(before, moved);
      return true;
    };
    return tryEdgeThenWhole(floor, k, area0, sameElement, edge, () => {
      k.p.pts = before.map(q => ({ ...q, u: r1(q.u + du) }));
      return true;
    }, () => (k.p.pts = before));
  }

  if (k.kind === 'corner') {
    const f = cornerFrame(floor, k.p);
    if (!f) return false;
    const z = worldToCorner(f, { x: 0, y: 0 });
    const before = k.p.pts;
    const last = before.length - 1;
    const edge = (): boolean => {
      // první bod jede po líci první stěny (t = 0), poslední po líci druhé (s = 0)
      const mv = edgePointMoves(o0, i, disp, f.e1, f.e2);
      if (!mv) return false;
      k.p.pts = before.map((q, j): CornerPt => {
        if (j !== i && j !== i + 1) return q;
        const m = worldToCorner(f, mv[j - i]!);
        return { s: j === last ? q.s : r1(q.s + m.s - z.s), t: j === 0 ? q.t : r1(q.t + m.t - z.t) };
      });
      return true;
    };
    // celek: stěna, se kterou je hrana rovnoběžná (výstupek se drží rohu a jede s ní)
    const wid = parallel(ed, f.e1) ? k.p.walls[0] : parallel(ed, f.e2) ? k.p.walls[1] : null;
    return tryEdgeThenWhole(floor, k, area0, sameElement, edge, () => !!wid && moveWall(floor, wid, dx, dy), () => (k.p.pts = before));
  }

  const f = endFrame(floor, k.p);
  if (!f) return false;
  if (!sameElement && parallel(ed, f.e1)) return moveWall(floor, k.p.wallId, dx, dy); // čelní hrana (podél stěny)
  const before = k.p.pts;
  const last = before.length - 1;
  const edge = (): boolean => {
    // krajní body jedou po svém líci (podél stěny)
    const mv = edgePointMoves(o0, i, disp, f.e1, f.e1);
    if (!mv) return false;
    k.p.pts = before.map((q, j) => {
      if (j !== i && j !== i + 1) return q;
      const m = mv[j - i]!;
      return { ...q, s: r1(q.s + dot(m, f.e1)), v: j === 0 || j === last ? q.v : r1(q.v + dot(m, f.n[q.f])) };
    });
    return true;
  };
  // celek: konec stěny se posune podél stěny (stěna se prodlouží / zkrátí), výstupek jede s koncem
  return tryEdgeThenWhole(floor, k, area0, sameElement, edge, () => {
    const w = floor.walls[k.p.wallId];
    const nEnd = w && floor.nodes[k.p.end === 'a' ? w.a : w.b];
    const nOther = w && floor.nodes[k.p.end === 'a' ? w.b : w.a];
    if (!nEnd || !nOther) return false;
    const t = dot(disp, f.e1);
    moveNodeWithRubberBand(floor, nEnd, nOther as Node, f.e1.x * t, f.e1.y * t);
    return true;
  }, () => (k.p.pts = before));
}

/**
 * Nejdřív posun jen hrany; když tím změní zamčený rozměr výstupku (a druhý konec kóty není na témž výstupku),
 * vrátí se a posune se celek. Výsledek musí dávat smysl (`stillValid`), jinak false.
 */
function tryEdgeThenWhole(floor: Floor, k: ProtKind, area0: number, sameElement: boolean, edge: () => boolean, whole: () => boolean, undo: () => void): boolean {
  const locked0 = lockedDims(floor, k);
  const okEdge = edge();
  if (sameElement) return okEdge && stillValid(floor, k, area0);
  const locked1 = lockedDims(floor, k);
  const broke = Object.keys(locked0).some(d => !(d in locked1) || Math.abs(locked1[d]! - locked0[d]!) > 0.5);
  if (!broke) return okEdge && stillValid(floor, k, area0);
  undo();
  return whole() && stillValid(floor, k, area0);
}
