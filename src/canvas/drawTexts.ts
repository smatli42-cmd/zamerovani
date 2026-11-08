/**
 * Samostatné texty na výkresu.
 */
import type { Floor } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { LINE_HEIGHT, textBoxPx, textLines } from './textBox';
import { toScreen } from './view';

export function drawTexts(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  ctx.save();
  for (const t of Object.values(floor.texts)) {
    const p = toScreen(t, cam);
    const { w, h, font } = textBoxPx(t, cam);
    const selected = selection?.kind === 'text' && selection.id === t.id;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((t.angle * Math.PI) / 180);
    if (selected) {
      ctx.fillStyle = 'rgba(219,234,254,0.8)';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-w / 2 - 4, -h / 2 - 2, w + 8, h + 4, 4);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 ${font}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textLines(t).forEach((line, i, all) => ctx.fillText(line, 0, (i - (all.length - 1) / 2) * font * LINE_HEIGHT));
    ctx.restore();
  }
  ctx.restore();
}
