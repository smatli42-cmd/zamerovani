/**
 * Panel vlastností vybraného prvku (stěna, otvor, místnost, roh) – vybere panel podle výběru.
 * Jednotlivé panely jsou ve vlastních souborech.
 */
import { wallsAtNode } from '../../core/floorQueries';
import { deleteSelection, duplicateSelection, rotateSelection } from '../../store/actions';
import { useStore } from '../../store/useStore';
import { close } from './common';
import { NumField, Panel } from './fields';
import { OpeningPanel } from './OpeningPanel';
import { ProtrusionPanel } from './ProtrusionPanel';
import { RoomPanel } from './RoomPanel';
import { TextPanel } from './TextPanel';
import { WallPanel } from './WallPanel';

export { LINE_STYLES } from './common';

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
    case 'protrusion': {
      const p = floor.protrusions?.[selection.id];
      return p ? <ProtrusionPanel floor={floor} p={p} /> : null;
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
