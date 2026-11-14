/**
 * Nástroj „Do rohu“ (KATALOG-STEN.md D3): zkrátit / prodloužit dvě rovné stěny do společného rohu.
 * Ťukne se na první stěnu a pak na druhou – vždy na tu část, která má zůstat (jako Trim/Extend v Revitu).
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { trimCorner, type TrimResult } from '../core/trimExtend';
import { findWallNear } from '../core/floorQueries';
import { findBodyAt } from '../core/wallBody';
import type { Id, Pt } from '../model/types';
import { trimToCorner } from '../store/actions';
import { store, type Camera } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';

export const TRIM_MSG_FIRST = 'Ťukni na první stěnu – na část, která má zůstat.';
const MSG_SECOND = 'Ťukni na druhou stěnu – na část, která má zůstat.';
const FAIL: Record<Exclude<TrimResult, 'ok'>, string> = {
  curved: 'Oblouk ani kruh do rohu zkrátit nejde – vyber rovné stěny.',
  parallel: 'Stěny jsou rovnoběžné, roh mezi nimi nevznikne.',
  same: 'Vyber dvě různé stěny.',
  tooShort: 'Stěna by byla příliš krátká – ťukni na delší část.',
  joined: 'Stěny už jsou v rohu spojené.'
};

let first: { wallId: Id; keep: Pt } | null = null;
let hoverPt: Pt | null = null;

function wallAt(p: PointerInput): Id | null {
  const floor = store.floor();
  if (!floor) return null;
  const hit = findWallNear(floor, p.world, HIT_PX.wall / store.get().camera.zoom);
  return hit?.wall.id ?? findBodyAt(floor, p.world)?.id ?? null;
}

export const trimTool: Tool = {
  down(p) {
    const id = wallAt(p);
    if (!id) {
      first = null;
      store.set({ selection: null, toolMsg: TRIM_MSG_FIRST });
      return requestRender();
    }
    if (!first) {
      first = { wallId: id, keep: p.world };
      store.set({ selection: { kind: 'wall', id }, numpad: null, toolMsg: MSG_SECOND });
      return requestRender();
    }
    const res = trimToCorner(first.wallId, first.keep, id, p.world);
    first = null;
    store.set({ selection: null, toolMsg: res === 'ok' ? TRIM_MSG_FIRST : `⚠️ ${FAIL[res]} ${TRIM_MSG_FIRST}` });
    requestRender();
  },
  hover(p) {
    hoverPt = first ? p.world : null;
    const id = wallAt(p);
    const cur = store.get().hover;
    if ((cur?.kind === 'wall' ? cur.id : null) !== id) store.set({ hover: id ? { kind: 'wall', id } : null });
    if (first) requestRender();
  },
  cancel() {
    first = null;
    hoverPt = null;
    store.set({ selection: null, toolMsg: TRIM_MSG_FIRST });
  },
  /** Náhled: bod budoucího rohu (kroužek) a čárkované spojení k němu od místa první volby. */
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    const floor = store.floor();
    const h = store.get().hover;
    if (!first || !floor || h?.kind !== 'wall' || h.id === first.wallId) return;
    const x = trimCorner(floor, first.wallId, h.id);
    if (!x) return;
    const s = toScreen(x, cam);
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    if (hoverPt) {
      const a = toScreen(first.keep, cam);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.restore();
  }
};
