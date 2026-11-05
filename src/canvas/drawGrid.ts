/**
 * Mřížka (10 cm / 1 m podle přiblížení) a grafické měřítko.
 */
import type { Camera } from '../store/store';
import { toWorld } from './view';

export function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
  const tl = toWorld({ x: 0, y: 0 }, cam);
  const br = toWorld({ x: w, y: h }, cam);
  let minor = 100;
  let major = 1000;
  if (cam.zoom < 0.05) {
    minor = 1000;
    major = 5000;
  } else if (cam.zoom < 0.12) {
    minor = 500;
    major = 1000;
  }

  const lines = (step: number, color: string, width: number, skip?: number) => {
    if (step * cam.zoom < 10) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      if (skip && x % skip === 0) continue;
      const sx = Math.round(x * cam.zoom + cam.x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
      if (skip && y % skip === 0) continue;
      const sy = Math.round(y * cam.zoom + cam.y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  };

  ctx.save();
  lines(minor, '#eef2f7', 1, major);
  lines(major, '#d5dde8', 1);
  ctx.restore();
}

export function drawScaleBar(ctx: CanvasRenderingContext2D, cam: Camera, h: number): void {
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const mm = candidates.find(c => c * cam.zoom >= 60) ?? 20000;
  const px = mm * cam.zoom;
  const x = 16;
  const y = h - 18;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 24, px + 16, 32, 6);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 6);
  ctx.stroke();
  ctx.fillStyle = '#334155';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`, x + px / 2, y - 10);
  ctx.restore();
}
