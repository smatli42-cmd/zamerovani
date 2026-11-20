/**
 * Panel místnosti.
 */
import { requestDelete } from '../deleteConfirm';
import type { Room } from '../../model/types';
import { duplicateSelection, roomLockState, setRoomDimsLocked, updateRoom } from '../../store/actions';
import { store } from '../../store/store';
import { useStore } from '../../store/useStore';
import { openField } from '../../store/numpadController';
import { close } from './common';
import { Panel, TextField } from './fields';

const ROOM_NAMES = ['Obývací pokoj', 'Kuchyň', 'Ložnice', 'Pokoj', 'Koupelna', 'WC', 'Chodba', 'Předsíň', 'Spíž', 'Komora', 'Sklep', 'Schodiště'];

export function RoomPanel({ room }: { room: Room }) {
  const set = (patch: Partial<Room>) => updateRoom(room.id, patch);
  return (
    <Panel title={`Místnost ${room.number}`} onClose={close}>
      <div class="field-row">
        <div style="flex:0 0 70px">
          <TextField label="Číslo" value={room.number} onCommit={v => set({ number: v.trim() })} />
        </div>
        <TextField label="Název" value={room.name} placeholder="např. Kuchyň" onCommit={v => set({ name: v })} />
      </div>
      <div class="chips">
        {ROOM_NAMES.map(n => (
          <button key={n} type="button" class="chip" onClick={() => set({ name: n })}>
            {n}
          </button>
        ))}
      </div>
      <RoomLocks roomId={room.id} />
      <h4>Světlé výšky</h4>
      {room.heights.map((h, i) => (
        <div class="height-row" key={i}>
          <button
            type="button"
            class="field-button height-value"
            onClick={() =>
              openField({ label: 'Světlá výška', min: 1 }, h.value, v => {
                if (v !== null && v > 0) set({ heights: room.heights.map((x, j) => (j === i ? { ...x, value: v } : x)) });
              })
            }
          >
            <b>{h.value} mm</b>
          </button>
          <input
            type="text"
            placeholder="kde (např. pod trámem)"
            value={h.note}
            key={`n${h.note}`}
            onChange={e => set({ heights: room.heights.map((x, j) => (j === i ? { ...x, note: (e.target as HTMLInputElement).value } : x)) })}
          />
          {room.heights.length > 1 && (
            <button class="btn btn-sm" onClick={() => set({ heights: room.heights.filter((_, j) => j !== i) })}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button class="btn btn-sm" onClick={() => set({ heights: [...room.heights, { value: room.heights[0]?.value ?? 2700, note: '' }] })}>
        ＋ Další výška
      </button>
      <TextField label="Poznámka" value={room.note} onCommit={v => set({ note: v })} />
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={requestDelete}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}

/** Hromadné zamknutí / odemknutí kót všech stěn obrysu místnosti. */
function RoomLocks({ roomId }: { roomId: string }) {
  useStore(s => s.project); // překreslit po změně zámků
  const floor = store.floor();
  const st = floor ? roomLockState(floor, roomId) : null;
  if (!st) return <p class="muted small">Kóty místnosti: kolem štítku není uzavřený obrys stěn.</p>;
  return (
    <div class="field lock-all">
      <span>Kóty místnosti {st === 'all' ? '🔒 vše zamčeno' : st === 'some' ? '🔒 část zamčena' : ''}</span>
      <div class="seg">
        <button class={st === 'all' ? 'active' : ''} onClick={() => setRoomDimsLocked(roomId, true)}>
          🔒 Zamknout vše
        </button>
        <button class={st === 'none' ? 'active' : ''} onClick={() => setRoomDimsLocked(roomId, false)}>
          🔓 Odemknout vše
        </button>
      </div>
    </div>
  );
}
