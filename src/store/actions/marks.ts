/**
 * Akce: značky v půdorysu (pravidla v core/marks.ts). Mazání, posun, kopie a vrstvy jdou společnou cestou volných
 * prvků (core/looseElements.ts). Každá akce = jeden krok Zpět.
 */
import type { Id, Mark, MarkPage, Pt } from '../../model/types';
import { createMark, defaultDir, dirAngle, dirDistance, dirTarget, markNumberError, nextMarkNumber } from '../../core/marks';
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

/**
 * Směr pohledu: zapnout / vypnout, styl, cíl ve výkresu (`to` – tažení koncového bodu), nebo úhel / vzdálenost
 * (panel; druhá hodnota zůstane).
 */
export function setMarkDir(id: Id, patch: { on?: boolean; style?: 'cone' | 'arrow'; to?: Pt; angle?: number; dist?: number }): void {
  store.edit(floor => {
    const m = floor.marks?.[id];
    if (!m) return false;
    const d = (m.dir ??= { ...defaultDir(m), on: false });
    if (patch.on !== undefined) d.on = patch.on;
    if (patch.style !== undefined) d.style = patch.style;
    if (patch.to) d.to = { x: Math.round(patch.to.x), y: Math.round(patch.to.y) };
    if (patch.angle !== undefined || patch.dist !== undefined) {
      // cíl ležící přesně na značce nemá směr – pak nahoru (výchozí)
      const angle = patch.angle ?? (dirDistance(m) > 0 ? dirAngle(m) : -90);
      d.to = dirTarget(m, angle, Math.max(1, patch.dist ?? dirDistance(m)));
    }
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
