/**
 * Lišta s volbami aktivního nástroje nad plátnem (Stěna: tloušťka; tvary: styl čáry; okno: druh; vkládání otvorů).
 */
import { activeWallArcHeight, activeWallThickness, WALL_PRESETS, wallPresets } from '../model/factory';
import { addWallPreset, endPaste, removeWallPreset, setActiveWallThickness, setWallArcHeight } from '../store/actions';
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { NumField, Seg } from './panels/fields';
import { LINE_STYLES } from './panels/SidePanel';
import { DRAW_LINE_STYLES } from './panels/common';
import { TRIM_MSG_FIRST } from '../tools/trimTool';
import { tools } from '../tools/registry';
import { splitMsg, splitTool } from '../tools/splitTool';

export function ToolOptions() {
  const tool = useStore(s => s.tool);
  const settings = useStore(s => s.settings);
  const clipboard = useStore(s => s.clipboard);
  const project = useStore(s => s.project);
  const toolMsg = useStore(s => s.toolMsg);
  // tlačítko Ukončit jen při běžícím řetězu: roh existuje na aktuálním podlaží (po Zpět / na jiném podlaží ne)
  const chainNode = useStore(s => (s.chainNode && store.floor()?.nodes[s.chainNode] ? s.chainNode : null));
  // menu Stěny: Stěna / Čára (dnešní čára ve stěnách – výstupky a vybrání; KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md)
  const wallOrLine = (
    <Seg
      options={[
        { v: 'wall', label: 'Stěna' },
        { v: 'line', label: 'Čára' }
      ]}
      value={tool === 'line' ? 'line' : 'wall'}
      onChange={v => {
        tools[tool].cancel?.();
        store.set({ tool: v, hover: null, chainNode: null });
      }}
    />
  );
  if (tool === 'line') {
    return (
      <div class="tool-options wall-options">
        {wallOrLine}
        <span class="small">Čára ve stěnách: od líce stěny zpět na týž líc vytvoří výstupek nebo vybrání.</span>
      </div>
    );
  }
  if (tool === 'wall') {
    // menu Stěny: předvolby tloušťky, aktuální je označená (stačí zkontrolovat a kreslit)
    const active = activeWallThickness(project);
    return (
      <div class="tool-options wall-options">
        {wallOrLine}
        <Seg
          options={[
            { v: 'straight', label: 'Rovná' },
            { v: 'arc', label: 'Oblouková' }
          ]}
          value={settings.wallShape}
          onChange={v => store.updateSettings({ wallShape: v })}
        />
        <span class="muted small">Osa</span>
        <Seg
          options={[
            { v: 'face', label: 'Líc' },
            { v: 'center', label: 'Střed' }
          ]}
          value={settings.wallAxis}
          onChange={v => store.updateSettings({ wallAxis: v })}
        />
        <span class="muted small">Řetěz</span>
        <Seg
          options={[
            { v: 'off', label: 'Vyp' },
            { v: 'on', label: 'Zap' }
          ]}
          value={settings.wallChain ? 'on' : 'off'}
          onChange={v => {
            store.updateSettings({ wallChain: v === 'on' });
            store.set({ chainNode: null });
          }}
        />
        {chainNode && (
          <button class="btn btn-sm" onClick={() => store.set({ chainNode: null })} title="Další stěna začne tam, kde perem začnete">
            ⏹ Ukončit řetěz
          </button>
        )}
        {settings.wallShape === 'arc' && (
          <NumField label="Výška oblouku" value={activeWallArcHeight(project)} min={10} onCommit={v => v !== null && setWallArcHeight(v)} />
        )}
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
  if (tool === 'split') {
    return (
      <div class="tool-options">
        <Seg
          options={[
            { v: 'one', label: 'Rozdělit' },
            { v: 'gap', label: 'S mezerou' }
          ]}
          value={settings.splitGap ? 'gap' : 'one'}
          onChange={v => {
            splitTool.cancel?.();
            store.updateSettings({ splitGap: v === 'gap' });
            store.set({ toolMsg: splitMsg(v === 'gap') });
          }}
        />
        <span class="small">✂️ {toolMsg ?? splitMsg(settings.splitGap)}</span>
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
  if (tool === 'drawDouble') {
    return (
      <div class="tool-options">
        <NumField label="Vzdálenost čar" value={settings.doubleWidth} min={1} onCommit={v => v !== null && store.updateSettings({ doubleWidth: v })} />
        <div class="chips">
          {wallPresets(project).map(t => (
            <button key={t} class={`chip ${t === settings.doubleWidth ? 'active' : ''}`} onClick={() => store.updateSettings({ doubleWidth: t })}>
              {t}
            </button>
          ))}
        </div>
        <span class="muted small">Konce</span>
        <Seg
          options={[
            { v: 'open', label: 'Otevřené' },
            { v: 'closed', label: 'Uzavřené' }
          ]}
          value={settings.doubleClosed ? 'closed' : 'open'}
          onChange={v => store.updateSettings({ doubleClosed: v === 'closed' })}
        />
        <span class="muted small">Styl</span>
        <Seg options={DRAW_LINE_STYLES} value={settings.doubleStyle} onChange={v => store.updateSettings({ doubleStyle: v })} />
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
  if (tool === 'trim') {
    return (
      <div class="tool-options">
        <span class="small">⌐ {toolMsg ?? TRIM_MSG_FIRST}</span>
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
