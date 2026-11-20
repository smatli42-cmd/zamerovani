/**
 * Panel volné kóty (core/freeDim.ts): délka (posune zvolený bod), odsazení, zámek, smazání.
 */
import { requestDelete } from '../deleteConfirm';
import { useState } from 'preact/hooks';
import { defaultFreeDimMove, freeDimValue } from '../../core/freeDim';
import { refLabel as endLabel } from '../../core/dimRefs';
import { isDimLocked } from '../../core/dimLock';
import type { Floor, FreeDim } from '../../model/types';
import { applyNumpadValue, setFreeDimOffset, toggleDimLock } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

export function DimPanel({ floor, d }: { floor: Floor; d: FreeDim }) {
  const [move, setMove] = useState<'a' | 'b'>(() => defaultFreeDimMove(d));
  const value = freeDimValue(floor, d.id);
  const target = { kind: 'free-dim' as const, dimId: d.id, move };
  const locked = isDimLocked(floor, target);
  return (
    <Panel title="Kóta" onClose={close}>
      <p class="muted small">
        Kóta: 1. {endLabel(d.a)}, 2. {endLabel(d.b)}. Mezi rovnoběžnými hranami měří kolmo. Zadaná délka posune zvolený konec ve směru kóty (roh jako při
        změně délky stěny, líc = celou stěnu, kresbu celou, okraj otvoru = otvor po stěně). Úhlopříčka místnosti zachová
        délky stěn – stojí pevný roh a jeho delší stěna, místnost se zkosí.
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
        <button class="btn btn-danger" onClick={requestDelete}>
          🗑️ Smazat
        </button>
      </div>
    </Panel>
  );
}
