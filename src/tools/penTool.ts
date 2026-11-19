/**
 * Nástroje Pero a Guma (ruční tahy, core/strokes.ts). Pero kreslí do aktivní vrstvy, prst posouvá a zoomuje
 * (input/pointer.ts – u těchto nástrojů prst vždy posouvá). Tah se při zvednutí vyhladí a uloží jako vektor.
 * Guma maže celé tahy v aktivní vrstvě; jedno gumování = jeden krok Zpět. Tahy se nechytají.
 */
import { addStroke, eraseStrokesAt } from '../store/actions';
import { layerById } from '../core/layers';
import { smoothStroke } from '../core/strokes';
import type { Pt } from '../model/types';
import { store, type Camera } from '../store/store';
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import type { PointerInput, Tool } from './types';

let raw: Pt[] | null = null;

/** Barva aktivní vrstvy (náhled tahu). */
const activeColor = () => {
  const p = store.get().project;
  return layerById(p, p?.activeLayer)?.color ?? '#0f172a';
};

export const penTool: Tool = {
  down(p: PointerInput) {
    // zamčená aktivní vrstva: pero do ní nekreslí (vrstvy V2, stejně jako guma v ní nemaže)
    const pr = store.get().project;
    const l = layerById(pr, pr?.activeLayer);
    if (l?.locked) {
      raw = null;
      store.set({ lockBlock: { key: '', text: `Aktivní vrstva „${l.name}“ je zamčená – pero do ní nekreslí.` } });
      return;
    }
    raw = [p.world];
    store.set({ selection: null, numpad: null });
    requestRender();
  },
  drag(p) {
    if (!raw) return;
    raw.push(p.world);
    requestRender();
  },
  up(p) {
    if (!raw) return;
    raw.push(p.world);
    const zoom = store.get().camera.zoom;
    // vyhlazení podle zoomu: body po ~1 px, odchylka ~0,4 px
    const pts = smoothStroke(raw, 1 / zoom, 0.4 / zoom);
    raw = null;
    addStroke(pts, store.get().settings.penWidth);
    requestRender();
  },
  cancel() {
    raw = null;
    requestRender();
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (!raw || !raw.length) return;
    ctx.save();
    ctx.strokeStyle = activeColor();
    ctx.lineWidth = Math.max(1, store.get().settings.penWidth * cam.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    raw.forEach((q, i) => {
      const s = toScreen(q, cam);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (raw.length === 1) ctx.lineTo(toScreen(raw[0]!, cam).x + 0.01, toScreen(raw[0]!, cam).y);
    ctx.stroke();
    ctx.restore();
  }
};

/** Poloměr gumy na obrazovce (px). */
const ERASER_PX = 14;
let erasing = false;
let eraserAt: Pt | null = null;
/** Minulá poloha gumy (mm) – maže se i mezi vzorky pohybu (rychlé máchnutí). */
let lastErase: Pt | null = null;

function erase(p: PointerInput): void {
  eraserAt = p.screen;
  const r = ERASER_PX / store.get().camera.zoom;
  const from = lastErase ?? p.world;
  const n = Math.max(1, Math.ceil(Math.hypot(p.world.x - from.x, p.world.y - from.y) / r));
  for (let i = 1; i <= n; i++) eraseStrokesAt({ x: from.x + ((p.world.x - from.x) * i) / n, y: from.y + ((p.world.y - from.y) * i) / n }, r);
  lastErase = p.world;
  requestRender();
}

export function eraserMsg(): string {
  const p = store.get().project;
  const l = layerById(p, p?.activeLayer);
  if (l?.locked) return `Aktivní vrstva „${l.name}“ je zamčená – guma nic nesmaže.`;
  return `Guma maže celé ruční tahy jen v aktivní vrstvě „${l?.name ?? ''}“.`;
}

export const eraserTool: Tool = {
  down(p) {
    erasing = true;
    lastErase = null;
    store.beginGesture();
    erase(p);
  },
  drag(p) {
    if (erasing) erase(p);
  },
  up() {
    if (!erasing) return;
    erasing = false;
    store.endGesture();
  },
  hover(p) {
    eraserAt = p.screen;
    requestRender();
  },
  cancel() {
    if (erasing) store.endGesture();
    erasing = false;
    eraserAt = null;
  },
  drawOverlay(ctx: CanvasRenderingContext2D) {
    if (!eraserAt) return;
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(eraserAt.x, eraserAt.y, ERASER_PX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
};
