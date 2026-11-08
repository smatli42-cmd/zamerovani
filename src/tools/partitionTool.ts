/**
 * Nástroj „Dvojčára“: příčka dvěma rovnoběžnými stěnami (tloušťka a strana se volí v liště nad plátnem).
 * Začátek i konec se přichytávají na rohy a na stěny; konec opřený o stěnu ji rozdělí na úseky,
 * volný konec se uzavře krátkou stěnou. Přichytávání funguje jako u nástroje Stěna.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { dist } from '../core/geometry';
import { partitionPoints } from '../core/partition';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import type { Pt } from '../model/types';
import { addPartition } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import type { PointerInput, Tool } from './types';
import { drawLengthBadge, drawSnapMarker, snapOptions } from './wallTool';

interface Drawing {
  start: SnapResult;
  end: SnapResult;
  downAt: Pt;
}

let drawing: Drawing | null = null;
let hoverSnap: SnapResult | null = null;

export const partitionTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const start = snapPoint(floor, p.world, snapOptions());
    drawing = { start, end: start, downAt: p.world };
    hoverSnap = null;
    store.set({ selection: null, numpad: null });
    requestRender();
  },

  drag(p: PointerInput) {
    const floor = store.floor();
    if (!floor || !drawing) return;
    drawing.end = snapEnd(floor, drawing.start.pt, p.world, snapOptions(drawing.start.node?.id));
    requestRender();
  },

  up() {
    const d = drawing;
    drawing = null;
    if (!d) return;
    if (dist(d.start.pt, d.end.pt) >= 50) {
      const { partThickness, partSide } = store.get().settings;
      addPartition(d.start.pt, d.start.node?.id ?? null, d.end.pt, d.end.node?.id ?? null, partThickness, partSide);
    } else {
      // Ťuknutí bez tažení = výběr prvku pod perem
      const floor = store.floor();
      if (floor) store.set({ selection: pickAny(floor, d.downAt, store.get().camera) });
    }
    requestRender();
  },

  hover(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const s = snapPoint(floor, p.world, snapOptions());
    hoverSnap = s.node || s.wallHit ? s : null;
    requestRender();
  },

  cancel() {
    drawing = null;
    hoverSnap = null;
    requestRender();
  },

  drawOverlay(ctx, cam) {
    if (hoverSnap && !drawing) drawSnapMarker(ctx, cam, hoverSnap);
    if (!drawing) return;
    const floor = store.floor();
    if (!floor) return;
    const { partThickness, partSide } = store.get().settings;
    const s = drawing.start.pt;
    const e = drawing.end.pt;
    const second = partitionPoints(floor, s, e, partThickness, partSide);
    const a = toScreen(s, cam);
    const b = toScreen(e, cam);
    const a2 = toScreen(second.a2, cam);
    const b2 = toScreen(second.b2, cam);

    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
    ctx.restore();

    drawSnapMarker(ctx, cam, drawing.start);
    drawSnapMarker(ctx, cam, drawing.end);
    drawLengthBadge(ctx, a, b, Math.round(dist(s, e)));
  }
};
