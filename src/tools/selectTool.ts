/**
 * Nástroj „Vybrat“: ťuknutí na prvek otevře jeho vlastnosti (panel vpravo, včetně Smazat),
 * ťuknutí na kótu otevře zadání rozměru. Tažením se posouvá roh / otvor / štítek místnosti.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { arcGeometry } from '../core/arc';
import { findNodeNear, findWallNear, wallLength, wallNodes } from '../core/floorQueries';
import { dist, projectToSegment, roundTo } from '../core/geometry';
import type { Id, Pt } from '../model/types';
import { mergeNodeIfCoincident, moveNode, moveOpeningTo, moveRoom, setCircleRadius, setWallSagitta } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import { HIT_PX, type PointerInput, type Tool } from './types';

type DragKind = { kind: 'node'; id: Id } | { kind: 'opening'; id: Id; grabOffset: number } | { kind: 'room'; id: Id; dx: number; dy: number }
  | { kind: 'handle'; id: Id };

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
  const g = wall.radius === undefined ? arcGeometry(n[0], n[1], wall.sagitta ?? 0) : null;
  const at = wall.radius !== undefined ? { x: n[0].x + wall.radius, y: n[0].y } : g?.apex;
  if (!at) return null;
  return dist(toScreen(at, store.get().camera), p.screen) <= HANDLE_PX ? wall.id : null;
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
    if (grabArcHandle(p)) return;
    const cam = store.get().camera;
    const hit = pickAny(floor, p.world, cam);
    downScreen = p.screen;
    dragging = false;
    drag = null;

    if (!hit) {
      store.set({ selection: null, numpad: null });
      return;
    }
    store.set({ selection: hit, numpad: null });
    if (hit.kind === 'node') drag = { kind: 'node', id: hit.id };
    if (hit.kind === 'room') {
      const r = floor.rooms[hit.id]!;
      drag = { kind: 'room', id: hit.id, dx: p.world.x - r.x, dy: p.world.y - r.y };
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
    if (!drag || !downScreen) return;
    if (!dragging) {
      if (dist(downScreen, p.screen) < 6) return; // ochrana proti nechtěnému posunu při ťuknutí
      dragging = true;
      store.beginGesture();
    }
    const floor = store.floor();
    if (!floor) return;
    const cam = store.get().camera;

    if (drag.kind === 'node') {
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
    } else if (drag.kind === 'handle') {
      const wall = floor.walls[drag.id];
      const n = wall && wallNodes(floor, wall);
      if (wall && n && wall.radius !== undefined) {
        // kruh: poloměr = vzdálenost pera od středu
        setCircleRadius(drag.id, Math.max(10, roundTo(dist(p.world, n[0]), 10)));
      } else if (wall && n) {
        // oblouk: vzepětí = vzdálenost pera od tětivy (se znaménkem podle strany)
        const len = dist(n[0], n[1]) || 1;
        const nx = -(n[1].y - n[0].y) / len;
        const ny = (n[1].x - n[0].x) / len;
        const mid = { x: (n[0].x + n[1].x) / 2, y: (n[0].y + n[1].y) / 2 };
        let h = roundTo((p.world.x - mid.x) * nx + (p.world.y - mid.y) * ny, 10);
        if (h === 0) h = (Math.sign(wall.sagitta ?? 1) || 1) * 10; // 0 by znamenalo rovnou stěnu – tu se zbavíme jen v panelu
        setWallSagitta(drag.id, h);
      }
    }
  },

  up() {
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
    if (hit?.kind !== cur?.kind || hit?.id !== cur?.id) {
      store.set({ hover: hit });
      requestRender();
    }
  },

  cancel() {
    if (dragging) store.endGesture();
    drag = null;
    dragging = false;
  }
};
