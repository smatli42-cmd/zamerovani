/**
 * Záloha projektu do souboru a obnovení ze souboru (přenos na PC / jiný tablet).
 * Formát: JSON { app, version, exportedAt, project, photos? }. Verze 2 nese i fotky značek (base64, ZNACKY-POZNAMKY-
 * DETAILY.md: „export celého projektu zahrnuje fotky“); verze 1 (bez fotek) se dál načte.
 */
import { newId } from '../model/factory';
import type { Id, Project } from '../model/types';
import { projectPhotoIds, remapPhotoIds } from '../core/marks';
import { migrateProject } from './migrate';
import { projectExists, saveProject, type StoredPhoto } from './db';
import { deletePhotos, projectPhotos, putPhotos } from './photos';

const APP_TAG = 'zamerovani';
const VERSION = 2;

/** Fotka v záloze. */
export interface BackupPhoto {
  id: Id;
  w: number;
  h: number;
  type: string;
  /** Data souboru v base64. */
  data: string;
}

function safeFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'projekt';
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Obsah zálohy: projekt a jen ty fotky, na které odkazuje. */
export async function backupPayload(project: Project, photos: StoredPhoto[]): Promise<object> {
  const used = projectPhotoIds(project);
  const list: BackupPhoto[] = [];
  for (const p of photos) if (used.has(p.id)) list.push({ id: p.id, w: p.w, h: p.h, type: p.blob.type || 'image/jpeg', data: await toBase64(p.blob) });
  return { app: APP_TAG, version: VERSION, exportedAt: new Date().toISOString(), project, photos: list };
}

export async function downloadBackup(project: Project): Promise<void> {
  const payload = await backupPayload(project, await projectPhotos(project.id));
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
 * Rozbalí zálohu: projekt (po migraci) a fotky s NOVÝMI id (odkazy v projektu se přejmenují) – fotky obnovené
 * zálohy se nikdy nepletou s fotkami jiného projektu v tabletu. `projectId` = id, pod kterým se projekt uloží.
 */
export function restoreFromPayload(data: unknown, projectId?: Id): { project: Project; photos: StoredPhoto[] } {
  const wrapper = data as { app?: string; project?: unknown; photos?: BackupPhoto[] };
  if (wrapper?.app !== APP_TAG || !wrapper.project) throw new Error('Soubor není záloha aplikace Zaměřování.');
  let project = migrateProject(wrapper.project);
  if (projectId) project = { ...project, id: projectId };
  const map = new Map<Id, Id>();
  const photos: StoredPhoto[] = [];
  for (const ph of wrapper.photos ?? []) {
    const id = newId('ph');
    map.set(ph.id, id);
    photos.push({ id, projectId: project.id, w: ph.w, h: ph.h, blob: fromBase64(ph.data, ph.type) });
  }
  return { project: map.size ? remapPhotoIds(project, map) : project, photos };
}

/**
 * Načte zálohu ze souboru a uloží ji jako projekt (i s fotkami).
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
  if (wrapper?.app !== APP_TAG || !wrapper.project) throw new Error('Soubor není záloha aplikace Zaměřování.');
  // id projektu zjistit bez dekódování fotek (velká záloha by se jinak převáděla dvakrát)
  const copy = await projectExists(migrateProject(wrapper.project).id);
  let { project, photos } = restoreFromPayload(data, copy ? newId('prj') : undefined);
  if (copy) project = { ...project, name: `${project.name} (kopie)` };
  project = { ...project, updatedAt: Date.now() };
  await putPhotos(photos);
  try {
    await saveProject(project);
  } catch (err) {
    // projekt se neuložil → jeho fotky by zůstaly bez vlastníka
    await deletePhotos(photos.map(p => p.id)).catch(() => undefined);
    throw err;
  }
  return project;
}
