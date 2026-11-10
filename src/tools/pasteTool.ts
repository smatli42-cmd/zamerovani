/**
 * Nástroj „Vložit“: po zkopírování otvorů (dveře, okna…) ťuknutím na stěnu se vloží celá skupina
 * (se zachovanými rozestupy). Zůstává aktivní, dokud se neukončí tlačítkem Hotovo.
 */
import { isCurved, wallLength } from '../core/floorQueries';
import { pasteOpenings } from '../store/actions';
import { store } from '../store/store';
import { wallForOpening } from './pick';
import type { PointerInput, Tool } from './types';

export const pasteTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const hit = wallForOpening(floor, p.world, store.get().camera);
    if (!hit || isCurved(hit.wall)) return;
    pasteOpenings(hit.wall.id, hit.t * wallLength(floor, hit.wall));
  }
};
