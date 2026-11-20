/**
 * Fotky v IndexedDB (krok B značky) – s náhradní IndexedDB (fake-indexeddb): přechod databáze z verze 1 na 2
 * (projekty zůstanou), úklid nepoužitých fotek, smazání projektu i s fotkami, import zálohy jako kopie.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMark } from '../core/marks';
import { createProject } from '../model/factory';
import type { Project } from '../model/types';

/** Projekt se značkou, která odkazuje na fotku `photoId`. */
function projectWithPhoto(photoId: string): Project {
  const p = createProject({ name: 'Foto' });
  const m = createMark({ x: 0, y: 0 }, 1);
  m.pages = [{ ...m.pages[0]!, photo: { id: photoId, w: 10, h: 10 } }];
  p.floors[0]!.marks = { [m.id]: m };
  return p;
}
const jpeg = (n: number) => new Blob([new Uint8Array([255, 216, n])], { type: 'image/jpeg' });

let old: Project;
let mod: { db: typeof import('./db'); photos: typeof import('./photos'); backup: typeof import('./backup') };

beforeAll(async () => {
  // stará databáze verze 1 (bez úložiště fotek) s jedním projektem
  old = createProject({ name: 'Starý' });
  await new Promise<void>((ok, fail) => {
    const req = indexedDB.open('zamerovani', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('projects', { keyPath: 'id' });
      req.result.createObjectStore('summaries', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const tx = req.result.transaction(['projects', 'summaries'], 'readwrite');
      tx.objectStore('projects').put(old);
      tx.objectStore('summaries').put({ id: old.id, name: old.name, address: '', surveyDate: old.surveyDate, updatedAt: 1, floorCount: 1 });
      tx.oncomplete = () => {
        req.result.close();
        ok();
      };
    };
    req.onerror = () => fail(req.error);
  });
  mod = { db: await import('./db'), photos: await import('./photos'), backup: await import('./backup') };
});

describe('úložiště fotek (IndexedDB verze 2)', () => {
  it('přechod z verze 1: projekty zůstanou, úložiště fotek přibude', async () => {
    const list = await mod.db.listProjects();
    expect(list.map(p => p.id)).toContain(old.id);
    expect(await mod.db.loadProject(old.id)).toBeTruthy();
    expect(await mod.photos.projectPhotos(old.id)).toEqual([]);
  });

  it('úklid smaže jen nepoužité fotky otevíraného projektu (ne použité, ne jiného projektu)', async () => {
    const a = projectWithPhoto('phA1');
    const b = projectWithPhoto('phB1');
    await mod.photos.putPhotos([
      { id: 'phA1', projectId: a.id, w: 10, h: 10, blob: jpeg(1) },
      { id: 'phA2', projectId: a.id, w: 10, h: 10, blob: jpeg(2) },
      { id: 'phB1', projectId: b.id, w: 10, h: 10, blob: jpeg(3) },
      { id: 'phB2', projectId: b.id, w: 10, h: 10, blob: jpeg(4) }
    ]);
    expect(await mod.photos.prunePhotos(a)).toBe(1);
    expect((await mod.photos.projectPhotos(a.id)).map(p => p.id)).toEqual(['phA1']);
    expect((await mod.photos.projectPhotos(b.id)).map(p => p.id).sort()).toEqual(['phB1', 'phB2']);
  });

  it('smazání projektu smaže i jeho fotky', async () => {
    const p = projectWithPhoto('phD1');
    await mod.db.saveProject(p);
    await mod.photos.putPhotos([{ id: 'phD1', projectId: p.id, w: 10, h: 10, blob: jpeg(5) }]);
    await mod.db.deleteProject(p.id);
    expect(await mod.photos.projectPhotos(p.id)).toEqual([]);
    expect(await mod.photos.getPhoto('phD1')).toBeUndefined();
  });

  it('import zálohy jako kopie: nový projekt, fotky s novými id pod novým projektem, originál beze změny', async () => {
    const p = projectWithPhoto('phI1');
    await mod.db.saveProject(p);
    await mod.photos.putPhotos([{ id: 'phI1', projectId: p.id, w: 10, h: 10, blob: jpeg(6) }]);
    const payload = await mod.backup.backupPayload(p, await mod.photos.projectPhotos(p.id));
    const file = new File([JSON.stringify(payload)], 'z.zamer.json', { type: 'application/json' });
    const copy = await mod.backup.importBackup(file);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe('Foto (kopie)');
    const photos = await mod.photos.projectPhotos(copy.id);
    expect(photos).toHaveLength(1);
    expect(photos[0]!.id).not.toBe('phI1');
    const m = Object.values(copy.floors[0]!.marks!)[0]!;
    expect(m.pages[0]!.photo!.id).toBe(photos[0]!.id);
    // originál a jeho fotka zůstaly
    expect((await mod.photos.projectPhotos(p.id)).map(x => x.id)).toEqual(['phI1']);
  });
});
