/**
 * Zkrátit / prodloužit do rohu (KATALOG-STEN.md D3, samostatný nástroj).
 *
 * Uživatel ťukne na dvě rovné stěny – vždy na tu část, která má zůstat. Referenční čáry obou stěn
 * (líc nebo osa, podle `Wall.axis`) se protnou v bodě X; u každé stěny se konec na „odvrácené“ straně
 * od ťuknutí přesune do X (zkrácení), případně se konec bližší k X prodlouží až do X. Oba konce pak
 * sdílejí jeden roh, takže se stěny napojí do rohu (tělo podle core/wallBody.ts).
 *
 * - Přesouvá se jen konec této stěny: roh sdílený s dalšími stěnami se pro ni oddělí (sousedé zůstanou).
 * - Otvory a výstupky drží svou polohu ve výkresu; ty, které leží v odříznuté části, se smažou (F4).
 * - Změřená délka se zruší (stěna má jinou délku – je zase jen náčrt).
 */
import { newId } from '../model/factory';
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, scale, sub } from './geometry';
import { isCurved, openingSpan, openingStartFromA, wallNodes } from './floorQueries';

export type TrimResult = 'ok' | 'curved' | 'parallel' | 'same' | 'tooShort' | 'joined';

const MIN_LEN = 10; // mm – kratší stěna po úpravě se nepřipustí

interface Plan {
  wall: Wall;
  end: 'a' | 'b';
}

/** Který konec stěny se přesune do bodu X, když uživatel ťukl do místa `keep`. null = už v X leží. */
function planEnd(wall: Wall, a: Pt, b: Pt, x: Pt, keep: Pt): Plan | null {
  const d = sub(b, a);
  const len2 = dot(d, d);
  const tx = dot(sub(x, a), d) / len2;
  const tk = dot(sub(keep, a), d) / len2;
  if (dist(a, x) < 1 || dist(b, x) < 1) return null; // konec už v rohu je
  // X mimo stěnu → prodlouží se bližší konec; X na stěně → odřízne se část, na kterou se neťuklo
  const end: 'a' | 'b' = tx <= 0 ? 'a' : tx >= 1 ? 'b' : tk < tx ? 'b' : 'a';
  return { wall, end };
}

/** Průsečík dvou přímek (p + s·d, q + t·e); null = rovnoběžné. */
function intersect(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9 * Math.hypot(d.x, d.y) * Math.hypot(e.x, e.y)) return null;
  const s = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return add(p, scale(d, s));
}

/** Bod rohu, do kterého by se stěny napojily (pro náhled nástroje); null = nejde. */
export function trimCorner(floor: Floor, w1: Id, w2: Id): Pt | null {
  const A = floor.walls[w1];
  const B = floor.walls[w2];
  if (!A || !B || w1 === w2 || isCurved(A) || isCurved(B)) return null;
  const n1 = wallNodes(floor, A);
  const n2 = wallNodes(floor, B);
  if (!n1 || !n2) return null;
  return intersect(n1[0], sub(n1[1], n1[0]), n2[0], sub(n2[1], n2[0]));
}

/**
 * Zkrátí / prodlouží stěny `w1` a `w2` do společného rohu. `keep1` / `keep2` = místa ťuknutí (část, která zůstane).
 * Mění `floor` jen při výsledku 'ok'.
 */
