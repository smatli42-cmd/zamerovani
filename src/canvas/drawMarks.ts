/**
 * Značky v půdorysu (core/marks.ts): štítek s číslem i názvem (jeden celek – směr pohledu ho nezakrývá), ikona
 * podle obsahu, volitelný směr pohledu (kužel / šipka) pod štítkem s úchytem na konci (úhel i délka).
 * Velikost je na obrazovce stálá (nezávisí na zoomu).
 */
import type { Floor, Mark } from '../model/types';
import { dirLength, dirVector, markBoxPx, markContent, markLabel, marksOf, MARK_PX } from '../core/marks';
import { isSelected, type Camera, type Selection } from '../store/store';
import { toScreen } from './view';

/** Koncový bod směru na obrazovce (px) – úchyt pro otočení a délku; kreslení i zásah perem (tools/pick.ts). */
export function markDirHandle(m: Mark, cam: Camera): { x: number; y: number } | null {
  if (!m.dir?.on) return null;
  const c = toScreen(m, cam);
  const u = dirVector(m.dir.angle);
  const L = dirLength(m);
  return { x: c.x + u.x * L, y: c.y + u.y * L };
}

function drawDir(ctx: CanvasRenderingContext2D, m: Mark, cam: Camera): void {
  if (!m.dir?.on) return;
  const c = toScreen(m, cam);
  const a = (m.dir.angle * Math.PI) / 180;
  const L = dirLength(m);
  ctx.save();
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  if (m.dir.style === 'cone') {
    const half = (30 * Math.PI) / 180;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, L, a - half, a + half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    const tip = { x: c.x + Math.cos(a) * L, y: c.y + Math.sin(a) * L };
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const h = 11;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - Math.cos(a - 0.45) * h, tip.y - Math.sin(a - 0.45) * h);
    ctx.lineTo(tip.x - Math.cos(a + 0.45) * h, tip.y - Math.sin(a + 0.45) * h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, m: Mark, cam: Camera): void {
  const hd = markDirHandle(m, cam);
  if (!hd) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, MARK_PX.handle * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawMarks(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  const marks = marksOf(floor);
  // směry pod štítky (žádný kužel nezakryje číslo ani název)
  for (const m of marks) drawDir(ctx, m, cam);
  for (const m of marks) {
    const selected = isSelected(selection, 'mark', m.id);
    const c = toScreen(m, cam);
    const { w, h } = markBoxPx(m);
    const x = c.x - w / 2;
    const y = c.y - h / 2;
    ctx.save();
    if (selected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 4, w + 8, h + 8, h / 2 + 4);
      ctx.stroke();
    }
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // šířka štítku je odhad – široká písmena by text vytlačila ven, písmo se pak zmenší
    const label = markLabel(m);
    const tw = ctx.measureText(label).width;
    if (tw > w - 14) ctx.font = `700 ${Math.max(8, Math.floor((12 * (w - 14)) / tw))}px system-ui, sans-serif`;
    ctx.fillText(label, c.x, c.y + 0.5);
    // ikona podle obsahu (jen text / skica) na rohu štítku
    const content = markContent(m);
    if (content) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(content === 'sketch' ? '✏️' : '📝', x + w - 2, y - 1);
    }
    ctx.restore();
    if (selected) drawHandle(ctx, m, cam);
  }
}
