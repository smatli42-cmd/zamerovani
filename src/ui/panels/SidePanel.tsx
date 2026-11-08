/**
 * Panel vlastností vybraného prvku (stěna, otvor, místnost, roh).
 */
import { wallLength, wallsAtNode } from '../../core/floorQueries';
import { OPENING_DEFAULTS } from '../../model/factory';
import type { Floor, LineStyle, Opening, Room, TextNote, Wall, WallType } from '../../model/types';
import { applyNumpadValue, deleteSelection, setOpeningRef, updateOpening, updateRoom, updateText, updateWall, updateWallLabel } from '../../store/actions';
import { openTarget } from '../../store/numpadController';
import { store } from '../../store/store';
import { useStore } from '../../store/useStore';
import { NumField, Panel, Seg, TextField } from './fields';

const close = () => store.set({ selection: null });

export function SidePanel() {
  const selection = useStore(s => s.selection);
  const numpadOpen = useStore(s => s.numpad !== null);
  const project = useStore(s => s.project);
  const floorId = useStore(s => s.floorId);
  if (!selection || numpadOpen || !project) return null;
  const floor = project.floors.find(f => f.id === floorId);
  if (!floor) return null;

  switch (selection.kind) {
    case 'wall': {
      const w = floor.walls[selection.id];
      return w ? <WallPanel floor={floor} wall={w} /> : null;
    }
    case 'opening': {
      const o = floor.openings[selection.id];
      return o ? <OpeningPanel op={o} /> : null;
    }
    case 'room': {
      const r = floor.rooms[selection.id];
      return r ? <RoomPanel room={r} /> : null;
    }
    case 'text': {
      const t = floor.texts[selection.id];
      return t ? <TextPanel note={t} /> : null;
    }
    case 'node':
      return (
        <Panel title="Roh" onClose={close}>
          <p class="muted small">Tažením roh posunete. Přetažením na jiný roh se rohy spojí.</p>
          <p class="small">Napojené stěny: {wallsAtNode(floor, selection.id).length}</p>
          <button class="btn btn-danger" onClick={deleteSelection}>
            🗑️ Smazat roh i se stěnami
          </button>
        </Panel>
      );
  }
}

const WALL_TYPES: { v: WallType; label: string }[] = [
  { v: 'obvodova', label: 'Obvodová' },
  { v: 'nosna', label: 'Nosná' },
  { v: 'pricka', label: 'Příčka' },
  { v: 'sdk', label: 'SDK' },
  { v: 'neovereno', label: '?' }
];

