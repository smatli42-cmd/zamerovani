/**
 * Akce pohledu (vycentrování výkresu).
 */
import { canvasSize } from '../canvas/renderer';
import { fitCamera } from '../canvas/view';
import { store } from '../store/store';
import type { Floor, Pt } from '../model/types';
import { drawingPolylines } from '../core/drawing';
import { stairOutlines } from '../core/stairs';
import { strokesOf } from '../core/strokes';
import { dimLine, dimPoints } from '../core/freeDim';

/** Body všeho, co je ve výkresu: rohy stěn, štítky, texty, kresba, schodiště, ruční tahy, volné kóty. */
function drawingPoints(floor: Floor): Pt[] {
  return [
    ...Object.values(floor.nodes),
    ...Object.values(floor.rooms),
    ...Object.values(floor.texts),
    ...Object.values(floor.marks ?? {}),
    ...Object.values(floor.drawings ?? {}).flatMap(d => drawingPolylines(d).flat()),
    ...Object.values(floor.stairs ?? {}).flatMap(st => stairOutlines(st).flat()),
    ...strokesOf(floor).flatMap(st => st.pts),
    ...Object.values(floor.dims ?? {}).flatMap(d => [...(dimPoints(floor, d) ?? []), ...(dimLine(floor, d) ?? [])])
  ];
}

export function fitToDrawing(): void {
  const floor = store.floor();
  const { width, height } = canvasSize();
  if (!width || !height) return;
  const pts = floor ? drawingPoints(floor) : [];
  // Na širokém displeji necháme vpravo místo pro panel vlastností / NumPad
  const reserve = width > 900 ? 330 : 0;
  store.set({ camera: fitCamera(pts, width, height, 90, reserve) });
}
