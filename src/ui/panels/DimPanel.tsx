/**
 * Panel volné kóty (core/freeDim.ts): délka (posune zvolený bod), odsazení, zámek, smazání.
 */
import { useState } from 'preact/hooks';
import { endLabel, freeDimValue } from '../../core/freeDim';
import { isDimLocked } from '../../core/dimLock';
import type { Floor, FreeDim } from '../../model/types';
import { applyNumpadValue, deleteSelection, setFreeDimOffset, toggleDimLock } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

export function DimPanel({ floor, d }: { floor: Floor; d: FreeDim }) {
  const [move, setMove] = useState<'a' | 'b'>('b');
  const value = freeDimValue(floor, d.id);
  const target = { kind: 'free-dim' as const, dimId: d.id, move };
  const locked = isDimLocked(floor, target);
  return (
    <Panel title="Kóta" onClose={close}>
      <p class="muted small">
        Kóta mezi dvěma body: 1. {endLabel(d.a)}, 2. {endLabel(d.b)}. Zadaná délka posune zvolený bod ve směru kóty (roh stěny jako při změně délky
        stěny, kresbu celou, oba body na jedné kresbě jen bod).
      </p>
      <Seg
        options={[
          { v: 'a', label: '◀ Posunout 1. bod' },
          { v: 'b', label: 'Posunout 2. bod ▶' }
        ]}
        value={move}
        onChange={v => setMove(v as 'a' | 'b')}
      />
      <div class="field-grid">
        <NumField label="Délka" value={value === null ? null : Math.round(value)} min={1} onCommit={v => v !== null && applyNumpadValue(target, v)} />
        {/* odsazení se zadává bez znaménka – strana zůstane (přehodí se tažením za čáru nástrojem Kóta) */}
        <NumField label="Odsazení" value={Math.abs(d.offset)} onCommit={v => v !== null && setFreeDimOffset(d.id, (Math.sign(d.offset) || 1) * v)} />
      </div>
      <div class="panel-actions">
        <button class={`btn btn-sm lock-toggle ${locked ? 'on' : ''}`} onClick={() => toggleDimLock(target)}>
          {locked ? '🔒 Zamčeno – odemknout' : '🔓 Zamknout kótu'}
        </button>
        <button class="btn btn-danger" onClick={deleteSelection}>
          🗑️ Smazat
        </button>
      </div>
    </Panel>
  );
}
