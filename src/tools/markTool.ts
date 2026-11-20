/**
 * Nástroj „Značka“ (ZNACKY-POZNAMKY-DETAILY.md): klepnutí do prázdného místa založí značku s dalším číslem,
 * klepnutí na značku ji vybere a otevře její okno, tažením se posune (přes nástroj Vybrat).
 */
import { addMark } from '../store/actions';
import { store } from '../store/store';
import { pickMark } from './pick';
import { anyHandleUnderPen, selectTool } from './selectTool';
import type { PointerInput, Tool } from './types';

let delegating = false;

export const markTool: Tool = {
  down(p: PointerInput) {
    const floor = store.view('pick');
    if (!floor) return;
    if (pickMark(floor, p.world, store.get().camera) || anyHandleUnderPen(p)) {
      delegating = true;
      selectTool.down?.(p);
      return;
    }
    delegating = false;
    addMark(p.world);
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
