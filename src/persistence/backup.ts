/**
 * Záloha projektu do souboru a obnovení ze souboru (přenos na PC / jiný tablet).
 * Formát: JSON { app, version, exportedAt, project }. Fotky se přidají později (ZIP).
 */
import { newId } from '../model/factory';
import type { Project } from '../model/types';
import { migrateProject } from './migrate';
import { projectExists, saveProject } from './db';

const APP_TAG = 'zamerovani';

function safeFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'projekt';
}

export function downloadBackup(project: Project): void {
  const payload = { app: APP_TAG, version: 1, exportedAt: new Date().toISOString(), project };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(project.name)}_${project.surveyDate}.zamer.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Načte zálohu ze souboru a uloží ji jako projekt.
 * Pokud projekt se stejným ID už existuje, uloží se jako kopie (nic se nepřepíše).
 */
export async function importBackup(file: File): Promise<Project> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Soubor není platná záloha (neplatný JSON).');
  }
  const wrapper = data as { app?: string; project?: unknown };
  if (wrapper?.app !== APP_TAG || !wrapper.project) {
    throw new Error('Soubor není záloha aplikace Zaměřování.');
  }
  let project = migrateProject(wrapper.project);
  if (await projectExists(project.id)) {
    project = { ...project, id: newId('prj'), name: `${project.name} (kopie)` };
  }
  project = { ...project, updatedAt: Date.now() };
  await saveProject(project);
  return project;
}
