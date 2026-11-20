/**
 * Značky v půdorysu (core/marks.ts): štítek s barevně odlišeným číslem (barva značky, bílé písmo) a názvem (bílé pole,
 * tmavé písmo) – přání uživatele 2026-11-20; ikona podle obsahu; volitelný směr pohledu (kužel / šipka) pod
 * štítkem až do cíle ve výkresu (mm – při zoomu ukazuje pořád na stejné místo), úchyt na cíli.
 * Štítek má na obrazovce stálou velikost (nezávisí na zoomu).
 */
import type { Floor, Mark } from '../model/types';
import { markBoxPx, markCode, markCodePx, markContent, marksOf, MARK_PX } from '../core/marks';
import { isSelected, type Camera, type Selection } from '../store/store';
import { toScreen } from './view';

/** Konec směru na obrazovce (px) – úchyt; null, když leží pod štítkem (pak se táhne štítek). Kreslení i zásah (tools/pick.ts). */
export function markDirHandle(m: Mark, cam: Camera): { x: number; y: number } | null {
  if (!m.dir?.on) return null;
  const c = toScreen(m, cam);
  const t = toScreen(m.dir.to, cam);
  const { w, h } = markBoxPx(m);
  if (Math.abs(t.x - c.x) <= w / 2 + 4 && Math.abs(t.y - c.y) <= h / 2 + 4) return null;
  return t;
}

/** Největší poloměr výplně kužele na obrazovce (px). */
const CONE_MAX_PX = 180;

function drawDir(ctx: CanvasRenderingContext2D, m: Mark, cam: Camera): void {
  if (!m.dir?.on) return;
  const c = toScreen(m, cam);
  const t = toScreen(m.dir.to, cam);
  const L = Math.hypot(t.x - c.x, t.y - c.y);
  if (L < 2) return;
  const a = Math.atan2(t.y - c.y, t.x - c.x);
  ctx.save();
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  if (m.dir.style === 'cone') {
    const half = (30 * Math.PI) / 180;
    // výplň kužele jen do CONE_MAX_PX (velký zoom by zakryl výkres), dál čárkovaná osa přesně do cíle
    const R = Math.min(L, CONE_MAX_PX);
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, R, a - half, a + half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // osa kužele až do cíle (přesné místo) a značka cíle
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    const hd = 11;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x - Math.cos(a - 0.45) * hd, t.y - Math.sin(a - 0.45) * hd);
    ctx.lineTo(t.x - Math.cos(a + 0.45) * hd, t.y - Math.sin(a + 0.45) * hd);
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

/** Text do šířky `w` (písmo se zmenší, kdyby odhad šířky nestačil). */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, weight: number): void {
  ctx.font = `${weight} 12px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  if (tw > w - 10) ctx.font = `${weight} ${Math.max(8, Math.floor((12 * (w - 10)) / tw))}px system-ui, sans-serif`;
  ctx.fillText(text, x, y);
}

export function drawMarks(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  const marks = marksOf(floor);
  // směry pod štítky (žádný kužel nezakryje číslo ani název)
  for (const m of marks) drawDir(ctx, m, cam);
  for (const m of marks) {
    const selected = isSelected(selection, 'mark', m.id);
    const c = toScreen(m, cam);
    const { w, h } = markBoxPx(m);
    const cw = Math.min(w, markCodePx(m));
    const x = c.x - w / 2;
    const y = c.y - h / 2;
    const r = h / 2;
    ctx.save();
    if (selected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 4, w + 8, h + 8, r + 4);
      ctx.stroke();
    }
    // celý štítek: bílé pole s okrajem barvy značky (název)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    // část s číslem: barva značky, bílé písmo
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, h, cw >= w ? r : [r, 0, 0, r]);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    fitText(ctx, markCode(m), x + cw / 2, c.y + 0.5, cw, 800);
    if (m.name) {
      ctx.fillStyle = '#0f172a';
      fitText(ctx, m.name, x + cw + (w - cw) / 2, c.y + 0.5, w - cw, 600);
    }
    // ikona podle obsahu (jen text / skica) na rohu štítku
    const content = markContent(m);
    if (content) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(content === 'photo' ? '📷' : content === 'sketch' ? '✏️' : '📝', x + w - 2, y - 1);
    }
    ctx.restore();
    if (selected) drawHandle(ctx, m, cam);
  }
}
