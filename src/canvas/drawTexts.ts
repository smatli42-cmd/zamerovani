/**
 * Samostatné texty na výkresu.
 */
import type { Floor } from '../model/types';
import { isSelected, type Camera, type Selection } from '../store/store';
import { LINE_HEIGHT, textBoxPx, textLines } from './textBox';
import { toScreen } from './view';

export function drawTexts(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  ctx.save();
  for (const t of Object.values(floor.texts)) {
    const p = toScreen(t, cam);
    const { w, h, font } = textBoxPx(t, cam);
    const selected = isSelected(selection, 'text', t.id);
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
    if (t.leader) drawLeader(ctx, p, toScreen(t.leader, cam), t.angle, w, h, selected);
  }
  ctx.restore();
}

/** Odkazová čára od okraje textu k hrotu se šipkou (hrot je při výběru úchyt). */
function drawLeader(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, tip: { x: number; y: number }, angle: number, w: number, h: number, selected: boolean): void {
  const a = (angle * Math.PI) / 180;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  // hrot v souřadnicích natočeného textu, čára začíná na okraji rámečku textu
  const lx = dx * Math.cos(-a) - dy * Math.sin(-a);
  const ly = dx * Math.sin(-a) + dy * Math.cos(-a);
  const hw = w / 2 + 4;
  const hh = h / 2 + 2;
  const k = Math.min(Math.abs(lx) > 1e-6 ? hw / Math.abs(lx) : Infinity, Math.abs(ly) > 1e-6 ? hh / Math.abs(ly) : Infinity);
  if (k >= 1) return; // hrot uvnitř textu
  const sx = from.x + (lx * k) * Math.cos(a) - (ly * k) * Math.sin(a);
  const sy = from.y + (lx * k) * Math.sin(a) + (ly * k) * Math.cos(a);
  const ang = Math.atan2(tip.y - sy, tip.x - sx);
  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - 12 * Math.cos(ang - 0.35), tip.y - 12 * Math.sin(ang - 0.35));
  ctx.lineTo(tip.x - 12 * Math.cos(ang + 0.35), tip.y - 12 * Math.sin(ang + 0.35));
  ctx.closePath();
  ctx.fill();
  if (selected) {
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}
