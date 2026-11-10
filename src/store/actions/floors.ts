/**
 * Akce: podlaží.
 */
import { createFloor } from '../../model/factory';
import type { Id } from '../../model/types';
import { store } from '../store';

export function addFloor(name: string): void {
  const f = createFloor(name);
  store.editProject(p => {
    p.floors.push(f);
  }, { floorId: f.id, selection: null, numpad: null });
}

export function renameFloor(id: Id, name: string): void {
  store.editProject(p => {
    const f = p.floors.find(x => x.id === id);
    if (f) f.name = name;
  });
}

export function deleteFloor(id: Id): void {
  const project = store.get().project;
  if (!project || project.floors.length <= 1) return;
  const idx = project.floors.findIndex(f => f.id === id);
  const fallback = project.floors[idx === 0 ? 1 : idx - 1]!.id;
  store.editProject(p => {
    p.floors = p.floors.filter(f => f.id !== id);
  }, { floorId: fallback, selection: null, numpad: null });
}
