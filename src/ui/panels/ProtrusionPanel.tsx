/**
 * Panel výstupku / vybrání stěny (KATALOG-STEN.md, sekce I): rozměry, výška, název, materiál, poznámka.
 */
import { protrusionDims } from '../../core/protrusionEdit';
import { protrusionCornerWarning } from '../../core/cornerOverlap';
import type { CornerProtrusion, EndProtrusion, Floor, Protrusion } from '../../model/types';
import { cornerDims } from '../../core/cornerProtrusion';
import { endDims, type EndDim } from '../../core/endProtrusion';
import { END_DIM_LABEL } from '../../core/dimLock';
import { useState } from 'preact/hooks';
import { applyNumpadValue, copyProtrusionRow, deleteSelection, updateProtrusion } from '../../store/actions';
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
            const want = Math.min(100, count);
            const n = copyProtrusionRow(p.id, want, spacing, dir === 'b' ? 1 : -1);
            setMsg(n === want ? `Vloženo kopií: ${n}.` : n === 0 ? 'Nevložena žádná kopie – vyjely by ze stěny, překryly by se, nebo brání zamčená kóta.' : `Vloženo kopií: ${n} z ${want} – ostatní by vyjely ze stěny nebo se překryly.`);
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
      <p class="muted small">Drží se rohu dvou stěn – při posunu stěn zůstane na jejich lících se stejnými rozměry. Rozměry jdou zadat i ťuknutím na kóty.</p>
      <div class="field-grid">
        <NumField label="Podél 1. stěny" value={Math.round(d.a)} min={10} onCommit={v => v !== null && applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'a' }, v)} />
        <NumField label="Podél 2. stěny" value={Math.round(d.b)} min={10} onCommit={v => v !== null && applyNumpadValue({ kind: 'corner-dim', protrusionId: cp.id, dim: 'b' }, v)} />
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

/** Panel výstupku na konci stěny (I1.11): rozměry, výška, název, materiál, poznámka. */
export function EndProtrusionPanel({ ep }: { ep: EndProtrusion }) {
  const d = endDims(ep);
  const dims = (Object.keys(END_DIM_LABEL) as EndDim[]).filter(k => d[k] > 0);
  return (
    <Panel title="Výstupek na konci stěny" onClose={close}>
      <p class="muted small">Obtáčí čelo volného konce stěny a drží se ho. Rozměry jdou zadat i ťuknutím na kóty.</p>
      <div class="field-grid">
        {dims.map(k => (
          <NumField key={k} label={END_DIM_LABEL[k][0]!.toUpperCase() + END_DIM_LABEL[k].slice(1)} value={Math.round(d[k])} min={k === 'over' ? 1 : 10} onCommit={v => v !== null && applyNumpadValue({ kind: 'end-dim', protrusionId: ep.id, dim: k }, v)} />
        ))}
        <NumField label="Výška" value={ep.height ?? null} allowEmpty onCommit={v => updateProtrusion(ep.id, { height: v ?? undefined })} />
      </div>
      <TextField label="Název" value={ep.name} placeholder="např. přizdívka, pilíř" presets={['přizdívka', 'pilíř', 'obklad']} onCommit={v => updateProtrusion(ep.id, { name: v })} />
      <TextField label="Materiál" value={ep.material} onCommit={v => updateProtrusion(ep.id, { material: v })} />
      <TextField label="Poznámka" value={ep.note} onCommit={v => updateProtrusion(ep.id, { note: v })} />
      <div class="panel-actions">
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
