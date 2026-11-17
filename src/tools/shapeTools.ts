/**
 * Nástroje „Obdélník“, „Kruh“ a „Oblouk“. Tvary jsou KRESBA (core/drawing.ts, rozhodnutí uživatele 2026-11-17):
 * nikdy stěna ani výstupek, nevyplňují se šedou. Body se přichytávají jako u ostatní kresby (tools/drawSnap.ts) –
 * jen pomůcka, se stěnou se nic nespojí ani nerozdělí.
 * Ťuknutí bez tažení vybere prvek pod perem. Úchyty vybrané kresby / oblouku stěny jde táhnout.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { arcGeometry } from '../core/arc';
import { dist, roundTo } from '../core/geometry';
import type { SnapResult } from '../core/snapping';
import type { Pt } from '../model/types';
import { addDrawArc, addDrawCircle, addDrawRect } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import { grabArcHandle, selectTool } from './selectTool';
import type { PointerInput, Tool } from './types';
import { drawSnapMarker } from './wallTool';
import { drawSnap } from './drawSnap';

const MIN_SIZE = 50; // mm – menší tažení se bere jako ťuknutí

function snap(p: Pt): Pt {
  const floor = store.floor();
  return floor ? drawSnap(floor, p, null).pt : { x: roundTo(p.x, 10), y: roundTo(p.y, 10) };
}

function badge(ctx: CanvasRenderingContext2D, at: Pt, text: string): void {
  ctx.font = '600 14px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(at.x + 16, at.y - 28, w, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x + 23, at.y - 16);
}

/** Společné chování: tažení, tažení středového bodu vybraného oblouku, ťuknutí = výběr. */
function makeTool(opts: {
  begin: (p: Pt) => Pt;
  move: (start: Pt, p: Pt) => Pt;
  commit: (start: Pt, end: Pt) => void;
  preview: (ctx: CanvasRenderingContext2D, start: Pt, end: Pt, cam: Parameters<NonNullable<Tool['drawOverlay']>>[1]) => string | null;
}): Tool {
  let start: Pt | null = null;
  let end: Pt | null = null;
  let downAt: Pt | null = null;
  let handle = false;

  return {
    down(p: PointerInput) {
      if (grabArcHandle(p)) {
        handle = true;
        return;
      }
      handle = false;
      if (!store.floor()) return;
      store.set({ selection: null, numpad: null });
      downAt = p.world;
      start = opts.begin(p.world);
      end = start;
      requestRender();
    },
    drag(p: PointerInput) {
      if (handle) return selectTool.drag?.(p);
      if (!start) return;
      end = opts.move(start, p.world);
      requestRender();
    },
    up(p: PointerInput) {
      if (handle) {
        selectTool.up?.(p);
        handle = false;
        return;
      }
      const s = start;
      const e = end;
      const tap = downAt;
      start = end = downAt = null;
      if (s && e && dist(s, e) >= MIN_SIZE) opts.commit(s, e);
      else if (tap) {
        const floor = store.floor();
        if (floor) store.set({ selection: pickAny(floor, tap, store.get().camera, store.get().selection) });
      }
      requestRender();
    },
    hover: selectTool.hover,
    cancel() {
      if (handle) selectTool.cancel?.();
      handle = false;
      start = end = downAt = null;
      requestRender();
    },
    drawOverlay(ctx, cam) {
      if (!start || !end) return;
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      const text = opts.preview(ctx, start, end, cam);
      ctx.setLineDash([]);
      if (text) badge(ctx, toScreen(end, cam), text);
      ctx.restore();
    }
  };
}

/** Obdélník se táhne z rohu do protějšího rohu (strany rovnoběžné s osami). */
export const rectTool = makeTool({
  begin: snap,
  move: (_s, p) => snap(p),
  commit: (a, b) => {
    if (Math.abs(b.x - a.x) >= MIN_SIZE && Math.abs(b.y - a.y) >= MIN_SIZE) addDrawRect(a, b);
  },
  preview(ctx, a, b, cam) {
    const p = toScreen(a, cam);
    const q = toScreen(b, cam);
    ctx.strokeRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    return `${Math.abs(Math.round(b.x - a.x))} × ${Math.abs(Math.round(b.y - a.y))} mm`;
  }
});

/** Kruh se táhne od středu, poloměr = vzdálenost pera od středu. */
export const circleTool = makeTool({
  begin: snap,
  move: (_s, p) => snap(p),
  commit: (c, e) => addDrawCircle(c, Math.round(dist(c, e))),
  preview(ctx, c, e, cam) {
    const p = toScreen(c, cam);
    ctx.beginPath();
    ctx.arc(p.x, p.y, dist(c, e) * cam.zoom, 0, Math.PI * 2);
    ctx.stroke();
    return `Ø ${Math.round(dist(c, e) * 2)} mm`;
  }
});

/** Výchozí vzepětí nového oblouku = čtvrtina tětivy; upřesní se tažením středového bodu nebo kótou. */
const defaultSagitta = (a: Pt, b: Pt) => Math.max(10, Math.round(dist(a, b) / 4 / 10) * 10);

let arcStart: SnapResult | null = null;
let arcEnd: SnapResult | null = null;

/** Oblouk se táhne jako tětiva (krajní body se přichytávají jako u stěny). */
const arcBase = makeTool({
  begin: p => {
    const floor = store.floor();
    arcStart = floor ? drawSnap(floor, p, null) : null;
    arcEnd = arcStart;
    return arcStart?.pt ?? p;
  },
  move: (s, p) => {
    const floor = store.floor();
    if (floor && arcStart) arcEnd = drawSnap(floor, p, s);
    return arcEnd?.pt ?? p;
  },
  commit: (a, b) => {
    addDrawArc(a, b, defaultSagitta(a, b));
  },
  preview(ctx, a, b, cam) {
    const g = arcGeometry(a, b, defaultSagitta(a, b));
    const p = toScreen(a, cam);
    const q = toScreen(b, cam);
    ctx.beginPath();
    if (g) {
      const c = toScreen(g.center, cam);
      ctx.arc(c.x, c.y, g.r * cam.zoom, g.start, g.end, g.anticlockwise);
    } else {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    if (arcStart) drawSnapMarker(ctx, cam, arcStart);
    if (arcEnd) drawSnapMarker(ctx, cam, arcEnd);
    return `${Math.round(dist(a, b))} mm`;
  }
});
export const arcTool: Tool = arcBase;
