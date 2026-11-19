/**
 * Nástroj „Ořezat“ pro kresbu (požadavek uživatele 2026-11-19, jako Trim / Extend ve Fusion 360): ťuknutí na čáru
 * kresby ji ořízne k nejbližším průsečíkům (režim Oříznout), nebo prodlouží její konec k nejbližší čáře
 * (režim Prodloužit). Pravidla v core/drawTrim.ts; při najetí perem / myší náhled (červeně co zmizí,
 * čárkovaně kam se prodlouží). Stěn se nástroj netýká (na ty je „Do rohu“).
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { pickDrawing } from '../core/drawing';
import { extendPlan, TRIM_FAIL_TEXT, trimPiece, type ExtendPlan, type TrimPiece } from '../core/drawTrim';
import type { Pt } from '../model/types';
import { extendDrawingAt, trimDrawingAt } from '../store/actions';
import { store, type Camera } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';

const extendMode = () => store.get().settings.drawTrimMode === 'extend';

/** Návod v liště podle režimu. */
export const drawTrimMsg = (extend: boolean) =>
  extend ? 'Ťukni na čáru kresby blízko konce, který se má prodloužit k nejbližší čáře.' : 'Ťukni na kus čáry kresby, který má zmizet (ořízne se k nejbližším průsečíkům).';

let preview: { trim?: TrimPiece; extend?: ExtendPlan } | null = null;

function drawingAt(p: Pt): string | null {
  const floor = store.floor();
  return floor ? pickDrawing(floor, p, HIT_PX.wall / store.get().camera.zoom, true) : null;
}

export const drawTrimTool: Tool = {
  down(p: PointerInput) {
    const id = drawingAt(p.world);
    const msg = drawTrimMsg(extendMode());
    preview = null;
    if (!id) {
      store.set({ toolMsg: msg });
      return requestRender();
    }
    const res = extendMode() ? extendDrawingAt(id, p.world) : trimDrawingAt(id, p.world);
    store.set({ toolMsg: res === 'ok' ? msg : `⚠️ ${TRIM_FAIL_TEXT[res]}` });
    requestRender();
  },
  hover(p: PointerInput) {
    const floor = store.floor();
    const id = drawingAt(p.world);
    const d = id ? floor?.drawings?.[id] : undefined;
    preview = null;
    if (floor && d) {
      if (extendMode()) {
        const e = extendPlan(floor, d, p.world);
        if (typeof e !== 'string') preview = { extend: e };
      } else {
        const t = trimPiece(floor, d, p.world);
        if (typeof t !== 'string') preview = { trim: t };
      }
    }
    requestRender();
  },
  cancel() {
    preview = null;
    store.set({ toolMsg: drawTrimMsg(extendMode()) });
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (!preview) return;
    const [a, b, color, dash] = preview.trim ? [preview.trim.from, preview.trim.to, '#dc2626', [] as number[]] : [preview.extend!.from, preview.extend!.to, '#2563eb', [6, 4]];
    const s = toScreen(a, cam);
    const e = toScreen(b, cam);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.restore();
  }
};
