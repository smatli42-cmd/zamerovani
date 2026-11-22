/**
 * Kreslení skici značky (okno značky, ui/MarkWindow.tsx) – převzato z prototypu (prototyp/src/input/detailsUI.js):
 * mřížka, tahy a tvary (geometrie core/sketch.ts), kóty s libovolným textem (oranžové, šikmé zarážky; na fotce
 * orientační – fialové, čárkovaně, s ≈), popisky (velikost podle měřítka `k`),
 * zvýraznění vybraných prvků a obdélník výběru (okno modře, křížení zeleně čárkovaně – jako ve výkresu), úchyty
 * vybraných prvků (body čtverečkem, velikost kroužkem – core/sketchEdit.ts) a značka přichycení.
 * Souřadnice skici = px při zoomu 100 %; `view` = zoom `s` a posun `ox`, `oy` (px plátna).
 */
import { LINE_DASH } from './lineDash';
import type { MarkPage, Pt, SketchDim, SketchStroke } from '../model/types';
import { dimIsOrient, dimText, labelBox, SKETCH_FONT_PX, sketchPolylines, type SketchRef } from '../core/sketch';
import type { SketchHandle, SketchSnap } from '../core/sketchEdit';

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


/** `solid` = zvýraznění výběru (vždy plné). Vzor čáry podle tloušťky (LINE_DASH je pro 3 px), s ostrými konci. */
function drawStroke(ctx: CanvasRenderingContext2D, st: SketchStroke, color = st.color, width = st.width, solid = false): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const dash = solid ? [] : LINE_DASH[st.style ?? 'solid'];
  ctx.setLineDash(dash.map(v => (v * Math.max(width, 1)) / 3));
  ctx.lineCap = dash.length ? 'butt' : 'round';
  for (const pts of sketchPolylines(st)) {
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
}

const SELECT_COLOR = 'rgba(37, 99, 235, 0.45)';

/** Zvýraznění vybraného prvku (pod ním). */
function drawSelected(ctx: CanvasRenderingContext2D, page: MarkPage, ref: SketchRef): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (ref.kind === 'stroke') {
    const st = page.strokes[ref.index];
    if (st) drawStroke(ctx, st, SELECT_COLOR, st.width + 8, true);
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
  extra: { stroke?: SketchStroke | null; dim?: SketchDim | null; selected?: readonly SketchRef[]; band?: { a: Pt; b: Pt } | null; photo?: SketchPhoto | null; handles?: readonly SketchHandle[]; snap?: SketchSnap | null } = {}
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  // fotka jako podklad (kresba leží nad ní ve vlastní vrstvě); bez fotky jemná mřížka
  if (extra.photo) ctx.drawImage(extra.photo.img, 0, 0, extra.photo.w, extra.photo.h);
  else drawGrid(ctx, w, h, v);
  for (const ref of extra.selected ?? []) drawSelected(ctx, page, ref);
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
  if (extra.band) drawBand(ctx, extra.band.a, extra.band.b, v.s);
  if (extra.handles?.length) drawHandles(ctx, extra.handles, v.s);
  if (extra.snap) drawSnapMark(ctx, extra.snap, v.s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Úchyty vybraných prvků – stálá velikost na obrazovce: bod tvaru čtverec, velikost (vrchol, vzdálenost, písmo) kroužek. */
function drawHandles(ctx: CanvasRenderingContext2D, hs: readonly SketchHandle[], s: number): void {
  // `s` je v px zařízení – úchyt má mít ~7 css px (dost velký na prst / pero)
  const dpr = globalThis.devicePixelRatio || 1;
  const r = (7 * dpr) / s;
  ctx.save();
  ctx.lineWidth = (2 * dpr) / s;
  ctx.strokeStyle = '#2563eb';
  for (const h of hs) {
    ctx.fillStyle = h.kind === 'size' ? '#fde68a' : '#ffffff';
    ctx.beginPath();
    if (h.kind === 'size') ctx.arc(h.at.x, h.at.y, r * 1.1, 0, Math.PI * 2);
    else ctx.rect(h.at.x - r, h.at.y - r, 2 * r, 2 * r);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Značka přichycení: význačný bod čtverečkem, bod na čáře křížkem (zeleně). */
function drawSnapMark(ctx: CanvasRenderingContext2D, sn: SketchSnap, s: number): void {
  const dpr = globalThis.devicePixelRatio || 1;
  const r = (8 * dpr) / s;
  const { x, y } = sn.pt;
  ctx.save();
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = (2 * dpr) / s;
  ctx.beginPath();
  if (sn.kind === 'point') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else {
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
  }
  ctx.stroke();
  ctx.restore();
}

/** Obdélník výběru: zleva doprava okno (modře), zprava doleva křížení (zeleně čárkovaně). */
function drawBand(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, s: number): void {
  const crossing = b.x < a.x;
  ctx.save();
  ctx.fillStyle = crossing ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.12)';
  ctx.strokeStyle = crossing ? '#16a34a' : '#2563eb';
  ctx.lineWidth = 1.5 / s;
  ctx.setLineDash(crossing ? [6 / s, 4 / s] : []);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
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
