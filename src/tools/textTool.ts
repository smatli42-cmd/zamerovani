/**
 * Nástroj „Text“: ťuknutí do prázdného místa vloží text, ťuknutí na existující text ho vybere
 * (úprava v panelu vpravo) a tažením se přesune.
 */
import { addText } from '../store/actions';
import { store } from '../store/store';
import { pickText } from './pick';
import { selectTool } from './selectTool';
import type { PointerInput, Tool } from './types';

let delegating = false;

export const textTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    if (pickText(floor, p.world, store.get().camera)) {
      delegating = true;
      selectTool.down?.(p);
      return;
    }
    delegating = false;
    addText(p.world);
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
