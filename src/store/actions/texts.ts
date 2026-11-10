/**
 * Akce: samostatné texty a odkazové šipky.
 */
import { createText } from '../../model/factory';
import type { Id, Pt, TextNote } from '../../model/types';
import { store } from '../store';

/** ID právě vloženého textu – panel mu hned aktivuje pole, aby se dalo rovnou psát. */
let freshTextId: Id | null = null;

export function takeFreshTextId(): Id | null {
  const id = freshTextId;
  freshTextId = null;
  return id;
}

export function addText(p: Pt, leader?: Pt): Id {
  let id = '';
  store.edit(floor => {
    const t = createText(p.x, p.y);
    if (leader) t.leader = { x: Math.round(leader.x), y: Math.round(leader.y) };
    floor.texts[t.id] = t;
    id = t.id;
  });
  freshTextId = id;
  store.set({ selection: { kind: 'text', id } });
  return id;
}

export function updateText(id: Id, patch: Partial<TextNote>): void {
  store.edit(floor => {
    const t = floor.texts[id];
    if (!t) return;
    Object.assign(t, patch);
    if ('leader' in patch && !patch.leader) delete t.leader;
  });
}

export function moveText(id: Id, p: Pt): void {
  store.edit(floor => {
    const t = floor.texts[id];
    if (t) {
      const nx = Math.round(p.x / 10) * 10;
      const ny = Math.round(p.y / 10) * 10;
      // hrot šipky se posouvá spolu s textem
      if (t.leader) t.leader = { x: t.leader.x + nx - t.x, y: t.leader.y + ny - t.y };
      t.x = nx;
      t.y = ny;
    }
  });
}
