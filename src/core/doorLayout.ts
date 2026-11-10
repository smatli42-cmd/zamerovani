/**
 * Uspořádání dveří se zárubní v řezu stěnou (souřadnice x podél stěny od začátku otvoru, y od líce A ve směru tloušťky).
 *
 * Šířka otvoru v líci: ostění vlevo + zárubeň + dveře + zárubeň + ostění vpravo.
 * Tloušťka příčky T = hloubka ostění z líce A + hloubka zárubně + hloubka ostění z líce B
 * (hloubka z líce B se dopočítává, ukládá se jen hloubka z líce A).
 */
import type { Floor, Opening } from '../model/types';
import { partitionThickness } from './pairing';

export type RevealPart = 'depth' | 'depthBack' | 'left' | 'right' | 'top' | 'frameWidth' | 'frameDepth';

export interface DoorLayout {
  /** Délka ostění vlevo / vpravo (mm podél stěny). */
  L: number;
  R: number;
  /** Šířka a hloubka zárubně. */
  fw: number;
  F: number;
  /** Hloubka ostění z líce A / z líce B (0 = bez vykousnutí). */
  dA: number;
  dB: number;
  /** Odstup zárubně od líce A. */
  fo: number;
  /** Tloušťka příčky (null = obyčejná stěna). */
  T: number | null;
  /** Je zapnuté ostění. */
  reveal: boolean;
}

export function doorLayout(op: Opening, T: number | null): DoorLayout {
  const rv = op.reveal;
  const F = op.frame?.depth ?? 0;
  const dA = rv ? Math.max(0, rv.depth) : 0;
  const dB = rv && T !== null ? Math.max(0, T - F - dA) : 0;
  return {
    L: rv?.left ?? 0,
    R: rv?.right ?? 0,
    fw: op.frame?.width ?? 0,
    F,
    dA,
    dB,
    fo: rv ? dA : T !== null ? Math.max(0, (T - F) / 2) : 0,
    T,
    reveal: !!rv
  };
}

/** Tloušťka příčky, ve které leží otvor (null u obyčejné stěny). */
export function openingThickness(floor: Floor, op: Opening): number | null {
  const wall = floor.walls[op.wallId];
  return wall ? partitionThickness(floor, wall) : null;
}

/** Hodnota dílu ostění / zárubně pro zobrazení a NumPad. */
export function revealPartValue(floor: Floor, op: Opening, part: RevealPart): number | null {
  if (part === 'frameWidth') return op.frame?.width ?? null;
  if (part === 'frameDepth') return op.frame?.depth ?? null;
  if (!op.reveal) return null;
  if (part === 'depthBack') {
    const T = openingThickness(floor, op);
    return T === null ? null : Math.round(doorLayout(op, T).dB);
  }
  return op.reveal[part];
}

/**
 * Zapíše hodnotu dílu ostění / zárubně a udrží vazby: tloušťka příčky = ostění A + zárubeň + ostění B.
 * Délky ostění (left/right) a šířka zárubně mění celkovou šířku otvoru – okraj u referenčního rohu to řeší volající.
 */
export function applyRevealPart(floor: Floor, op: Opening, part: RevealPart, value: number): boolean {
  const T = openingThickness(floor, op);
  const v = Math.max(0, Math.round(value));
  if (part === 'frameWidth') {
    if (!op.frame) return false;
    op.frame.width = v;
    return true;
  }
  if (part === 'frameDepth') {
    if (!op.frame) return false;
    const old = op.frame.depth;
    op.frame.depth = Math.max(10, v);
    if (op.reveal && T !== null) {
      // změna hloubky zárubně přerozdělí hloubky obou ostění (poměr zůstane)
      const dA0 = op.reveal.depth;
      const total0 = dA0 + Math.max(0, T - old - dA0);
      const total1 = Math.max(0, T - op.frame.depth);
      op.reveal.depth = Math.round(total0 > 0 ? (dA0 * total1) / total0 : total1 / 2);
    }
    return true;
  }
  if (!op.reveal) return false;
  if (part === 'depth') {
    op.reveal.depth = T !== null && op.frame ? Math.min(v, Math.max(0, T - op.frame.depth)) : v;
  } else if (part === 'depthBack') {
    if (T === null || !op.frame) return false;
    op.reveal.depth = Math.max(0, T - op.frame.depth - v);
  } else {
    op.reveal[part] = v;
  }
  return true;
}
