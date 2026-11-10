/**
 * Nástroj „Vložit“: po zkopírování otvorů (dveře, okna…) ťuknutím na stěnu se vloží celá skupina
 * (se zachovanými rozestupy). Zůstává aktivní, dokud se neukončí tlačítkem Hotovo.
 */
import { findWallNear, isCurved, wallLength } from '../core/floorQueries';
import { toPrimary } from '../core/pairing';
import { pasteOpenings } from '../store/actions';
import { store } from '../store/store';
import { HIT_PX, type PointerInput, type Tool } from './types';

export const pasteTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const hit = findWallNear(floor, p.world, (HIT_PX.wall * 1.5) / store.get().camera.zoom);
    if (!hit || isCurved(hit.wall)) return;
    const prim = toPrimary(floor, hit.wall, hit.point);
    if (prim) pasteOpenings(prim.wall.id, prim.t * wallLength(floor, prim.wall));
    else pasteOpenings(hit.wall.id, hit.t * wallLength(floor, hit.wall));
  }
};
