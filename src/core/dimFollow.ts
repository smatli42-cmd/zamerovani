/**
 * Zamčená volná kóta = pevné spojení (rozhodnutí uživatele 2026-11-18, KOTY-ZAMEK-EXPORT.md): když se úpravou
 * pohne prvek na jednom konci zamčené volné kóty, prvek na druhém konci se posune s ním (posun konce ve směru kóty
 * jako při zadání délky, core/freeDim.ts), i přes víc kót za sebou. Jediné místo pravidla – volá ho `store.edit`
 * po každé úpravě, před kontrolou zámků (`lockViolation`); co se dorovnat nedá, kontrola zámků dál zastaví.
 *
 * Který konec se posune s druhým (rozhodnutí uživatele):
 * - kresba (bod, úsek) ✔ – celá kresba (oba konce na téže kresbě: jen bod / úsek, u dvojité čáry šířka / konec),
 * - okraj otvoru ✔ – otvor po své stěně (jen když kóta vede podél stěny, jinak se délka nedorovná → zámek zastaví),
 * - roh stěny, líc stěny ✔ – roh / celá stěna (sousední stěny se protáhnou),
 * - pevný bod výkresu ✗ – zůstává (zámek zastaví).
 * Posouvá se jen konec, který se úpravou nepohnul; když se pohnuly oba (posun celé skupiny), kóta se nedorovnává.
 */
import type { DimEnd, Floor, Id, Pt } from '../model/types';
import { openingSpan, openingStartFromA, wallLength } from './floorQueries';
import { dimKey } from './dimLock';
import { refGeom } from './dimRefs';
import { freeDimValue, freeDimsOf, setFreeDimLength } from './freeDim';
import { dist } from './geometry';

/**
 * Pohnulo dorovnání něčím, co změnila sama úprava (`before` → `edited`)? Pak by se zadaná úprava přepsala
 * (např. obdélník zamčený ke dvěma protilehlým stěnám posune celou místnost) – úprava se musí zastavit.
 * Hlídá rohy stěn, body kreseb a polohy / šířky otvorů.
 */
export function followDisturbsEdit(before: Floor, edited: Floor, after: Floor, allowKey?: string): boolean {
  const same = (p: Pt | undefined, q: Pt | undefined) => !p || !q || dist(p, q) < 0.05;
  const num = (x: number | null, y: number | null) => x === null || y === null || Math.abs(x - y) < 0.05;
  // rohy a body kreseb, které úprava posunula
  for (const n of Object.values(edited.nodes)) if (!same(before.nodes[n.id], n) && !same(n, after.nodes[n.id])) return true;
  for (const dr of Object.values(edited.drawings ?? {})) {
    const d0 = before.drawings?.[dr.id];
    const d1 = after.drawings?.[dr.id];
    if (!d0 || !d1) continue;
    if (dr.pts.some((p, i) => !same(d0.pts[i], p)) && dr.pts.some((p, i) => !same(p, d1.pts[i]))) return true;
  }
  // délky stěn a volné kóty, které úprava změnila
  for (const w of Object.values(edited.walls)) {
    const len = (fl: Floor) => (fl.walls[w.id] ? straightLen(fl, fl.walls[w.id]!.a, fl.walls[w.id]!.b) : null);
    if (!num(len(before), len(edited)) && !num(len(edited), len(after))) return true;
  }
  for (const d of freeDimsOf(edited)) {
    // zamčené kóty dorovnání právě vrací (kromě té, kterou uživatel přepisuje)
    const key = dimKey({ kind: 'free-dim', dimId: d.id, move: 'b' });
    if (before.dimLocks?.[key] && key !== allowKey) continue;
    const v = freeDimValue(edited, d.id);
    if (!num(freeDimValue(before, d.id), v) && !num(v, freeDimValue(after, d.id))) return true;
  }
  // otvory, které úprava posunula ve výkresu
  for (const o of Object.values(edited.openings)) {
    const p0 = openingPos(before, o.id);
    const p1 = openingPos(edited, o.id);
    const p2 = openingPos(after, o.id);
    if (p0 && p1 && p2 && (!same(p0[0], p1[0]) || !same(p0[1], p1[1])) && (!same(p1[0], p2[0]) || !same(p1[1], p2[1]))) return true;
  }
  return false;
}

const straightLen = (fl: Floor, a: Id, b: Id): number | null => {
  const na = fl.nodes[a];
  const nb = fl.nodes[b];
  return na && nb ? dist(na, nb) : null;
};

/** Okraje otvoru ve výkresu (po čáře stěny); null = otvor / stěna neexistuje. */
function openingPos(fl: Floor, id: Id): [Pt, Pt] | null {
  const o = fl.openings[id];
  const w = o && fl.walls[o.wallId];
  const a = w && fl.nodes[w.a];
  const b = w && fl.nodes[w.b];
  if (!o || !w || !a || !b) return null;
  const len = dist(a, b);
  if (len < 1) return null;
  const s = openingStartFromA(o, wallLength(fl, w));
  const at = (u: number): Pt => ({ x: a.x + ((b.x - a.x) * u) / len, y: a.y + ((b.y - a.y) * u) / len });
  return [at(s), at(s + openingSpan(o))];
}

/** Smí se konec posunout se zamčenou kótou? (pevný bod ne) */
const follows = (e: DimEnd): boolean => !('x' in e);

/** Pohnul se konec mezi `before` a `after`? (bod: poloha; hrana: přímka – směr nebo kolmá poloha) */
function endMoved(before: Floor, after: Floor, e: DimEnd): boolean {
  const g0 = refGeom(before, e);
  const g1 = refGeom(after, e);
  if (!g0 || !g1) return false;
  if (g0.kind === 'point' || g1.kind === 'point') return dist(g0.p, g1.p) > 0.05;
  const cross = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x;
  if (Math.abs(cross(g0.d, g1.d)) > 1e-6) return true;
  return Math.abs(cross(g0.d, { x: g1.p.x - g0.p.x, y: g1.p.y - g0.p.y })) > 0.05;
}

/**
 * Dorovná zamčené volné kóty, jejichž délku úprava `before` → `floor` změnila, posunem konce, který se nepohnul.
 * `allowKey` = kóta, kterou uživatel právě přepisuje (nedorovnává se). Vrací, zda se něco posunulo.
 */
export function followLockedDims(before: Floor | undefined, floor: Floor, allowKey?: string): boolean {
  if (!before?.dimLocks) return false;
  let any = false;
  const done = new Set<Id>();
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (const d of freeDimsOf(floor)) {
      const key = dimKey({ kind: 'free-dim', dimId: d.id, move: 'b' });
      if (done.has(d.id) || key === allowKey || !before.dimLocks[key] || !floor.dimLocks?.[key]) continue;
      const v0 = freeDimValue(before, d.id);
      const v1 = freeDimValue(floor, d.id);
      if (v0 === null || v1 === null || Math.abs(v1 - v0) < 0.05) continue;
      const movedA = endMoved(before, floor, d.a);
      const movedB = endMoved(before, floor, d.b);
      if (movedA === movedB) continue; // pohnuly se oba (nebo žádný) – nedorovnává se
      const k = movedA ? 'b' : 'a';
      if (!follows(d[k])) continue;
      done.add(d.id); // každá kóta se dorovnává nejvýš jednou (řetěz kót bez zacyklení)
      if (setFreeDimLength(floor, d.id, v0, k)) {
        changed = true;
        any = true;
      }
    }
    if (!changed) break;
  }
  return any;
}
