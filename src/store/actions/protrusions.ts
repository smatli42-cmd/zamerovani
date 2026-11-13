/**
 * Akce: nástroj Čára a výstupky / vybrání stěn (KATALOG-STEN.md, sekce I).
 * Čára = stěna bez tloušťky; lomená čára z čar, jejíž oba konce leží na stejném líci téže stěny,
 * se po dokončení sama změní na výstupek nebo vybrání.
 */
import { newId } from '../../model/factory';
import type { Floor, Id, Protrusion, Pt, Wall } from '../../model/types';
import { profileFromPolyline, setProtrusionDim, type ProtrusionDim } from '../../core/protrusion';
import { store } from '../store';
import { cleanup } from './shared';
import { insertWall } from './walls';

const isPlainLine = (w: Wall) => w.thickness === 0 && !w.sagitta && w.radius === undefined && w.a !== w.b;

/**
 * Lomená čára z čar bez tloušťky, ke které patří `wallId`: řetěz přes rohy, ve kterých se stýkají právě dvě
 * čáry. Vrací body od jednoho konce k druhému a čáry řetězu; null u uzavřeného řetězu nebo konce napojeného jinam.
 */
export function lineChain(floor: Floor, wallId: Id): { pts: Pt[]; walls: Id[] } | null {
  const first = floor.walls[wallId];
  if (!first || !isPlainLine(first)) return null;
  const at = (nodeId: Id) => Object.values(floor.walls).filter(w => w.a === nodeId || w.b === nodeId);
  const nodes: Id[] = [first.a, first.b];
  const walls: Id[] = [first.id];
  // prodlužuje řetěz na konci (atEnd) nebo na začátku
  const grow = (atEnd: boolean): boolean => {
    for (;;) {
      const nodeId = atEnd ? nodes[nodes.length - 1]! : nodes[0]!;
      const here = at(nodeId);
      const lines = here.filter(isPlainLine);
      // konec řetězu: jediná čára (případně v rohu stěny s tělem, např. výstupek od rohu stěny)
      if (lines.length === 1) return here.every(w => isPlainLine(w) || w.thickness > 0);
      if (here.length !== 2 || lines.length !== 2) return false; // napojeno na něco dalšího
      const next = here.find(w => !walls.includes(w.id));
      if (!next) return false; // uzavřený řetěz
      const far = next.a === nodeId ? next.b : next.a;
      if (nodes.includes(far)) return false;
      walls.push(next.id);
      if (atEnd) nodes.push(far);
      else nodes.unshift(far);
    }
  };
  if (!grow(true) || !grow(false)) return null;
  const pts = nodes.map(id => floor.nodes[id]).filter((p): p is NonNullable<typeof p> => !!p);
  return pts.length === nodes.length ? { pts: pts.map(p => ({ x: p.x, y: p.y })), walls } : null;
}

/** Je-li čára `wallId` součástí lomené čáry s oběma konci na líci stěny, nahradí ji výstupkem / vybráním. */
function convertChain(floor: Floor, wallId: Id): Id | null {
  const chain = lineChain(floor, wallId);
  const prof = chain && profileFromPolyline(floor, chain.pts);
  if (!chain || !prof) return null;
  for (const id of chain.walls) delete floor.walls[id];
  const p: Protrusion = { id: newId('pr'), ...prof, name: '', material: '', note: '' };
  (floor.protrusions ??= {})[p.id] = p;
  cleanup(floor);
  return p.id;
}

/**
 * Nástroj Čára: přidá úsek čáry (stěnu bez tloušťky). Uzavře-li lomená čára výstupek / vybrání na líci stěny,
 * čáry zmizí a vznikne výstupek, který se vybere. Jeden krok Zpět.
 */
export function addLine(start: Pt, startNodeId: Id | null, end: Pt, endNodeId: Id | null): void {
  let prot: Id | null = null;
  store.edit(floor => {
    const id = insertWall(floor, start, startNodeId, end, endNodeId, { thickness: 0 });
    if (id) prot = convertChain(floor, id);
  });
  if (prot) store.set({ selection: { kind: 'protrusion', id: prot } });
}

/** Vlastnosti výstupku (výška, název, materiál, poznámka). */
export function updateProtrusion(id: Id, patch: Partial<Pick<Protrusion, 'height' | 'name' | 'material' | 'note'>>): void {
  store.edit(floor => {
    const p = floor.protrusions?.[id];
    if (!p) return;
    Object.assign(p, patch);
    if (p.height === undefined || !(p.height > 0)) delete p.height;
  });
}

/** Kóta výstupku z NumPadu (mění jen výstupek, ne stěnu). */
export function applyProtrusionDim(floor: Floor, id: Id, dim: ProtrusionDim, value: number): boolean {
  return setProtrusionDim(floor, id, dim, value);
}
