/**
 * Značky v půdorysu (core/marks.ts): kroužek s číslem, vedle název, ikona podle obsahu, volitelný směr pohledu
 * (kužel / šipka). Velikost je na obrazovce stálá (nezávisí na zoomu).
 */
import type { Floor, Mark } from '../model/types';
import { dirVector, markCode, markContent, marksOf, MARK_PX } from '../core/marks';
import { isSelected, type Camera, type Selection } from '../store/store';
import { toScreen } from './view';

/** Poloha úchytu směru na obrazovce (px) – kreslení i zásah perem (tools/pick.ts). */
export function markDirHandle(m: Mark, cam: Camera): { x: number; y: number } | null {
  if (!m.dir?.on) return null;
  const c = toScreen(m, cam);
  const u = dirVector(m.dir.angle);
  return { x: c.x + u.x * MARK_PX.dirLen, y: c.y + u.y * MARK_PX.dirLen };
}

function drawDir(ctx: CanvasRenderingContext2D, m: Mark, cam: Camera, selected: boolean): void {
  if (!m.dir?.on) return;
  const c = toScreen(m, cam);
  const a = (m.dir.angle * Math.PI) / 180;
  const L = MARK_PX.dirLen;
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
    ctx.moveTo(c.x + Math.cos(a) * MARK_PX.r, c.y + Math.sin(a) * MARK_PX.r);
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
  // úchyt pro otočení (jen u vybrané značky)
  const hd = selected ? markDirHandle(m, cam) : null;
  if (hd) {
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
}

export function drawMarks(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  for (const m of marksOf(floor)) {
    const selected = isSelected(selection, 'mark', m.id);
    drawDir(ctx, m, cam, selected);
    const c = toScreen(m, cam);
    const r = MARK_PX.r;
    ctx.save();
    if (selected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const code = markCode(m);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${code.length > 3 ? 10 : 12}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, c.x, c.y + 0.5);
    // ikona podle obsahu (jen text / skica)
    const content = markContent(m);
    if (content) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(content === 'sketch' ? '✏️' : '📝', c.x + r * 0.9, c.y - r * 0.9);
    }
    if (m.name) {
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const w = ctx.measureText(m.name).width;
      const x = c.x + r + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(x - 3, c.y - 10, w + 6, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillText(m.name, x, c.y + 0.5);
    }
    ctx.restore();
  }
}
