/**
 * Akce: výchozí hodnota a zápis hodnoty z NumPadu.
 */
import { revealPartValue } from '../../core/doorLayout';
import type { Floor } from '../../model/types';
import { arcChain, setChainSagitta } from '../../core/arcChain';
import { openingSpan, openingStartFromA, wallLength } from '../../core/floorQueries';
import { componentGap, setComponentGap } from '../../core/components';
import { store, type NumPadTarget } from '../store';
import { setGap, setOpeningWidth, setReveal, setStartFromA } from './openings';
import { applyWallLength, resizeCircle } from './walls';

/** Výchozí hodnota zobrazená v NumPadu pro daný cíl. */
export function numpadInitialValue(floor: Floor, t: NumPadTarget): number | null {
  switch (t.kind) {
    case 'wall-length': {
      const w = floor.walls[t.wallId];
      return w ? (w.measured ?? Math.round(wallLength(floor, w))) : null;
    }
    case 'opening-offset': {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return null;
      const len = wallLength(floor, wall);
      const start = openingStartFromA(op, len);
      return Math.round(t.ref === 'a' ? start : len - start - openingSpan(op));
    }
    case 'opening-width':
      return floor.openings[t.openingId]?.width ?? null;
    case 'opening-reveal':
      {
        const op = floor.openings[t.openingId];
        return op ? revealPartValue(floor, op, t.part) : null;
      }
    case 'wall-sagitta': {
      const w = floor.walls[t.wallId];
      return w ? Math.round(Math.abs(arcChain(floor, w.id)?.sagitta ?? w.sagitta ?? 0)) : null;
    }
    case 'wall-thickness':
      return floor.walls[t.wallId]?.thickness ?? null;
    case 'circle-diameter': {
      const w = floor.walls[t.wallId];
      return w?.radius !== undefined ? w.radius * 2 : null;
    }
    case 'comp-gap': {
      const g = componentGap(floor, t.wallId, t.side);
      return g ? Math.round(g.value) : null;
    }
    case 'opening-gap': {
      const a = floor.openings[t.firstId];
      const b = floor.openings[t.secondId];
      const wall = a && floor.walls[a.wallId];
      if (!a || !b || !wall) return null;
      const len = wallLength(floor, wall);
      return Math.round(openingStartFromA(b, len) - (openingStartFromA(a, len) + openingSpan(a)));
    }
  }
}

/** Zapíše hodnotu z NumPadu do výkresu. */
export function applyNumpadValue(t: NumPadTarget, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (t.kind === 'wall-length') return applyWallLength(t.wallId, value, t.move);
  let ok = false;
  store.edit(floor => {
    if (t.kind === 'opening-offset') {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return;
      const len = wallLength(floor, wall);
      op.ref = t.ref;
      op.offset = Math.round(value);
      setStartFromA(op, openingStartFromA(op, len), len);
      ok = true;
    } else if (t.kind === 'opening-width') {
      const op = floor.openings[t.openingId];
      if (!op || value < 100) return;
      setOpeningWidth(floor, op, value);
      ok = true;
    } else if (t.kind === 'opening-reveal') {
      const op = floor.openings[t.openingId];
      if (!op) return;
      ok = setReveal(floor, op, t.part, value);
    } else if (t.kind === 'opening-gap') {
      setGap(floor, t.firstId, t.secondId, value);
      ok = true;
    } else if (t.kind === 'wall-sagitta') {
      const w = floor.walls[t.wallId];
      if (!w || value < 1) return;
      const sign = Math.sign(arcChain(floor, w.id)?.sagitta ?? w.sagitta ?? 0) || 1;
      if (!setChainSagitta(floor, w.id, sign * value)) w.sagitta = sign * value;
      ok = true;
    } else if (t.kind === 'wall-thickness') {
      const w = floor.walls[t.wallId];
      if (!w || value < 10) return;
      w.thickness = Math.round(value);
      ok = true;
    } else if (t.kind === 'circle-diameter') {
      if (value < 10) return;
      ok = resizeCircle(floor, t.wallId, value / 2);
    } else if (t.kind === 'comp-gap') {
      ok = setComponentGap(floor, t.wallId, t.side, value);
    }
  });
  return ok;
}
