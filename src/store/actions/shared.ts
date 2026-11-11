/**
 * Společné pomocné funkce akcí (jen pro soubory ve složce actions, ven se neexportují).
 */
import { newId } from '../../model/factory';
import type { Floor, Id, Pt } from '../../model/types';
import { dist } from '../../core/geometry';

export const MERGE_TOL = 1; // mm – rohy blíž než toto jsou jeden roh

/** Má některá stěna u tohoto rohu zapnuté „nespojovat konec“? (Takový roh je jen té jedné stěny, C1.13.) */
export function nodeHasNoJoin(floor: Floor, nodeId: Id): boolean {
  return Object.values(floor.walls).some(w => (w.a === nodeId && !!w.noJoinA) || (w.b === nodeId && !!w.noJoinB));
}

export function getOrCreateNode(floor: Floor, p: Pt, existingId?: Id | null): Id {
  // oddělený konec (nespojený) se nová stěna nikdy sama nepřipojí
  if (existingId && floor.nodes[existingId] && !nodeHasNoJoin(floor, existingId)) return existingId;
  const found = Object.values(floor.nodes).find(n => dist(n, p) < MERGE_TOL && !nodeHasNoJoin(floor, n.id));
  if (found) return found.id;
  const id = newId('n');
  floor.nodes[id] = { id, x: Math.round(p.x), y: Math.round(p.y) };
  return id;
}

/** Odstraní rohy bez stěn a otvory bez stěny. */
export function cleanup(floor: Floor): void {
  const used = new Set<Id>();
  for (const w of Object.values(floor.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(floor.nodes)) if (!used.has(id)) delete floor.nodes[id];
  for (const op of Object.values(floor.openings)) if (!floor.walls[op.wallId]) delete floor.openings[op.id];
}
