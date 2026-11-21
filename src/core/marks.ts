/**
 * Značky v půdorysu (ZNACKY-POZNAMKY-DETAILY.md, krok A) – JEDINÉ místo pravidel značky: číslování, popisek,
 * ikona podle obsahu, směr pohledu, obsah skici (guma, prázdnost). Výběr / posun / kopie / mazání / vrstvy jdou
 * přes společná pravidla volných prvků (core/looseElements.ts, core/layers.ts).
 *
 * Číslo: pořadové, unikátní v celém projektu (všechna podlaží), zobrazuje se s předponou `MARK_PREFIX` (Z1, Z2…).
 * Smazání značky ostatní nepřečísluje; nová značka dostane číslo o 1 vyšší než nejvyšší v projektu.
 */
import type { Floor, Id, Mark, MarkDir, MarkDirStyle, MarkPage, Project, Pt } from '../model/types';
import { newId } from '../model/factory';

/** Předpona čísla značky – JEDINÉ místo (Z1, Z2…). */
export const MARK_PREFIX = 'Z';

/** Barvy značky (výchozí první). */
export const MARK_COLORS = ['#7c3aed', '#dc2626', '#2563eb', '#059669', '#ea580c', '#0f172a'] as const;

/** Velikost značky na obrazovce (px) – stálá, nezávisí na zoomu: výška štítku, úchyt konce směru. */
export const MARK_PX = { h: 26, handle: 12 } as const;

/** Šířka znaku štítku (px) – odhad s rezervou; kreslení písmo zmenší, kdyby text přesto přetekl (canvas/drawMarks.ts). */
const CHAR_PX = 8;

/** Šířka části štítku s číslem (px) – jen tahle část má při ťuknutí přednost před rohem (tools/pick.ts). */
export function markCodePx(m: Pick<Mark, 'num'>): number {
  return markCode(m).length * CHAR_PX + 16;
}

/** Šířka části štítku s názvem (px; 0 = bez názvu). */
export function markNamePx(m: Pick<Mark, 'name'>): number {
  return m.name ? m.name.length * CHAR_PX + 16 : 0;
}

/** Rozměr štítku na obrazovce (px; číslo + název, odhad podle počtu znaků – kreslení i zásah perem). Střed = poloha značky. */
export function markBoxPx(m: Pick<Mark, 'num' | 'name'> & Partial<Pick<Mark, 'pages' | 'note'>>): { w: number; h: number } {
  return { w: Math.max(MARK_PX.h, markCodePx(m) + markIconPx(m) + markNamePx(m)), h: MARK_PX.h };
}

/** Šířka pole s ikonou obsahu (fotka / skica / poznámka) mezi číslem a názvem (px; 0 = prázdná značka). */
export function markIconPx(m: Partial<Pick<Mark, 'pages' | 'note'>>): number {
  return markContent(m) ? 24 : 0;
}

/** Výchozí vzdálenost cíle směru od značky po zapnutí (mm). */
export const DIR_DEFAULT_MM = 1500;

/** Úhel směru (°, 0 = doprava, osa Y dolů jako na obrazovce). */
export function dirAngle(m: Pt & Pick<Mark, 'dir'>): number {
  const to = m.dir?.to;
  return to ? Math.round((Math.atan2(to.y - m.y, to.x - m.x) * 180) / Math.PI) : -90;
}

/** Vzdálenost cíle směru od značky (mm). */
export function dirDistance(m: Pt & Pick<Mark, 'dir'>): number {
  const to = m.dir?.to;
  return to ? Math.round(Math.hypot(to.x - m.x, to.y - m.y)) : DIR_DEFAULT_MM;
}

/**
 * Cíl z tažení úchytu: bod pod perem, ale vždy aspoň 20 px za okrajem štítku (při daném zoomu) – úchyt nikdy
 * nezapadne pod štítek. Pero přímo na značce = původní směr.
 */
export function dirTargetFromDrag(m: Pt & Pick<Mark, 'dir' | 'num' | 'name'>, p: Pt, zoom: number): Pt {
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  const angle = d * zoom < 1 ? dirAngle(m) : (Math.atan2(p.y - m.y, p.x - m.x) * 180) / Math.PI;
  const u = dirVector(angle);
  const { w, h } = markBoxPx(m);
  const minPx = Math.min(Math.abs(u.x) > 1e-9 ? w / 2 / Math.abs(u.x) : Infinity, Math.abs(u.y) > 1e-9 ? h / 2 / Math.abs(u.y) : Infinity) + 20;
  const dist = Math.max(d, minPx / zoom);
  return { x: Math.round(m.x + u.x * dist), y: Math.round(m.y + u.y * dist) };
}

