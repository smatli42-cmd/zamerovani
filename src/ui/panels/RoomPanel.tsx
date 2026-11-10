/**
 * Panel místnosti.
 */
import type { Room } from '../../model/types';
import { deleteSelection, duplicateSelection, updateRoom } from '../../store/actions';
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
      <h4>Světlé výšky</h4>
      {room.heights.map((h, i) => (
        <div class="height-row" key={i}>
          <input
            type="number"
            inputMode="numeric"
            value={h.value}
            key={`v${h.value}`}
            onChange={e => {
              const v = Math.round(Number((e.target as HTMLInputElement).value));
              if (v > 0) set({ heights: room.heights.map((x, j) => (j === i ? { ...x, value: v } : x)) });
            }}
          />
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
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
