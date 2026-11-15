/**
 * Prvky nesené stěnou při zkrácení, dělení a smazání stěny (KATALOG-STEN.md F4, I1.13) – JEDINÉ místo,
 * kde se toto pravidlo provádí (CLAUDE.md, pravidlo pro průřezové funkce).
 *
 * Pravidlo (rozhodnutí uživatele 2026-11-15) platí pro všechny prvky nesené stěnou:
 * - prvek, který celý leží na kusu stěny, který zůstává, přejde na něj a zůstane ve výkresu na místě;
 * - prvek, který leží v mazaném kusu **i jen zčásti**, nebo přes dělicí bod (dva kusy), se smaže;
 * - výjimka: napojený roh (příčka T, i na líci) se nemaže – jen se odpojí a příčka zůstane s volným koncem
 *   (rozhodnutí uživatele: příčka je samostatná stěna).
 *
 * Druhy prvků: otvor (okno, dveře, průchod, nika – ostění a rám jsou jeho součást), výstupek / vybrání,
 * výstupek přes roh (I1.11 – jeho rozsah podél stěny je od rohu po konec obrysu na líci; přejde na kus, který
 * má konec v rohu), napojený roh (`Node.host`). **Nový druh prvku na stěně musí přibýt do `carriedBy` i s testem**
 * (`store/carried.test.ts`). Zámky kót smazaných prvků zanikají samy (`pruneLocks`).
 */
import type { Floor, Id, Pt } from '../model/types';
import { openingSpan, openingStartFromA } from './floorQueries';
import { protrusionExtent } from './protrusion';
import { cornerFaceCover, cornerProtrusionsOf } from './cornerProtrusion';

/** Tolerance (mm) na okraji kusu stěny – zaokrouhlení poloh. */
const TOL = 0.5;
/** Napojený roh blíž než toto (mm) ke konci kusu už není napojení doprostřed stěny (stejná mez jako syncHosted). */
const HOST_END_MIN = 5;

/**
 * Kus původní stěny, který zůstane: rozsah [from, to] podél původní stěny (mm od jejího rohu A, u oblouku po
 * oblouku osy) a stěna, která ho teď nese (`wallId`, u zkrácení stejná stěna). Nová délka kusu = to − from.
 */
export interface KeptPart {
  wallId: Id;
  from: number;
  to: number;
}

interface Carried {
  kind: 'opening' | 'protrusion' | 'corner' | 'hosted';
  id: Id;
  /** rozsah podél původní stěny (napojený roh: u0 = u1) */
  u0: number;
  u1: number;
}

/** Všechny prvky nesené stěnou `wallId` s jejich rozsahem podél ní (`len` = délka stěny, `uOf` = poloha bodu podél ní). */
function carriedBy(floor: Floor, wallId: Id, len: number, uOf: (p: Pt) => number): Carried[] {
  const out: Carried[] = [];
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== wallId) continue;
    const u0 = openingStartFromA(op, len);
    out.push({ kind: 'opening', id: op.id, u0, u1: u0 + openingSpan(op) });
  }
  for (const p of Object.values(floor.protrusions ?? {})) {
    if (p.wallId !== wallId) continue;
    const { u0, u1 } = protrusionExtent(p);
    out.push({ kind: 'protrusion', id: p.id, u0, u1 });
  }
  // výstupek přes roh: úsek líce od rohu X po konec obrysu (null = roh už není → zanikne)
  for (const cp of cornerProtrusionsOf(floor)) {
    const i = cp.walls.indexOf(wallId);
    if (i < 0) continue;
    const cover = cornerFaceCover(floor, cp, i as 0 | 1);
    const node = floor.nodes[cp.node];
    // od rohu stěny (u vnějšího rohu leží X za koncem osy) po konec obrysu na líci
    const us = cover && node ? [uOf(node), uOf(cover[1])] : [Infinity, Infinity];
    out.push({ kind: 'corner', id: cp.id, u0: Math.min(...us), u1: Math.max(...us) });
  }
  for (const n of Object.values(floor.nodes)) {
    if (n.host !== wallId) continue;
    const u = uOf(n);
    out.push({ kind: 'hosted', id: n.id, u0: u, u1: u });
  }
  return out;
}

