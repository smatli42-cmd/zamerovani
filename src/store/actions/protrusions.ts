/**
 * Akce: nástroj Čára a výstupky / vybrání stěn (KATALOG-STEN.md, sekce I).
 * Čára = stěna bez tloušťky; lomená čára z čar, jejíž oba konce leží na stejném líci téže stěny,
 * se po dokončení sama změní na výstupek nebo vybrání.
 */
import { newId } from '../../model/factory';
import type { Floor, Id, Protrusion, Pt, Wall } from '../../model/types';
import { findFaceNear, profileFromPolyline, setProtrusionDim, type ProtrusionDim } from '../../core/protrusion';
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

/**
 * Uzavřený tvar z čar bez tloušťky (obdélník, uzavřená lomená čára), ke kterému patří `wallId`: v každém rohu
 * právě dvě čáry tvaru. Vrací rohy po obvodu a čáry (čára i spojuje rohy i a i+1); null, není-li to uzavřený tvar.
 */
export function lineLoop(floor: Floor, wallId: Id): { pts: Pt[]; walls: Id[] } | null {
  const first = floor.walls[wallId];
  if (!first || !isPlainLine(first)) return null;
  const nodes: Id[] = [first.a];
  const walls: Id[] = [first.id];
  let cur = first.b;
  while (cur !== first.a) {
    const lines = Object.values(floor.walls).filter(w => (w.a === cur || w.b === cur) && isPlainLine(w));
    if (lines.length !== 2 || nodes.includes(cur)) return null;
    const next = lines.find(w => w.id !== walls[walls.length - 1]);
    if (!next) return null;
    nodes.push(cur);
    walls.push(next.id);
    cur = next.a === cur ? next.b : next.a;
  }
  const pts = nodes.map(id => floor.nodes[id]);
  if (nodes.length < 3 || pts.some(p => !p)) return null;
  return { pts: pts.map(p => ({ x: p!.x, y: p!.y })), walls };
}

/**
 * Uzavřený tvar, jehož strana (souvislý úsek stran) leží na líci jedné stěny: ty strany se vynechají a zbytek
 * obvodu je otevřená lomená čára s konci na líci (jako u kreslení třemi čarami).
 */
function openLoopOnFace(floor: Floor, loop: { pts: Pt[] }): Pt[] | null {
  const n = loop.pts.length;
  const onFace = loop.pts.map(p => findFaceNear(floor, p, 1.5));
  // strana i (roh i → i+1) leží na líci, když oba rohy leží na stejném líci téže stěny
  const edgeOn = loop.pts.map((_, i) => {
    const a = onFace[i];
    const b = onFace[(i + 1) % n];
    return !!a && !!b && a.wall.id === b.wall.id && a.side === b.side;
  });
  const count = edgeOn.filter(Boolean).length;
  if (count === 0 || count === n) return null;
  // začátek = první strana mimo líc hned za úsekem na líci; úsek na líci musí být jeden souvislý
  let start = edgeOn.findIndex((on, i) => !on && edgeOn[(i - 1 + n) % n]);
  if (start < 0) return null;
  const pts: Pt[] = [loop.pts[start]!];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (edgeOn[i]) break;
    pts.push(loop.pts[(i + 1) % n]!);
  }
  return pts.length - 1 === n - count ? pts : null;
}

/** Je-li čára `wallId` součástí lomené čáry s oběma konci na líci stěny, nahradí ji výstupkem / vybráním. */
export function convertChain(floor: Floor, wallId: Id): Id | null {
  let chain = lineChain(floor, wallId);
  if (!chain) {
    // uzavřený tvar přiložený stranou k líci stěny (chyba od uživatele 2026-11-13: obdélník u stěny zůstal čarami)
    const loop = lineLoop(floor, wallId);
    const open = loop && openLoopOnFace(floor, loop);
    if (loop && open) chain = { pts: open, walls: loop.walls };
  }
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
    if (id && !prot) dropLineOverProtrusion(floor, id);
  });
  if (prot) store.set({ selection: { kind: 'protrusion', id: prot } });
}

/**
 * Čára ležící po líci stěny v šířce už hotového výstupku (uzavření tvaru, který se změnil na výstupek už po
 * třech čarách) je zbytečná – smaže se.
 */
function dropLineOverProtrusion(floor: Floor, wallId: Id): void {
  const w = floor.walls[wallId];
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  if (!w || !a || !b || !isPlainLine(w)) return;
  const ha = findFaceNear(floor, a, 1.5);
  const hb = ha && findFaceNear(floor, b, 1.5, ha.wall.id);
  if (!ha || !hb || hb.side !== ha.side) return;
  const lo = Math.min(ha.u, hb.u);
  const hi = Math.max(ha.u, hb.u);
  const covered = Object.values(floor.protrusions ?? {}).some(p => {
    if (p.wallId !== ha.wall.id || p.side !== ha.side) return false;
    const us = p.pts.map(q => q.u);
    return Math.min(...us) <= lo + 1.5 && Math.max(...us) >= hi - 1.5;
  });
  if (!covered) return;
  delete floor.walls[wallId];
  cleanup(floor);
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
