/**
 * Panel značky (ZNACKY-POZNAMKY-DETAILY.md): číslo (ruční změna s kontrolou duplicity), název,
 * barva, směr pohledu (kužel / šipka, úhel), otevření okna s poznámkou a skicou, kopie, smazání s potvrzením.
 * Vrstva a přesun do vrstvy jsou dole (LayerField).
 */
import type { Mark } from '../../model/types';
import { defaultDir, markCode, MARK_COLORS, MARK_PREFIX } from '../../core/marks';
import { duplicateSelection, setMarkDir, setMarkNumber, updateMark } from '../../store/actions';
import { store } from '../../store/store';
import { requestDelete } from '../deleteConfirm';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

export function MarkPanel({ m }: { m: Mark }) {
  const dir = m.dir ?? { ...defaultDir(), on: false };
  return (
    <Panel title={`Značka ${markCode(m)}`} onClose={close}>
      <button class="btn btn-primary btn-lg" style="width:100%" onClick={() => store.set({ markOpen: m.id })}>
        📝 Poznámka a skica…
      </button>
      <label class="field">
        <span>Název (může být prázdný)</span>
        <input type="text" value={m.name} key={m.name} placeholder="např. Sokl u terasy" onChange={e => updateMark(m.id, { name: (e.target as HTMLInputElement).value })} />
      </label>
      <div class="field-grid">
        <NumField
          label={`Číslo (${MARK_PREFIX})`}
          value={m.num}
          unit=""
          min={1}
          onCommit={v => {
            if (v === null) return;
            const err = setMarkNumber(m.id, Math.round(v));
            if (err) store.set({ lockBlock: { key: '', text: err } });
          }}
        />
      </div>
      <div class="field field-inline">
        <span>Barva</span>
        <div class="mark-colors">
          {MARK_COLORS.map(c => (
            <button key={c} type="button" class={`color-dot ${m.color === c ? 'active' : ''}`} style={{ background: c }} title={c} onClick={() => updateMark(m.id, { color: c })} />
          ))}
        </div>
      </div>
      <div class="field field-inline">
        <span>Směr pohledu</span>
        <Seg
          options={[
            { v: 'off', label: 'Bez směru' },
            { v: 'cone', label: 'Kužel' },
            { v: 'arrow', label: 'Šipka' }
          ]}
          value={dir.on ? dir.style : 'off'}
          onChange={v => setMarkDir(m.id, v === 'off' ? { on: false } : { on: true, style: v })}
        />
      </div>
      {dir.on && (
        <>
          <div class="field-grid">
            <NumField label="Úhel" value={dir.angle} unit="°" min={-360} onCommit={v => v !== null && setMarkDir(m.id, { angle: v })} />
          </div>
          <p class="muted small">Tažením kulatého úchytu na konci kužele / šipky směr otočíte i prodloužíte / zkrátíte.</p>
        </>
      )}
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={requestDelete}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
