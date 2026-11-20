/**
 * Fotky značek (ZNACKY-POZNAMKY-DETAILY.md, krok B): zmenšení, odkazy z projektu, záloha a obnova i s fotkami.
 * (Ukládání do IndexedDB a zmenšení přes plátno běží jen v prohlížeči – tady čisté části.)
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { MarkPage, Project } from '../model/types';
import { createMark, markContent, PHOTO_MAX_PX, photoFitSize, projectPhotoIds, remapPhotoIds } from '../core/marks';
import { backupPayload, restoreFromPayload } from './backup';
import type { StoredPhoto } from './db';

function projectWithPhoto(): Project {
  const p = createProject({ name: 'Foto' });
  const m = createMark({ x: 0, y: 0 }, 1);
  const page: MarkPage = { ...m.pages[0]!, photo: { id: 'ph1', w: 2000, h: 1500 }, strokes: [{ mode: 'line', color: '#000', width: 2, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] };
  m.pages = [page];
  p.floors[0]!.marks = { [m.id]: m };
  return p;
}

describe('fotka ke značce', () => {
  it('zmenšení: delší strana nejvýš 2000 px, poměr stran zachován, malá fotka se nezvětšuje', () => {
    expect(photoFitSize(4000, 3000)).toEqual({ w: PHOTO_MAX_PX, h: 1500 });
    expect(photoFitSize(3000, 4000)).toEqual({ w: 1500, h: PHOTO_MAX_PX });
    expect(photoFitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('odkazy z projektu, ikona fotky, přejmenování id (kresba nad fotkou zůstane)', () => {
    const p = projectWithPhoto();
    expect([...projectPhotoIds(p)]).toEqual(['ph1']);
    const m = Object.values(p.floors[0]!.marks!)[0]!;
    expect(markContent(m)).toBe('photo');
    const q = remapPhotoIds(p, new Map([['ph1', 'ph9']]));
    const page = Object.values(q.floors[0]!.marks!)[0]!.pages[0]!;
    expect(page.photo).toEqual({ id: 'ph9', w: 2000, h: 1500 });
    expect(page.strokes).toHaveLength(1);
    // původní projekt se nezměnil
    expect([...projectPhotoIds(p)]).toEqual(['ph1']);
  });

  it('záloha nese fotky (jen použité); obnova je uloží s novými id a projekt na ně odkazuje', async () => {
    const p = projectWithPhoto();
    const bytes = new Uint8Array([255, 216, 255, 1, 2, 3, 250]);
    const photos: StoredPhoto[] = [
      { id: 'ph1', projectId: p.id, w: 2000, h: 1500, blob: new Blob([bytes], { type: 'image/jpeg' }) },
      { id: 'phX', projectId: p.id, w: 10, h: 10, blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }) }
    ];
    const payload = JSON.parse(JSON.stringify(await backupPayload(p, photos))) as { version: number; photos: { id: string }[] };
    expect(payload.version).toBe(2);
    expect(payload.photos.map(x => x.id)).toEqual(['ph1']);
    const r = restoreFromPayload(payload, 'prj-new');
    expect(r.project.id).toBe('prj-new');
    expect(r.photos).toHaveLength(1);
    const ph = r.photos[0]!;
    expect(ph.id).not.toBe('ph1');
    expect(ph.projectId).toBe('prj-new');
    expect(new Uint8Array(await ph.blob.arrayBuffer())).toEqual(bytes);
    expect([...projectPhotoIds(r.project)]).toEqual([ph.id]);
  });

  it('starší záloha (verze 1, bez fotek) se dál načte', () => {
    const p = createProject({ name: 'Stará' });
    const r = restoreFromPayload({ app: 'zamerovani', version: 1, project: { ...p, schema: 32 } });
    expect(r.photos).toEqual([]);
    expect(r.project.name).toBe('Stará');
  });
});
