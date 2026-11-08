/**
 * Lišta s volbami aktivního nástroje nad plátnem (Dvojčára: tloušťka a strana; tvary: styl čáry).
 */
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { NumField, Seg } from './panels/fields';
import { LINE_STYLES } from './panels/SidePanel';

export function ToolOptions() {
  const tool = useStore(s => s.tool);
  const settings = useStore(s => s.settings);
  if (tool === 'rect' || tool === 'circle' || tool === 'arc') {
    return (
      <div class="tool-options">
        <span class="muted small">Styl čáry nových stěn</span>
        <Seg options={LINE_STYLES} value={settings.shapeStyle} onChange={v => store.updateSettings({ shapeStyle: v })} />
      </div>
    );
  }
  if (tool !== 'dline') return null;
  return (
    <div class="tool-options">
      <NumField label="Tloušťka příčky" value={settings.partThickness} min={10} onCommit={v => v !== null && store.updateSettings({ partThickness: v })} />
      <button class="btn btn-sm" onClick={() => store.updateSettings({ partSide: settings.partSide === 1 ? -1 : 1 })} title="Na kterou stranu od směru kreslení leží druhá čára">
        ⇄ Druhá čára: {settings.partSide === 1 ? 'vlevo' : 'vpravo'} od směru kreslení
      </button>
    </div>
  );
}
