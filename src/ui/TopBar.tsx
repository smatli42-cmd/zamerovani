/**
 * Horní lišta editoru (návrh ovládání 2026-11-21): projekty, název, podlaží, Zpět / Vpřed, Vrstvy, Celý výkres,
 * nabídka „…“ (údaje projektu, podlaží, záloha, nastavení – ui/MoreMenu.tsx) a stav uložení. Ikony z ui/icons.tsx.
 */
import { useState } from 'preact/hooks';
import { downloadBackup } from '../persistence/backup';
import { saveNow } from '../persistence/autosave';
import { addFloor, deleteFloor, renameFloor } from '../store/actions';
import { store, type SaveStatus } from '../store/store';
import { useStore } from '../store/useStore';
import { ConfirmDialog, TextPrompt } from './Dialog';
import { ProjectForm } from './ProjectForm';
import { fitToDrawing } from './viewActions';
import { Icon } from './icons';
import { MoreMenu, type MoreAction } from './MoreMenu';
import { ExportDialog } from './ExportDialog';
import { ToolBadge } from './ToolHead';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'Uloženo',
  saving: 'Ukládám…',
  dirty: 'Neuloženo',
  error: 'Chyba ukládání'
};

type FloorDialog = { type: 'add' } | { type: 'rename'; id: string; name: string } | { type: 'delete'; id: string; name: string } | null;

export function TopBar() {
  const project = useStore(s => s.project);
  const floorId = useStore(s => s.floorId);
  const canUndo = useStore(s => s.canUndo);
  const canRedo = useStore(s => s.canRedo);
  const saveStatus = useStore(s => s.saveStatus);
  const layersOpen = useStore(s => s.layersOpen);
  const [floorDialog, setFloorDialog] = useState<FloorDialog>(null);
  const [showMore, setShowMore] = useState(false);
  const [editInfo, setEditInfo] = useState(false);
  const [showExport, setShowExport] = useState(false);

  if (!project) return null;
  const floor = project.floors.find(f => f.id === floorId);
  const backup = () => downloadBackup(project).catch(() => store.set({ lockBlock: { key: '', text: 'Zálohu se nepodařilo vytvořit.' } }));
  const moreActions: MoreAction[] = [
    { icon: 'info', label: 'Údaje projektu', run: () => setEditInfo(true) },
    { icon: 'plus', label: 'Přidat podlaží', run: () => setFloorDialog({ type: 'add' }) }
  ];
  if (floor) moreActions.push({ icon: 'edit', label: 'Přejmenovat podlaží', run: () => setFloorDialog({ type: 'rename', id: floor.id, name: floor.name }) });
  if (floor && project.floors.length > 1) moreActions.push({ icon: 'trash', label: 'Smazat podlaží', danger: true, run: () => setFloorDialog({ type: 'delete', id: floor.id, name: floor.name }) });
  moreActions.push({ icon: 'export', label: 'Export do PDF', run: () => setShowExport(true) });
  moreActions.push({ icon: 'backup', label: 'Záloha projektu do souboru', run: backup });

  return (
    <header class="topbar">
      <button
        class="btn btn-dark"
        title="Zpět na seznam projektů"
        onClick={async () => {
          await saveNow();
          // uložení selhalo (např. plné úložiště) → projekt nezavírat, jinak by se ztratila poslední změna (i odkaz na fotku)
          if (store.get().saveStatus === 'error') {
            store.set({ lockBlock: { key: '', text: 'Projekt se nepodařilo uložit – zůstává otevřený. Uvolněte místo v tabletu nebo stáhněte zálohu (… → Záloha projektu).' } });
            return;
          }
          store.closeProject();
        }}
      >
        <Icon name="back" size={22} />
        <span class="btn-label">Projekty</span>
      </button>
      <button class="project-title" title="Upravit údaje projektu" onClick={() => setEditInfo(true)}>
        {project.name}
      </button>

      <div class="floor-switch">
        <Icon name="floor" size={20} />
        <select
          title="Podlaží"
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
      </div>

      <ToolBadge />

      <button class="btn btn-dark top-icon boxed" disabled={!canUndo} onClick={() => store.undo()} title="Zpět (Ctrl+Z)" aria-label="Zpět">
        <Icon name="undo" />
      </button>
      <button class="btn btn-dark top-icon boxed" disabled={!canRedo} onClick={() => store.redo()} title="Vpřed (Ctrl+Y)" aria-label="Vpřed">
        <Icon name="redo" />
      </button>
      <span class="top-sep" />
      <button class={`btn btn-dark ${layersOpen === 'top' ? 'active' : ''}`} onClick={() => store.set({ layersOpen: layersOpen === 'top' ? false : 'top' })} title="Vrstvy">
        <Icon name="layers" />
        <span class="btn-label">Vrstvy</span>
      </button>
      <button class="btn btn-dark" onClick={fitToDrawing} title="Zobrazit celý výkres">
        <Icon name="fit" />
        <span class="btn-label">Celý výkres</span>
      </button>
      <button data-more-btn class={`btn btn-dark top-icon ${showMore ? 'active' : ''}`} onClick={() => setShowMore(!showMore)} title="Další: údaje projektu, podlaží, záloha, nastavení" aria-label="Další">
        <Icon name="more" />
      </button>
      <span class={`save-status save-${saveStatus}`}>
        <i class="save-dot" />
        {SAVE_TEXT[saveStatus]}
      </span>

      {showMore && <MoreMenu actions={moreActions} onClose={() => setShowMore(false)} />}
      {showExport && <ExportDialog project={project} floorId={floorId} onClose={() => setShowExport(false)} />}

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
