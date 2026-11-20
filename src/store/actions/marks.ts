/**
 * Akce: značky v půdorysu (pravidla v core/marks.ts). Mazání, posun, kopie a vrstvy jdou společnou cestou volných
 * prvků (core/looseElements.ts). Každá akce = jeden krok Zpět.
 */
import type { Id, Mark, MarkPage, Pt } from '../../model/types';
import { clampDirLength, createMark, defaultDir, markNumberError, nextMarkNumber } from '../../core/marks';
import { store } from '../store';

/** Nová značka klepnutím (číslo = další v projektu); vybere se. Vrací id, nebo null (např. zamčená vrstva Popisky). */
export function addMark(at: Pt): Id | null {
  let id: Id | null = null;
  const ok = store.edit((floor, project) => {
    const m = createMark(at, nextMarkNumber(project));
    (floor.marks ??= {})[m.id] = m;
    id = m.id;
  });
  if (!ok || !id) return null;
  store.set({ selection: { kind: 'mark', id } });
  return id;
}

/** Název, barva (přejmenování, změna barvy). */
export function updateMark(id: Id, patch: Partial<Pick<Mark, 'name' | 'color'>>): void {
  store.edit(floor => {
    const m = floor.marks?.[id];
    if (!m) return false;
    if (patch.name !== undefined) m.name = patch.name.trim();
    if (patch.color !== undefined) m.color = patch.color;
  });
}

/** Ruční změna čísla s kontrolou duplicity v celém projektu. Vrací chybu, nebo null = změněno. */
export function setMarkNumber(id: Id, num: number): string | null {
  const p = store.get().project;
  if (!p) return null;
  const err = markNumberError(p, id, num);
  if (err) return err;
  store.edit(floor => {
    const m = floor.marks?.[id];
    if (!m || m.num === num) return false;
    m.num = num;
  });
  return null;
}

/** Směr pohledu: zapnout / vypnout, styl, úhel a délka (tažení koncového bodu, px na obrazovce). */
export function setMarkDir(id: Id, patch: { on?: boolean; style?: 'cone' | 'arrow'; angle?: number; len?: number }): void {
  store.edit(floor => {
    const m = floor.marks?.[id];
    if (!m) return false;
    const d = (m.dir ??= { ...defaultDir(), on: false });
    if (patch.on !== undefined) d.on = patch.on;
    if (patch.style !== undefined) d.style = patch.style;
    if (patch.angle !== undefined) d.angle = Math.round(patch.angle);
    if (patch.len !== undefined) d.len = clampDirLength(patch.len);
  });
}

/**
 * Obsah značky z okna (poznámka + strany se skicou) – jeden krok Zpět po zavření okna. Vrací false, když se
 * zápis neprovedl (zamčená vrstva, značka neexistuje) – okno pak zůstane otevřené; beze změny = true.
 */
export function setMarkContent(id: Id, note: string, pages: MarkPage[]): boolean {
  const m0 = store.floor()?.marks?.[id];
  if (!m0) return false;
  if (m0.note === note && JSON.stringify(m0.pages) === JSON.stringify(pages)) return true;
  return store.edit(floor => {
    const m = floor.marks![id]!;
    m.note = note;
    m.pages = JSON.parse(JSON.stringify(pages)) as MarkPage[];
  });
}
