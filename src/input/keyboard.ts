/**
 * Klávesové zkratky (PC, tablet s klávesnicí, dálkoměr v režimu klávesnice).
 */
import { requestDelete } from '../ui/deleteConfirm';
import { openTarget, pressKey, type NumKey } from '../store/numpadController';
import { store } from '../store/store';
import { tools } from '../tools/registry';

export function attachKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    const state = store.get();
    const ctrl = e.ctrlKey || e.metaKey;
    // okno značky je modální – Zpět / Delete / zkratky výkresu v něm nepůsobí (vlastní Zpět skici, Esc zavře okno)
    if (state.markOpen) return;

    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }

    // Číselná klávesnice je otevřená → klávesy jdou do ní
    if (state.numpad) {
      const map: Record<string, NumKey> = { Enter: 'ENTER', Tab: 'NEXT', Backspace: 'BACK', Escape: 'ESC', Delete: 'CLEAR', '+': '+', '-': '-' };
      const key: NumKey | undefined = /^[0-9]$/.test(e.key) ? (e.key as NumKey) : map[e.key];
      if (key) {
        e.preventDefault();
        pressKey(key);
      }
      return;
    }

    // Vybraná stěna + napsané číslo → rovnou otevře zadání délky
    if (state.selection?.kind === 'wall' && /^[0-9]$/.test(e.key) && !ctrl) {
      e.preventDefault();
      const wall = store.floor()?.walls[state.selection.id];
      if (!wall) return;
      openTarget({ kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } });
      pressKey(e.key as NumKey);
      return;
    }

    if (e.key === 'Delete') {
      requestDelete();
    } else if (e.key === 'Escape') {
      tools[state.tool].cancel?.();
      // Esc ukončí i kreslení řetězem
      store.set({ selection: null, numpad: null, chainNode: null });
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
