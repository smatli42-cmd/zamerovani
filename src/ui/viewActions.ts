/**
 * Akce pohledu (vycentrování výkresu).
 */
import { canvasSize } from '../canvas/renderer';
import { fitCamera } from '../canvas/view';
import { store } from '../store/store';

export function fitToDrawing(): void {
  const floor = store.floor();
  const { width, height } = canvasSize();
  if (!width || !height) return;
  const pts = floor ? [...Object.values(floor.nodes), ...Object.values(floor.rooms)] : [];
  // Na širokém displeji necháme vpravo místo pro panel vlastností / NumPad
  const reserve = width > 900 ? 330 : 0;
  store.set({ camera: fitCamera(pts, width, height, 90, reserve) });
}
