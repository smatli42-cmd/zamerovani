/**
 * Kreslení ručních tahů (core/strokes.ts): barva = barva vrstvy, tloušťka v mm výkresu (× zoom).
 * Renderer volá pro každou vrstvu zvlášť s podlažím omezeným na tu vrstvu.
 */
import { strokesOf } from '../core/strokes';
import type { Floor } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { COLORS, isSel } from './drawPlan';
import { toScreen } from './view';

export function drawStrokes(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, color: string, selection: Selection, hover: Selection): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokesOf(floor)) {
    const pts = s.pts.map(p => toScreen(p, cam));
    if (!pts.length) continue;
    const path = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      // tah z jednoho bodu = tečka
      if (pts.length === 1) ctx.lineTo(pts[0]!.x + 0.01, pts[0]!.y);
    };
    const w = Math.max(0.75, s.width * cam.zoom);
    const sel = isSel(selection, 'stroke', s.id);
    const hov = isSel(hover, 'stroke', s.id);
    if (sel || hov) {
      ctx.strokeStyle = sel ? 'rgba(37,99,235,0.35)' : 'rgba(147,197,253,0.45)';
      ctx.lineWidth = w + 10;
      path();
      ctx.stroke();
    }
    ctx.strokeStyle = sel ? COLORS.selected : color;
    ctx.lineWidth = w;
    path();
    ctx.stroke();
  }
  ctx.restore();
}
