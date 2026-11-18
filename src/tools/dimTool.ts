/**
 * Nástroj Kóta (volná kóta, core/freeDim.ts; rozhodnutí uživatele 2026-11-18): ťuknutí na 1. a 2. konec – bod
 * (roh stěny, bod kresby) nebo hranu (líc stěny, čára kresby, okraj otvoru – core/dimRefs.ts), jinak přichycený bod
 * výkresu. Pod perem / myší se zvýrazní, k čemu se kóta přichytí. Mezi rovnoběžnými hranami a mezi hranou a bodem
 * měří kolmo (zarovnaná kóta jako v CAD). Tažením za kótovací čáru hotové kóty se mění odsazení.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { measurePoints, refAt, refGeom, refSegment, type RefGeom } from '../core/dimRefs';
import { dimLine, dimPoints, offsetTowards, pickFreeDim, sameEnd } from '../core/freeDim';
import { add, dist, normal, scale, sub } from '../core/geometry';
import { snapPoint } from '../core/snapping';
import type { DimEnd, Floor, Id, Pt } from '../model/types';
import { addFreeDim, setFreeDimOffset } from '../store/actions';
import { store, type Camera } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';
import { snapOptions } from './wallTool';

/** 1. konec rozdělané kóty. */
let first: DimEnd | null = null;
/** Konec pod perem (zvýraznění, náhled). */
let hoverEnd: DimEnd | null = null;
/** Tažení odsazení existující kóty. */
let shifting: { id: Id; offset: number; moved: boolean; startScreen: Pt } | null = null;

const zoom = () => store.get().camera.zoom;

/** Konec kóty pod perem: bod / hrana, jinak přichycený bod výkresu. */
function endUnder(floor: Floor, world: Pt): DimEnd {
  const ref = refAt(floor, world, HIT_PX.node / zoom(), (HIT_PX.wall * 0.75) / zoom());
  if (ref) return ref;
  const p = snapPoint(floor, world, snapOptions()).pt;
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

/** Body kóty mezi konci (null = hrany nejsou rovnoběžné / nulová délka). */
function measure(floor: Floor, a: DimEnd, b: DimEnd): [Pt, Pt] | null {
  const g1 = refGeom(floor, a);
  const g2 = refGeom(floor, b);
  const m = g1 && g2 ? measurePoints(g1, g2) : null;
  return m && dist(m[0], m[1]) >= 1 ? m : null;
}

export const dimTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    // tažení za kótovací čáru hotové kóty mění odsazení – jen když se nezačíná nová kóta a pod perem není bod ani hrana
    const onRef = !!refAt(floor, p.world, HIT_PX.node / zoom(), (HIT_PX.wall * 0.5) / zoom());
    const hit = first || onRef ? null : pickFreeDim(floor, p.world, (HIT_PX.wall * 0.6) / zoom());
    const d = hit ? floor.dims?.[hit] : null;
    if (d) {
      shifting = { id: d.id, offset: d.offset, moved: false, startScreen: p.screen };
      store.set({ selection: { kind: 'dim', id: d.id }, numpad: null });
    }
  },
  drag(p) {
    const floor = store.floor();
    const d = shifting && floor?.dims?.[shifting.id];
    if (shifting && d && floor) {
      if (dist(p.screen, shifting.startScreen) >= 6) shifting.moved = true;
      const o = offsetTowards(floor, d, p.world);
      if (o !== null) shifting.offset = o;
    } else if (floor) hoverEnd = endUnder(floor, p.world);
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
    const floor = store.floor();
    if (!floor) return;
    const end = endUnder(floor, p.world);
    if (!first) {
      first = end;
      store.set({ selection: null, numpad: null, toolMsg: dimToolMsg(true) });
    } else if (!sameEnd(first, end)) {
      if (measure(floor, first, end)) {
        addFreeDim(first, end);
        first = null;
        store.set({ toolMsg: dimToolMsg(false) });
      } else store.set({ toolMsg: 'Hrany nejsou rovnoběžné – ťukni na rovnoběžnou hranu nebo na bod (Esc = začít znovu).' });
    }
    requestRender();
  },
  hover(p) {
    const floor = store.floor();
    if (!floor) return;
    hoverEnd = endUnder(floor, p.world);
    requestRender();
  },
  cancel() {
    if (first) store.set({ toolMsg: dimToolMsg(false) });
    first = null;
    shifting = null;
    hoverEnd = null;
    requestRender();
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    const floor = store.floor();
    if (!floor) return;
    ctx.save();
    // náhled odsazení při tažení
    const d = shifting && floor.dims?.[shifting.id];
    if (shifting && d) {
      const line = dimLine(floor, { ...d, offset: shifting.offset });
      const pts = dimPoints(floor, d);
      if (line && pts) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        polyline(ctx, cam, [pts[0], line[0], line[1], pts[1]]);
      }
      ctx.restore();
      return;
    }
    // 1. konec zeleně, konec pod perem modře (červeně, když s 1. koncem nejde – nerovnoběžné hrany)
    if (first) mark(ctx, cam, floor, first, '#16a34a');
    const m = first && hoverEnd ? measure(floor, first, hoverEnd) : null;
    if (hoverEnd) mark(ctx, cam, floor, hoverEnd, first && !m ? '#dc2626' : '#2563eb');
    if (m) {
      const a = toScreen(m[0], cam);
      const b = toScreen(m[1], cam);
      ctx.strokeStyle = '#2563eb';
      ctx.fillStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      polyline(ctx, cam, m);
      const n = dist(a, b) > 1e-6 ? normal(scale(sub(b, a), 1 / dist(a, b))) : { x: 0, y: -1 };
      const mid = scale(add(a, b), 0.5);
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(dist(m[0], m[1]))), mid.x + n.x * 14, mid.y + n.y * 14);
    }
    ctx.restore();
  }
};

function polyline(ctx: CanvasRenderingContext2D, cam: Camera, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = toScreen(p, cam);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
}

/** Zvýrazní konec kóty: hranu silnou čarou (+ místo dosednutí), bod kroužkem. */
function mark(ctx: CanvasRenderingContext2D, cam: Camera, floor: Floor, e: DimEnd, color: string): void {
  const g: RefGeom | null = refGeom(floor, e);
  if (!g) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.setLineDash([]);
  const seg = refSegment(floor, e);
  if (seg) {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    polyline(ctx, cam, seg);
    ctx.globalAlpha = 1;
  }
  const s = toScreen(g.p, cam);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 'x' in e ? 4 : 6, 0, Math.PI * 2);
  if ('x' in e) ctx.stroke();
  else ctx.fill();
}

/** Návod v liště nástroje (`started` = 1. konec je zadaný). */
export function dimToolMsg(started: boolean): string {
  return started
    ? 'Ťukni na 2. bod nebo hranu (rovnoběžnou – kóta změří kolmou vzdálenost).'
    : 'Ťukni na 1. bod nebo hranu (roh, líc stěny, čára, okraj okna / dveří). Délku zadáš ťuknutím na číslo, odsazení tažením za čáru kóty.';
}
