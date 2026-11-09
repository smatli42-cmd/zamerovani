/**
 * Nástroj „Vybrat“: ťuknutí na prvek otevře jeho vlastnosti (panel vpravo, včetně Smazat),
 * ťuknutí na kótu otevře zadání rozměru. Tažením se posouvá roh / otvor / štítek místnosti.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { arcChain } from '../core/arcChain';
import { findNodeNear, findWallNear, wallLength, wallNodes } from '../core/floorQueries';
import { dist, projectToSegment, roundTo } from '../core/geometry';
import type { Id, Pt } from '../model/types';
import { selectInRect, normRect } from '../core/rectSelect';
import { groupOrigin, type GroupOrigin, mergeNodeIfCoincident, moveGroup, moveNode, moveOpeningTo, moveRoom, moveText, updateText, setCircleRadius, setWallSagitta } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import { HIT_PX, type PointerInput, type Tool } from './types';

type DragKind = { kind: 'node'; id: Id } | { kind: 'opening'; id: Id; grabOffset: number } | { kind: 'room'; id: Id; dx: number; dy: number }
  | { kind: 'text'; id: Id; dx: number; dy: number }
  | { kind: 'handle'; id: Id }
  | { kind: 'leader'; id: Id }
  | { kind: 'group'; origin: GroupOrigin; start: Pt };

/** Rámeček výběru: zleva doprava okno (modře), zprava doleva křížení (zeleně, čárkovaně). */
let band: { start: Pt; end: Pt; startScreen: Pt; endScreen: Pt } | null = null;

let drag: DragKind | null = null;
let downScreen: Pt | null = null;
let dragging = false;

/** Poloměr zásahu středového bodu oblouku (px). */
const HANDLE_PX = 18;

/**
 * Pokud je vybraná oblouková stěna a pero míří na její středový bod, začne tažení vzepětí.
 * Používají to i nástroje Stěna a Oblouk (vrací true = událost převzata, ostatní předat selectTool).
 */
/** Vybraná oblouková / kruhová stěna, pokud pero míří na její úchyt (střed oblouku, bod kruhu). */
export function arcUnderPen(p: PointerInput): Id | null {
  const floor = store.floor();
  const sel = store.get().selection;
  if (!floor || sel?.kind !== 'wall') return null;
  const wall = floor.walls[sel.id];
  const n = wall && wallNodes(floor, wall);
  if (!wall || !n) return null;
  const at = wall.radius !== undefined ? { x: n[0].x + wall.radius, y: n[0].y } : arcChain(floor, wall.id)?.geom.apex;
  if (!at) return null;
  return dist(toScreen(at, store.get().camera), p.screen) <= HANDLE_PX ? wall.id : null;
}

/** Hrot odkazové šipky vybraného textu se dá táhnout. */
export function grabLeaderHandle(p: PointerInput): boolean {
  const floor = store.floor();
  const sel = store.get().selection;
  const t = floor && sel?.kind === 'text' ? floor.texts[sel.id] : null;
  if (!t?.leader) return false;
  if (dist(toScreen(t.leader, store.get().camera), p.screen) > HANDLE_PX) return false;
  drag = { kind: 'leader', id: t.id };
  downScreen = p.screen;
  dragging = false;
  return true;
}

export function grabArcHandle(p: PointerInput): boolean {
  const id = arcUnderPen(p);
  if (!id) return false;
  drag = { kind: 'handle', id };
  downScreen = p.screen;
  dragging = false;
  return true;
}