function WallPanel({ floor, wall }: { floor: Floor; wall: Wall }) {
  const len = Math.round(wallLength(floor, wall));
  const l = wall.label;
  const circle = wall.radius !== undefined;
  return (
    <Panel title={circle ? 'Kruh' : 'Stěna'} onClose={close}>
      {circle && (
        <button class="big-value" onClick={() => openTarget({ kind: 'circle-diameter', wallId: wall.id })}>
          <span>Ø{wall.radius! * 2}</span> <small>mm</small>
          <span class="hint">ťukni a zadej průměr (nebo táhni modrý bod na obvodu)</span>
        </button>
      )}
      {!circle && (
      <button class="big-value" onClick={() => openTarget({ kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } })}>
        {wall.measured === null ? <span class="sketch">~{len}</span> : <span>{wall.measured}</span>} <small>mm</small>
        <span class="hint">{wall.measured === null ? 'náčrt – ťukni a zadej změřenou délku' : 'změřeno – ťukni pro změnu'}</span>
      </button>
      )}

      {!circle && (
      <div class="field">
        <span>Tvar</span>
        <Seg
          options={[
            { v: 'straight', label: 'Rovná' },
            { v: 'arc', label: 'Oblouk' }
          ]}
          value={wall.sagitta ? 'arc' : 'straight'}
          onChange={v => updateWall(wall.id, { sagitta: v === 'arc' ? (wall.sagitta || Math.max(10, Math.round(len / 4 / 10) * 10)) : 0 })}
        />
      </div>
      )}
      {wall.sagitta ? (
        <>
          <button class="field-button" onClick={() => openTarget({ kind: 'wall-sagitta', wallId: wall.id })}>
            <span>Vzepětí oblouku</span>
            <b>{Math.abs(wall.sagitta)} mm</b>
          </button>
          <p class="muted small">Vzepětí jde změnit i tažením modrého bodu uprostřed oblouku.</p>
          <button class="btn" onClick={() => updateWall(wall.id, { sagitta: -(wall.sagitta ?? 0) })}>
            🔄 Vyklenout na opačnou stranu
          </button>
        </>
      ) : null}
      <div class="field">
        <span>Styl čáry</span>
        <Seg options={LINE_STYLES} value={wall.style ?? 'solid'} onChange={v => updateWall(wall.id, { style: v })} />
      </div>

      <h4>Popisek stěny</h4>
      <NumField label="Tloušťka" value={l.thickness} allowEmpty onCommit={v => updateWallLabel(wall.id, { thickness: v })} />
      <div class="field">
        <span>Typ</span>
        <Seg options={WALL_TYPES} value={l.type} onChange={v => updateWallLabel(wall.id, { type: l.type === v ? null : v })} />
      </div>
      <TextField
        label="Materiál"
        value={l.material}
        placeholder="např. cihla plná"
        presets={['cihla plná', 'CPP', 'Porotherm', 'pórobeton', 'kámen', 'beton', 'dřevo']}
        onCommit={v => updateWallLabel(wall.id, { material: v })}
      />
      <TextField label="Poznámka" value={l.note} placeholder="např. vlhkost u paty" onCommit={v => updateWallLabel(wall.id, { note: v })} />

      <button class="btn btn-danger" onClick={deleteSelection}>
        🗑️ Smazat stěnu
      </button>
    </Panel>
  );
}

const OPENING_PRESETS: Record<Opening['kind'], number[]> = {
  door: [600, 700, 800, 900, 1100, 1250],
  window: [600, 900, 1200, 1500, 1800, 2100],
  opening: [700, 800, 900, 1200, 1500],
  niche: [300, 450, 600, 900]
};

const NOTE_PRESETS: Record<Opening['kind'], string[]> = {
  door: ['1-křídlé', '2-křídlé', 'posuvné', 'prosklené', 'dřevěná zárubeň', 'ocelová zárubeň'],
  window: ['1-dílné', '2-dílné', '3-dílné', 'francouzské', 'dřevěné', 'plastové', 'zdvojené'],
  opening: ['oblouk', 'bez zárubně'],
  niche: ['skříň', 'radiátor', 'zazděný otvor']
};

function OpeningPanel({ op }: { op: Opening }) {
  const info = OPENING_DEFAULTS[op.kind];
  const set = (patch: Partial<Opening>) => updateOpening(op.id, patch);
  return (
    <Panel title={`${info.label} ${op.number}`} onClose={close}>
      <div class="field">
        <span>Měřit odstup od rohu</span>
        <Seg
          options={[
            { v: 'a', label: 'A' },
            { v: 'b', label: 'B' }
          ]}
          value={op.ref}
          onChange={v => setOpeningRef(op.id, v)}
        />
      </div>
      <button class="field-button" onClick={() => openTarget({ kind: 'opening-offset', openingId: op.id, ref: op.ref })}>
        <span>Odstup od rohu {op.ref.toUpperCase()}</span>
        <b>{op.offset} mm</b>
      </button>
      <button class="field-button" onClick={() => openTarget({ kind: 'opening-width', openingId: op.id })}>
        <span>Šířka</span>
        <b>{op.width} mm</b>
      </button>
      <div class="chips">
        {OPENING_PRESETS[op.kind].map(w => (
          <button key={w} class={`chip ${w === op.width ? 'active' : ''}`} onClick={() => applyNumpadValue({ kind: 'opening-width', openingId: op.id }, w)}>
            {w}
          </button>
        ))}
      </div>
      <NumField label="Výška" value={op.height} min={100} onCommit={v => v !== null && set({ height: v })} />
      {op.kind !== 'door' && <NumField label="Parapet" value={op.sill} onCommit={v => v !== null && set({ sill: v })} />}
      {op.kind === 'niche' && <NumField label="Hloubka niky" value={op.depth} min={10} onCommit={v => v !== null && set({ depth: v })} />}
      {(op.kind === 'door' || op.kind === 'niche') && (
        <div class="btn-row">
          {op.kind === 'door' && (
            <button class="btn" onClick={() => set({ hinge: op.hinge === 'a' ? 'b' : 'a' })}>
              🔄 Panty L/P
            </button>
          )}
          <button class="btn" onClick={() => set({ swing: op.swing === 1 ? -1 : 1 })}>
            🔄 {op.kind === 'door' ? 'Dovnitř/ven' : 'Strana'}
          </button>
        </div>
      )}
      <TextField label="Číslo" value={op.number} onCommit={v => set({ number: v.trim() || op.number })} />
      <TextField label="Popis" value={op.note} presets={NOTE_PRESETS[op.kind]} appendPreset onCommit={v => set({ note: v })} />
      <button class="btn btn-danger" onClick={deleteSelection}>
        🗑️ Smazat {info.label.toLowerCase()}
      </button>
    </Panel>
  );
}

