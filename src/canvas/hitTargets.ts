/**
 * Klikatelné popisky (kóty, štítky) z posledního vykreslení.
 * Kreslící funkce sem zapisují obdélníky na obrazovce, vstup se jich ptá při ťuknutí.
 */
import type { Id, Pt } from '../model/types';
import type { NumPadTarget } from '../store/store';

export type HitAction =
  | { type: 'numpad'; target: NumPadTarget; wallId?: Id }
  | { type: 'room'; roomId: Id }
  /** Dvojitá šipka u vybrané stěny – přehodí stranu těla. */
  | { type: 'flipWall'; wallId: Id };

export interface HitBox {
  /** Střed na obrazovce (px). */
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  /** Natočení (rad). */
  angle: number;
  action: HitAction;
}

let boxes: HitBox[] = [];

export function resetHitBoxes(): void {
  boxes = [];
}

export function addHitBox(box: HitBox): void {
  boxes.push(box);
}

export function allHitBoxes(): readonly HitBox[] {
  return boxes;
}

/** Je bod uvnitř (natočeného) obdélníku? Tolerance v px pro prst. */
function contains(b: HitBox, p: Pt, tol: number): boolean {
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const c = Math.cos(-b.angle);
  const s = Math.sin(-b.angle);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= b.halfW + tol && Math.abs(ly) <= b.halfH + tol;
}

/** Najde popisek pod bodem (poslední vykreslený má přednost). */
export function hitTest(p: Pt, tol = 4): HitBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i]!;
    if (contains(b, p, tol)) return b;
  }
  return null;
}

/** Překrývá se navrhovaný popisek s už vykresleným? (pro rozmístění kót) */
export function overlapsExisting(b: Omit<HitBox, 'action'>, pad = 3): boolean {
  const ext = (x: Omit<HitBox, 'action'>) => {
    const c = Math.abs(Math.cos(x.angle));
    const s = Math.abs(Math.sin(x.angle));
    return { hx: x.halfW * c + x.halfH * s, hy: x.halfW * s + x.halfH * c };
  };
  const e = ext(b);
  return boxes.some(o => {
    const f = ext(o);
    return Math.abs(o.x - b.x) < e.hx + f.hx + pad && Math.abs(o.y - b.y) < e.hy + f.hy + pad;
  });
}