/** Prvek zanikne se svým kusem stěny (napojený roh se jen odpojí). */
function drop(floor: Floor, c: Carried): void {
  if (c.kind === 'opening') delete floor.openings[c.id];
  else if (c.kind === 'protrusion') delete floor.protrusions?.[c.id];
  else if (c.kind === 'corner') delete floor.cornerProtrusions?.[c.id];
  else {
    const n = floor.nodes[c.id];
    if (n) {
      delete n.host;
      delete n.hostFace;
    }
  }
}

/** Prvek přejde na kus `part` a zůstane ve výkresu na místě. */
function move(floor: Floor, c: Carried, part: KeptPart, oldWallId: Id): void {
  const shift = part.from;
  if (c.kind === 'opening') {
    const op = floor.openings[c.id]!;
    const start = c.u0 - shift;
    const span = c.u1 - c.u0;
    op.wallId = part.wallId;
    op.offset = Math.round(op.ref === 'a' ? start : part.to - part.from - start - span);
  } else if (c.kind === 'corner') {
    // souřadnice rohu nezávisí na délce stěny – mění se jen stěna, ke které roh patří
    const cp = floor.cornerProtrusions![c.id]!;
    cp.walls = cp.walls.map(w => (w === oldWallId ? part.wallId : w)) as [Id, Id];
  } else if (c.kind === 'protrusion') {
    const p = floor.protrusions![c.id]!;
    p.wallId = part.wallId;
    p.pts = p.pts.map(q => ({ ...q, u: Math.round((q.u - shift) * 10) / 10 }));
  } else {
    floor.nodes[c.id]!.host = part.wallId;
  }
}

/**
 * Rozdělí prvky stěny `oldWallId` (délka `oldLen`, poloha bodu podél ní `uOf` – počítaná z PŮVODNÍ polohy stěny)
 * na kusy, které zůstávají (`parts`); co neleží celé na jednom kusu, zanikne. Volá se po změně stěny:
 * zkrácení / prodloužení (jeden kus), dělení (dva kusy).
 */
export function redistributeCarried(floor: Floor, oldWallId: Id, oldLen: number, parts: readonly KeptPart[], uOf: (p: Pt) => number): void {
  for (const c of carriedBy(floor, oldWallId, oldLen, uOf)) {
    // napojený roh v konci kusu (bod dělení, nový roh Do rohu) je roh té stěny, ne napojení → odpojí se
    const pad = c.kind === 'hosted' ? HOST_END_MIN : -TOL;
    const part = parts.find(k => c.u0 >= k.from + pad && c.u1 <= k.to - pad);
    if (part) move(floor, c, part, oldWallId);
    else drop(floor, c);
  }
}

/** Prvky nesené stěnou, která už neexistuje (smazaná stěna, u výstupku přes roh i zaniklý roh), zaniknou (napojené rohy se odpojí). */
export function dropOrphanCarried(floor: Floor): void {
  for (const op of Object.values(floor.openings)) if (!floor.walls[op.wallId]) drop(floor, { kind: 'opening', id: op.id, u0: 0, u1: 0 });
  for (const p of Object.values(floor.protrusions ?? {})) if (!floor.walls[p.wallId]) drop(floor, { kind: 'protrusion', id: p.id, u0: 0, u1: 0 });
  for (const n of Object.values(floor.nodes)) if (n.host && !floor.walls[n.host]) drop(floor, { kind: 'hosted', id: n.id, u0: 0, u1: 0 });
  for (const cp of cornerProtrusionsOf(floor)) if (cp.walls.some(w => !floor.walls[w]) || !floor.nodes[cp.node]) drop(floor, { kind: 'corner', id: cp.id, u0: 0, u1: 0 });
}
