/**
 * Odstupy vybrané skupiny stěn (např. sloupu nebo samostatné příčky) od nejbližších stěn mimo ni.
 * Každé číslo je klikací (NumPad); zadáním se celá skupina posune.
 */
import { componentGap, type Side } from '../core/components';
import type { Floor, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { drawDimLine, type DimStyle } from './drawDims';
import { toScreen } from './view';

const GAP_STYLE: DimStyle = { color: '#0e7490', bg: '#ecfeff', bold: false };
const PERP: Record<Side, Pt> = { left: { x: 0, y: -1 }, right: { x: 0, y: -1 }, top: { x: -1, y: 0 }, bottom: { x: -1, y: 0 } };

export function drawComponentDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, s: number, selection: Selection): void {
  if (selection?.kind !== 'wall' || !floor.walls[selection.id]) return;
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const gap = componentGap(floor, selection.id, side);
    if (!gap) continue;
    drawDimLine(ctx, toScreen(gap.from, cam), toScreen(gap.hit, cam), PERP[side], 0, String(Math.round(gap.value)), undefined, GAP_STYLE, s, {
      type: 'numpad',
      target: { kind: 'comp-gap', wallId: selection.id, side }
    });
  }
}
