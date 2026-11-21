/**
 * Nabídka „…“ horní lišty (návrh ovládání 2026-11-21): méně časté akce – údaje projektu, podlaží, záloha –
 * a nastavení kreslení. Zavře se ťuknutím mimo nabídku.
 */
import { useEffect, useRef } from 'preact/hooks';
import { wakeLockSupported } from '../input/wakeLock';
import { setLayerVisible } from '../store/actions';
import { layerById, SYS } from '../core/layers';
import { store, type Settings } from '../store/store';
import { useStore } from '../store/useStore';
import { Icon, type IconName } from './icons';

export interface MoreAction {
  icon: IconName;
  label: string;
  run: () => void;
  danger?: boolean;
}

export function MoreMenu({ actions, onClose }: { actions: MoreAction[]; onClose: () => void }) {
  const settings = useStore(s => s.settings);
  const project = useStore(s => s.project);
  const box = useRef<HTMLDivElement>(null);
  // kóty = vrstva Kóty (rozhodnutí uživatele 2026-11-19: přepínač nahrazuje oko vrstvy Kóty, je v historii)
  const dimsVisible = layerById(project, SYS.koty)?.visible ?? true;
  // Zavře se ťuknutím mimo okno (ne při zvednutí prstu – na dotykovém displeji by zmizelo dřív, než se stihne zapnout volba)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && !box.current?.contains(t) && !t.closest('[data-more-btn]')) onClose();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);
  const toggle = (key: keyof Settings, label: string, hint: string) => (
    <label class="toggle-row" title={hint}>
      <input type="checkbox" checked={Boolean(settings[key])} onChange={() => store.updateSettings({ [key]: !settings[key] })} />
      <span>{label}</span>
    </label>
  );
  return (
    <div class="popover more-menu" ref={box}>
      <div class="more-actions">
        {actions.map(a => (
          <button
            key={a.label}
            type="button"
            class={`more-action ${a.danger ? 'danger' : ''}`}
            onClick={() => {
              onClose();
              a.run();
            }}
          >
            <Icon name={a.icon} size={22} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div class="more-sep">Nastavení kreslení</div>
      {toggle('snap', 'Přichytávat na rohy', 'Přichytávání na rohy, stěny a zarovnání')}
      <label class="toggle-row" title="Vrstva Kóty (automatické i volné kóty)">
        <input type="checkbox" checked={dimsVisible} onChange={() => setLayerVisible(SYS.koty, !dimsVisible)} />
        <span>Zobrazit kóty</span>
      </label>
      {toggle('showGrid', 'Zobrazit mřížku', '')}
      {toggle('fingerPan', 'Prst jen posouvá', 'Kreslí se jen perem, prst posouvá výkres (ochrana proti dlani)')}
      {toggle('keepAwake', 'Nevypínat displej', 'Tablet neusne, dokud je aplikace otevřená na obrazovce')}
      {settings.keepAwake && !wakeLockSupported() && (
        <p class="muted small" style="margin:0 0 6px">
          Tento prohlížeč nevypínání displeje nepodporuje (nebo stránka neběží přes https). Prodlužte „Časový limit obrazovky“ v nastavení tabletu.
        </p>
      )}
      <div class="toggle-row">
        <span>Velikost kót</span>
        <button class="btn btn-sm" onClick={() => store.updateSettings({ dimScale: Math.max(0.7, +(settings.dimScale - 0.1).toFixed(2)) })}>
          −
        </button>
        <b>{Math.round(settings.dimScale * 100)} %</b>
        <button class="btn btn-sm" onClick={() => store.updateSettings({ dimScale: Math.min(2, +(settings.dimScale + 0.1).toFixed(2)) })}>
          ＋
        </button>
      </div>
    </div>
  );
}
