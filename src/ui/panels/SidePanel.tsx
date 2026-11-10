/**
 * Panel vlastností vybraného prvku (stěna, otvor, místnost, roh).
 */
import { useEffect, useRef } from 'preact/hooks';
import { wallLength, wallsAtNode } from '../../core/floorQueries';
import { isWindowKind, OPENING_DEFAULTS } from '../../model/factory';
import type { Floor, LineStyle, Opening, Room, TextNote, Wall, WallType } from '../../model/types';
import { applyNumpadValue, deleteSelection, setPartitionStyle, setRevealEnabled, rotateSelection, duplicateSelection, setOpeningRef, updateOpening, takeFreshTextId, updateRoom, updateText, updateWall, updateWallLabel } from '../../store/actions';
import { openTarget } from '../../store/numpadController';
import { store } from '../../store/store';
import { arcChain } from '../../core/arcChain';
import { partitionThickness, thicknessTarget } from '../../core/pairing';
import { openingThickness, revealPartValue, type RevealPart } from '../../core/doorLayout';
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
      if (w?.part) return <PartitionPanel floor={floor} wall={w} />;
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
    case 'multi': {
      const count = (k: string) => selection.items.filter(i => i.kind === k).length;
      const parts = [
        [count('wall'), 'stěn'],
        [count('opening'), 'otvorů'],
        [count('room'), 'místností'],
        [count('text'), 'textů']
      ].filter(([n]) => n);
      return (
        <Panel title={`Vybráno ${selection.items.length} prvků`} onClose={close}>
          <p class="small">{parts.map(([n, label]) => `${n} ${label}`).join(', ')}</p>
          <p class="muted small">Tažením za vybraný prvek posunete celý výběr.</p>
          <div class="field-grid">
            <div class="field">
              <span>Otočit o 90°</span>
              <div class="btn-row">
                <button class="btn btn-sm" onClick={() => rotateSelection(-90)}>⟲ doleva</button>
                <button class="btn btn-sm" onClick={() => rotateSelection(90)}>⟳ doprava</button>
              </div>
            </div>
            <NumField label="Otočit o úhel" value={null} min={-360} unit="°" onCommit={v => v !== null && rotateSelection(v)} />
          </div>
          <div class="panel-actions">
            <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
            <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
          </div>
        </Panel>
      );
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

function PartitionPanel({ floor, wall }: { floor: Floor; wall: Wall }) {
  const thick = partitionThickness(floor, wall);
  const target = thicknessTarget(floor, wall);
  return (
    <Panel title="Příčka" onClose={close}>
      <button class="field-button" onClick={() => target && openTarget({ kind: 'wall-length', wallId: target.wallId, move: { nodeId: target.nodeId } })}>
        <span>Tloušťka příčky</span>
        <b>{thick ?? '?'} mm</b>
      </button>
      <div class="field field-inline">
        <span>Styl čáry</span>
        <Seg options={LINE_STYLES} value={wall.style ?? 'solid'} onChange={v => setPartitionStyle(wall.id, v)} />
      </div>
      <p class="muted small">Dveře a okna ťukni kamkoli na příčku, uloží se jednou a kreslí na obou čarách.</p>
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}

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
      <div class="field field-inline">
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
            <b>{Math.abs(arcChain(floor, wall.id)?.sagitta ?? wall.sagitta)} mm</b>
          </button>
          <button class="btn" onClick={() => updateWall(wall.id, { sagitta: -(arcChain(floor, wall.id)?.sagitta ?? wall.sagitta ?? 0) })}>
            🔄 Vyklenout na opačnou stranu
          </button>
        </>
      ) : null}
      <div class="field field-inline">
        <span>Styl čáry</span>
        <Seg options={LINE_STYLES} value={wall.style ?? 'solid'} onChange={v => updateWall(wall.id, { style: v })} />
      </div>

      <h4>Popisek stěny</h4>
      <NumField label="Tloušťka" value={l.thickness} allowEmpty onCommit={v => updateWallLabel(wall.id, { thickness: v })} />
      <div class="field field-inline">
        <span>Typ</span>
        <Seg options={WALL_TYPES} value={l.type} onChange={v => updateWallLabel(wall.id, { type: l.type === v ? null : v })} />
      </div>
      <TextField
        label="Materiál"
        value={l.material}
        placeholder="např. cihla plná"
        presets={['cihla plná', 'Porotherm', 'pórobeton', 'beton']}
        onCommit={v => updateWallLabel(wall.id, { material: v })}
      />
      <TextField label="Poznámka" value={l.note} placeholder="např. vlhkost u paty" onCommit={v => updateWallLabel(wall.id, { note: v })} />

      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}

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

function OpeningPanel({ op }: { op: Opening }) {
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

const TEXT_SIZES = [
  { v: 50, label: 'Malé' },
  { v: 100, label: 'Střední' },
  { v: 200, label: 'Velké' }
];

function TextPanel({ note }: { note: TextNote }) {
  const set = (patch: Partial<TextNote>) => updateText(note.id, patch);
  const area = useRef<HTMLTextAreaElement>(null);
  // nově vložený text: pole se rovnou aktivuje a výchozí „Text“ se označí, takže stačí psát
  useEffect(() => {
    if (takeFreshTextId() === note.id) area.current?.focus();
  }, [note.id]);
  return (
    <Panel title="Text" onClose={close}>
      <label class="field">
        <span>Text (víc řádků = Enter)</span>
        <textarea
          ref={area}
          rows={3}
          value={note.text}
          key={note.text}
          onFocus={e => (e.target as HTMLTextAreaElement).select()}
          onChange={e => set({ text: (e.target as HTMLTextAreaElement).value })}
        />
      </label>
      <button class="btn btn-primary btn-lg" style="width:100%" onClick={close}>
        ✔ Hotovo
      </button>
      <div class="field field-inline">
        <span>Šipka</span>
        <Seg
          options={[
            { v: 'no', label: 'Bez šipky' },
            { v: 'yes', label: 'S šipkou' }
          ]}
          value={note.leader ? 'yes' : 'no'}
          onChange={v => set({ leader: v === 'yes' ? note.leader ?? { x: note.x - 600, y: note.y + 600 } : undefined })}
        />
      </div>
      <div class="field field-inline">
        <span>Velikost</span>
        <Seg options={TEXT_SIZES} value={note.size} onChange={v => set({ size: v })} />
      </div>
      <div class="field field-inline">
        <span>Natočení</span>
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
      </div>
      <div class="field-grid">
        <NumField label="Výška písma" value={note.size} min={20} onCommit={v => v !== null && set({ size: v })} />
        <NumField label="Úhel" value={note.angle} unit="°" onCommit={v => v !== null && set({ angle: ((v % 360) + 360) % 360 })} />
      </div>
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}

const ROOM_NAMES = ['Obývací pokoj', 'Kuchyň', 'Ložnice', 'Pokoj', 'Koupelna', 'WC', 'Chodba', 'Předsíň', 'Spíž', 'Komora', 'Sklep', 'Schodiště'];

function RoomPanel({ room }: { room: Room }) {
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

export const LINE_STYLES: { v: LineStyle; label: string }[] = [
  { v: 'solid', label: 'Plná' },
  { v: 'dashed', label: 'Čárkovaná' },
  { v: 'dashdot', label: 'Čerchovaná' }
];
