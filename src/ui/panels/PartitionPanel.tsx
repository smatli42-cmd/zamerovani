/**
 * Panel spárované příčky (obě čáry najednou).
 */
import { partitionThickness, thicknessTarget } from '../../core/pairing';
import type { Floor, Wall } from '../../model/types';
import { deleteSelection, duplicateSelection, setPartitionStyle } from '../../store/actions';
import { openTarget } from '../../store/numpadController';
import { close, LINE_STYLES } from './common';
import { Panel, Seg } from './fields';

export function PartitionPanel({ floor, wall }: { floor: Floor; wall: Wall }) {
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