const TEXT_SIZES = [
  { v: 100, label: 'Malé' },
  { v: 200, label: 'Střední' },
  { v: 400, label: 'Velké' }
];

function TextPanel({ note }: { note: TextNote }) {
  const set = (patch: Partial<TextNote>) => updateText(note.id, patch);
  return (
    <Panel title="Text" onClose={close}>
      <label class="field">
        <span>Text (víc řádků = Enter)</span>
        <textarea
          rows={3}
          value={note.text}
          key={note.text}
          onFocus={e => (e.target as HTMLTextAreaElement).select()}
          onChange={e => set({ text: (e.target as HTMLTextAreaElement).value })}
        />
      </label>
      <h4>Velikost písma</h4>
      <Seg options={TEXT_SIZES} value={note.size} onChange={v => set({ size: v })} />
      <NumField label="Výška písma" value={note.size} min={20} onCommit={v => v !== null && set({ size: v })} />
      <h4>Natočení</h4>
      <Seg
        options={[
          { v: 0, label: '0°' },
          { v: 90, label: '90°' },
          { v: 180, label: '180°' },
          { v: 270, label: '270°' }
        ]}
        value={note.angle}
        onChange={v => set({ angle: v })}
      />
      <NumField label="Úhel" value={note.angle} unit="°" onCommit={v => v !== null && set({ angle: ((v % 360) + 360) % 360 })} />
      <p class="muted small">Tažením se text přesune.</p>
      <button class="btn btn-danger" onClick={deleteSelection}>
        🗑️ Smazat text
      </button>
    </Panel>
  );
}

const ROOM_NAMES = ['Obývací pokoj', 'Kuchyň', 'Ložnice', 'Pokoj', 'Koupelna', 'WC', 'Chodba', 'Předsíň', 'Spíž', 'Komora', 'Sklep', 'Schodiště'];

function RoomPanel({ room }: { room: Room }) {
  const set = (patch: Partial<Room>) => updateRoom(room.id, patch);
  return (
    <Panel title={`Místnost ${room.number}`} onClose={close}>
      <TextField label="Číslo" value={room.number} onCommit={v => set({ number: v.trim() })} />
      <TextField label="Název" value={room.name} placeholder="např. Kuchyň" presets={ROOM_NAMES} onCommit={v => set({ name: v })} />
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
      <button class="btn btn-danger" onClick={deleteSelection}>
        🗑️ Smazat místnost
      </button>
    </Panel>
  );
}

export const LINE_STYLES: { v: LineStyle; label: string }[] = [
  { v: 'solid', label: 'Plná' },
  { v: 'dashed', label: 'Čárkovaná' },
  { v: 'dashdot', label: 'Čerchovaná' }
];
