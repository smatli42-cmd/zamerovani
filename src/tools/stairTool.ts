/**
 * Nástroj Schodiště (2D značka, core/stairs.ts). Režimy (lišta voleb, `settings.stairMode`):
 * - z rohu do rohu: tažení, nebo dvě ťuknutí (roh u prvního stupně, protější roh); osa podél delší strany,
 * - zadané rozměry: šířka × délka z lišty; ťuknutí do rohu u prvního stupně, druhé ťuknutí (nebo tažení) = směr,
 * - točité: ťuknutí do středu, druhé na vnější okraj u prvního stupně (360°, upraví se v panelu).
 * S `stairAppend` (tlačítko panelu „Další rameno nakreslit“) kreslí rameno k vybranému schodišti (podesta mezi
 * rameny se dopočte, dá se nahradit kresbou). Ťuknutí na schodiště ho vybere. Body se přichytávají jako kresba.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { dist } from '../core/geometry';
import { flightPolygon } from '../core/stairFlight';
import { defaultSteps, flightFromCorners, flightLength, stairHit } from '../core/stairs';
import { SPIRAL_MIN_RADIUS, sizedFlight, spiralFlight } from '../core/stairCreate';
import type { Pt, StairFlight } from '../model/types';
import { addSizedStair, addSpiralStair, addStair, appendDrawnFlight } from '../store/actions';
import { store } from '../store/store';
import { drawSnap } from './drawSnap';
import { pickAny } from './pick';
import { selectTool } from './selectTool';
import type { PointerInput, Tool } from './types';

const MIN_SIZE = 50; // mm – menší tažení se bere jako ťuknutí

/** Zpráva v liště voleb podle režimu a stavu (čeká se na 2. bod). */
export function stairToolMsg(second: boolean): string {
  const { settings, stairAppend } = store.get();
  const pre = stairAppend ? 'Další rameno: ' : '';
  if (settings.stairMode === 'spiral') return second ? 'Ťukněte na vnější okraj u prvního stupně.' : 'Ťukněte do středu točitého schodiště.';
  if (settings.stairMode === 'size') return pre + (second ? 'Ťukněte směrem, kam rameno vede.' : 'Ťukněte do rohu u prvního stupně.');
  return pre + (second ? 'Ťukněte do protějšího rohu ramene.' : 'Táhněte z rohu do protějšího rohu, nebo ťukněte do dvou rohů.');
}

const snap = (p: Pt): Pt => {
  const floor = store.floor();
  return floor ? drawSnap(store.view('snap')!, p, null).pt : p;
};

/** Rameno, které vznikne z bodů a, b v aktuálním režimu (náhled i vložení). */
function previewFlight(a: Pt, b: Pt): StairFlight | null {
  const { stairMode, stairWidth, stairLength } = store.get().settings;
  if (stairMode === 'spiral') return spiralFlight('', a, b);
  if (stairMode === 'size') return sizedFlight('', a, b, stairWidth, stairLength);
  const f = flightFromCorners('', a, b, 2);
  f.steps = defaultSteps(flightLength(f));
  return f;
}

function commit(a: Pt, b: Pt): void {
  const { settings, stairAppend } = store.get();
  const append = stairAppend && store.floor()?.stairs?.[stairAppend] && settings.stairMode !== 'spiral' ? stairAppend : null;
  if (settings.stairMode === 'spiral') addSpiralStair(a, b);
  else if (append) {
    appendDrawnFlight(append, a, b, settings.stairMode === 'size' ? { width: settings.stairWidth, length: settings.stairLength } : undefined);
  } else if (settings.stairMode === 'size') addSizedStair(a, b, settings.stairWidth, settings.stairLength);
  else addStair(a, b);
  store.set({ stairAppend: null, toolMsg: null });
}

let start: Pt | null = null; // stisk / 1. ťuknutí
let end: Pt | null = null; // tažení / pero nad displejem
let downAt: Pt | null = null;
let first: Pt | null = null; // čeká se na 2. ťuknutí

/** Zruší rozkreslené body (změna režimu v liště – „Nakreslit další rameno“ zůstane). */
export function resetStairPoints(): void {
  start = end = downAt = first = null;
  requestRender();
}

export const stairTool: Tool = {
  down(p: PointerInput) {
    if (!store.floor()) return;
    downAt = p.world;
    start = first ?? snap(p.world);
    end = first ? snap(p.world) : start;
    requestRender();
  },
  drag(p: PointerInput) {
    if (!start) return;
    end = snap(p.world);
    requestRender();
  },
  up(p: PointerInput) {
    const tap = downAt;
    const s = start;
    const e = end;
    start = downAt = null;
    if (!tap || !s || !e) return;
    const dragged = !first && dist(s, e) >= MIN_SIZE;
    if (first) {
      // 2. ťuknutí (nebo tažení po 1. ťuknutí)
      const b = snap(p.world);
      const a = first;
      first = null;
      if (dist(a, b) >= MIN_SIZE) commit(a, b);
      else store.set({ toolMsg: stairToolMsg(false) });
    } else if (dragged) commit(s, e);
    else {
      const floor = store.floor();
      // jen ťuknutí dovnitř schodiště ho vybere – na rohu / hraně (přichycení) začne nové rameno
      const hit = floor && !store.get().stairAppend ? pickAny(store.view('pick')!, tap, store.get().camera, store.get().selection) : null;
      const inside = hit?.kind === 'stair' && floor?.stairs?.[hit.id] && stairHit(floor.stairs[hit.id]!, tap, 0) && dist(s, tap) < 1;
      if (hit?.kind === 'stair' && inside) store.set({ selection: hit, toolMsg: null });
      else {
        // 1. ťuknutí: začátek ramene / střed točitého schodiště
        first = s;
        store.set({ selection: store.get().stairAppend ? store.get().selection : null, numpad: null, toolMsg: stairToolMsg(true) });
      }
    }
    end = null;
    requestRender();
  },
  hover(p: PointerInput) {
    if (first) {
      end = snap(p.world);
      requestRender();
      return;
    }
    selectTool.hover?.(p);
  },
  cancel() {
    resetStairPoints();
    store.set({ stairAppend: null, toolMsg: null });
  },
  drawOverlay(ctx, cam) {
    const a = first ?? start;
    const b = end;
    if (!a) return;
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#2563eb';
    // 1. bod
    const pa = toScreen(a, cam);
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, 5, 0, Math.PI * 2);
    ctx.fill();
    const f = b && dist(a, b) >= MIN_SIZE ? previewFlight(a, b) : null;
    if (f && b) {
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      flightPolygon(f).forEach((q, i) => {
        const s = toScreen(q, cam);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const fa = toScreen(f.a, cam);
      const fb = toScreen(f.b, cam);
      ctx.beginPath();
      ctx.moveTo(fa.x, fa.y);
      ctx.lineTo(fb.x, fb.y);
      ctx.stroke();
      badge(ctx, toScreen(b, cam), f.center ? `Ø ${Math.round((dist(f.center, f.a) + f.width / 2) * 2)} mm, ${f.steps} st.` : `${Math.round(flightLength(f))} × ${Math.round(f.width)} mm, ${f.steps} st.`);
    } else if (b && store.get().settings.stairMode === 'spiral') {
      badge(ctx, toScreen(b, cam), `poloměr aspoň ${SPIRAL_MIN_RADIUS} mm`);
    }
    ctx.restore();
  }
};

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
