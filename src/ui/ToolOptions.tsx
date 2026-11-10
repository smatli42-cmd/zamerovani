/**
 * Lišta s volbami aktivního nástroje nad plátnem (Stěna: tloušťka; tvary: styl čáry; okno: druh; vkládání otvorů).
 */
import { activeWallThickness, WALL_PRESETS, wallPresets } from '../model/factory';
import { addWallPreset, endPaste, removeWallPreset, setActiveWallThickness } from '../store/actions';
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { NumField, Seg } from './panels/fields';
import { LINE_STYLES } from './panels/SidePanel';

export function ToolOptions() {
  const tool = useStore(s => s.tool);
  const settings = useStore(s => s.settings);
  const clipboard = useStore(s => s.clipboard);
  const project = useStore(s => s.project);
  if (tool === 'wall') {
    // menu Stěny: předvolby tloušťky, aktuální je označená (stačí zkontrolovat a kreslit)
    const active = activeWallThickness(project);
    return (
      <div class="tool-options wall-options">
        <span class="muted small">Tloušťka stěny</span>
        <div class="chips">
          {wallPresets(project).map(t => (
            <span key={t} class="chip-wrap">
              <button class={`chip ${t === active ? 'active' : ''}`} onClick={() => setActiveWallThickness(t)}>
                {t}
              </button>
              {!WALL_PRESETS.includes(t) && (
                <button class="chip-remove" title="Odebrat předvolbu" onClick={() => removeWallPreset(t)}>
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        <NumField label="Vlastní" value={wallPresets(project).includes(active) ? null : active} min={10} onCommit={v => v !== null && addWallPreset(v)} />
      </div>
    );
  }
  if (tool === 'rect' || tool === 'circle' || tool === 'arc') {
    return (
      <div class="tool-options">
        <span class="muted small">Styl čáry nových stěn</span>
        <Seg options={LINE_STYLES} value={settings.shapeStyle} onChange={v => store.updateSettings({ shapeStyle: v })} />
      </div>
    );
  }
  if (tool === 'window') {
    return (
      <div class="tool-options">
        <span class="muted small">Vkládat</span>
        <Seg
          options={[
            { v: 'window', label: 'Okno' },
            { v: 'french', label: 'Francouzské okno' }
          ]}
          value={settings.windowKind}
          onChange={v => store.updateSettings({ windowKind: v })}
        />
      </div>
    );
  }
  if (tool === 'paste') {
    return (
      <div class="tool-options">
        <span class="small">📋 Ťukni na stěnu, kam se mají zkopírované otvory vložit ({clipboard?.length ?? 0}).</span>
        <button class="btn btn-sm" onClick={endPaste}>
          ✔ Hotovo
        </button>
      </div>
    );
  }
  return null;
}
