/**
 * Zkrátit / prodloužit do rohu (KATALOG-STEN.md D3, samostatný nástroj).
 *
 * Uživatel ťukne na dvě rovné stěny – vždy na tu část, která má zůstat. Referenční čáry obou stěn
 * (líc nebo osa, podle `Wall.axis`) se protnou v bodě X; u každé stěny se konec na „odvrácené“ straně
 * od ťuknutí přesune do X (zkrácení), případně se konec bližší k X prodlouží až do X. Oba konce pak
 * sdílejí jeden roh, takže se stěny napojí do rohu (tělo podle core/wallBody.ts).
 *
 * - Přesouvá se jen konec této stěny: roh sdílený s dalšími stěnami se pro ni oddělí (sousedé zůstanou).
 * - Prvky nesené stěnou drží svou polohu ve výkresu; ty, které leží v odříznuté části (i jen zčásti), se smažou,
 *   napojené příčky se odpojí (F4, core/carried.ts).
 * - Zamčená délka stěny (zámek kót) úpravu zastaví – hlídá store.edit.
 */
import { newId } from '../model/factory';
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { canHostOnFace, isCurved, wallFaceOffset, wallNodes } from './floorQueries';
import { redistributeCarried } from './carried';

/** 'locked' = úprava by změnila zamčenou kótu (hlídá store.edit, ne tato funkce). */
export type TrimResult = 'ok' | 'curved' | 'parallel' | 'same' | 'tooShort' | 'joined' | 'locked' | 'outside';

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
    const [a1, b1] = wallNodes(floor, w)!;
    const newLen = dist(a1, b1);
    const shift = dot(sub(a1, oldA), dir); // o kolik se posunul roh A podél stěny
    // prvky nesené stěnou zůstanou na místě; co leží v odříznuté části (i jen zčásti), zanikne (F4)
    redistributeCarried(floor, w.id, oldLen, [{ wallId: w.id, from: shift, to: shift + newLen }], p => dot(sub(p, oldA), dir));
  }

  if (!changed) {
    if (!existing) delete floor.nodes[cornerId];
    return 'joined';
  }
  // roh v X je roh obou stěn – napojení doprostřed jedné z nich se zruší (napojení na třetí stěnu zůstane)
  const corner = floor.nodes[cornerId]!;
  if (corner.host === w1 || corner.host === w2) {
    delete corner.host;
    delete corner.hostFace;
  }
  // rohy, které po zkrácení nenese žádná stěna, zmizí
  const used = new Set(Object.values(floor.walls).flatMap(w => [w.a, w.b]));
  for (const id of Object.keys(floor.nodes)) if (!used.has(id)) delete floor.nodes[id];
  return 'ok';
}

/** Kam dosedne konec stěny `w1` u hrany stěny `w2` (režim K hraně): bod, líc a ponechaný konec. */
interface EdgePlan {
  x: Pt;
  face?: 1 | -1;
  end: 'a' | 'b';
}

