/**
 * Panel výstupku / vybrání stěny (KATALOG-STEN.md, sekce I): rozměry, výška, název, materiál, poznámka.
 */
import { protrusionDims } from '../../core/protrusionEdit';
import { protrusionCornerWarning } from '../../core/cornerOverlap';
import type { CornerProtrusion, Floor, Protrusion } from '../../model/types';
import { cornerDims } from '../../core/cornerProtrusion';
import { useState } from 'preact/hooks';
import { applyNumpadValue, copyProtrusionRow, deleteSelection, setCornerProtrusionDim, updateProtrusion } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, Seg, TextField } from './fields';

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
      <RowCopy p={p} width={d ? Math.round(d.width) : 0} />
      <div class="panel-actions">
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}

/** Kopírovat v řadě (I1.11): počet kopií, rozteč (osová vzdálenost) a směr podél stěny. */
function RowCopy({ p, width }: { p: Protrusion; width: number }) {
  const [count, setCount] = useState(2);
  const [spacing, setSpacing] = useState(Math.max(width * 2, 1000));
  const [dir, setDir] = useState<'b' | 'a'>('b');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div class="field">
      <span>Kopírovat v řadě</span>
      <div class="field-grid">
        <NumField label="Počet kopií" unit="ks" value={count} min={1} onCommit={v => v !== null && setCount(Math.round(v))} />
        <NumField label="Rozteč" value={spacing} min={10} onCommit={v => v !== null && setSpacing(v)} />
      </div>
      <div class="btn-row">
        <Seg
          options={[
            { v: 'b', label: 'Směr k B' },
            { v: 'a', label: 'Směr k A' }
          ]}
          value={dir}
          onChange={setDir}
        />
        <button
          class="btn"
          onClick={() => {
            const n = copyProtrusionRow(p.id, count, spacing, dir === 'b' ? 1 : -1);
            setMsg(n === count ? `Vloženo kopií: ${n}.` : `Vloženo kopií: ${n} z ${count} – ostatní by vyjely ze stěny nebo se překryly.`);
          }}
        >
          📄 Kopírovat
        </button>
      </div>
      {msg && <p class="muted small">{msg}</p>}
    </div>
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
