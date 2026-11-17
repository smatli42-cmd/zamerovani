/**
 * Nástroje kresby: „Čára“ (samostatná lomená čára) a „Dvojitá čára“ (dvě rovnoběžné čáry – překlad).
 * Čistě grafické prvky (core/drawing.ts): přichytí se ke stěnám a bodům jen jako pomůcka (tools/drawSnap.ts),
 * nikdy nevytvoří stěnu ani výstupek a nevyplní se šedou.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { paintDrawing } from '../canvas/drawDrawings';
import { dist } from '../core/geometry';
import { sideFromPen } from '../core/wallSide';
import type { Drawing, Pt } from '../model/types';
import type { SnapResult } from '../core/snapping';
import { addDrawDouble, addDrawLine } from '../store/actions';
import { store } from '../store/store';
import { doubleAlongWall, drawSnap, type DrawSnapResult } from './drawSnap';
import { pickAny } from './pick';
import { drawGuides, grabArcHandle, selectTool } from './selectTool';
import type { PointerInput, Tool } from './types';
import { drawLengthBadge, drawSnapMarker } from './wallTool';

/** O kolik px se musí pero odchýlit od čáry, aby se druhá čára dvojité čáry přehodila na druhou stranu. */
const FLIP_PX = 10;

interface Stroke {
  start: SnapResult;
  end: DrawSnapResult;
  downAt: Pt;
  side: 1 | -1 | null;
}

function makeDrawTool(kind: 'line' | 'double'): Tool {
  let s: Stroke | null = null;
  let handle = false;
  let hoverSnap: SnapResult | null = null;

  /** Šířka a strana druhé čáry: podél stěny od jejího líce = tloušťka stěny, jinak volba nástroje a strana perem. */
  const doubleParams = (st: Stroke): { width: number; side: 1 | -1 } => {
    const floor = store.floor();
    const auto = floor ? doubleAlongWall(floor, st.start.pt, st.end.pt) : null;
    return auto ?? { width: store.get().settings.doubleWidth, side: st.side ?? 1 };
  };

  const preview = (st: Stroke): Drawing => {
    const { settings } = store.get();
    if (kind === 'line') return { id: '', shape: 'line', pts: [st.start.pt, st.end.pt], style: settings.shapeStyle, color: settings.drawColor };
    const p = doubleParams(st);
    return { id: '', shape: 'double', pts: [st.start.pt, st.end.pt], ...p, style: settings.doubleStyle, color: settings.drawColor, ...(settings.doubleClosed ? { closedEnds: true as const } : {}) };
  };

  return {
    down(p: PointerInput) {
      handle = grabArcHandle(p);
      if (handle) return;
      const floor = store.floor();
      if (!floor) return;
      const start = drawSnap(floor, p.world, null);
      s = { start, end: start, downAt: p.world, side: null };
      hoverSnap = null;
      store.set({ selection: null, numpad: null });
      requestRender();
    },
    drag(p: PointerInput) {
      if (handle) return selectTool.drag?.(p);
      const floor = store.floor();
      if (!floor || !s) return;
      s.end = drawSnap(floor, p.world, s.start.pt);
      if (kind === 'double') s.side = sideFromPen(s.start.pt, s.end.pt, p.world, FLIP_PX / store.get().camera.zoom, s.side);
      requestRender();
    },
    up(p: PointerInput) {
      if (handle) {
        selectTool.up?.(p);
        handle = false;
        return;
      }
      const st = s;
      s = null;
      if (!st) return;
      if (dist(st.start.pt, st.end.pt) >= 10) {
        if (kind === 'line') addDrawLine(st.start.pt, st.end.pt);
        else {
          const dp = doubleParams(st);
          addDrawDouble(st.start.pt, st.end.pt, dp.width, dp.side);
        }
      } else {
        // ťuknutí bez tažení = výběr prvku pod perem
        const floor = store.floor();
        if (floor) store.set({ selection: pickAny(floor, st.downAt, store.get().camera, store.get().selection) });
      }
      requestRender();
    },
    hover(p: PointerInput) {
      const floor = store.floor();
      if (!floor) return;
      const r = drawSnap(floor, p.world, null);
      hoverSnap = r.node || r.wallHit || r.special ? r : null;
      requestRender();
    },
    cancel() {
      if (handle) selectTool.cancel?.();
      handle = false;
      s = null;
      hoverSnap = null;
      requestRender();
    },
    drawOverlay(ctx, cam) {
      if (!s) {
        if (hoverSnap) drawSnapMarker(ctx, cam, hoverSnap);
        return;
      }
      if (s.end.guide) drawGuides(ctx, { line: s.end.guide, point: s.end.pt, lines: [] }, cam);
      if (dist(s.start.pt, s.end.pt) >= 1) paintDrawing(ctx, preview(s), cam);
      drawSnapMarker(ctx, cam, s.start);
      drawSnapMarker(ctx, cam, s.end);
      drawLengthBadge(ctx, toScreen(s.start.pt, cam), toScreen(s.end.pt, cam), Math.round(dist(s.start.pt, s.end.pt)));
    }
  };
}

export const drawLineTool = makeDrawTool('line');
export const drawDoubleTool = makeDrawTool('double');
