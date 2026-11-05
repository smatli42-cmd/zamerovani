/**
 * Nástroje pro vkládání: otvory (dveře, okno, průchod, nika) a štítek místnosti.
 * Ťuknutí na existující prvek ho vybere (a jde posouvat jako v nástroji Vybrat).
 */
import { findWallNear } from '../core/floorQueries';
import type { OpeningKind } from '../model/types';
import { addOpening, addRoom } from '../store/actions';
import { store } from '../store/store';
import { pickOpening, pickRoom } from './pick';
import { selectTool } from './selectTool';
import { HIT_PX, type PointerInput, type Tool } from './types';

function makeOpeningTool(kind: OpeningKind): Tool {
  let delegating = false;
  return {
    down(p: PointerInput) {
      const floor = store.floor();
      if (!floor) return;
      const cam = store.get().camera;
      if (pickOpening(floor, p.world, cam)) {
        delegating = true;
        selectTool.down?.(p);
        return;
      }
      delegating = false;
      const hit = findWallNear(floor, p.world, (HIT_PX.wall * 1.5) / cam.zoom);
      if (hit) addOpening(hit.wall.id, kind, hit.t);
    },
    drag(p) {
      if (delegating) selectTool.drag?.(p);
    },
    up(p) {
      if (delegating) selectTool.up?.(p);
      delegating = false;
    },
    hover: selectTool.hover,
    cancel() {
      if (delegating) selectTool.cancel?.();
      delegating = false;
    }
  };
}

export const doorTool = makeOpeningTool('door');
export const windowTool = makeOpeningTool('window');
export const openingTool = makeOpeningTool('opening');
export const nicheTool = makeOpeningTool('niche');

let roomDelegating = false;
export const roomTool: Tool = {
  down(p) {
    const floor = store.floor();
    if (!floor) return;
    if (pickRoom(floor, p.world, store.get().camera)) {
      roomDelegating = true;
      selectTool.down?.(p);
      return;
    }
    roomDelegating = false;
    addRoom(p.world);
  },
  drag(p) {
    if (roomDelegating) selectTool.drag?.(p);
  },
  up(p) {
    if (roomDelegating) selectTool.up?.(p);
    roomDelegating = false;
  },
  cancel() {
    if (roomDelegating) selectTool.cancel?.();
    roomDelegating = false;
  }
};