export const selectTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    if (grabArcHandle(p) || grabLeaderHandle(p)) return;
    const cam = store.get().camera;
    const hit = pickAny(floor, p.world, cam);
    downScreen = p.screen;
    dragging = false;
    drag = null;

    if (!hit) {
      // Tažení z prázdného místa = výběr obdélníkem, ťuknutí = zrušení výběru
      store.set({ selection: null, numpad: null });
      band = { start: p.world, end: p.world, startScreen: p.screen, endScreen: p.screen };
      return;
    }
    const cur = store.get().selection;
    if (cur?.kind === 'multi') {
      const member = cur.items.some(i => (i.kind === hit.kind && i.id === (hit as { id: Id }).id) || (hit.kind === 'node' && i.kind === 'wall' && (floor.walls[i.id]?.a === (hit as { id: Id }).id || floor.walls[i.id]?.b === (hit as { id: Id }).id)));
      if (member) {
        drag = { kind: 'group', origin: groupOrigin(floor, cur.items), start: p.world };
        return;
      }
    }
    store.set({ selection: hit, numpad: null });
    if (hit.kind === 'node') drag = { kind: 'node', id: hit.id };
    if (hit.kind === 'room') {
      const r = floor.rooms[hit.id]!;
      drag = { kind: 'room', id: hit.id, dx: p.world.x - r.x, dy: p.world.y - r.y };
    }
    if (hit.kind === 'text') {
      const t = floor.texts[hit.id]!;
      drag = { kind: 'text', id: hit.id, dx: p.world.x - t.x, dy: p.world.y - t.y };
    }
    if (hit.kind === 'opening') {
      const op = floor.openings[hit.id]!;
      const wall = floor.walls[op.wallId];
      const n = wall && wallNodes(floor, wall);
      if (wall && n) {
        const len = wallLength(floor, wall);
        const along = projectToSegment(p.world, n[0], n[1]).t * len;
        const start = op.ref === 'a' ? op.offset : len - op.offset - op.width;
        drag = { kind: 'opening', id: hit.id, grabOffset: along - start };
      }
    }
  },

  drag(p: PointerInput) {
    if (band) {
      band.end = p.world;
      band.endScreen = p.screen;
      requestRender();
      return;
    }
    if (!drag || !downScreen) return;
    if (!dragging) {
      if (dist(downScreen, p.screen) < 6) return; // ochrana proti nechtěnému posunu při ťuknutí
      dragging = true;
      store.beginGesture();
    }
    const floor = store.floor();
    if (!floor) return;
    const cam = store.get().camera;

    if (drag.kind === 'leader') {
      updateText(drag.id, { leader: { x: Math.round(p.world.x / 10) * 10, y: Math.round(p.world.y / 10) * 10 } });
    } else if (drag.kind === 'group') {
      moveGroup(drag.origin, p.world.x - drag.start.x, p.world.y - drag.start.y);
    } else if (drag.kind === 'node') {
      const tol = HIT_PX.snapNode / cam.zoom;
      const other = findNodeNear(floor, p.world, tol, drag.id);
      let target: Pt;
      if (other) target = other;
      else {
        const w = findWallNear(floor, p.world, tol * 0.7);
        const own = w && (w.wall.a === drag.id || w.wall.b === drag.id);
        target = w && !own ? w.point : { x: roundTo(p.world.x, 10), y: roundTo(p.world.y, 10) };
      }
      moveNode(drag.id, target);
    } else if (drag.kind === 'opening') {
      const op = floor.openings[drag.id];
      const wall = op && floor.walls[op.wallId];
      const n = wall && wallNodes(floor, wall);
      if (op && wall && n) {
        const along = projectToSegment(p.world, n[0], n[1]).t * wallLength(floor, wall);
        moveOpeningTo(drag.id, roundTo(along - drag.grabOffset, 10));
      }
    } else if (drag.kind === 'room') {
      moveRoom(drag.id, { x: p.world.x - drag.dx, y: p.world.y - drag.dy });
    } else if (drag.kind === 'text') {
      moveText(drag.id, { x: p.world.x - drag.dx, y: p.world.y - drag.dy });
    } else if (drag.kind === 'handle') {
      const wall = floor.walls[drag.id];
      const n = wall && wallNodes(floor, wall);
      if (wall && n && wall.radius !== undefined) {
        // kruh: poloměr = vzdálenost pera od středu
        setCircleRadius(drag.id, Math.max(10, roundTo(dist(p.world, n[0]), 10)));
      } else if (wall && n) {
        // oblouk: vzepětí = vzdálenost pera od tětivy (se znaménkem podle strany)
        // oblouk rozdělený na části se táhne celý (podle vnějších konců)
        const ch = arcChain(floor, wall.id);
        const pa = ch?.a ?? n[0];
        const pb = ch?.b ?? n[1];
        const len = dist(pa, pb) || 1;
        const nx = -(pb.y - pa.y) / len;
        const ny = (pb.x - pa.x) / len;
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        let h = roundTo((p.world.x - mid.x) * nx + (p.world.y - mid.y) * ny, 10);
        if (h === 0) h = (Math.sign(ch?.sagitta ?? wall.sagitta ?? 1) || 1) * 10; // 0 by znamenalo rovnou stěnu – tu se zbavíme jen v panelu
        setWallSagitta(drag.id, h);
      }
    }
  },

  up() {
    if (band) {
      const b = band;
      band = null;
      const floor = store.floor();
      if (floor && Math.hypot(b.endScreen.x - b.startScreen.x, b.endScreen.y - b.startScreen.y) >= 8) {
        const items = selectInRect(floor, normRect(b.start, b.end), b.end.x < b.start.x);
        store.set({ selection: items.length === 0 ? null : items.length === 1 ? items[0]! : { kind: 'multi', items } });
      }
      requestRender();
      return;
    }
    if (drag && dragging) {
      if (drag.kind === 'node') mergeNodeIfCoincident(drag.id);
      store.endGesture();
    }
    drag = null;
    dragging = false;
    downScreen = null;
  },

  hover(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const hit = pickAny(floor, p.world, store.get().camera);
    const cur = store.get().hover;
    if (hit?.kind !== cur?.kind || (hit as { id?: Id } | null)?.id !== (cur as { id?: Id } | null)?.id) {
      store.set({ hover: hit });
      requestRender();
    }
  },

  drawOverlay(ctx) {
    if (!band) return;
    const x = Math.min(band.startScreen.x, band.endScreen.x);
    const y = Math.min(band.startScreen.y, band.endScreen.y);
    const w = Math.abs(band.endScreen.x - band.startScreen.x);
    const h = Math.abs(band.endScreen.y - band.startScreen.y);
    const crossing = band.end.x < band.start.x;
    ctx.save();
    ctx.fillStyle = crossing ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.12)';
    ctx.strokeStyle = crossing ? '#16a34a' : '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(crossing ? [6, 4] : []);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  },

  cancel() {
    band = null;
    if (dragging) store.endGesture();
    drag = null;
    dragging = false;
  }
};
