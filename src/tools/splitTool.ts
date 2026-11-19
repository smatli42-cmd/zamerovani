/**
 * Nástroj „Rozdělit“ (KATALOG-STEN.md D4; rozhodnutí uživatele 2026-11-15): ťuknutím na stěnu se rozdělí na dvě
 * (po 10 mm od rohu A, zarovnání s rohy). V režimu „S mezerou“ se ťukne na dvě místa téže stěny a úsek mezi nimi
 * zmizí. Přesnou polohu pak určí kóty částí. Prvky nesené stěnou podle pravidla F4.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { findWallNear } from '../core/floorQueries';
import { findBodyAt } from '../core/wallBody';
import type { Id, Pt } from '../model/types';
import { canSplit, cutWallSegment, splitPoint, splitWall, type SplitResult } from '../store/actions';
import { store, type Camera } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';

export const splitMsg = (gap: boolean) => (gap ? 'Ťukni na začátek mezery ve stěně.' : 'Ťukni na stěnu v místě, kde ji rozdělit.');
const MSG_SECOND = 'Ťukni na konec mezery na téže stěně.';
const FAIL: Record<Exclude<SplitResult, 'ok'>, string> = {
  circle: 'Kruh rozdělit nejde.',
  end: 'Příliš blízko konce stěny (nebo body mezery splývají).',
  whole: 'Mezera přes celou stěnu – stěnu raději smaž.',
  locked: 'Brání zamčená kóta (viz hlášení dole).',
  none: 'Tady žádná stěna není.'
};

let first: { wallId: Id; at: Pt } | null = null;
let hoverPt: Pt | null = null;

function wallAt(p: Pt): Id | null {
  const floor = store.floor();
  if (!floor) return null;
  const hit = findWallNear(store.view('pick')!, p, HIT_PX.wall / store.get().camera.zoom);
  return hit?.wall.id ?? findBodyAt(store.view('pick')!, p)?.id ?? null;
}
const alignTol = () => HIT_PX.snapAlign / store.get().camera.zoom;
const done = (removed: number, gap: boolean) =>
  `${gap ? 'Úsek vyjmut.' : 'Rozděleno.'}${removed ? ` Smazáno nebo odpojeno prvků (F4): ${removed}.` : ''} Přesnou polohu urči kótou. ${splitMsg(gap)}`;

export const splitTool: Tool = {
  down(p: PointerInput) {
    const gap = store.get().settings.splitGap;
    const id = wallAt(p.world);
    if (!id) {
      first = null;
      store.set({ selection: null, toolMsg: `⚠️ ${FAIL.none} ${splitMsg(gap)}` });
      return requestRender();
    }
    if (!gap) {
      const r = splitWall(id, p.world, alignTol());
      store.set({ selection: null, toolMsg: r.result === 'ok' ? done(r.removed, false) : `⚠️ ${FAIL[r.result]} ${splitMsg(false)}` });
      return requestRender();
    }
    if (!canSplit(store.floor(), id)) {
      first = null;
      store.set({ selection: null, toolMsg: `⚠️ ${FAIL.circle} ${splitMsg(true)}` });
      return requestRender();
    }
    if (!first || first.wallId !== id) {
      first = { wallId: id, at: p.world };
      store.set({ selection: { kind: 'wall', id }, numpad: null, toolMsg: MSG_SECOND });
      return requestRender();
    }
    const r = cutWallSegment(id, first.at, p.world, alignTol());
    first = null;
    store.set({ selection: null, toolMsg: r.result === 'ok' ? done(r.removed, true) : `⚠️ ${FAIL[r.result]} ${splitMsg(true)}` });
    requestRender();
  },
  hover(p: PointerInput) {
    hoverPt = p.world;
    const id = wallAt(p.world);
    const cur = store.get().hover;
    if ((cur?.kind === 'wall' ? cur.id : null) !== id) store.set({ hover: id ? { kind: 'wall', id } : null });
    requestRender();
  },
  cancel() {
    first = null;
    hoverPt = null;
    store.set({ selection: null, toolMsg: splitMsg(store.get().settings.splitGap) });
  },
  /** Náhled: značka dělicího bodu pod perem; u mezery červeně úsek, který zmizí. */
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    const floor = store.floor();
    const h = store.get().hover;
    if (!floor || !hoverPt || h?.kind !== 'wall') return;
    const now = splitPoint(floor, h.id, hoverPt, alignTol());
    if (!now) return;
    const s = toScreen(now.pt, cam);
    ctx.save();
    if (first && first.wallId === h.id) {
      const a = splitPoint(floor, h.id, first.at, alignTol());
      if (a) {
        const sa = toScreen(a.pt, cam);
        ctx.strokeStyle = 'rgba(220,38,38,0.85)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x - 8, s.y - 8);
    ctx.lineTo(s.x + 8, s.y + 8);
    ctx.moveTo(s.x + 8, s.y - 8);
    ctx.lineTo(s.x - 8, s.y + 8);
    ctx.stroke();
    ctx.restore();
  }
};
