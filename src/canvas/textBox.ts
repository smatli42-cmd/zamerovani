/**
 * Rozměry textu na výkresu na obrazovce (společné pro kreslení a hledání pod perem).
 * Šířka je odhad podle počtu znaků – stačí pro rámeček a zásah, bez závislosti na plátně.
 */
import type { TextNote } from '../model/types';
import type { Camera } from '../store/store';

/** Nejmenší čitelná výška písma na obrazovce (px), i když je výkres hodně oddálený. */
const MIN_FONT_PX = 9;
export const LINE_HEIGHT = 1.25;

export function textLines(t: TextNote): string[] {
  return t.text.split('\n');
}

/** Šířka a výška textu v px (bez natočení) a velikost písma v px. */
export function textBoxPx(t: TextNote, cam: Camera): { w: number; h: number; font: number } {
  const font = Math.max(MIN_FONT_PX, t.size * cam.zoom);
  const chars = Math.max(1, ...textLines(t).map(l => l.length));
  return { w: chars * font * 0.58, h: textLines(t).length * font * LINE_HEIGHT, font };
}
