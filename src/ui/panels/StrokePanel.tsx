/**
 * Panel ručního tahu (core/strokes.ts): tloušťka, kopie, smazání. Vrstva a přesun do vrstvy jsou dole (LayerField).
 */
import { requestDelete } from '../deleteConfirm';
import type { Stroke } from '../../model/types';
import { STROKE_WIDTHS } from '../../core/strokes';
import { duplicateSelection, setStrokeWidth } from '../../store/actions';
import { close } from './common';
import { Panel, Seg } from './fields';

export function StrokePanel({ s }: { s: Stroke }) {
  const preset = (STROKE_WIDTHS as readonly number[]).includes(s.width) ? (s.width as (typeof STROKE_WIDTHS)[number]) : null;
  return (
    <Panel title="Ruční tah" onClose={close}>
      <p class="muted small">Poznámka perem – barva podle vrstvy. Tažením za vybraný tah ho posunete.</p>
      <div class="field">
        <span>Tloušťka (mm výkresu)</span>
        <Seg options={STROKE_WIDTHS.map(w => ({ v: w, label: `${w}` }))} value={preset as never} onChange={v => setStrokeWidth(s.id, v)} />
      </div>
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={requestDelete}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
