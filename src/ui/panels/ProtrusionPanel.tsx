/**
 * Panel výstupku / vybrání stěny (KATALOG-STEN.md, sekce I): rozměry, výška, název, materiál, poznámka.
 */
import { protrusionDims } from '../../core/protrusion';
import type { Floor, Protrusion } from '../../model/types';
import { applyNumpadValue, deleteSelection, updateProtrusion } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, TextField } from './fields';

export function ProtrusionPanel({ floor, p }: { floor: Floor; p: Protrusion }) {
  const d = protrusionDims(floor, p);
  const dim = (k: 'width' | 'depth', v: number | null) => v !== null && applyNumpadValue({ kind: 'protrusion-dim', protrusionId: p.id, dim: k }, v);
  return (
    <Panel title={p.mode === 'subtract' ? 'Vybrání stěny' : 'Výstupek stěny'} onClose={close}>
      <p class="muted small">Patří ke stěně a pohybuje se s ní. Rozměry a odstupy jdou zadat i ťuknutím na kóty.</p>
      <div class="field-grid">
        <NumField label="Šířka" value={d ? Math.round(d.width) : null} min={10} onCommit={v => dim('width', v)} />
        <NumField label="Hloubka" value={d ? Math.round(d.depth) : null} min={1} onCommit={v => dim('depth', v)} />
        <NumField label="Výška" value={p.height ?? null} allowEmpty onCommit={v => updateProtrusion(p.id, { height: v ?? undefined })} />
      </div>
      <TextField label="Název" value={p.name} placeholder="např. pilastr, přizdívka" presets={p.mode === 'subtract' ? ['výklenek', 'drážka'] : ['pilastr', 'přizdívka', 'podpěra']} onCommit={v => updateProtrusion(p.id, { name: v })} />
      <TextField label="Materiál" value={p.material} onCommit={v => updateProtrusion(p.id, { material: v })} />
      <TextField label="Poznámka" value={p.note} onCommit={v => updateProtrusion(p.id, { note: v })} />
      <div class="panel-actions">
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
