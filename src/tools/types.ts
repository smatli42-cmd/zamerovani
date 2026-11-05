/**
 * Společné rozhraní nástrojů. Vstup (input/pointer.ts) předává události aktivnímu nástroji.
 */
import type { Pt } from '../model/types';
import type { Camera } from '../store/store';

export interface PointerInput {
  /** Pozice ve světě (mm). */
  world: Pt;
  /** Pozice na plátně (px). */
  screen: Pt;
  device: 'pen' | 'mouse' | 'touch';
}

export interface Tool {
  /** Stisk (pero / levé tlačítko / prst, pokud prst kreslí). */
  down?(p: PointerInput): void;
  /** Pohyb se stisknutým hrotem. */
  drag?(p: PointerInput): void;
  /** Uvolnění. */
  up?(p: PointerInput): void;
  /** Pohyb bez stisku (myš, pero nad displejem). */
  hover?(p: PointerInput): void;
  /** Zrušení rozdělané akce (Esc, druhý prst…). */
  cancel?(): void;
  /** Dočasná grafika nástroje (náhled kreslené stěny, vodítka). */
  drawOverlay?(ctx: CanvasRenderingContext2D, cam: Camera): void;
}

/** Tolerance zásahu prstem/perem v px (převádí se na mm podle zoomu). */
export const HIT_PX = {
  node: 18,
  wall: 16,
  snapNode: 16,
  snapAlign: 10
} as const;
