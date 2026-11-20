/**
 * Fotky značek (ZNACKY-POZNAMKY-DETAILY.md, krok B): uložené ZVLÁŠŤ od dat projektu (IndexedDB `photos`),
 * projekt na ně jen odkazuje (`MarkPage.photo`). Fotka se při vložení zmenší (delší strana `PHOTO_MAX_PX`), původní
 * soubor se nemění ani neukládá. Úklid nepoužitých fotek při otevření projektu (`prunePhotos`), smazání s projektem
 * (`deleteProject` v db.ts), záloha / obnova v backup.ts.
 */
import type { Id, MarkPhoto, Project } from '../model/types';
import { newId } from '../model/factory';
import { photoFitSize, projectPhotoIds } from '../core/marks';
import { db, type StoredPhoto } from './db';

/** Zmenší obrázek ze souboru (fotoaparát / galerie) na JPEG; natočení podle EXIF řeší prohlížeč. */
export async function resizePhoto(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { w, h } = photoFitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error('Fotku se nepodařilo zmenšit.'))), 'image/jpeg', 0.85));
  return { blob, w, h };
}

/** Zmenší a uloží fotku k projektu; vrací odkaz pro stranu značky. */
export async function addPhoto(projectId: Id, file: Blob): Promise<MarkPhoto> {
  const { blob, w, h } = await resizePhoto(file);
  const photo: StoredPhoto = { id: newId('ph'), projectId, blob, w, h };
  await (await db()).put('photos', photo);
  return { id: photo.id, w, h };
}

export async function getPhoto(id: Id): Promise<StoredPhoto | undefined> {
  return (await db()).get('photos', id);
}

/** Všechny fotky projektu (záloha). */
export async function projectPhotos(projectId: Id): Promise<StoredPhoto[]> {
  return (await db()).getAllFromIndex('photos', 'projectId', projectId);
}

/** Uloží fotky (obnova ze zálohy). */
export async function putPhotos(photos: StoredPhoto[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('photos', 'readwrite');
  await Promise.all([...photos.map(p => tx.store.put(p)), tx.done]);
}

/**
 * Smaže fotky projektu, na které už nic neodkazuje (smazaná značka, odebraná fotka). Volá se při otevření projektu –
 * tehdy je historie Zpět prázdná, takže žádný krok Zpět fotku nepotřebuje.
 */
export async function prunePhotos(project: Pick<Project, 'id' | 'floors'>): Promise<number> {
  const used = projectPhotoIds(project);
  const d = await db();
  const tx = d.transaction('photos', 'readwrite');
  const keys = await tx.store.index('projectId').getAllKeys(project.id);
  const drop = keys.filter(k => !used.has(k));
  await Promise.all([...drop.map(k => tx.store.delete(k)), tx.done]);
  return drop.length;
}

/** Smaže fotky podle id (úklid po nepovedeném importu). */
export async function deletePhotos(ids: Id[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('photos', 'readwrite');
  await Promise.all([...ids.map(id => tx.store.delete(id)), tx.done]);
}
