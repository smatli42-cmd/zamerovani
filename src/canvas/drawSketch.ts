/**
 * Kreslení skici značky (okno značky, ui/MarkWindow.tsx) – převzato z prototypu (prototyp/src/input/detailsUI.js):
 * mřížka, tahy a tvary (geometrie core/sketch.ts), kóty s libovolným textem (oranžové, šikmé zarážky), popisky,
 * zvýraznění vybraného prvku.
 * Souřadnice skici = px při zoomu 100 %; `view` = zoom `s` a posun `ox`, `oy` (px plátna).
 */
import type { MarkPage, SketchDim, SketchStroke } from '../model/types';
import { labelBox, sketchPolylines, type SketchRef } from '../core/sketch';

export interface SketchView {
  s: number;
  ox: number;
  oy: number;
}

/** Barva kót skici (odlišené od kresby). */
export const SKETCH_DIM_COLOR = '#ea580c';
const FONT = '700 13px system-ui, sans-serif';


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
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(d.a.x, d.a.y);
      ctx.lineTo(d.b.x, d.b.y);
      ctx.stroke();
    }
  } else {
    const l = page.labels[ref.index];
    if (l) {
      const b = labelBox(l.text, l.x, l.y);
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDim(ctx: CanvasRenderingContext2D, d: SketchDim): void {
  const dx = d.b.x - d.a.x;
  const dy = d.b.y - d.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const tick = 7;
  ctx.save();
  ctx.strokeStyle = SKETCH_DIM_COLOR;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(d.a.x, d.a.y);
  ctx.lineTo(d.b.x, d.b.y);
  for (const p of [d.a, d.b]) {
    ctx.moveTo(p.x - (ux + nx) * tick, p.y - (uy + ny) * tick);
    ctx.lineTo(p.x + (ux + nx) * tick, p.y + (uy + ny) * tick);
    ctx.moveTo(p.x - nx * tick, p.y - ny * tick);
    ctx.lineTo(p.x + nx * tick, p.y + ny * tick);
  }
  ctx.stroke();
  if (d.text) {
    const mx = (d.a.x + d.b.x) / 2;
    const my = (d.a.y + d.b.y) / 2;
    const b = labelBox(d.text, mx, my);
    ctx.fillStyle = '#fff7ed';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = SKETCH_DIM_COLOR;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.text, mx, my + 0.5);
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
  for (const d of page.dims) drawDim(ctx, d);
  if (extra.dim) drawDim(ctx, extra.dim);
  ctx.save();
  for (const lb of page.labels) {
    const b = labelBox(lb.text, lb.x, lb.y);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = lb.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.font = FONT;
    ctx.fillStyle = lb.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lb.text, lb.x, lb.y + 0.5);
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
