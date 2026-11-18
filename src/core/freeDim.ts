/**
 * Volná kóta mezi dvěma body (POZADAVKY.md 3; rozhodnutí uživatele 2026-11-18): řídicí – zadaná délka posune
 * zvolený konec ve směru kóty; vzniká nástrojem Kóta dvěma ťuknutími, odsazení se upraví tažením.
 * Všechna pravidla volné kóty jsou tady (konce, hodnota, posun konce, úklid po smazání prvků).
 *
 * Konec kóty (`DimEnd`) jede s prvkem, na který je napojený:
 * - roh stěny: posun konce = posun rohu jako při změně délky stěny (řešič „gumička“, core/solver.ts) – volné
 *   větve jedou s ním, kolmé sousední stěny zůstanou kolmé; když druhý konec není roh, posune se celá skupina stěn,
 * - bod kresby: oba konce na téže kresbě → posune se jen ten bod (obdélník zůstane obdélníkem); jinak celá kresba,
 * - pevný bod: posune se jen bod.
 */
import type { DimEnd, Drawing, Floor, FreeDim, Id, Node, Pt } from '../model/types';
import { add, dist, dot, normal, projectToSegment, scale, sub } from './geometry';
import { moveDrawingVertex, placeDrawing } from './drawing';
import { moveNodeWithRubberBand } from './solver';

export const freeDimsOf = (floor: Floor): FreeDim[] => Object.values(floor.dims ?? {});

/** Poloha konce kóty ve výkresu; null = prvek už neexistuje. */
export function endPoint(floor: Floor, e: DimEnd): Pt | null {
  if ('node' in e) {
    const n = floor.nodes[e.node];
    return n ? { x: n.x, y: n.y } : null;
  }
  if ('drawing' in e) {
    const q = floor.drawings?.[e.drawing]?.pts[e.i];
    return q ? { x: q.x, y: q.y } : null;
  }
  return { x: e.x, y: e.y };
}

/** Body kóty [a, b]; null = některý konec zanikl. */
export function dimPoints(floor: Floor, d: FreeDim): [Pt, Pt] | null {
  const a = endPoint(floor, d.a);
  const b = endPoint(floor, d.b);
  return a && b ? [a, b] : null;
}

/** Délka kóty (mm); null = kóta neexistuje. */
export function freeDimValue(floor: Floor, id: Id): number | null {
  const d = floor.dims?.[id];
  const pts = d && dimPoints(floor, d);
  return pts ? dist(pts[0], pts[1]) : null;
}

/** Kótovací čára (body posunuté o odsazení); null = kóta se nekreslí. */
export function dimLine(floor: Floor, d: FreeDim): [Pt, Pt] | null {
  const pts = dimPoints(floor, d);
  if (!pts || dist(pts[0], pts[1]) < 1e-6) return null;
  const n = normal(scale(sub(pts[1], pts[0]), 1 / dist(pts[0], pts[1])));
  const o = scale(n, d.offset);
  return [add(pts[0], o), add(pts[1], o)];
}

/** Kóta, jejíž kótovací čára leží do `tol` od bodu (nejbližší). */
export function pickFreeDim(floor: Floor, p: Pt, tol: number): Id | null {
  let best: Id | null = null;
  let bestD = tol;
  for (const d of freeDimsOf(floor)) {
    const line = dimLine(floor, d);
    if (!line) continue;
    const h = projectToSegment(p, line[0], line[1]).distance;
    if (h <= bestD) {
      best = d.id;
      bestD = h;
    }
  }
  return best;
}

/** Odsazení kóty podle bodu p (kolmá vzdálenost od spojnice bodů se znaménkem, po 10 mm). */
export function offsetTowards(floor: Floor, d: FreeDim, p: Pt): number | null {
  const pts = dimPoints(floor, d);
  if (!pts || dist(pts[0], pts[1]) < 1e-6) return null;
  const n = normal(scale(sub(pts[1], pts[0]), 1 / dist(pts[0], pts[1])));
  return Math.round(dot(sub(p, pts[0]), n) / 10) * 10;
}

/**
 * Konec kóty pod bodem p: roh stěny, bod kresby (vrchol / střed kruhu) do vzdálenosti `tol`, jinak pevný bod `free`
 * (už přichycený bod výkresu).
 */
export function endAt(floor: Floor, p: Pt, tol: number, free: Pt = p): DimEnd {
  let best: DimEnd | null = null;
  let bestD = tol;
  for (const n of Object.values(floor.nodes)) {
    const dd = dist(n, p);
    if (dd <= bestD) {
      best = { node: n.id };
      bestD = dd;
    }
  }
  if (best) return best;
  for (const dr of Object.values(floor.drawings ?? {})) {
    dr.pts.forEach((q, i) => {
      const dd = dist(q, p);
      if (dd <= bestD) {
        best = { drawing: dr.id, i };
        bestD = dd;
      }
    });
  }
  return best ?? { x: Math.round(free.x * 10) / 10, y: Math.round(free.y * 10) / 10 };
}

/** Jsou dva konce tentýž bod? */
export function sameEnd(a: DimEnd, b: DimEnd): boolean {
  if ('node' in a) return 'node' in b && a.node === b.node;
  if ('drawing' in a) return 'drawing' in b && a.drawing === b.drawing && a.i === b.i;
  return !('node' in b) && !('drawing' in b) && a.x === b.x && a.y === b.y;
}

/** Popis konce (panel, NumPad). */
export function endLabel(e: DimEnd): string {
  if ('node' in e) return 'roh stěny';
  if ('drawing' in e) return 'bod kresby';
  return 'bod výkresu';
}

