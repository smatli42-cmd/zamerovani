/**
 * Převody mezi světem (mm) a obrazovkou (px).
 */
import type { Pt } from '../model/types';
import type { Camera } from '../store/store';

export const toScreen = (p: Pt, cam: Camera): Pt => ({ x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y });
export const toWorld = (p: Pt, cam: Camera): Pt => ({ x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom });

/** Přepočet vzdálenosti na obrazovce (px) na mm. */
export const pxToMm = (px: number, cam: Camera): number => px / cam.zoom;

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 3;

/** Zoom se zachováním bodu pod prstem/kurzorem. */
export function zoomAt(cam: Camera, screen: Pt, factor: number): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  const world = toWorld(screen, cam);
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom };
}

/** Kamera, která zobrazí zadané body na celou plochu. `rightReserve` = šířka (px) vpravo zakrytá panelem. */
export function fitCamera(pts: Pt[], width: number, height: number, pad = 90, rightReserve = 0): Camera {
  width -= rightReserve;
  if (pts.length === 0) return { x: width / 2, y: height / 2, zoom: 0.15 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1000, maxX - minX);
  const h = Math.max(1000, maxY - minY);
  const zoom = Math.max(MIN_ZOOM, Math.min(1.5, Math.min((width - pad * 2) / w, (height - pad * 2) / h)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { zoom, x: width / 2 - cx * zoom, y: height / 2 - cy * zoom };
}
