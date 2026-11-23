/**
 * Příznak „hlavní kóta“ pro export (KOTY-ZAMEK-EXPORT.md bod B, EXPORT-NAVRH.md, rozhodnutí uživatele 2026-11-23)
 * – JEDINÉ místo pravidla. Každá kóta (automatická i volná, popis `DimTarget`) je buď **hlavní** (jde do výkresu:
 * PDF ve výchozím stavu, DXF hladina „Kóty“), nebo **pracovní** (PDF jen když ji list zapne, DXF na vypnuté
 * hladině „Kóty pracovní“). Nezávisí na zámku kóty.
 *
 * Výchozí automaticky (`defaultMain`): celkové rozměry hlavní (délka stěny, délka po líci, průměr kruhu,
 * vzepětí oblouku stěny), volná kóta hlavní (nakreslená záměrně); dílčí rozměry pracovní (otvor, ostění,
 * meziostění, odstupy, tloušťka, poloha napojení) a kóty výstupků a schodiště pracovní.
 * Ruční přepsání jedním ťuknutím (NumPad / panel kóty) se ukládá v podlaží: `Floor.dimRoles[dimKey] = { main, target }`
 * – jen odchylka od výchozího stavu; zaniká se svým prvkem nebo když kóta měří jiného souseda (`pruneDimRoles`,
 * `reboundDimRoles` v `store.edit`). Role výkres nemění – jde přepnout i u kóty zamčené vrstvy.
 */
import type { Floor } from '../model/types';
import { dimAnchor, dimKey, ownersExist, type DimTarget } from './dimLock';
import { openingsOnWall } from './floorQueries';

/** Výchozí role kóty podle druhu (true = hlavní). Nový druh kóty doplnit sem (switch je úplný). */
export function defaultMain(t: DimTarget): boolean {
  switch (t.kind) {
    case 'wall-length':
    case 'wall-face-length':
    case 'circle-diameter':
    case 'wall-sagitta':
    case 'free-dim':
      return true;
    case 'opening-offset':
    case 'opening-width':
    case 'opening-gap':
    case 'opening-reveal':
    case 'wall-thickness':
    case 'comp-gap':
    case 'junction-gap':
    case 'protrusion-dim':
    case 'protrusion-sagitta':
    case 'corner-dim':
    case 'end-dim':
    case 'stair-dim':
      return false;
  }
}

/** Je kóta hlavní (ruční přepsání, jinak výchozí podle druhu)? */
export function isMainDim(floor: Floor, t: DimTarget): boolean {
  return floor.dimRoles?.[dimKey(t)]?.main ?? defaultMain(t);
}

/** Nastaví roli kóty; shodná s výchozí = záznam se smaže (ukládá se jen odchylka). */
export function setDimMain(floor: Floor, t: DimTarget, main: boolean): void {
  const key = dimKey(t);
  if (main === defaultMain(t)) {
    if (floor.dimRoles?.[key]) {
      delete floor.dimRoles[key];
      if (Object.keys(floor.dimRoles).length === 0) delete floor.dimRoles;
    }
    return;
  }
  floor.dimRoles = { ...(floor.dimRoles ?? {}), [key]: { main, target: { ...t } } };
}

/** Mezera mezi otvory existuje jen mezi sousedními otvory (vložený otvor mezi ně z ní udělá jiné dvě kóty). */
function gapAdjacent(floor: Floor, t: DimTarget): boolean {
  if (t.kind !== 'opening-gap') return true;
  const w = floor.walls[floor.openings[t.firstId]?.wallId ?? ''];
  if (!w) return false;
  const ids = openingsOnWall(floor, w).map(o => o.op.id);
  const i = ids.indexOf(t.firstId);
  return i >= 0 && ids[i + 1] === t.secondId;
}

/** Úklid: role kót, jejichž prvky už neexistují. */
export function pruneDimRoles(floor: Floor): void {
  if (!floor.dimRoles) return;
  for (const [key, r] of Object.entries(floor.dimRoles)) if (!ownersExist(floor, r.target) || !gapAdjacent(floor, r.target)) delete floor.dimRoles[key];
  if (Object.keys(floor.dimRoles).length === 0) delete floor.dimRoles;
}

/**
 * Role kót „přepojených“ na jiného souseda (vložený / smazaný otvor mezi dvěma, nové napojení) zaniká –
 * je to jiná kóta (stejně jako zámek, `reboundLocks`).
 */
export function reboundDimRoles(before: Floor | undefined, after: Floor): void {
  if (!before?.dimRoles || !after.dimRoles) return;
  for (const [key, r] of Object.entries(after.dimRoles)) {
    if (before.dimRoles[key] && ownersExist(after, r.target) && dimAnchor(before, r.target) !== dimAnchor(after, r.target)) delete after.dimRoles[key];
  }
  if (Object.keys(after.dimRoles).length === 0) delete after.dimRoles;
}