/** Cíl směru pod úhlem `angle` (°) ve vzdálenosti `dist` (mm) od značky. */
export function dirTarget(m: Pt, angle: number, dist: number): Pt {
  const u = dirVector(angle);
  return { x: Math.round(m.x + u.x * dist), y: Math.round(m.y + u.y * dist) };
}

export function marksOf(floor: Floor): Mark[] {
  return Object.values(floor.marks ?? {});
}

/** Text čísla (např. „Z3“). */
export function markCode(m: Pick<Mark, 'num'>): string {
  return `${MARK_PREFIX}${m.num}`;
}

/** Všechna čísla značek v projektu (všechna podlaží), kromě značky `exceptId`. */
function usedNumbers(project: Pick<Project, 'floors'>, exceptId?: Id): Set<number> {
  const out = new Set<number>();
  for (const f of project.floors) for (const m of marksOf(f)) if (m.id !== exceptId) out.add(m.num);
  return out;
}

/** Číslo nové značky: o 1 vyšší než nejvyšší v projektu (mezery po smazaných se nezaplňují). */
export function nextMarkNumber(project: Pick<Project, 'floors'>): number {
  let max = 0;
  for (const n of usedNumbers(project)) max = Math.max(max, n);
  return max + 1;
}

/** Ruční změna čísla: kladné celé číslo, které v projektu nemá jiná značka. */
export function markNumberError(project: Pick<Project, 'floors'>, markId: Id, num: number): string | null {
  if (!Number.isInteger(num) || num < 1) return 'Číslo poznámky musí být kladné celé číslo.';
  if (usedNumbers(project, markId).has(num)) return `Číslo ${MARK_PREFIX}${num} už má jiná poznámka.`;
  return null;
}

export function emptyPage(): MarkPage {
  return { id: newId('pg'), strokes: [], labels: [], dims: [] };
}

/** Nová značka (bez vrstvy – doplní store.edit, pravidlo V4: Popisky). */
export function createMark(at: Pt, num: number): Mark {
  return { id: newId('mk'), num, name: '', x: Math.round(at.x), y: Math.round(at.y), color: MARK_COLORS[0], note: '', pages: [emptyPage()] };
}

export function pageIsEmpty(p: MarkPage): boolean {
  return !p.strokes.length && !p.labels.length && !p.dims.length;
}

/** Co značka obsahuje (ikona v půdorysu): fotka, pak skica, pak text. */
export function markContent(m: Partial<Pick<Mark, 'pages' | 'note'>>): 'photo' | 'sketch' | 'text' | null {
  if ((m.pages ?? []).some(p => p.photo)) return 'photo';
  if ((m.pages ?? []).some(p => !pageIsEmpty(p))) return 'sketch';
  if (m.note?.trim()) return 'text';
  return null;
}

/** Výchozí směr pohledu po zapnutí: nahoru, cíl 1,5 m od značky (kužel). */
export function defaultDir(m: Pt, style: MarkDirStyle = 'cone'): MarkDir {
  return { on: true, style, to: dirTarget(m, -90, DIR_DEFAULT_MM) };
}

/** Jednotkový vektor směru pohledu. */
export function dirVector(angle: number): Pt {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Delší strana uložené fotky (px) – fotka se při vložení zmenší (ZNACKY-POZNAMKY-DETAILY.md). */
export const PHOTO_MAX_PX = 2000;

/** Rozměr zmenšené fotky (delší strana nejvýš `max`; menší fotka se nezvětšuje). */
export function photoFitSize(w: number, h: number, max = PHOTO_MAX_PX): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Id fotek, na které projekt odkazuje (všechna podlaží, všechny značky a strany). */
export function projectPhotoIds(project: Pick<Project, 'floors'>): Set<Id> {
  const out = new Set<Id>();
  for (const f of project.floors) for (const m of marksOf(f)) for (const p of m.pages ?? []) if (p.photo) out.add(p.photo.id);
  return out;
}

/** Projekt s přejmenovanými fotkami (import zálohy jako kopie – id fotek musí být nová). */
export function remapPhotoIds<P extends Pick<Project, 'floors'>>(project: P, map: ReadonlyMap<Id, Id>): P {
  return {
    ...project,
    floors: project.floors.map(f =>
      f.marks
        ? { ...f, marks: Object.fromEntries(Object.entries(f.marks).map(([k, m]) => [k, { ...m, pages: m.pages.map(p => (p.photo && map.has(p.photo.id) ? { ...p, photo: { ...p.photo, id: map.get(p.photo.id)! } } : p)) }])) }
        : f
    )
  };
}
