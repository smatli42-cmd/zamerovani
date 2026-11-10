/**
 * Vykreslování plátna. Kreslí se jen po změně (requestRender), ne neustále.
 */
import { store } from '../store/store';
import { tools } from '../tools/registry';
import { drawDims } from './drawDims';
import { drawGrid, drawScaleBar } from './drawGrid';
import { drawArcHandle, drawFlipArrow, drawNodes, drawOpenings, drawWalls } from './drawPlan';
import { drawRooms } from './drawRooms';
import { drawTexts } from './drawTexts';
import { drawComponentDims } from './drawComponentDims';
import { resetHitBoxes } from './hitTargets';
import { setRenderHandler } from './invalidate';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let scheduled = false;
let unsubscribe: (() => void) | null = null;
let observer: ResizeObserver | null = null;

export function canvasSize(): { width: number; height: number } {
  return { width, height };
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    render();
  });
}

function resize(): void {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

export function attachRenderer(el: HTMLCanvasElement): void {
  canvas = el;
  ctx = el.getContext('2d');
  setRenderHandler(schedule);
  observer = new ResizeObserver(resize);
  observer.observe(el);
  unsubscribe = store.subscribe(schedule);
  resize();
}

export function detachRenderer(): void {
  observer?.disconnect();
  unsubscribe?.();
  observer = null;
  unsubscribe = null;
  canvas = null;
  ctx = null;
}

function render(): void {
  if (!ctx) return;
  const state = store.get();
  const floor = store.floor();
  const cam = state.camera;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  if (state.settings.showGrid) drawGrid(ctx, cam, width, height);

  resetHitBoxes();
  if (floor) {
    drawWalls(ctx, floor, cam, state.selection, state.hover);
    drawOpenings(ctx, floor, cam, state.selection, state.hover);
    drawNodes(ctx, floor, cam, state.selection, state.hover);
    drawRooms(ctx, floor, cam, state.selection);
    drawTexts(ctx, floor, cam, state.selection);
    if (state.settings.showDims) drawDims(ctx, floor, cam, state.settings.dimScale, state.selection);
    if (state.settings.showDims) drawComponentDims(ctx, floor, cam, state.settings.dimScale, state.selection);
    drawArcHandle(ctx, floor, cam, state.selection);
    drawFlipArrow(ctx, floor, cam, state.selection);
    drawMoveMarker(ctx);
  }
  tools[state.tool].drawOverlay?.(ctx, cam);
  drawScaleBar(ctx, cam, height);
}

/** Při zadávání délky stěny zvýrazní roh, který se posune. */
function drawMoveMarker(c: CanvasRenderingContext2D): void {
  const { numpad, camera } = store.get();
  const floor = store.floor();
  if (!numpad || numpad.target.kind !== 'wall-length' || !floor) return;
  const wall = floor.walls[numpad.target.wallId];
  if (!wall) return;
  const move = numpad.target.move;
  const ids = move === 'both' ? [wall.a, wall.b] : [move.nodeId];
  c.save();
  for (const id of ids) {
    const n = floor.nodes[id];
    if (!n) continue;
    const p = { x: n.x * camera.zoom + camera.x, y: n.y * camera.zoom + camera.y };
    c.strokeStyle = '#f59e0b';
    c.fillStyle = 'rgba(245,158,11,0.25)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(p.x, p.y, 13, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}
