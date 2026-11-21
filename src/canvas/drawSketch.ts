/**
 * Kreslení skici značky (okno značky, ui/MarkWindow.tsx) – převzato z prototypu (prototyp/src/input/detailsUI.js):
 * mřížka, tahy a tvary (geometrie core/sketch.ts), kóty s libovolným textem (oranžové, šikmé zarážky; na fotce
 * orientační – fialové, čárkovaně, s ≈), popisky (velikost podle měřítka `k`),
 * zvýraznění vybraného prvku.
 * Souřadnice skici = px při zoomu 100 %; `view` = zoom `s` a posun `ox`, `oy` (px plátna).
 */
import type { MarkPage, SketchDim, SketchStroke } from '../model/types';
import { dimIsOrient, dimText, labelBox, SKETCH_FONT_PX, sketchPolylines, type SketchRef } from '../core/sketch';

export interface SketchView {
  s: number;
  ox: number;
  oy: number;
}

/** Barva kót skici (odlišené od kresby). */
export const SKETCH_DIM_COLOR = '#ea580c';
/** Barva orientačních kót na fotce (krok C – jen orientační, ne měřítko): fialová, čárkovaná čára, text s ≈. */
export const SKETCH_ORIENT_COLOR = '#7c3aed';
const font = (k = 1): string => `700 ${SKETCH_FONT_PX * k}px system-ui, sans-serif`;


function drawStroke(ctx: CanvasRenderingContext2D, st: SketchStroke, color = st.color, width = st.width): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (const pts of sketchPolylines(st)) {
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.stroke();
  }
}

const SELECT_COLOR = 'rgba(37, 99, 235, 0.45)';

/** Zvýraznění vybraného prvku (pod ním). */
function drawSelected(ctx: CanvasRenderingContext2D, page: MarkPage, ref: SketchRef): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (ref.kind === 'stroke') {
    const st = page.strokes[ref.index];
    if (st) drawStroke(ctx, st, SELECT_COLOR, st.width + 8);
  } else if (ref.kind === 'dim') {
    const d = page.dims[ref.index];
    if (d) {
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 9 * (d.k ?? 1);
      ctx.beginPath();
      ctx.moveTo(d.a.x, d.a.y);
      ctx.lineTo(d.b.x, d.b.y);
      ctx.stroke();
      // i rámeček textu (kótu jde vybrat i ťuknutím na text)
      const t = dimText(page, d);
      if (t) {
        const k = d.k ?? 1;
        const b = labelBox(t, (d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2, k);
        ctx.lineWidth = 5 * k;
        ctx.beginPath();
        ctx.roundRect(b.x - 3 * k, b.y - 3 * k, b.w + 6 * k, b.h + 6 * k, 7 * k);
        ctx.stroke();
      }
    }
  } else {
    const l = page.labels[ref.index];
    if (l) {
      const k = l.k ?? 1;
      const b = labelBox(l.text, l.x, l.y, k);
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 5 * k;
      ctx.beginPath();
      ctx.roundRect(b.x - 3 * k, b.y - 3 * k, b.w + 6 * k, b.h + 6 * k, 7 * k);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDim(ctx: CanvasRenderingContext2D, page: MarkPage, d: SketchDim): void {
  const k = d.k ?? 1;
  const orient = dimIsOrient(page);
  const color = orient ? SKETCH_ORIENT_COLOR : SKETCH_DIM_COLOR;
  const dx = d.b.x - d.a.x;
  const dy = d.b.y - d.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const tick = 7 * k;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * k;
  ctx.lineCap = 'round';
  // čára kóty (orientační čárkovaně), zarážky plně
  ctx.setLineDash(orient ? [8 * k, 5 * k] : []);
  ctx.beginPath();
  ctx.moveTo(d.a.x, d.a.y);
  ctx.lineTo(d.b.x, d.b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const p of [d.a, d.b]) {
    ctx.moveTo(p.x - (ux + nx) * tick, p.y - (uy + ny) * tick);
    ctx.lineTo(p.x + (ux + nx) * tick, p.y + (uy + ny) * tick);
    ctx.moveTo(p.x - nx * tick, p.y - ny * tick);
    ctx.lineTo(p.x + nx * tick, p.y + ny * tick);
  }
  ctx.stroke();
  const text = dimText(page, d);
  if (text) {
    const mx = (d.a.x + d.b.x) / 2;
    const my = (d.a.y + d.b.y) / 2;
    const b = labelBox(text, mx, my, k);
    ctx.fillStyle = orient ? '#f5f3ff' : '#fff7ed';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 5 * k);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = font(k);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mx, my + 0.5 * k);
  }
  ctx.restore();
}

/** Vykreslí stranu skici; `extra` = rozpracovaný tah / kóta. */
/** Načtená fotka strany (podklad skici – krok B). */
export interface SketchPhoto {
  img: CanvasImageSource;
  w: number;
  h: number;
}

export function drawSketch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: SketchView,
  page: MarkPage,
  extra: { stroke?: SketchStroke | null; dim?: SketchDim | null; selected?: SketchRef | null; photo?: SketchPhoto | null } = {}
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  // fotka jako podklad (kresba leží nad ní ve vlastní vrstvě); bez fotky jemná mřížka
  if (extra.photo) ctx.drawImage(extra.photo.img, 0, 0, extra.photo.w, extra.photo.h);
  else drawGrid(ctx, w, h, v);
  if (extra.selected) drawSelected(ctx, page, extra.selected);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of page.strokes) drawStroke(ctx, st);
  if (extra.stroke) drawStroke(ctx, extra.stroke);
  ctx.restore();
  for (const d of page.dims) drawDim(ctx, page, d);
  if (extra.dim) drawDim(ctx, page, extra.dim);
  ctx.save();
  for (const lb of page.labels) {
    const k = lb.k ?? 1;
    const b = labelBox(lb.text, lb.x, lb.y, k);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = lb.color;
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 5 * k);
    ctx.fill();
    ctx.stroke();
    ctx.font = font(k);
    ctx.fillStyle = lb.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lb.text, lb.x, lb.y + 0.5 * k);
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Jemná čtverečková mřížka skici (20 jednotek) přes viditelnou oblast. */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, v: SketchView): void {
  const x0 = -v.ox / v.s;
  const y0 = -v.oy / v.s;
  const x1 = (w - v.ox) / v.s;
  const y1 = (h - v.oy) / v.s;
  ctx.save();
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1 / v.s;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 20) * 20; x <= x1; x += 20) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.floor(y0 / 20) * 20; y <= y1; y += 20) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.restore();
}
