/**
 * Akce: zámek kót (KOTY-ZAMEK-EXPORT.md, A). Zamyká se jen ručně – ťuknutím na ikonu, v NumPadu
 * nebo hromadně u stěny / místnosti. Zamknutí ani odemknutí nemění výkres, jen to, co drží.
 */
import type { Id } from '../../model/types';
import { isDimLocked, roomWallIds, setLock, wallDimTargets, type DimTarget } from '../../core/dimLock';
import type { Floor } from '../../model/types';
import { isMainDim, setDimMain } from '../../core/dimRole';
import { store } from '../store';

export function setDimLock(t: DimTarget, on: boolean): void {
  store.edit(floor => setLock(floor, t, on));
}

export function toggleDimLock(t: DimTarget): void {
  const floor = store.floor();
  if (floor) setDimLock(t, !isDimLocked(floor, t));
}

function roomTargets(floor: Floor, roomId: Id): DimTarget[] {
  const room = floor.rooms[roomId];
  return room ? roomWallIds(floor, room).flatMap(id => wallDimTargets(floor, id)) : [];
}

/** Stav zámků kót: 'all' = vše zamčené, 'none' = nic, 'some' = část; null = stěna nemá kóty. */
type LockState = 'all' | 'none' | 'some' | null;

function stateOf(floor: Floor, ts: DimTarget[]): LockState {
  if (!ts.length) return null;
  const n = ts.filter(t => isDimLocked(floor, t)).length;
  return n === 0 ? 'none' : n === ts.length ? 'all' : 'some';
}

export function wallLockState(floor: Floor, wallId: Id): LockState {
  return stateOf(floor, wallDimTargets(floor, wallId));
}

export function roomLockState(floor: Floor, roomId: Id): LockState {
  return stateOf(floor, roomTargets(floor, roomId));
}

/** Zamknout / odemknout všechny kóty stěny (délka, tloušťka, otvory, ostění, výstupky, napojení). */
export function setWallDimsLocked(wallId: Id, on: boolean): void {
  store.edit(floor => {
    for (const t of wallDimTargets(floor, wallId)) setLock(floor, t, on);
  });
}

/** Zamknout / odemknout všechny kóty stěn obrysu místnosti. Vrací false, když kolem místnosti není uzavřený obrys. */
export function setRoomDimsLocked(roomId: Id, on: boolean): boolean {
  const floor = store.floor();
  if (!floor || roomTargets(floor, roomId).length === 0) return false;
  store.edit(f => {
    for (const t of roomTargets(f, roomId)) setLock(f, t, on);
  });
  return true;
}

/** Hlavní / pracovní kóta pro export (core/dimRole.ts) – výkres se nemění, jen to, co půjde do výkresu. */
export function toggleDimMain(t: DimTarget): void {
  const floor = store.floor();
  if (floor) store.edit(f => setDimMain(f, t, !isMainDim(floor, t)));
}
