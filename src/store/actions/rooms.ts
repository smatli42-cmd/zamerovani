/**
 * Akce: místnosti.
 */
import { createRoom } from '../../model/factory';
import type { Id, Pt, Room } from '../../model/types';
import { store } from '../store';

/** Vrací id nového štítku, nebo null, když nevznikl (zamčená vrstva Popisky). */
export function addRoom(p: Pt): Id | null {
  let id = '';
  const ok = store.edit(floor => {
    const room = createRoom(floor, p.x, p.y);
    floor.rooms[room.id] = room;
    id = room.id;
  });
  if (!ok) return null;
  store.set({ selection: { kind: 'room', id } });
  return id;
}

export function updateRoom(id: Id, patch: Partial<Room>): void {
  store.edit(floor => {
    const r = floor.rooms[id];
    if (r) Object.assign(r, patch);
  });
}

export function moveRoom(id: Id, p: Pt): void {
  store.edit(floor => {
    const r = floor.rooms[id];
    if (r) {
      r.x = Math.round(p.x / 10) * 10;
      r.y = Math.round(p.y / 10) * 10;
    }
  });
}
