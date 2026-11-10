/**
 * Akce: mazání výběru.
 */
import { wallsAtNode } from '../../core/floorQueries';
import { store } from '../store';
import { cleanup } from './shared';

export function deleteSelection(): void {
  const sel = store.get().selection;
  if (!sel) return;
  const items = sel.kind === 'multi' ? sel.items : [sel];
  store.edit(
    floor => {
      // příčka se maže celá (obě čáry i uzavírací stěny)
      for (const it of [...items]) {
        const w = it.kind === 'wall' ? floor.walls[it.id] : null;
        if (w?.part) for (const pw of Object.values(floor.walls)) if (pw.part?.id === w.part.id) delete floor.walls[pw.id];
      }
      for (const sel of items) switch (sel.kind) {
        case 'wall':
          delete floor.walls[sel.id];
          break;
        case 'node':
          for (const w of wallsAtNode(floor, sel.id)) delete floor.walls[w.id];
          break;
        case 'opening':
          delete floor.openings[sel.id];
          break;
        case 'room':
          delete floor.rooms[sel.id];
          break;
        case 'text':
          delete floor.texts[sel.id];
          break;
      }
      cleanup(floor);
    },
    { selection: null, numpad: null }
  );
}
