/**
 * Vrstva vybraného prvku a tlačítko „Přesunout do vrstvy“ (pravidlo 3; pravidla v core/layers.ts).
 * Je v každém panelu vlastností (vkládá ho `Panel`). Otvor a výstupek mají vrstvu své stěny – jen ji ukážou.
 */
import { useState } from 'preact/hooks';
import { elementLayer, layerById, layersOf } from '../../core/layers';
import { canMoveToLayer, moveSelectionToLayer, selectionElemKind } from '../../store/actions';
import { useStore } from '../../store/useStore';

export function LayerField() {
  const selection = useStore(s => s.selection);
  const project = useStore(s => s.project);
  const floorId = useStore(s => s.floorId);
  const [open, setOpen] = useState(false);
  const floor = project?.floors.find(f => f.id === floorId);
  if (!selection || !project || !floor) return null;
  const items = selection.kind === 'multi' ? selection.items : [selection];
  const kinds = items.map(i => selectionElemKind(i.kind)).filter(k => k !== null);
  if (!kinds.length) return null;
  const layers = new Set(items.map(i => {
    const k = selectionElemKind(i.kind);
    return k ? elementLayer(floor, k, i.id) : null;
  }).filter(Boolean));
  const name = layers.size === 1 ? (layerById(project, [...layers][0]!)?.name ?? '—') : 'různé';
  const movable = items.some(i => canMoveToLayer(i.kind));
  const inherited = !movable;

  return (
    <div class="layer-field">
      <div class="layer-field-row">
        <span class="muted small">Vrstva</span>
        <b>{name}</b>
        {inherited && <span class="muted small">(podle stěny)</span>}
        {movable && (
          <button class="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            Přesunout do vrstvy
          </button>
        )}
      </div>
      {open && movable && (
        <div class="layer-choices">
          {layersOf(project)
            .reverse()
            .map(l => (
              <button
                key={l.id}
                class={`btn btn-sm ${layers.size === 1 && layers.has(l.id) ? 'active' : ''}`}
                onClick={() => {
                  moveSelectionToLayer(l.id);
                  setOpen(false);
                }}
              >
                <span class="layer-dot" style={{ background: l.color }} />
                {l.name}
                {!l.visible ? ' (skrytá)' : l.locked ? ' (zamčená)' : ''}
              </button>
            ))}
          {items.some(i => !canMoveToLayer(i.kind) && i.kind !== 'node') && <p class="muted small">Otvory a výstupky se přesunou se svou stěnou.</p>}
        </div>
      )}
    </div>
  );
}
