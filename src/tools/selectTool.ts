/**
 * Nástroj „Vybrat“: ťuknutí na prvek otevře jeho vlastnosti (panel vpravo, včetně Smazat),
 * ťuknutí na kótu otevře zadání rozměru. Tažením se posouvá roh / otvor / štítek místnosti.
 */
import { requestRender } from '../canvas/invalidate';
import { findNodeNear, findWallNear, wallLength, wallNodes } from '../core/floorQueries';
import { dist, projectToSegment, roundTo } from '../core/geometry';
import type { Id, Pt } from '../model/types';
import { mergeNodeIfCoincident, moveNode, moveOpeningTo, moveRoom } from '../store/actions';
import { store } from '../store/store';
import { pickAny } from './pick';
import { HIT_PX, type PointerInput, type Tool } from './types';

type DragKind = { kind: 'node'; id: Id } | { kind: 'opening'; id: Id; grabOffset: number } | { kind: 'room'; id: Id; dx: number; dy: number };

let drag: DragKind | null = null;
let downScreen: Pt | null = null;
let dragging = false;

export const selectTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
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
