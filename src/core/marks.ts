/**
 * Značky v půdorysu (ZNACKY-POZNAMKY-DETAILY.md, krok A) – JEDINÉ místo pravidel značky: číslování, popisek,
 * ikona podle obsahu, směr pohledu, obsah skici (guma, prázdnost). Výběr / posun / kopie / mazání / vrstvy jdou
 * přes společná pravidla volných prvků (core/looseElements.ts, core/layers.ts).
 *
 * Číslo: pořadové, unikátní v celém projektu (všechna podlaží), zobrazuje se s předponou `MARK_PREFIX` (Z1, Z2…).
 * Smazání značky ostatní nepřečísluje; nová značka dostane číslo o 1 vyšší než nejvyšší v projektu.
 */
import type { Floor, Id, Mark, MarkDirStyle, MarkPage, Project, Pt } from '../model/types';
import { newId } from '../model/factory';

/** Předpona čísla značky – JEDINÉ místo (Z1, Z2…). */
export const MARK_PREFIX = 'Z';

/** Barvy značky (výchozí první). */
export const MARK_COLORS = ['#7c3aed', '#dc2626', '#2563eb', '#059669', '#ea580c', '#0f172a'] as const;

/** Velikost značky na obrazovce (px) – stálá, nezávisí na zoomu: výška štítku, výchozí / nejkratší / nejdelší směr, úchyt. */
export const MARK_PX = { h: 26, dirLen: 70, dirMin: 24, dirMax: 600, handle: 12 } as const;

/** Text štítku: číslo i název v jednom (přání uživatele 2026-11-20 – směr pak název nezakrývá). */
export function markLabel(m: Pick<Mark, 'num' | 'name'>): string {
  return m.name ? `${markCode(m)}  ${m.name}` : markCode(m);
}

/** Šířka znaku štítku (px) – odhad s rezervou; kreslení písmo zmenší, kdyby text přesto přetekl (canvas/drawMarks.ts). */
const CHAR_PX = 8;

/** Rozměr štítku na obrazovce (px; odhad podle počtu znaků – kreslení i zásah perem). Střed = poloha značky. */
export function markBoxPx(m: Pick<Mark, 'num' | 'name'>): { w: number; h: number } {
  return { w: Math.max(MARK_PX.h, markLabel(m).length * CHAR_PX + 18), h: MARK_PX.h };
}

/** Šířka části štítku s číslem (px) – jen tahle část má při ťuknutí přednost před rohem (tools/pick.ts). */
export function markCodePx(m: Pick<Mark, 'num'>): number {
  return markCode(m).length * CHAR_PX + 18;
}

/** Nejmenší délka směru ve směru `angle`: vždy vyčnívá ze štítku (úchyt nikdy neleží pod ním). */
function minDirLength(m: Pick<Mark, 'num' | 'name'>, angle: number): number {
  const { w, h } = markBoxPx(m);
  const u = dirVector(angle);
  return Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2) + 20;
}

/** Délka směru na obrazovce (px): zadaná (tažením), výchozí 70 px, vždy aspoň mimo štítek. */
export function dirLength(m: Pick<Mark, 'dir' | 'num' | 'name'>): number {
  const angle = m.dir?.angle ?? 0;
  return Math.max(m.dir?.len ?? MARK_PX.dirLen, minDirLength(m, angle));
}

/** Délka směru z tažení koncového bodu (px, omezená). */
export function clampDirLength(px: number): number {
  return Math.round(Math.max(MARK_PX.dirMin, Math.min(MARK_PX.dirMax, px)));
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
  if (!Number.isInteger(num) || num < 1) return 'Číslo značky musí být kladné celé číslo.';
  if (usedNumbers(project, markId).has(num)) return `Číslo ${MARK_PREFIX}${num} už má jiná značka.`;
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

/** Co značka obsahuje (ikona v půdorysu): skica má přednost před textem. */
export function markContent(m: Mark): 'sketch' | 'text' | null {
  if ((m.pages ?? []).some(p => !pageIsEmpty(p))) return 'sketch';
  if (m.note.trim()) return 'text';
  return null;
}

/** Výchozí směr pohledu po zapnutí: nahoru (kužel). */
export function defaultDir(style: MarkDirStyle = 'cone') {
  return { on: true, angle: -90, style };
}

/** Jednotkový vektor směru pohledu. */
export function dirVector(angle: number): Pt {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Úhel (°, celý) od středu značky k bodu – nastavení směru tažením úchytu. */
export function angleTowards(m: Pt, p: Pt): number {
  return Math.round((Math.atan2(p.y - m.y, p.x - m.x) * 180) / Math.PI);
}

/** Úhel po otočení skupiny o `deg` (0–359). */
export function rotateAngle(angle: number, deg: number): number {
  return (((Math.round(angle + deg) % 360) + 360) % 360);
}
