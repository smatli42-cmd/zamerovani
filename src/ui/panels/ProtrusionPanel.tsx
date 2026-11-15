/**
 * Panel výstupku / vybrání stěny (KATALOG-STEN.md, sekce I): rozměry, výška, název, materiál, poznámka.
 */
import { protrusionDims } from '../../core/protrusionEdit';
import { protrusionCornerWarning } from '../../core/cornerOverlap';
import type { CornerProtrusion, Floor, Protrusion } from '../../model/types';
import { cornerDims } from '../../core/cornerProtrusion';
import { applyNumpadValue, deleteSelection, setCornerProtrusionDim, updateProtrusion } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, TextField } from './fields';

export function ProtrusionPanel({ floor, p }: { floor: Floor; p: Protrusion }) {
  const d = protrusionDims(floor, p);
  // F7: výstupek / vybrání blízko rohu – jen upozornění
  const cornerWarn = protrusionCornerWarning(floor, p.id);
  const dim = (k: 'width' | 'depth', v: number | null) => v !== null && applyNumpadValue({ kind: 'protrusion-dim', protrusionId: p.id, dim: k }, v);
  return (
    <Panel title={p.mode === 'subtract' ? 'Vybrání stěny' : 'Výstupek stěny'} onClose={close}>
      <p class="muted small">Patří ke stěně a pohybuje se s ní. Rozměry a odstupy jdou zadat i ťuknutím na kóty.</p>
      {cornerWarn && <div class="panel-warn">⚠️ {cornerWarn}</div>}
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

/** Panel výstupku přes roh (I1.11): rozměry podél líců obou stěn od rohu, výška, název, materiál, poznámka. */
export function CornerProtrusionPanel({ cp }: { cp: CornerProtrusion }) {
  const d = cornerDims(cp);
  return (
    <Panel title="Výstupek v rohu" onClose={close}>
      <p class="muted small">Drží se rohu dvou stěn – při posunu stěn zůstane na jejich lících se stejnými rozměry.</p>
      <div class="field-grid">
        <NumField label="Podél 1. stěny" value={Math.round(d.a)} min={10} onCommit={v => v !== null && setCornerProtrusionDim(cp.id, 'a', v)} />
        <NumField label="Podél 2. stěny" value={Math.round(d.b)} min={10} onCommit={v => v !== null && setCornerProtrusionDim(cp.id, 'b', v)} />
        <NumField label="Výška" value={cp.height ?? null} allowEmpty onCommit={v => updateProtrusion(cp.id, { height: v ?? undefined })} />
      </div>
      <TextField label="Název" value={cp.name} placeholder="např. sloupek, šachta" presets={['sloupek', 'šachta', 'pilíř']} onCommit={v => updateProtrusion(cp.id, { name: v })} />
      <TextField label="Materiál" value={cp.material} onCommit={v => updateProtrusion(cp.id, { material: v })} />
      <TextField label="Poznámka" value={cp.note} onCommit={v => updateProtrusion(cp.id, { note: v })} />
      <div class="panel-actions">
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
