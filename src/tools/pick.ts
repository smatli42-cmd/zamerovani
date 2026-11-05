/**
 * Hledání prvku pod perem/prstem (společné pro více nástrojů).
 */
import { findNodeNear, findWallNear, openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { projectToSegment } from '../core/geometry';
import type { Floor, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { HIT_PX } from './types';

/** Velikost štítku místnosti na obrazovce – musí odpovídat kreslení v canvas/drawRooms.ts. */
export const ROOM_LABEL = { halfW: 70, halfH: 30 };

export function pickOpening(floor: Floor, p: Pt, cam: Camera): string | null {
  const tol = HIT_PX.wall / cam.zoom;
  for (const wall of Object.values(floor.walls)) {
    const n = wallNodes(floor, wall);
    if (!n) continue;
    const pr = projectToSegment(p, n[0], n[1]);
    if (pr.distance > tol * 1.5) continue;
    const along = pr.t * wallLength(floor, wall);
    for (const po of openingsOnWall(floor, wall)) {
      if (along >= po.start - tol * 0.3 && along <= po.end + tol * 0.3) return po.op.id;
    }
  }
  return null;
}

export function pickRoom(floor: Floor, p: Pt, cam: Camera): string | null {
  const rooms = Object.values(floor.rooms);
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i]!;
    if (Math.abs(p.x - r.x) * cam.zoom <= ROOM_LABEL.halfW && Math.abs(p.y - r.y) * cam.zoom <= ROOM_LABEL.halfH) return r.id;
  }
  return null;
}

/** Prvek pod bodem v pořadí priority: roh, otvor, místnost, stěna. */
export function pickAny(floor: Floor, p: Pt, cam: Camera): Selection {
  const node = findNodeNear(floor, p, HIT_PX.node / cam.zoom);
  if (node) return { kind: 'node', id: node.id };
  const op = pickOpening(floor, p, cam);
  if (op) return { kind: 'opening', id: op };
  const room = pickRoom(floor, p, cam);
  if (room) return { kind: 'room', id: room };
  const wall = findWallNear(floor, p, HIT_PX.wall / cam.zoom);
  if (wall) return { kind: 'wall', id: wall.wall.id };
  return null;
}