export function trimExtendToCorner(floor: Floor, w1: Id, keep1: Pt, w2: Id, keep2: Pt): TrimResult {
  if (w1 === w2) return 'same';
  const A = floor.walls[w1];
  const B = floor.walls[w2];
  if (!A || !B) return 'same';
  if (isCurved(A) || isCurved(B)) return 'curved';
  const x0 = trimCorner(floor, w1, w2);
  if (!x0) return 'parallel';
  const x = { x: Math.round(x0.x), y: Math.round(x0.y) };
  const n1 = wallNodes(floor, A)!;
  const n2 = wallNodes(floor, B)!;
  const plans = [planEnd(A, n1[0], n1[1], x, keep1), planEnd(B, n2[0], n2[1], x, keep2)];

  // kontrola délek předem (nic se nezmění, když by některá stěna zmizela)
  for (const pl of plans) {
    if (!pl) continue;
    const n = wallNodes(floor, pl.wall)!;
    const fixed = pl.end === 'a' ? n[1] : n[0];
    if (dist(fixed, x) < MIN_LEN) return 'tooShort';
  }

  // společný roh: existující konec některé ze stěn v X, jinak nový
  const existing = [n1[0], n1[1], n2[0], n2[1]].find(p => dist(p, x) < 1);
  let cornerId: Id;
  if (existing) cornerId = existing.id;
  else {
    cornerId = newId('n');
    floor.nodes[cornerId] = { id: cornerId, x: x.x, y: x.y };
  }

  let changed = false;
  // konec, který už v X leží, ale má vlastní roh (oddělený konec C1.13 / dva shodné rohy) → přepojit na společný roh
  for (const [w, n] of [[A, n1], [B, n2]] as const) {
    for (const end of ['a', 'b'] as const) {
      const node = end === 'a' ? n[0] : n[1];
      if (dist(node, x) >= 1) continue;
      if (w[end] !== cornerId) {
        w[end] = cornerId;
        changed = true;
      }
      if (end === 'a' && w.noJoinA) {
        delete w.noJoinA;
        changed = true;
      }
      if (end === 'b' && w.noJoinB) {
        delete w.noJoinB;
        changed = true;
      }
    }
  }

  for (const pl of plans) {
    if (!pl) continue;
    changed = true;
    const w = pl.wall;
    const [a0, b0] = wallNodes(floor, w)!;
    const oldA = { x: a0.x, y: a0.y };
    const oldLen = dist(a0, b0);
    const dir = scale(sub(b0, a0), 1 / oldLen);
    w[pl.end] = cornerId;
    if (pl.end === 'a') delete w.noJoinA;
    else delete w.noJoinB;
    w.measured = null;
    const [a1, b1] = wallNodes(floor, w)!;
    const newLen = dist(a1, b1);
    const shift = dot(sub(a1, oldA), dir); // o kolik se posunul roh A podél stěny
    keepPositions(floor, w, shift, oldLen, newLen);
  }

  if (!changed) {
    if (!existing) delete floor.nodes[cornerId];
    return 'joined';
  }
  // roh v X je roh obou stěn – napojení doprostřed jedné z nich se zruší (napojení na třetí stěnu zůstane)
  const corner = floor.nodes[cornerId]!;
  if (corner.host === w1 || corner.host === w2) delete corner.host;
  // rohy, které po zkrácení nenese žádná stěna, zmizí
  const used = new Set(Object.values(floor.walls).flatMap(w => [w.a, w.b]));
  for (const id of Object.keys(floor.nodes)) if (!used.has(id)) delete floor.nodes[id];
  return 'ok';
}

/** Otvory a výstupky zůstanou na místě ve výkresu; co leží mimo novou stěnu, se smaže (F4). */
function keepPositions(floor: Floor, w: Wall, shift: number, oldLen: number, newLen: number): void {
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== w.id) continue;
    const span = openingSpan(op);
    const start = openingStartFromA(op, oldLen) - shift;
    if (start < -0.5 || start + span > newLen + 0.5) {
      delete floor.openings[op.id];
      continue;
    }
    op.offset = Math.round(op.ref === 'a' ? start : newLen - start - span);
  }
  for (const p of Object.values(floor.protrusions ?? {})) {
    if (p.wallId !== w.id) continue;
    const us = p.pts.map(q => q.u - shift);
    if (Math.max(...us) <= 0 || Math.min(...us) >= newLen) {
      delete floor.protrusions![p.id];
      continue;
    }
    p.pts.forEach((q, i) => (q.u = us[i]!));
  }
}
