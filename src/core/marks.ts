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
import { projectToSegment } from './geometry';

/** Předpona čísla značky – JEDINÉ místo (Z1, Z2…). */
export const MARK_PREFIX = 'Z';

/** Barvy značky (výchozí první). */
export const MARK_COLORS = ['#7c3aed', '#dc2626', '#2563eb', '#059669', '#ea580c', '#0f172a'] as const;

/** Předvolby názvů (převzato z prototypu – názvy detailů). */
export const MARK_NAME_PRESETS = ['Ostění okna', 'Nadpraží / Překlad', 'Parapet', 'Sokl / Práh', 'Styk příčky', 'Stropní trám', 'Vlhkost', 'Trhlina'] as const;

/** Velikost značky na obrazovce (px) – stálá, nezávisí na zoomu. */
export const MARK_PX = { r: 14, dirLen: 54, handle: 12 } as const;

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

/** Guma ve skice: smaže tahy, kóty a popisky pod bodem (tolerance v jednotkách skici). Vrací novou stranu, nebo null = nic. */
export function eraseInPage(p: MarkPage, at: Pt, tol: number): MarkPage | null {
  const hitPoly = (pts: Pt[]) => pts.some((q, i) => (i === 0 ? Math.hypot(at.x - q.x, at.y - q.y) <= tol : projectToSegment(at, pts[i - 1]!, q).distance <= tol));
  const strokes = p.strokes.filter(s => !hitPoly(s.pts));
  const dims = p.dims.filter(d => projectToSegment(at, d.a, d.b).distance > tol);
  const labels = p.labels.filter(l => Math.hypot(at.x - l.x, at.y - l.y) > tol * 1.7);
  if (strokes.length === p.strokes.length && dims.length === p.dims.length && labels.length === p.labels.length) return null;
  return { ...p, strokes, dims, labels };
}
