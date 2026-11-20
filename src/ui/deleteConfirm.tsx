/**
 * Smazání výběru – JEDINÁ cesta z UI (tlačítka Smazat v panelech, klávesa Delete). Výběr se značkou se maže až
 * po potvrzení (značka nese poznámku a skicu – ZNACKY-POZNAMKY-DETAILY.md); ostatní prvky hned (Zpět je vrátí).
 */
import { markCode, marksOf } from '../core/marks';
import { deleteSelection } from '../store/actions';
import { store, type Selection } from '../store/store';
import { useStore } from '../store/useStore';
import { ConfirmDialog } from './Dialog';

/** Značky ve výběru. */
function selectedMarks(sel: Selection): string[] {
  if (!sel) return [];
  const items = sel.kind === 'multi' ? sel.items : [sel];
  return items.filter(i => i.kind === 'mark').map(i => i.id);
}

export function requestDelete(): void {
  if (selectedMarks(store.get().selection).length) store.set({ deleteConfirm: true });
  else deleteSelection();
}

export function DeleteConfirm() {
  const open = useStore(s => s.deleteConfirm);
  const sel = useStore(s => s.selection);
  if (!open) return null;
  const ids = selectedMarks(sel);
  const floor = store.floor();
  const names = floor ? marksOf(floor).filter(m => ids.includes(m.id)) : [];
  const label = names.map(m => `${markCode(m)}${m.name ? ` ${m.name}` : ''}`).join(', ');
  return (
    <ConfirmDialog
      title={ids.length > 1 ? 'Smazat značky?' : 'Smazat značku?'}
      message={`${label} – smaže se i poznámka a skica. Krok jde vrátit tlačítkem Zpět.`}
      confirmLabel="Smazat"
      danger
      onConfirm={deleteSelection}
      onClose={() => store.set({ deleteConfirm: false })}
    />
  );
}
