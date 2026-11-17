/**
 * Kreslení kresby (samostatné čáry, tvary, dvojité čáry) a jejích šraf. Volá se PO stěnách a otvorech:
 * šrafa i čáry leží nad šedou výplní stěn (KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md, bod 4). Kresba sama se šedou
 * nikdy nevyplňuje – výplň má jen šrafa „Plná“ v barvě, kterou uživatel zvolí. Geometrie: core/drawing.ts.
 */
import { activeHatch, DRAW_COLORS, drawingHandles, drawingOutline, drawingPolylines, drawingsOf } from '../core/drawing';
import type { Drawing, Floor, HatchKind, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { COLORS, isSel, LINE_DASH } from './drawPlan';
import { toScreen } from './view';

/** Rozteč šrafy na obrazovce (px) – stejně hustá při každém přiblížení. */
const HATCH_PX = 10;

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean): void {
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (closed) ctx.closePath();
}

/** Vzor šrafy uvnitř obrysu (souřadnice obrazovky); obrys už je nastavený jako ořez. */
function paintHatch(ctx: CanvasRenderingContext2D, kind: HatchKind, color: string, poly: Pt[]): void {
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'solid') {
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    return;
  }
  if (kind === 'dots') {
    for (let y = Math.floor(y0 / HATCH_PX) * HATCH_PX; y <= y1; y += HATCH_PX)
      for (let x = Math.floor(x0 / HATCH_PX) * HATCH_PX + ((y / HATCH_PX) % 2 ? HATCH_PX / 2 : 0); x <= x1; x += HATCH_PX) ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
    return;
  }
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = HATCH_PX * Math.SQRT2;
  // šikmé čáry y = x + c (45°, v obrazovce dolů doprava = výkresově „/“ zrcadlí se jen osa Y)
  for (let c = Math.floor((y0 - x1) / step) * step; c <= y1 - x0; c += step) {
    ctx.moveTo(x0, x0 + c);
    ctx.lineTo(x1, x1 + c);
  }
  if (kind === 'cross')
    for (let c = Math.floor((y0 + x0) / step) * step; c <= y1 + x1; c += step) {
      ctx.moveTo(x0, c - x0);
      ctx.lineTo(x1, c - x1);
    }
  ctx.stroke();
}

/** Nakreslí jednu kresbu (šrafa, zvýraznění výběru, čáry). Používají to i náhledy nástrojů. */
export function paintDrawing(ctx: CanvasRenderingContext2D, d: Drawing, cam: Camera, state: 'normal' | 'selected' | 'hover' = 'normal'): void {
  const lines = drawingPolylines(d).map(pl => pl.map(p => toScreen(p, cam)));
  const closed = (pl: Pt[]) => pl.length > 2 && Math.hypot(pl[0]!.x - pl[pl.length - 1]!.x, pl[0]!.y - pl[pl.length - 1]!.y) < 0.01;
  const color = DRAW_COLORS[d.color ?? 'black'];
  ctx.save();
  const hatch = activeHatch(d);
  const outline = hatch ? drawingOutline(d) : null;
  if (hatch && outline) {
    const poly = outline.map(p => toScreen(p, cam));
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, poly, true);
    ctx.clip();
    paintHatch(ctx, hatch, DRAW_COLORS[d.hatchColor ?? d.color ?? 'black'], poly);
    ctx.restore();
  }
  if (state !== 'normal') {
    ctx.strokeStyle = state === 'selected' ? 'rgba(37,99,235,0.25)' : 'rgba(147,197,253,0.35)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const pl of lines) tracePath(ctx, pl, closed(pl));
    ctx.stroke();
  }
  const dash = LINE_DASH[d.style ?? 'solid'];
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.lineCap = dash.length ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const pl of lines) tracePath(ctx, pl, closed(pl));
  ctx.stroke();
  ctx.restore();
}

export function drawDrawings(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  for (const d of drawingsOf(floor)) {
    const state = isSel(selection, 'drawing', d.id) ? 'selected' : isSel(hover, 'drawing', d.id) ? 'hover' : 'normal';
    paintDrawing(ctx, d, cam, state);
  }
}

/** Úchyty vybrané kresby: vrcholy (čtverečky), vzepětí / poloměr / vzdálenost čar (kroužky). */
export function drawDrawingHandles(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  const d = selection?.kind === 'drawing' ? floor.drawings?.[selection.id] : null;
  if (!d) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  for (const h of drawingHandles(d)) {
    const p = toScreen(h.at, cam);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = h.kind === 'vertex' ? COLORS.selected : '#60a5fa';
    ctx.beginPath();
    if (h.kind === 'vertex') ctx.rect(p.x - 6, p.y - 6, 12, 12);
    else ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}
