/**
 * Nástroj Kóta (volná kóta, core/freeDim.ts; rozhodnutí uživatele 2026-11-18): ťuknutí na 1. bod a na 2. bod –
 * roh stěny, bod kresby, jinak (přichycený) bod výkresu. Kóta se nakreslí přímo mezi body a vybere se; tažením
 * za kótovací čáru existující kóty se mění její odsazení. Délka se zadá ťuknutím na číslo (NumPad).
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { dimLine, dimPoints, endAt, endPoint, offsetTowards, pickFreeDim } from '../core/freeDim';
import { add, dist, normal, scale, sub } from '../core/geometry';
import { snapPoint } from '../core/snapping';
import type { DimEnd, Id, Pt } from '../model/types';
import { addFreeDim, setFreeDimOffset } from '../store/actions';
import { store, type Camera } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';
import { snapOptions } from './wallTool';

/** 1. bod rozdělané kóty. */
let first: DimEnd | null = null;
/** Bod pod perem (náhled). */
let hoverAt: Pt | null = null;
/** Tažení odsazení existující kóty. */
let shifting: { id: Id; offset: number; moved: boolean; startScreen: Pt } | null = null;

const tolOf = () => HIT_PX.node / store.get().camera.zoom;

/** Konec kóty pod perem (roh, bod kresby, jinak přichycený bod). */
function endUnder(world: Pt): DimEnd | null {
  const floor = store.floor();
  if (!floor) return null;
  return endAt(floor, world, tolOf(), snapPoint(floor, world, snapOptions()).pt);
}

export const dimTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    // tažení za kótovací čáru existující kóty mění odsazení (jen když se nezačíná nová kóta)
    // roh / bod kresby pod perem má přednost (řetěz kót ze společného rohu)
    const onPoint = !('x' in endAt(floor, p.world, tolOf()));
    const hit = first || onPoint ? null : pickFreeDim(floor, p.world, (HIT_PX.wall * 0.6) / store.get().camera.zoom);
    const d = hit ? floor.dims?.[hit] : null;
    if (d) {
      shifting = { id: d.id, offset: d.offset, moved: false, startScreen: p.screen };
      store.set({ selection: { kind: 'dim', id: d.id }, numpad: null });
    }
  },
  drag(p) {
    hoverAt = p.world;
    const floor = store.floor();
    const d = shifting && floor?.dims?.[shifting.id];
    if (shifting && d && floor) {
      if (dist(p.screen, shifting.startScreen) >= 6) shifting.moved = true;
      const o = offsetTowards(floor, d, p.world);
      if (o !== null) shifting.offset = o;
    }
    requestRender();
  },
  up(p) {
    if (shifting) {
      const s = shifting;
      shifting = null;
      if (s.moved) setFreeDimOffset(s.id, s.offset);
      requestRender();
      return;
    }
    const end = endUnder(p.world);
    if (!end) return;
    if (!first) {
      first = end;
      store.set({ selection: null, numpad: null, toolMsg: dimToolMsg(true) });
    } else {
      const floor = store.floor();
      const a = floor && endPoint(floor, first);
      const b = floor && endPoint(floor, end);
      // ťuknutí znovu na 1. bod = nic (kóta nulové délky nevznikne)
      if (a && b && dist(a, b) >= 1) {
        addFreeDim(first, end);
        first = null;
        store.set({ toolMsg: dimToolMsg(false) });
      }
    }
    requestRender();
  },
  hover(p) {
    hoverAt = p.world;
    if (first) requestRender();
  },
  cancel() {
    if (first) store.set({ toolMsg: dimToolMsg(false) });
    first = null;
    shifting = null;
    hoverAt = null;
    requestRender();
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    const floor = store.floor();
    if (!floor) return;
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    // náhled odsazení při tažení
    const d = shifting && floor.dims?.[shifting.id];
    if (shifting && d) {
      const line = dimLine(floor, { ...d, offset: shifting.offset });
      const pts = dimPoints(floor, d);
      if (line && pts) {
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        for (const [p, q] of [
          [pts[0], line[0]],
          [line[0], line[1]],
          [line[1], pts[1]]
        ] as const) {
          const s = toScreen(p, cam);
          const e = toScreen(q, cam);
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(e.x, e.y);
        }
        ctx.stroke();
      }
    }
    // rozdělaná kóta: 1. bod a čára k peru
    const a = first && endPoint(floor, first);
    if (a) {
      const sa = toScreen(a, cam);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sa.x, sa.y, 6, 0, Math.PI * 2);
      ctx.fill();
      const end = hoverAt && endUnder(hoverAt);
      const b = end && endPoint(floor, end);
      if (b) {
        const sb = toScreen(b, cam);
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        // délka v náhledu
        const len = dist(a, b);
        if (len >= 1) {
          const mid = scale(add(sa, sb), 0.5);
          const n = dist(sa, sb) > 1e-6 ? normal(scale(sub(sb, sa), 1 / dist(sa, sb))) : { x: 0, y: -1 };
          ctx.font = '600 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(len)), mid.x + n.x * 14, mid.y + n.y * 14);
        }
      }
    }
    ctx.restore();
  }
};

/** Návod v liště nástroje (`started` = 1. bod je zadaný). */
export function dimToolMsg(started: boolean): string {
  return started
    ? 'Ťukni na 2. bod kóty (roh stěny, bod kresby nebo místo ve výkresu).'
    : 'Ťukni na 1. bod kóty. Délku zadáš ťuknutím na číslo, odsazení tažením za čáru hotové kóty.';
}
