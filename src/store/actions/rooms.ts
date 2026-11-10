/**
 * Akce: místnosti.
 */
import { createRoom } from '../../model/factory';
import type { Id, Pt, Room } from '../../model/types';
import { store } from '../store';

export function addRoom(p: Pt): Id {
  let id = '';
  store.edit(floor => {
    const room = createRoom(floor, p.x, p.y);
    floor.rooms[room.id] = room;
    id = room.id;
  });
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
