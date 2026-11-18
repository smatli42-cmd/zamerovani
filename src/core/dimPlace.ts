/**
 * Poloha kót posunutých tažením za číslo (rozhodnutí uživatele 2026-11-18) – jediné místo pravidla pro všechny
 * druhy kót (stěny, otvory, napojení, výstupky všech druhů, tloušťka, ostění, vzepětí, odstupy skupin, volné kóty).
 *
 * - Kolmý posun (`off`, mm, kladně ve směru „ven“, kterým se kóta kreslí) patří **řadě** kót: řetězová kóta otvorů
 *   na stěně, řada napojení, řetěz výstupku (před – šířka – za) a řada „přesah + podél líce“ výstupku na konci stěny
 *   se posouvají celé; ostatní kóty samy. Volná kóta si kolmý posun pamatuje ve vlastním `FreeDim.offset`.
 * - Posun čísla podél kótovací čáry (`along`, mm) patří jedné kótě.
 * - Vynášecí (odkazové) čáry vedou vždy od měřených bodů ke kótovací čáře, na kterou stranu kóta leží
 *   (canvas/dimLine.ts); číslo mimo kótovací čáru se k ní připojí prodloužením čáry.
 * - Záznam zaniká s prvkem, ke kterému patří (`prunePlaces` v `store.edit`).
 */
import type { DimPlace, Floor, Id, Pt, Wall } from '../model/types';
import { dimKey, dimValue, ownersExist, type DimTarget } from './dimLock';
import { openingsOnWall } from './floorQueries';
import { hostedChain } from './hosting';
import { dimPoints } from './freeDim';
import { dot, normal, unit } from './geometry';

/** Řada kót, která se posouvá kolmo společně. */
export interface DimRow {
  key: string;
  /** Kóta, se kterou záznam řady zaniká (stačí, když existuje její prvek). */
  owner: DimTarget;
}

/** Kóta, která tvoří řadu sama. */
export const rowOf = (t: DimTarget): DimRow => ({ key: dimKey(t), owner: t });

/** Řetězová kóta otvorů / řada napojení na stěně. */
export const wallChainRow = (kind: 'openings' | 'junctions', wall: Wall): DimRow => ({
  key: `row:${kind}:${wall.id}`,
  owner: { kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } }
});

/** Řetěz výstupku / vybrání na stěně (před – šířka – za). */
export const protrusionRow = (id: Id): DimRow => ({ key: `row:prot:${id}`, owner: { kind: 'protrusion-dim', protrusionId: id, dim: 'width' } });

/** Řada po líci 0 výstupku na konci stěny (přesah za čelo + podél líce). */
export const endRow = (id: Id): DimRow => ({ key: `row:end:${id}:0`, owner: { kind: 'end-dim', protrusionId: id, dim: 'along0' } });

/** Klíč posunu čísla podél: kóta, nebo `alongKey`, když se stejná kóta kreslí víckrát (zárubeň vlevo / vpravo). */
const alongKeyOf = (t: DimTarget, alongKey?: string) => alongKey ?? dimKey(t);

/** Posun kóty `t` v řadě `row` proti výchozí poloze (mm); bez `t` (úsek bez čísla) jen kolmý posun řady. */
export function dimShift(place: Floor['dimPlace'], row: DimRow, t: DimTarget | null, alongKey?: string): { off: number; along: number } {
  return {
    off: t?.kind === 'free-dim' ? 0 : (place?.[row.key]?.off ?? 0),
    along: t ? (place?.[alongKeyOf(t, alongKey)]?.along ?? 0) : 0
  };
}

/** Tažená kóta: řada, kóta a směry na výkrese (jednotkové; obrazovka a svět mají stejnou orientaci). */
export interface DimDrag {
  row: DimRow;
  target: DimTarget;
  /** Směr „ven“ (kladný kolmý posun). */
  out: Pt;
  /** Směr kótovací čáry (kladný posun čísla). */
  u: Pt;
  /** Rozlišení čísla, když se stejná kóta kreslí víckrát. */
  alongKey?: string;
}

/** Stav na začátku tažení: kolmý posun, posun čísla, `k` = převod kolmého posunu na `FreeDim.offset` (±1). */
export interface DragStart {
  off: number;
  along: number;
  k: number;
}

export function dragStart(floor: Floor, drag: DimDrag): DragStart | null {
  const along = floor.dimPlace?.[alongKeyOf(drag.target, drag.alongKey)]?.along ?? 0;
  const t = drag.target;
  if (t.kind === 'free-dim') {
    const d = floor.dims?.[t.dimId];
    const pts = d && dimPoints(floor, d);
    if (!d || !pts) return null;
    return { off: d.offset, along, k: dot(drag.out, normal(unit(pts[0], pts[1]))) < 0 ? -1 : 1 };
  }
  return { off: floor.dimPlace?.[drag.row.key]?.off ?? 0, along, k: 1 };
}

function setField(floor: Floor, key: string, owner: DimTarget, field: 'off' | 'along', value: number): void {
  const place = (floor.dimPlace ??= {});
  const e: DimPlace = place[key] ?? { owner };
  if (value === 0) delete e[field];
  else e[field] = value;
  if (e.off === undefined && e.along === undefined) delete place[key];
  else place[key] = e;
  if (Object.keys(place).length === 0) delete floor.dimPlace;
}

/**
 * Nastaví polohu tažené kóty: začátek tažení + posun `dOff` (kolmo, mm) a `dAlong` (podél, mm).
 * Hodnota blíž než `snap` (mm) k výchozí poloze se vrátí na výchozí (0). Odsazení volné kóty se nepřichytává
 * (0 = kótovací čára přímo na měřených bodech, ne výchozí poloha). Mění `floor` (koncept v store.edit).
 */
export function applyDrag(floor: Floor, drag: DimDrag, start: DragStart, dOff: number, dAlong: number, snap = 0): void {
  const r = (v: number) => (Math.abs(v) < snap ? 0 : Math.round(v));
  const t = drag.target;
  if (t.kind === 'free-dim') {
    const d = floor.dims?.[t.dimId];
    if (d) d.offset = Math.round(start.off + start.k * dOff);
  } else {
    setField(floor, drag.row.key, drag.row.owner, 'off', r(start.off + dOff));
  }
  setField(floor, alongKeyOf(t, drag.alongKey), t, 'along', r(start.along + dAlong));
}

/** Existuje kóta / řada záznamu? (prvek existuje, kóta jde spočítat, řada stěny má aspoň jednu kótu) */
function placeAlive(floor: Floor, key: string, e: DimPlace): boolean {
  if (!ownersExist(floor, e.owner) || dimValue(floor, e.owner) === null) return false;
  const wall = e.owner.kind === 'wall-length' ? floor.walls[e.owner.wallId] : null;
  if (wall && key.startsWith('row:openings:')) return openingsOnWall(floor, wall).length > 0;
  if (wall && key.startsWith('row:junctions:')) return hostedChain(floor, wall.id).length > 0;
  return true;
}

/** Odstraní polohy kót, které zanikly (smazaný prvek, kóta už nejde spočítat, řada stěny bez kót). */
export function prunePlaces(floor: Floor): void {
  if (!floor.dimPlace) return;
  for (const [key, e] of Object.entries(floor.dimPlace)) if (!placeAlive(floor, key, e)) delete floor.dimPlace[key];
  if (Object.keys(floor.dimPlace).length === 0) delete floor.dimPlace;
}
