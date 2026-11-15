/**
 * Uspořádání dveří se zárubní v řezu stěnou (souřadnice x podél stěny od začátku otvoru, y od líce A ve směru tloušťky).
 *
 * Šířka otvoru v líci: ostění vlevo + zárubeň + dveře + zárubeň + ostění vpravo.
 * Tloušťka stěny T = hloubka ostění z líce A + hloubka zárubně + hloubka ostění z líce B
 * (hloubka z líce B se dopočítává, ukládá se jen hloubka z líce A).
 */
import type { Floor, Opening, OpeningKind, Wall } from '../model/types';
import { isWindowKind } from '../model/factory';
import { hasBody } from './wallFace';
import { wallNodes } from './floorQueries';
import { normal, unit } from './geometry';

export type RevealPart = 'depth' | 'depthBack' | 'left' | 'right' | 'top' | 'frameWidth' | 'frameDepth' | 'frameOffset';

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
  /** Tloušťka stěny (null = otvor jen na čáře líce). */
  T: number | null;
  /** Je zapnuté ostění (aspoň z jednoho líce). */
  reveal: boolean;
  /** Ostění z vnitřního líce (A) / z vnějšího líce (B). U čáry bez tloušťky jen `inner`. */
  inner: boolean;
  outer: boolean;
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
    // bez ostění: zárubeň dveří uprostřed tloušťky, rám okna u vnitřního líce (líc A)
    fo: rv ? dA : (op.frame?.offset ?? (T !== null && op.kind !== 'window' && op.kind !== 'french' ? Math.max(0, (T - F) / 2) : 0)),
    T,
    reveal: !!rv,
    inner: !!rv && (rv.inner || T === null),
    outer: !!rv && T !== null && rv.outer
  };
}

/**
 * Čára v rovině líce přes otvor v půdorysné značce: u okna a francouzského okna plná (navazuje na hrany stěny),
 * u dveří a průchodu čerchovaná (konstrukce nad řezem).
 */
export const faceLineDashed = (kind: OpeningKind): boolean => !isWindowKind(kind);

/**
 * Okraj stěny po jedné straně otvoru v půdorysné značce (x podél stěny od začátku otvoru, y od líce A).
 * `end` 'a' = levá strana (x od 0, ostění `L`), 'b' = pravá strana (x od `span`, ostění `R`).
 * S ostěním je okraj „vykousnutý“ (schod o délku ostění u zárubně / rámu); bez ostění rovná čára přes tloušťku.
 * Prázdné pole = nic se nekreslí (otvor bez ostění v čáře bez tloušťky).
 */
export function jambOutline(lay: DoorLayout, span: number, end: 'a' | 'b'): [number, number][] {
  const w = end === 'a' ? lay.L : lay.R;
  const X = (x: number) => (end === 'a' ? x : span - x);
  let pts: [number, number][];
  if (lay.reveal) {
    const { dA, F, T } = lay;
    // vnitřní líc: s ostěním schod u zárubně, bez něj okraj rovně od líce (líc stěny pokračuje až k okraji)
    pts = lay.inner ? [[0, 0], [0, dA], [w, dA]] : [[0, 0], [w, 0]];
    pts.push([w, dA + F]);
    if (T !== null) {
      if (lay.outer) pts.push([0, dA + F], [0, T]);
      else pts.push([w, T], [0, T]);
    } else pts.push([0, dA + F]);
  } else if (lay.T !== null) pts = [[0, 0], [0, lay.T]];
  else return [];
  // bez duplicitních bodů (nulová šířka / hloubka ostění) a bez bodů uprostřed rovného úseku
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
  const out = uniq.filter((p, i) => {
    const a = uniq[i - 1];
    const b = uniq[i + 1];
    return !a || !b || !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });
  return out.map(([x, y]) => [X(x), y]);
}

/**
 * Tloušťka stěny, ve které leží otvor (otvor se kreslí skrz celé tělo, ostění z obou líců).
 * null = stěna bez tloušťky (čára) – otvor se kreslí jen na čáře.
 */
export function openingThickness(floor: Floor, op: Opening): number | null {
  const wall = floor.walls[op.wallId];
  return wall && hasBody(wall) ? wall.thickness : null;
}

/** Hodnota dílu ostění / zárubně pro zobrazení a NumPad. */
export function revealPartValue(floor: Floor, op: Opening, part: RevealPart): number | null {
  if (part === 'frameWidth') return op.frame?.width ?? null;
  if (part === 'frameDepth') return op.frame?.depth ?? null;
  if (part === 'frameOffset') return op.frame ? Math.round(doorLayout(op, openingThickness(floor, op)).fo) : null;
  if (!op.reveal) return null;
  if (part === 'depthBack') {
    const T = openingThickness(floor, op);
    return T === null ? null : Math.round(doorLayout(op, T).dB);
  }
  return op.reveal[part];
}

/**
 * Zapíše hodnotu dílu ostění / zárubně a udrží vazby: tloušťka stěny = ostění A + zárubeň + ostění B.
 * Délky ostění (left/right) a šířka zárubně mění celkovou šířku otvoru – okraj u referenčního rohu to řeší volající.
 */
export function applyRevealPart(floor: Floor, op: Opening, part: RevealPart, value: number): boolean {
  const T = openingThickness(floor, op);
  const v = Math.max(0, Math.round(value));
  if (part === 'frameWidth') {
    // rám okna má pevnou šířku WINDOW_FRAME.width (50 mm), mění se jen zárubeň dveří
    if (!op.frame || isWindowKind(op.kind)) return false;
    op.frame.width = v;
    return true;
  }
  if (part === 'frameOffset') {
    if (!op.frame) return false;
    op.frame.offset = T !== null ? Math.min(v, Math.max(0, T - op.frame.depth)) : v;
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

/** Ve stěně s tloušťkou se křídlo dveří / francouzského okna výchozí otevírá do místnosti (od těla stěny). */
export const leafSwingIntoRoom = (wall: Wall): 1 | -1 => (wall.side === 1 ? -1 : 1);

/**
 * Strana (`swing`) stěny směrem ven od středu výkresu – výchozí strana rámu okna v obvodové stěně kreslené jednou čarou
 * (rám začíná v líci a jde do stěny, tedy ven).
 */
export function outwardSwing(floor: Floor, wall: Wall): 1 | -1 {
  const n = wallNodes(floor, wall);
  const nodes = Object.values(floor.nodes);
  if (!n || nodes.length === 0) return 1;
  const c = { x: nodes.reduce((s, p) => s + p.x, 0) / nodes.length, y: nodes.reduce((s, p) => s + p.y, 0) / nodes.length };
  const m = { x: (n[0].x + n[1].x) / 2, y: (n[0].y + n[1].y) / 2 };
  const nrm = normal(unit(n[0], n[1]));
  return nrm.x * (m.x - c.x) + nrm.y * (m.y - c.y) >= 0 ? 1 : -1;
}
