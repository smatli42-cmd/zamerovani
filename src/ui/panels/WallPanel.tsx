/**
 * Panel stěny (rovná, oblouk, kruh) a jejího popisku.
 */
import { arcChain } from '../../core/arcChain';
import { wallLength } from '../../core/floorQueries';
import type { Floor, Wall, WallType } from '../../model/types';
import { deleteSelection, duplicateSelection, flipWallSide, setWallThickness, updateWall, updateWallLabel } from '../../store/actions';
import { openTarget } from '../../store/numpadController';
import { close, LINE_STYLES } from './common';
import { NumField, Panel, Seg, TextField } from './fields';

const WALL_TYPES: { v: WallType; label: string }[] = [
  { v: 'obvodova', label: 'Obvodová' },
  { v: 'nosna', label: 'Nosná' },
  { v: 'pricka', label: 'Příčka' },
  { v: 'sdk', label: 'SDK' },
  { v: 'neovereno', label: '?' }
];

export function WallPanel({ floor, wall }: { floor: Floor; wall: Wall }) {
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
            <b>{Math.round(Math.abs(arcChain(floor, wall.id)?.sagitta ?? wall.sagitta))} mm</b>
          </button>
          <button class="btn" onClick={() => updateWall(wall.id, { sagitta: -(arcChain(floor, wall.id)?.sagitta ?? wall.sagitta ?? 0) })}>
            🔄 Vyklenout na opačnou stranu
          </button>
        </>
      ) : null}
      {!circle && (
        <div class="field-grid">
          <NumField label="Tloušťka" value={wall.thickness} onCommit={v => v !== null && setWallThickness(wall.id, v)} />
          {wall.thickness > 0 && (
            <button class="btn" onClick={() => flipWallSide(wall.id)} title="Přehodí, na kterou stranu od čáry líce roste tělo stěny">
              ⇅ Strana těla
            </button>
          )}
        </div>
      )}
      <div class="field field-inline">
        <span>Styl čáry</span>
        <Seg options={LINE_STYLES} value={wall.style ?? 'solid'} onChange={v => updateWall(wall.id, { style: v })} />
      </div>

      <h4>Popisek stěny</h4>
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
