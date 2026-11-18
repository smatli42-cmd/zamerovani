/**
 * Akce: volné kóty mezi dvěma body (core/freeDim.ts). Délka se zadává NumPadem (cíl `free-dim`, actions/numpad.ts).
 */
import { newId } from '../../model/factory';
import type { DimEnd, Id } from '../../model/types';
import { endPoint, sameEnd } from '../../core/freeDim';
import { dist } from '../../core/geometry';
import { store } from '../store';

/** Přidá kótu mezi body `a` a `b` (vybere se). null = stejný bod / nulová délka. */
export function addFreeDim(a: DimEnd, b: DimEnd, offset = 0): Id | null {
  const floor = store.floor();
  const pa = floor && endPoint(floor, a);
  const pb = floor && endPoint(floor, b);
  if (!pa || !pb || sameEnd(a, b) || dist(pa, pb) < 1) return null;
  const id = newId('dim');
  store.edit(
    f => {
      (f.dims ??= {})[id] = { id, a: { ...a }, b: { ...b }, offset: Math.round(offset) };
    },
    { selection: { kind: 'dim', id } }
  );
  return id;
}

/** Odsazení kótovací čáry od spojnice bodů (mm, se znaménkem). */
export function setFreeDimOffset(id: Id, offset: number): void {
  if (!Number.isFinite(offset)) return;
  store.edit(f => {
    const d = f.dims?.[id];
    if (!d) return false;
    d.offset = Math.round(offset);
  });
}
