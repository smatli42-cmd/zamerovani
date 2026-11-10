/**
 * Panel otvoru (dveře, okno, francouzské okno, průchod, nika), ostění a zárubeň / rám.
 */
import { openingThickness, revealPartValue, type RevealPart } from '../../core/doorLayout';
import { isWindowKind, OPENING_DEFAULTS } from '../../model/factory';
import type { Opening } from '../../model/types';
import { applyNumpadValue, deleteSelection, duplicateSelection, setOpeningRef, setRevealEnabled, updateOpening } from '../../store/actions';
import { openTarget } from '../../store/numpadController';
import { store } from '../../store/store';
import { close } from './common';
import { NumField, Panel, Seg, TextField } from './fields';

const OPENING_PRESETS: Record<Opening['kind'], number[]> = {
  door: [600, 700, 800, 900, 1100, 1250],
  window: [600, 900, 1200, 1500, 1800, 2100],
  french: [800, 900, 1000, 1200, 1500],
  opening: [700, 800, 900, 1200, 1500],
  niche: [300, 450, 600, 900]
};

function RevealField({ op, part, label }: { op: Opening; part: RevealPart; label: string }) {
  const floor = store.floor();
  return (
    <button class="field-button" onClick={() => openTarget({ kind: 'opening-reveal', openingId: op.id, part })}>
      <span>{label}</span>
      <b>{(floor && revealPartValue(floor, op, part)) ?? 0} mm</b>
    </button>
  );
}

export function OpeningPanel({ op }: { op: Opening }) {
  const info = OPENING_DEFAULTS[op.kind];
  const set = (patch: Partial<Opening>) => updateOpening(op.id, patch);
  return (
    <Panel title={`${info.label} ${op.number}`} onClose={close}>
      {isWindowKind(op.kind) && (
        <div class="field field-inline">
          <span>Druh</span>
          <Seg
            options={[
              { v: 'window', label: 'Okno' },
              { v: 'french', label: 'Francouzské' }
            ]}
            value={op.kind as 'window' | 'french'}
            onChange={v => v !== op.kind && set({ kind: v, sill: OPENING_DEFAULTS[v].sill })}
          />
        </div>
      )}
      <div class="field field-inline">
        <span>Měřit od rohu</span>
        <Seg
          options={[
            { v: 'a', label: 'A' },
            { v: 'b', label: 'B' }
          ]}
          value={op.ref}
          onChange={v => setOpeningRef(op.id, v)}
        />
      </div>
      <div class="field-grid">
        <button class="field-button" onClick={() => openTarget({ kind: 'opening-offset', openingId: op.id, ref: op.ref })}>
          <span>Odstup od {op.ref.toUpperCase()}</span>
          <b>{op.offset} mm</b>
        </button>
        <button class="field-button" onClick={() => openTarget({ kind: 'opening-width', openingId: op.id })}>
          <span>Šířka</span>
          <b>{op.width} mm</b>
        </button>
      </div>
      <div class="chips">
        {OPENING_PRESETS[op.kind].map(w => (
          <button key={w} class={`chip ${w === op.width ? 'active' : ''}`} onClick={() => applyNumpadValue({ kind: 'opening-width', openingId: op.id }, w)}>
            {w}
          </button>
        ))}
      </div>
      <div class="field-grid">
        <NumField label="Výška" value={op.height} min={100} onCommit={v => v !== null && set({ height: v })} />
        {op.kind !== 'door' && <NumField label="Parapet" value={op.sill} onCommit={v => v !== null && set({ sill: v })} />}
        {op.kind === 'niche' && <NumField label="Hloubka niky" value={op.depth} min={10} onCommit={v => v !== null && set({ depth: v })} />}
      </div>
      {(op.kind === 'door' || op.kind === 'niche' || (isWindowKind(op.kind) && op.frame)) && (
        <div class="btn-row">
          {op.kind === 'door' && (
            <button class="btn" onClick={() => set({ hinge: op.hinge === 'a' ? 'b' : 'a' })}>
              🔄 Panty L/P
            </button>
          )}
          <button class="btn" onClick={() => set({ swing: op.swing === 1 ? -1 : 1 })}>
            🔄 {op.kind === 'door' ? 'Dovnitř/ven' : op.kind === 'niche' ? 'Strana' : 'Strana rámu'}
          </button>
        </div>
      )}
      {op.frame && (
        <div class="field-grid">
          <RevealField op={op} part="frameWidth" label={op.kind === 'door' ? 'Šířka zárubně' : 'Šířka rámu'} />
          <RevealField op={op} part="frameDepth" label={op.kind === 'door' ? 'Hloubka zárubně' : 'Hloubka rámu'} />
          {!op.reveal && <RevealField op={op} part="frameOffset" label={op.kind === 'door' ? 'Odsazení zárubně' : 'Odsazení rámu'} />}
        </div>
      )}
      {op.kind !== 'niche' && (
        <>
          <div class="field field-inline">
            <span>Ostění</span>
            <Seg
              options={[
                { v: 'no', label: 'Bez ostění' },
                { v: 'yes', label: 'S ostěním' }
              ]}
              value={op.reveal ? 'yes' : 'no'}
              onChange={v => setRevealEnabled(op.id, v === 'yes')}
            />
          </div>
          {op.reveal && (
            <>
              <div class="field-grid">
                <RevealField op={op} part="depth" label={op.frame ? 'Hloubka (líc A)' : 'Hloubka'} />
                {op.frame && openingThickness(store.floor()!, op) !== null && <RevealField op={op} part="depthBack" label="Hloubka (líc B)" />}
                <RevealField op={op} part="top" label="Nahoře" />
                <RevealField op={op} part="left" label="Vlevo" />
                <RevealField op={op} part="right" label="Vpravo" />
              </div>
              {op.kind !== 'door' && !op.frame && (
                <button class="btn btn-sm" style="margin-bottom:6px" onClick={() => set({ swing: op.swing === 1 ? -1 : 1 })}>
                  🔄 Strana ostění
                </button>
              )}
            </>
          )}
        </>
      )}
      <div class="field-row">
        <div style="flex:0 0 80px">
          <TextField label="Číslo" value={op.number} onCommit={v => set({ number: v.trim() || op.number })} />
        </div>
        <TextField label="Popis" value={op.note} onCommit={v => set({ note: v })} />
      </div>
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