/** Líc stěny `w2`, ke kterému se stěna `w1` zkrátí / prodlouží (strana, na které leží její ponechaný konec). */
function planEdge(floor: Floor, w1: Id, keep1: Pt, w2: Id): EdgePlan | Exclude<TrimResult, 'ok'> {
  if (w1 === w2) return 'same';
  const A = floor.walls[w1];
  const B = floor.walls[w2];
  if (!A || !B) return 'same';
  if (isCurved(A) || isCurved(B)) return 'curved';
  const nA = wallNodes(floor, A);
  const nB = wallNodes(floor, B);
  if (!nA || !nB || dist(nB[0], nB[1]) < 1) return 'same';
  const dA = sub(nA[1], nA[0]);
  const dB = sub(nB[1], nB[0]);
  const x0 = intersect(nA[0], dA, nB[0], dB);
  if (!x0) return 'parallel';
  // ponechaný konec podle průsečíku s čárou stěny B (strana B, na které zůstane)
  const pl0 = planEnd(A, nA[0], nA[1], x0, keep1);
  const fixed = pl0 ? (pl0.end === 'a' ? nA[1] : nA[0]) : dist(nA[0], x0) < 1 ? nA[1] : nA[0];
  const nrm = normal(unit(nB[0], nB[1]));
  const at = dot(sub(fixed, nB[0]), nrm);
  // líc B: u stěny s tloušťkou ten, na jehož straně leží ponechaný konec; jinak čára stěny
  let face: 1 | -1 | undefined;
  let off = 0;
  // strana B, na které zůstane ponechaný konec (u stěny s tloušťkou podle středu těla)
  let s: 1 | -1 = at >= 0 ? 1 : -1;
  if (canHostOnFace(B)) {
    const r0 = wallFaceOffset(B, -1);
    const r1 = wallFaceOffset(B, 1);
    s = at > (r0 + r1) / 2 ? 1 : -1;
    off = wallFaceOffset(B, s);
    if (Math.abs(off) > 0.5) face = s;
    else off = 0;
  }
  // bod napojení se nezaokrouhluje – leží přesně na líci (syncHosted ho nemusí dorovnávat)
  const x = intersect(nA[0], dA, add(nB[0], scale(nrm, off)), dB)!;
  // konec musí dosednout na stěnu B (ne za její konec)
  const lenB = Math.sqrt(dot(dB, dB));
  const tB = dot(sub(x, nB[0]), dB) / lenB;
  if (tB < 5 || tB > lenB - 5) return 'outside';
  // ponechaný konec leží za lícem (ne v těle B) a stěna nebude kratší než MIN_LEN
  if ((at - off) * s < MIN_LEN || dist(fixed, x) < MIN_LEN) return 'tooShort';
  const end: 'a' | 'b' = fixed === nA[0] ? 'b' : 'a';
  return { x, face, end };
}

/** Bod, do kterého dosedne konec stěny `w1` u hrany stěny `w2` (náhled nástroje); null = nejde. */
export function trimEdgePoint(floor: Floor, w1: Id, keep1: Pt, w2: Id): Pt | null {
  const pl = planEdge(floor, w1, keep1, w2);
  return typeof pl === 'string' ? null : pl.x;
}

/**
 * Zkrátí / prodlouží jen stěnu `w1` k hraně stěny `w2` (D3 „jeden prvek“, T místo L). `keep1` = místo ťuknutí
 * (část, která zůstane). Konec dosedne na bližší líc `w2` (strana ponechané části; u stěny bez tloušťky na její čáru)
 * a napojí se na ni (`Node.host` / `hostFace`), stěna `w2` se nemění. Prvky nesené stěnou podle F4.
 * Mění `floor` jen při výsledku 'ok'.
 */
export function trimExtendToEdge(floor: Floor, w1: Id, keep1: Pt, w2: Id): TrimResult {
  const pl = planEdge(floor, w1, keep1, w2);
  if (typeof pl === 'string') return pl;
  const w = floor.walls[w1]!;
  const [a0, b0] = wallNodes(floor, w)!;
  const cur = floor.nodes[w[pl.end]]!;
  if (dist(cur, pl.x) < 1 && cur.host === w2 && cur.hostFace === pl.face) return 'joined';
  const oldA = { x: a0.x, y: a0.y };
  const oldLen = dist(a0, b0);
  const dir = scale(sub(b0, a0), 1 / oldLen);
  const id = newId('n');
  floor.nodes[id] = { id, x: pl.x.x, y: pl.x.y, host: w2, ...(pl.face ? { hostFace: pl.face } : {}) };
  w[pl.end] = id;
  if (pl.end === 'a') delete w.noJoinA;
  else delete w.noJoinB;
  const [a1, b1] = wallNodes(floor, w)!;
  const shift = dot(sub(a1, oldA), dir);
  redistributeCarried(floor, w.id, oldLen, [{ wallId: w.id, from: shift, to: shift + dist(a1, b1) }], p => dot(sub(p, oldA), dir));
  const used = new Set(Object.values(floor.walls).flatMap(x => [x.a, x.b]));
  for (const nid of Object.keys(floor.nodes)) if (!used.has(nid)) delete floor.nodes[nid];
  return 'ok';
}
