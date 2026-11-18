/**
 * Volné kóty (core/freeDim.ts): kótovací čára s odsazením, klikací číslo otevře NumPad (výchozí posouvaný bod
 * vybere `defaultFreeDimMove` při otevření, v NumPadu jde přepnout), zamčená kóta má ikonu zámku. Vybraná / pod perem modře.
 */
import { dimLine, dimPoints, freeDimsOf } from '../core/freeDim';
import { dist, normal, scale, sub } from '../core/geometry';
import type { Floor } from '../model/types';
import { isSelected, type Camera, type Selection } from '../store/store';
import { drawDimLine, type DimStyle } from './dimLine';
import { toScreen } from './view';

const STYLE: DimStyle = { color: '#334155', bg: '#ffffff', bold: false };
const SEL: DimStyle = { color: '#2563eb', bg: '#eff6ff', bold: true };

export function drawFreeDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection, hover: Selection): void {
  for (const d of freeDimsOf(floor)) {
    const pts = dimPoints(floor, d);
    const line = dimLine(floor, d);
    if (!pts || !line) continue;
    const p1 = toScreen(pts[0], cam);
    const p2 = toScreen(pts[1], cam);
    if (dist(p1, p2) < 1e-6) continue;
    // směr odsazení na obrazovce (normála a→b posunutá o znaménko odsazení)
    const n = normal(scale(sub(p2, p1), 1 / dist(p1, p2)));
    const out = d.offset < 0 ? scale(n, -1) : n;
    const on = isSelected(selection, 'dim', d.id) || isSelected(hover, 'dim', d.id);
    drawDimLine(ctx, p1, p2, out, Math.abs(d.offset) * cam.zoom, String(Math.round(dist(pts[0], pts[1]))), undefined, on ? SEL : STYLE, dimScale, {
      type: 'numpad',
      target: { kind: 'free-dim', dimId: d.id, move: 'b' }
    });
  }
}
