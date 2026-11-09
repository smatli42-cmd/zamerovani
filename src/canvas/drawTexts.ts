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

/** Odkazová čára podle zvyklosti: vodorovná čára pod textem (stejně dlouhá jako text) a z jejího konce šikmá čára k hrotu se šipkou. */
function drawLeader(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, tip: { x: number; y: number }, angle: number, w: number, h: number, selected: boolean): void {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const toScr = (x: number, y: number) => ({ x: from.x + x * cos - y * sin, y: from.y + x * sin + y * cos });
  const lx = (tip.x - from.x) * cos + (tip.y - from.y) * sin; // hrot v souřadnicích natočeného textu
  const hw = w / 2 + 4;
  const yl = h / 2 + 3;
  const u1 = toScr(-hw, yl);
  const u2 = toScr(hw, yl);
  const st = toScr(lx < 0 ? -hw : hw, yl); // šikmá čára začíná na straně, kde je hrot
  const sx = st.x;
  const sy = st.y;
  const ang = Math.atan2(tip.y - sy, tip.x - sx);
  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(u1.x, u1.y);
  ctx.lineTo(u2.x, u2.y);
  ctx.stroke();
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
