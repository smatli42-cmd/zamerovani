/**
 * Nástroj „Stěna“: tažením perem se nakreslí stěna (vnitřní líc).
 * Začátek i konec se přichytávají na rohy, směr do 90°, zarovnání s rohy.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { dist } from '../core/geometry';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import type { Pt } from '../model/types';
import { addWall } from '../store/actions';
import { DEFAULT_WALL_THICKNESS } from '../model/factory';
import { store, type Camera } from '../store/store';
import { pickAny } from './pick';
import { grabArcHandle, selectTool } from './selectTool';
import { HIT_PX, type PointerInput, type Tool } from './types';

interface Drawing {
  start: SnapResult;
  end: SnapResult;
  /** Skutečné místo dotyku (bez přichycení) – pro výběr prvku ťuknutím. */
  downAt: Pt;
}

let drawing: Drawing | null = null;
let hoverSnap: SnapResult | null = null;

export function snapOptions(startNodeId?: string) {
  const { settings, camera } = store.get();
  return {
    ortho: settings.ortho,
    snap: settings.snap,
    nodeTol: HIT_PX.snapNode / camera.zoom,
    alignTol: HIT_PX.snapAlign / camera.zoom,
    startNodeId
  };
}

let handleDrag = false;

export const wallTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    // Středový bod vybraného oblouku se dá táhnout i při kreslení stěn
    handleDrag = grabArcHandle(p);
    if (handleDrag) return;
    const start = snapPoint(floor, p.world, snapOptions());
    drawing = { start, end: start, downAt: p.world };
    hoverSnap = null;
    store.set({ selection: null, numpad: null });
    requestRender();
  },

  drag(p: PointerInput) {
    if (handleDrag) return selectTool.drag?.(p);
    const floor = store.floor();
    if (!floor || !drawing) return;
    drawing.end = snapEnd(floor, drawing.start.pt, p.world, snapOptions(drawing.start.node?.id));
    requestRender();
  },

  up(p) {
    if (handleDrag) {
      selectTool.up?.(p);
      handleDrag = false;
      return;
    }
    const d = drawing;
    drawing = null;
    if (!d) return;
    if (dist(d.start.pt, d.end.pt) >= 50) {
      // Při kreslení se panel vlastností neotevírá (nepřekáží v kreslení)
      addWall(d.start.pt, d.start.node?.id ?? null, d.end.pt, d.end.node?.id ?? null, false, { thickness: DEFAULT_WALL_THICKNESS });
    } else {
      // Ťuknutí bez tažení = výběr prvku pod perem (otevře jeho vlastnosti)
      const floor = store.floor();
      if (floor) store.set({ selection: pickAny(floor, d.downAt, store.get().camera) });
    }
    requestRender();
  },

  hover(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const s = snapPoint(floor, p.world, snapOptions());
    hoverSnap = s.node || s.wallHit || s.special ? s : null;
    requestRender();
  },

  cancel() {
    if (handleDrag) selectTool.cancel?.();
    handleDrag = false;
    drawing = null;
    hoverSnap = null;
    requestRender();
  },

  drawOverlay(ctx, cam) {
    if (hoverSnap && !drawing) drawSnapMarker(ctx, cam, hoverSnap);
    if (!drawing) return;
    const a = toScreen(drawing.start.pt, cam);
    const b = toScreen(drawing.end.pt, cam);

    // Vodítka zarovnání
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    for (const g of drawing.end.guides) {
      const f = toScreen(g.from, cam);
      const t = toScreen(g.to, cam);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.restore();

    // Náhled stěny
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    drawSnapMarker(ctx, cam, drawing.start);
    drawSnapMarker(ctx, cam, drawing.end);
    drawLengthBadge(ctx, a, b, Math.round(dist(drawing.start.pt, drawing.end.pt)));
  }
};

export function drawSnapMarker(ctx: CanvasRenderingContext2D, cam: Camera, s: SnapResult): void {
  if (!s.node && !s.wallHit && !s.special) return;
  const p = toScreen(s.pt, cam);
  ctx.save();
  ctx.strokeStyle = s.node ? '#16a34a' : s.special ? '#7c3aed' : '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (s.node) ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  else if (s.special) {
    ctx.moveTo(p.x, p.y - 9);
    ctx.lineTo(p.x + 9, p.y);
    ctx.lineTo(p.x, p.y + 9);
    ctx.lineTo(p.x - 9, p.y);
    ctx.closePath();
  } else ctx.rect(p.x - 6, p.y - 6, 12, 12);
  ctx.stroke();
  ctx.restore();
}

export function drawLengthBadge(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, mm: number): void {
  const text = `${mm} mm`;
  ctx.save();
  ctx.font = '600 14px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  const x = b.x + 16;
  const y = b.y - 28;
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 7, y + 12);
  ctx.restore();
  void a;
}
