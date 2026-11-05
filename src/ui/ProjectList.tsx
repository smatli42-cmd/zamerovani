/**
 * Úvodní obrazovka: seznam projektů (zakázek), nový projekt, import zálohy.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { createProject } from '../model/factory';
import type { Project, ProjectSummary } from '../model/types';
import { downloadBackup, importBackup } from '../persistence/backup';
import { deleteProject, listProjects, loadProject, saveProject } from '../persistence/db';
import { store } from '../store/store';
import { ConfirmDialog } from './Dialog';
import { ProjectForm } from './ProjectForm';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)}. ${Number(m)}. ${y}` : iso;
}

function formatUpdated(ts: number): string {
  return new Date(ts).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch(err => setError(`Nepodařilo se načíst projekty: ${err}`));

  useEffect(() => {
    void refresh();
  }, []);

  const open = async (id: string) => {
    const p = await loadProject(id);
    if (p) store.openProject(p);
    else setError('Projekt se nepodařilo otevřít.');
  };

  const onImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const p = await importBackup(file);
      setError(null);
      await refresh();
      store.openProject(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="projects-screen">
      <header class="projects-header">
        <h1>📐 Zaměřování</h1>
        <div class="spacer" />
        <button class="btn" onClick={() => fileInput.current?.click()}>
          📂 Načíst zálohu
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onImport} />
        <button class="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ Nový projekt
        </button>
      </header>

      {error && (
        <div class="banner banner-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <main class="projects-grid">
        {projects === null && <p class="muted">Načítám…</p>}
        {projects?.length === 0 && (
          <div class="empty">
            <p>Zatím tu není žádný projekt.</p>
            <button class="btn btn-primary btn-lg" onClick={() => setCreating(true)}>
              ＋ Založit první projekt
            </button>
          </div>
        )}
        {projects?.map(p => (
          <article key={p.id} class="project-card">
            <button class="project-open" onClick={() => void open(p.id)}>
              <h3>{p.name}</h3>
              {p.address && <p>{p.address}</p>}
              <p class="muted">
                Zaměřeno {formatDate(p.surveyDate)} · podlaží: {p.floorCount}
              </p>
              <p class="muted small">Upraveno {formatUpdated(p.updatedAt)}</p>
            </button>
            <div class="project-actions">
              <button
                class="btn btn-sm"
                onClick={async () => {
                  const full = await loadProject(p.id);
                  if (full) setEditing(full);
                }}
              >
                ✏️ Údaje
              </button>
              <button
                class="btn btn-sm"
                title="Stáhnout zálohu projektu do souboru"
                onClick={async () => {
                  const full = await loadProject(p.id);
                  if (full) downloadBackup(full);
                }}
              >
                💾 Záloha
              </button>
              <button class="btn btn-sm btn-danger-ghost" onClick={() => setDeleting(p)}>
                🗑️
              </button>
            </div>
          </article>
        ))}
      </main>

      {creating && (
        <ProjectForm
          title="Nový projekt"
          onClose={() => setCreating(false)}
          onSubmit={async fields => {
            const p = createProject(fields);
            await saveProject(p);
            store.openProject(p);
          }}
        />
      )}
      {editing && (
        <ProjectForm
          title="Údaje projektu"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async fields => {
            await saveProject({ ...editing, ...fields, updatedAt: Date.now() });
            await refresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Smazat projekt?"
          message={`Projekt „${deleting.name}“ bude nenávratně smazán z tohoto tabletu. Pokud ho chcete zachovat, nejdřív stáhněte zálohu.`}
          confirmLabel="Smazat"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteProject(deleting.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
