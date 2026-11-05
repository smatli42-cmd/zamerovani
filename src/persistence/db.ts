/**
 * Ukládání projektů v tabletu (IndexedDB – funguje offline, přežije zavření prohlížeče).
 *
 * Úložiště:
 * - projects  : celé projekty (výkresy)
 * - summaries : krátké přehledy pro seznam projektů (aby se nemusely načítat všechny výkresy)
 * - (později) photos : fotografie jako binární data, odkazované z projektu přes ID
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Id, Project, ProjectSummary } from '../model/types';
import { migrateProject } from './migrate';

interface ZamDB extends DBSchema {
  projects: { key: Id; value: Project };
  summaries: { key: Id; value: ProjectSummary };
}

let dbPromise: Promise<IDBPDatabase<ZamDB>> | null = null;

function db(): Promise<IDBPDatabase<ZamDB>> {
  dbPromise ??= openDB<ZamDB>('zamerovani', 1, {
    upgrade(database) {
      database.createObjectStore('projects', { keyPath: 'id' });
      database.createObjectStore('summaries', { keyPath: 'id' });
    }
  });
  return dbPromise;
}

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    surveyDate: p.surveyDate,
    updatedAt: p.updatedAt,
    floorCount: p.floors.length
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAll('summaries');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: Id): Promise<Project | null> {
  const p = await (await db()).get('projects', id);
  return p ? migrateProject(p) : null;
}

export async function saveProject(p: Project): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('projects').put(p), tx.objectStore('summaries').put(summarize(p)), tx.done]);
}

export async function deleteProject(id: Id): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('projects').delete(id), tx.objectStore('summaries').delete(id), tx.done]);
}

export async function projectExists(id: Id): Promise<boolean> {
  return (await (await db()).getKey('projects', id)) !== undefined;
}

/** Požádá prohlížeč, aby data aplikace nemazal při nedostatku místa. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
