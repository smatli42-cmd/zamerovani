/**
 * Akce: volné kóty mezi dvěma body (core/freeDim.ts). Délka se zadává NumPadem (cíl `free-dim`, actions/numpad.ts).
 */
import { newId } from '../../model/factory';
import type { DimEnd, Id } from '../../model/types';
import { dimPoints, sameEnd } from '../../core/freeDim';
import { dist } from '../../core/geometry';
import { store } from '../store';
import { applyDrag, dragStart, type DimDrag, type DragStart } from '../../core/dimPlace';

/** Přidá kótu mezi body `a` a `b` (vybere se). null = stejný bod / nulová délka. */
export function addFreeDim(a: DimEnd, b: DimEnd, offset = 0): Id | null {
  const floor = store.floor();
  // kóta, která nejde změřit (nerovnoběžné hrany, nulová délka), nevznikne
  const pts = floor && dimPoints(floor, { id: '', a, b, offset: 0 });
  if (!pts || sameEnd(a, b) || dist(pts[0], pts[1]) < 1) return null;
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

/** Začátek tažení kóty za číslo (core/dimPlace.ts); null = kóta už neexistuje. */
export function beginDimDrag(drag: DimDrag): DragStart | null {
  const floor = store.floor();
  return floor ? dragStart(floor, drag) : null;
}

/**
 * Posun tažené kóty: od začátku tažení o `dOff` mm kolmo a `dAlong` mm podél (volá se při každém pohybu
 * během jednoho gesta = jeden krok Zpět). Blíž než `snap` mm k výchozí poloze = výchozí poloha.
 */
export function dragDim(drag: DimDrag, start: DragStart, dOff: number, dAlong: number, snap: number): void {
  store.edit(f => {
    applyDrag(f, drag, start, dOff, dAlong, snap);
  });
}
