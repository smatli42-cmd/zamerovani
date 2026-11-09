/**
 * Nástroj „Šipka“: táhne se od místa, na které se ukazuje (hrot), tam, kam má přijít text.
 * Po puštění se vloží text a hned se dá psát. Ťuknutí na existující text ho vybere a jde upravit/přesunout.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { dist } from '../core/geometry';
import { snapPoint } from '../core/snapping';
import type { Pt } from '../model/types';
import { addText } from '../store/actions';
import { store, type Camera } from '../store/store';
import { pickText } from './pick';
import { grabLeaderHandle, selectTool } from './selectTool';
import { HIT_PX, type PointerInput, type Tool } from './types';
import { snapOptions } from './wallTool';

let delegating = false;
let drawing: { tip: Pt; end: Pt; startScreen: Pt; endScreen: Pt } | null = null;

export const leaderTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    if (grabLeaderHandle(p)) {
      delegating = true;
      return;
    }
    if (pickText(floor, p.world, store.get().camera)) {
      delegating = true;
      selectTool.down?.(p);
      return;
    }
    delegating = false;
    // hrot se přichytí k rohu / stěně / zvláštnímu bodu
    const tip = snapPoint(floor, p.world, snapOptions()).pt;
    drawing = { tip, end: p.world, startScreen: p.screen, endScreen: p.screen };
    store.set({ selection: null, numpad: null });
  },
  drag(p) {
    if (delegating) return selectTool.drag?.(p);
    if (!drawing) return;
    drawing.end = p.world;
    drawing.endScreen = p.screen;
    requestRender();
  },
  up(p) {
    if (delegating) {
      selectTool.up?.(p);
      delegating = false;
      return;
    }
    const d = drawing;
    drawing = null;
    if (d && dist(d.startScreen, d.endScreen) >= HIT_PX.snapNode) addText(d.end, d.tip);
    requestRender();
  },
  hover: selectTool.hover,
  cancel() {
    if (delegating) selectTool.cancel?.();
    delegating = false;
    drawing = null;
    requestRender();
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (!drawing) return;
    const a = toScreen(drawing.tip, cam);
    const b = drawing.endScreen;
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
    ctx.restore();
  }
};
