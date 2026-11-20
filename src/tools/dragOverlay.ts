/**
 * Náhled při tažení (nástroj Vybrat, Stěna, kresba): pomocné čáry a zvýraznění přichycení posouvaného prvku.
 */
import { toScreen } from '../canvas/view';
import type { DragLine } from '../core/dragResolve';
import { dist } from '../core/geometry';
import type { Pt } from '../model/types';
import type { Camera } from '../store/store';

/** Pomocné čáry tažení: původní směry tence čárkovaně, zachycená čára tučně; ikona ⊥ u kolmice (D13). */
export function drawGuides(ctx: CanvasRenderingContext2D, g: { line: DragLine | null; point: Pt; lines: DragLine[] }, cam: Camera): void {
  const L = 100000; // mm – čára přes celé plátno
  const seg = (l: DragLine) => [toScreen({ x: l.origin.x - l.dir.x * L, y: l.origin.y - l.dir.y * L }, cam), toScreen({ x: l.origin.x + l.dir.x * L, y: l.origin.y + l.dir.y * L }, cam)] as const;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#a855f7';
  for (const l of g.lines) {
    if (l.id === g.line?.id) continue;
    const [a, b] = seg(l);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (g.line) {
    const [a, b] = seg(g.line);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (g.line.perpTo) {
      // ikona kolmice ⊥ vedle bodu
      const p = toScreen(g.point, cam);
      const x = p.x + 14;
      const y = p.y - 14;
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 16, 20, 18, 3);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 2);
      ctx.lineTo(x + 14, y - 2);
      ctx.moveTo(x + 8, y - 2);
      ctx.lineTo(x + 8, y - 13);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Hrany (a body), ke kterým se přichytil posouvaný prvek – zvýrazněné fialově. */
export function drawSnapHits(ctx: CanvasRenderingContext2D, hits: [Pt, Pt][], cam: Camera): void {
  ctx.save();
  ctx.strokeStyle = '#a855f7';
  ctx.fillStyle = '#a855f7';
  ctx.lineWidth = 3;
  for (const [a0, b0] of hits) {
    const a = toScreen(a0, cam);
    const b = toScreen(b0, cam);
    ctx.beginPath();
    if (dist(a0, b0) < 1) ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
    else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (dist(a0, b0) < 1) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}
