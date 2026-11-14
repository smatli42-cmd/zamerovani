/**
 * Řetězová kóta otvorů a zámek kót (KOTY-ZAMEK-EXPORT.md, A; upřesněno uživatelem 2026-11-14).
 *
 * Řetěz podél stěny od rohu A: odstup od A → otvor → meziostění → … → otvor → odstup k rohu B.
 * Zamčené úseky spojují sousední otvory do celku. Pravidlo změny úseku:
 * - změna úseku posune všechno napravo (směrem k rohu B), co je s ním spojené zamčenými úseky;
 * - první nezamčený úsek napravo změnu „spolkne“ (přepíše se na novou délku);
 * - když nezamčený úsek napravo není (nebo se mění poslední úsek k rohu B), posune se roh B – stěna se
 *   prodlouží / zkrátí a otvory zůstanou ve výkresu na místě.
 */
import type { Floor, Id, Opening } from '../model/types';
import { openingSpan, openingStartFromA, openingsOnWall, wallLength } from './floorQueries';
import { setWallLength } from './solver';

const locked = (floor: Floor, key: string) => !!floor.dimLocks?.[key];

function placeAt(op: Opening, start: number, len: number): void {
  const s = Math.round(start);
  op.offset = op.ref === 'a' ? s : Math.round(len - s - openingSpan(op));
}

/**
 * Posune otvory stěny od indexu `from` (pořadí od rohu A) o `delta` mm směrem k rohu B, pokud jsou spojené
 * zamčenými meziostěními; za posledním spojeným se změna spolkne, nebo se prodlouží stěna.
 * `forceExtend` = měněný úsek je poslední (k rohu B) – posouvá se rovnou roh B.
 * Vrací false, když to nejde (otvor by vyjel ze stěny, stěna by byla příliš krátká).
 */
export function pushChainRight(floor: Floor, wallId: Id, from: number, delta: number, forceExtend = false): boolean {
  const wall = floor.walls[wallId];
  if (!wall) return false;
  const len = wallLength(floor, wall);
  const placed = openingsOnWall(floor, wall);
  const n = placed.length;
  // které otvory se posunou a zda se posune i roh B
  let last = from - 1; // poslední posunutý otvor
  let extend = forceExtend;
  if (!forceExtend) {
    for (let j = from; j < n; j++) {
      last = j;
      const next = placed[j + 1];
      if (next) {
        if (!locked(floor, `opening-gap:${placed[j]!.op.id}:${next.op.id}`)) break;
      } else if (locked(floor, `opening-offset:${placed[j]!.op.id}:b`)) extend = true;
    }
  }
  const newLen = extend ? len + delta : len;
  // kontrola: posunuté otvory musí zůstat na stěně a nesmí se překrýt s nepohnutým sousedem
  for (let j = from; j <= last; j++) {
    const p = placed[j]!;
    if (p.start + delta < -0.5 || p.end + delta > newLen + 0.5) return false;
  }
  const before = placed[from - 1];
  if (from <= last && before && placed[from]!.start + delta < before.end - 0.5) return false;
  const after = placed[last + 1];
  if (after && last >= from && placed[last]!.end + delta > after.start + 0.5) return false;

  if (extend) {
    if (newLen < 10) return false;
    // zkrácení: nepohnutý poslední otvor musí zůstat na stěně
    const lastOp = placed[n - 1];
    if (lastOp && last < n - 1 && lastOp.end > newLen + 0.5) return false;
    // konec B napojený doprostřed jiné stěny (T) drží – prodloužením by se napojení zrušilo
    if (floor.nodes[wall.b]?.host) return false;
    const starts = placed.map(p => p.start);
    if (!setWallLength(floor, wallId, newLen, { nodeId: wall.b })) return false;
    if (Math.abs(wallLength(floor, floor.walls[wallId]!) - newLen) > 0.5) return false;
    // otvory drží polohu od rohu A (posunul se jen roh B)
    placed.forEach((p, i) => placeAt(floor.openings[p.op.id]!, starts[i]!, newLen));
  }
  for (let j = from; j <= last; j++) {
    const p = placed[j]!;
    placeAt(floor.openings[p.op.id]!, p.start + delta, newLen);
  }
  return true;
}

/** Index otvoru v řetězu stěny (od rohu A); −1 = není. */
export function chainIndex(floor: Floor, op: Opening): number {
  const wall = floor.walls[op.wallId];
  return wall ? openingsOnWall(floor, wall).findIndex(p => p.op.id === op.id) : -1;
}

/** Současná délka úseku „odstup od A“ (u prvního otvoru) / „odstup k B“ (u posledního). */
export function chainEdge(floor: Floor, op: Opening, ref: 'a' | 'b'): number | null {
  const wall = floor.walls[op.wallId];
  if (!wall) return null;
  const len = wallLength(floor, wall);
  const start = openingStartFromA(op, len);
  return ref === 'a' ? start : len - start - openingSpan(op);
}
