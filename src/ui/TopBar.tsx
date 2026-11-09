/**
 * Horní lišta editoru: zpět na projekty, podlaží, Zpět/Vpřed, nastavení, stav uložení.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadBackup } from '../persistence/backup';
import { saveNow } from '../persistence/autosave';
import { addFloor, deleteFloor, renameFloor } from '../store/actions';
import { store, type SaveStatus, type Settings } from '../store/store';
import { useStore } from '../store/useStore';
import { ConfirmDialog, TextPrompt } from './Dialog';
import { ProjectForm } from './ProjectForm';
import { fitToDrawing } from './viewActions';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: '✓ Uloženo',
  saving: '… Ukládám',
  dirty: '● Neuloženo',
  error: '⚠ Chyba ukládání'
};

type FloorDialog = { type: 'add' } | { type: 'rename'; id: string; name: string } | { type: 'delete'; id: string; name: string } | null;

export function TopBar() {
  const project = useStore(s => s.project);
  const floorId = useStore(s => s.floorId);
  const canUndo = useStore(s => s.canUndo);
  const canRedo = useStore(s => s.canRedo);
  const saveStatus = useStore(s => s.saveStatus);
  const [floorDialog, setFloorDialog] = useState<FloorDialog>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editInfo, setEditInfo] = useState(false);

  if (!project) return null;
  const floor = project.floors.find(f => f.id === floorId);

  return (
    <header class="topbar">
      <button
        class="btn btn-dark"
        title="Zpět na seznam projektů"
        onClick={async () => {
          await saveNow();
          store.closeProject();
        }}
      >
        ◀ Projekty
      </button>
      <button class="project-title" title="Upravit údaje projektu" onClick={() => setEditInfo(true)}>
        {project.name}
      </button>

      <div class="floor-switch">
        <select
          value={floorId ?? ''}
          onChange={e => {
            store.set({ floorId: (e.target as HTMLSelectElement).value, selection: null, numpad: null });
            requestAnimationFrame(fitToDrawing);
          }}
        >
          {project.floors.map(f => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button class="btn btn-dark btn-icon" title="Přidat podlaží" onClick={() => setFloorDialog({ type: 'add' })}>
          ＋
        </button>
        {floor && (
          <button class="btn btn-dark btn-icon" title="Přejmenovat podlaží" onClick={() => setFloorDialog({ type: 'rename', id: floor.id, name: floor.name })}>
            ✏️
          </button>
        )}
        {floor && project.floors.length > 1 && (
          <button class="btn btn-dark btn-icon" title="Smazat podlaží" onClick={() => setFloorDialog({ type: 'delete', id: floor.id, name: floor.name })}>
            🗑️
          </button>
        )}
      </div>

      <div class="spacer" />

      <button class="btn btn-dark" disabled={!canUndo} onClick={() => store.undo()} title="Zpět (Ctrl+Z)">
        ↩️
      </button>
      <button class="btn btn-dark" disabled={!canRedo} onClick={() => store.redo()} title="Vpřed (Ctrl+Y)">
        ↪️
      </button>
      <button class="btn btn-dark" onClick={fitToDrawing} title="Zobrazit celý výkres">
        🎯
      </button>
      <button data-settings-btn class={`btn btn-dark ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)} title="Nastavení kreslení">
        ⚙️
      </button>
      <button class="btn btn-dark" onClick={() => downloadBackup(project)} title="Stáhnout zálohu projektu do souboru">
        💾
      </button>
      <span class={`save-status save-${saveStatus}`}>{SAVE_TEXT[saveStatus]}</span>

      {showSettings && <SettingsPopover onClose={() => setShowSettings(false)} />}

      {floorDialog?.type === 'add' && (
        <TextPrompt title="Nové podlaží" label="Název podlaží" initial={suggestFloorName(project.floors.map(f => f.name))} onSubmit={addFloor} onClose={() => setFloorDialog(null)} />
      )}
      {floorDialog?.type === 'rename' && (
        <TextPrompt
          title="Přejmenovat podlaží"
          label="Název podlaží"
          initial={floorDialog.name}
          onSubmit={name => renameFloor(floorDialog.id, name)}
          onClose={() => setFloorDialog(null)}
        />
      )}
      {floorDialog?.type === 'delete' && (
        <ConfirmDialog
          title="Smazat podlaží?"
          message={`Podlaží „${floorDialog.name}“ se celé smaže (lze vrátit tlačítkem Zpět).`}
          confirmLabel="Smazat"
          danger
          onConfirm={() => deleteFloor(floorDialog.id)}
          onClose={() => setFloorDialog(null)}
        />
      )}
      {editInfo && (
        <ProjectForm
          title="Údaje projektu"
          initial={project}
          onClose={() => setEditInfo(false)}
          onSubmit={fields =>
            store.editProject(p => {
              Object.assign(p, fields);
            })
          }
        />
      )}
    </header>
  );
}

function suggestFloorName(existing: string[]): string {
  for (const name of ['2.NP', '3.NP', '1.PP', 'Podkroví', '4.NP']) if (!existing.includes(name)) return name;
  return 'Podlaží';
}

function SettingsPopover({ onClose }: { onClose: () => void }) {
  const settings = useStore(s => s.settings);
  const box = useRef<HTMLDivElement>(null);
  // Zavře se ťuknutím mimo okno (ne při zvednutí prstu – na dotykovém displeji by zmizelo dřív, než se stihne zapnout volba)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && !box.current?.contains(t) && !t.closest('[data-settings-btn]')) onClose();
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
    <div class="popover settings-popover" ref={box}>
      {toggle('ortho', 'Pravé úhly (90°)', 'Stěny se kreslí jen vodorovně a svisle')}
      {toggle('snap', 'Přichytávat na rohy', 'Přichytávání na rohy, stěny a zarovnání')}
      {toggle('showDims', 'Zobrazit kóty', '')}
      {toggle('showGrid', 'Zobrazit mřížku', '')}
      {toggle('fingerPan', 'Prst jen posouvá', 'Kreslí se jen perem, prst posouvá výkres (ochrana proti dlani)')}
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