/**
 * Nastaví délku kóty posunem konce `move` ve směru kóty (mění `floor`). false = nejde (nulová délka, konec
 * zanikl, výsledek nesedí – např. posunem rohu obdélníku kresby se pohne i druhý konec).
 */
export function setFreeDimLength(floor: Floor, id: Id, value: number, move: 'a' | 'b'): boolean {
  const d = floor.dims?.[id];
  const pts = d && dimPoints(floor, d);
  if (!d || !pts || !Number.isFinite(value) || value < 1) return false;
  const [pa, pb] = pts;
  const cur = dist(pa, pb);
  if (cur < 1) return false; // bez směru
  const moving = move === 'a' ? d.a : d.b;
  const fixed = move === 'a' ? d.b : d.a;
  const from = move === 'a' ? pa : pb;
  const to = move === 'a' ? pb : pa;
  const delta = value - cur;
  if (Math.abs(delta) < 0.05) return true;
  const u = scale(sub(from, to), 1 / cur); // od pevného konce k posouvanému
  const dx = u.x * delta;
  const dy = u.y * delta;
  if ('node' in moving) {
    const n = floor.nodes[moving.node];
    if (!n) return false;
    // pevný konec, který není roh: pomocný „roh“ mimo graf – posune se vše, co visí na posouvaném rohu
    const anchor: Node = 'node' in fixed && floor.nodes[fixed.node] ? floor.nodes[fixed.node]! : { id: '\u0000kotva', x: to.x, y: to.y };
    if (anchor.id === n.id) return false;
    moveNodeWithRubberBand(floor, n, anchor, dx, dy);
  } else if ('drawing' in moving) {
    const dr: Drawing | undefined = floor.drawings?.[moving.drawing];
    const q = dr?.pts[moving.i];
    if (!dr || !q) return false;
    if ('drawing' in fixed && fixed.drawing === moving.drawing) moveDrawingVertex(dr, moving.i, { x: q.x + dx, y: q.y + dy });
    else
      placeDrawing(
        dr,
        dr.pts.map(p => ({ x: p.x, y: p.y })),
        dx,
        dy
      );
  } else {
    moving.x = Math.round((moving.x + dx) * 10) / 10;
    moving.y = Math.round((moving.y + dy) * 10) / 10;
  }
  const after = freeDimValue(floor, id);
  return after !== null && Math.abs(after - value) < 0.5;
}

/**
 * Po úpravě výkresu `before` → `after`: konce kót, jejichž roh nebo bod kresby zmizel či se přečísloval, se znovu
 * napojí (jedno místo pro všechny operace – Do rohu, sloučení rovných stěn, spojení / obrácení čáry kresby…):
 * - roh: roh ve stejném místě → ten roh; když místem dál vede stěna (sloučení rovného pokračování) → pevný bod;
 *   jinak kóta zanikne. (Do rohu / K hraně přepojí konec stěny výslovně – `remapDimNode` v core/trimExtend.ts.)
 * - bod kresby: na svém místě je dál → beze změny; jinak vrchol kresby (přednostně téže) ve stejném místě; když
 *   vrchol jen posunul (úchyt), zůstane.
 */
export function rescueFreeDims(before: Floor | undefined, after: Floor): void {
  if (!before || !after.dims) return;
  const near = (p: Pt, q: Pt, tol = 0.5) => dist(p, q) <= tol;
  for (const d of freeDimsOf(after)) {
    for (const k of ['a', 'b'] as const) {
      const e = d[k];
      if ('node' in e && !after.nodes[e.node]) {
        const old = before.nodes[e.node];
        if (!old) continue;
        const same = Object.values(after.nodes).find(n => near(n, old, 1));
        if (same) d[k] = { node: same.id };
        else if (wallThrough(after, old)) d[k] = { x: old.x, y: old.y };
      } else if ('drawing' in e) {
        const old = before.drawings?.[e.drawing]?.pts[e.i];
        const now = after.drawings?.[e.drawing]?.pts[e.i];
        if (!old || (now && near(now, old))) continue;
        const own = after.drawings?.[e.drawing];
        const cands = [...(own ? [own] : []), ...Object.values(after.drawings ?? {}).filter(x => x.id !== e.drawing)];
        let hit: DimEnd | null = null;
        for (const dr of cands) {
          const i = dr.pts.findIndex(q => near(q, old));
          if (i >= 0) {
            hit = { drawing: dr.id, i };
            break;
          }
        }
        // vrchol se jen posunul (úchyt, posun kresby) → kóta jde s ním
        if (hit && !(now && 'drawing' in hit && hit.drawing === e.drawing && hit.i === e.i)) d[k] = hit;
      }
    }
  }
}

/** Vede bodem (do 1 mm) osa některé rovné stěny? */
function wallThrough(floor: Floor, p: Pt): boolean {
  return Object.values(floor.walls).some(w => {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    return !!a && !!b && !w.sagitta && w.radius === undefined && projectToSegment(p, a, b).distance <= 1;
  });
}

/** Úklid: kóty, jejichž konec zanikl (smazaný roh, kresba, bod kresby), se smažou. */
export function pruneFreeDims(floor: Floor): void {
  if (!floor.dims) return;
  for (const d of freeDimsOf(floor)) if (!dimPoints(floor, d)) delete floor.dims[d.id];
  if (Object.keys(floor.dims).length === 0) delete floor.dims;
}

/** Roh `from` sloučený do rohu `to` (přetažení rohu na roh): kóty přejdou na spojený roh. */
export function remapDimNode(floor: Floor, from: Id, to: Id): void {
  for (const d of freeDimsOf(floor)) {
    for (const k of ['a', 'b'] as const) {
      const e = d[k];
      if ('node' in e && e.node === from) d[k] = { node: to };
    }
  }
}
