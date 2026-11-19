/**
 * Akce: ruční tahy perem (pravidla v core/strokes.ts, vrstvy v core/layers.ts).
 */
import { newId } from '../../model/factory';
import type { Id, Pt } from '../../model/types';
import { strokesToErase } from '../../core/strokes';
import { store } from '../store';

/** Nový ruční tah (body už vyhlazené, mm); vrstvu doplní `store.edit` = aktivní vrstva. Vrací id. */
export function addStroke(pts: Pt[], width: number): Id | null {
  if (!pts.length || !(width > 0)) return null;
  const id = newId('sk');
  const ok = store.edit(f => {
    (f.strokes ??= {})[id] = { id, pts: pts.map(p => ({ x: p.x, y: p.y })), width };
  });
  return ok ? id : null;
}

/** Tloušťka tahu (mm výkresu). */
export function setStrokeWidth(id: Id, width: number): void {
  if (!(width > 0)) return;
  store.edit(f => {
    const s = f.strokes?.[id];
    if (!s || s.width === width) return false;
    s.width = width;
  });
}

/**
 * Guma: smaže celé tahy pod bodem v aktivní vrstvě (viditelné a odemčené). Volá se v gestu – celé gumování
 * jedním tahem je jeden krok Zpět. Vrací počet smazaných.
 */
export function eraseStrokesAt(at: Pt, tol: number): number {
  const floor = store.floor();
  if (!floor) return 0;
  const ids = strokesToErase(store.get().project, floor, at, tol);
  if (!ids.length) return 0;
  store.edit(
    f => {
      for (const id of ids) delete f.strokes![id];
    },
    { selection: null }
  );
  return ids.length;
}
