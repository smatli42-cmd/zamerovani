/**
 * Nástroje „Obdélník“, „Kruh“ a „Oblouk“. Tvary jsou skutečné stěny:
 * obdélník = 4 stěny, kruh = 2 půlkruhové stěny, oblouk = jedna oblouková stěna.
 * Body se přichytávají k rohům a stěnám; stěny, o které se tvar opírá, se v místě napojení rozdělí.
 * Ťuknutí bez tažení vybere prvek pod perem. Středový bod vybraného oblouku jde táhnout.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { arcGeometry } from '../core/arc';
import { findNodeNear, findWallNear } from '../core/floorQueries';
import { dist, roundTo } from '../core/geometry';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import type { Pt } from '../model/types';
import { addCircleWalls, addRectWalls, addWall } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import { grabArcHandle, selectTool } from './selectTool';
import { HIT_PX, type PointerInput, type Tool } from './types';
import { drawSnapMarker, snapOptions } from './wallTool';

const MIN_SIZE = 50; // mm – menší tažení se bere jako ťuknutí

function snap(p: Pt): Pt {
  const floor = store.floor();
  const { camera, settings } = store.get();
  if (floor && settings.snap) {
    const n = findNodeNear(floor, p, HIT_PX.snapNode / camera.zoom);
    if (n) return { x: n.x, y: n.y };
    // Na stěnu se bod přichytí přesně (bez zaokrouhlení), aby tvar opravdu navazoval
    const w = findWallNear(floor, p, (HIT_PX.snapNode * 0.8) / camera.zoom);
    if (w) return { x: Math.round(w.point.x), y: Math.round(w.point.y) };
  }
  return { x: roundTo(p.x, 10), y: roundTo(p.y, 10) };
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
        if (floor) store.set({ selection: pickAny(floor, tap, store.get().camera) });
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
    if (Math.abs(b.x - a.x) >= MIN_SIZE && Math.abs(b.y - a.y) >= MIN_SIZE) addRectWalls(a, b, store.get().settings.shapeStyle);
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
  commit: (c, e) => addCircleWalls(c, Math.round(dist(c, e)), store.get().settings.shapeStyle),
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
    arcStart = floor ? snapPoint(floor, p, snapOptions()) : null;
    arcEnd = arcStart;
    return arcStart?.pt ?? p;
  },
  move: (s, p) => {
    const floor = store.floor();
    if (floor && arcStart) arcEnd = snapEnd(floor, s, p, snapOptions(arcStart.node?.id));
    return arcEnd?.pt ?? p;
  },
  commit: (a, b) => {
    const { settings } = store.get();
    addWall(a, arcStart?.node?.id ?? null, b, arcEnd?.node?.id ?? null, true, { sagitta: defaultSagitta(a, b), style: settings.shapeStyle });
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
