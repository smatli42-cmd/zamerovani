/**
 * Akce: otvory (dveře, okna, průchody, niky), ostění a zárubně.
 */
import { createOpening, isWindowKind } from '../../model/factory';
import { applyRevealPart, doorLayout, openingThickness, outwardSwing, type RevealPart } from '../../core/doorLayout';
import type { Floor, Id, Opening, OpeningKind } from '../../model/types';
import { openingSpan, openingStartFromA, openingsOnWall, wallLength } from '../../core/floorQueries';
import { store } from '../store';

/** Vloží otvor na stěnu v místě ťuknutí (t = 0..1 od rohu A). Měří se od bližšího rohu. */
export function addOpening(wallId: Id, kind: OpeningKind, t: number): Id | null {
  let createdId: Id | null = null;
  store.edit(floor => {
    const wall = floor.walls[wallId];
    if (!wall) return;
    const len = wallLength(floor, wall);
    const probe = createOpening(floor, wallId, kind);
    const width = Math.min(probe.width, Math.max(100, Math.round(len - 100 - (probe.frame?.width ?? 0) * 2)));
    const ref: 'a' | 'b' = t < 0.5 ? 'a' : 'b';
    const center = t * len;
    const spanW = openingSpan({ ...probe, width });
    const startFromA = Math.max(0, Math.min(len - spanW, Math.round((center - spanW / 2) / 10) * 10));
    const op: Opening = { ...probe, width, ref, hinge: ref, offset: 0 };
    const T = openingThickness(floor, op);
    // okno ve stěně kreslené jednou čarou: rám jde z líce ven (od středu výkresu)
    if (isWindowKind(kind) && T === null) op.swing = outwardSwing(floor, wall);
    // stěna s tloušťkou: nika na vnitřním líci (zahlubuje se do těla), dveře se otevírají do místnosti (od těla)
    if (T !== null && kind === 'niche') op.swing = wall.side;
    if (T !== null && kind === 'door') op.swing = wall.side === 1 ? -1 : 1;
    setStartFromA(op, startFromA, len);
    floor.openings[op.id] = op;
    createdId = op.id;
  });
  if (createdId) store.set({ selection: { kind: 'opening', id: createdId } });
  return createdId;
}

export function setStartFromA(op: Opening, startFromA: number, wallLen: number): void {
  const span = openingSpan(op);
  const s = Math.max(0, Math.min(Math.max(0, wallLen - span), Math.round(startFromA)));
  op.offset = op.ref === 'a' ? s : Math.max(0, Math.round(wallLen - s - span));
}

export function updateOpening(id: Id, patch: Partial<Opening>): void {
  store.edit(floor => {
    const op = floor.openings[id];
    if (op) Object.assign(op, patch);
  });
}

/** Přesune otvor podél stěny (začátek otvoru měřený od rohu A). */
export function moveOpeningTo(id: Id, startFromA: number): void {
  store.edit(floor => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    if (!op || !wall) return;
    setStartFromA(op, startFromA, wallLength(floor, wall));
  });
}

/** Změní referenční roh, od kterého se měří odstup – poloha otvoru se nezmění. */
export function setOpeningRef(id: Id, ref: 'a' | 'b'): void {
  store.edit(floor => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    if (!op || !wall || op.ref === ref) return;
    const len = wallLength(floor, wall);
    const start = openingStartFromA(op, len);
    op.ref = ref;
    setStartFromA(op, start, len);
  });
}

/** Změní šířku otvoru, okraj u referenčního rohu zůstane na místě. */
export function setOpeningWidth(floor: Floor, op: Opening, width: number): void {
  const wall = floor.walls[op.wallId];
  if (!wall) return;
  op.width = Math.max(100, Math.round(width));
  // offset je měřen od ref rohu → při změně šířky zůstává bližší okraj na místě automaticky
  const len = wallLength(floor, wall);
  setStartFromA(op, openingStartFromA(op, len), len);
}

/** Změní rozměry ostění; protože se mění celková šířka otvoru, okraj u referenčního rohu zůstane na místě. */
export function setReveal(floor: Floor, op: Opening, part: RevealPart, value: number): boolean {
  const wall = floor.walls[op.wallId];
  if (!wall) return false;
  const len = wallLength(floor, wall);
  const start = openingStartFromA(op, len);
  const ref = op.ref;
  const startFixed = ref === 'a' ? start : len - start - openingSpan(op);
  if (!applyRevealPart(floor, op, part, value)) return false;
  op.offset = startFixed;
  setStartFromA(op, openingStartFromA(op, len), len);
  return true;
}

/** Zapne (výchozí hodnoty) nebo vypne ostění otvoru. */
export function setRevealEnabled(id: Id, on: boolean): void {
  store.edit(floor => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    if (!op || !wall) return;
    const len = wallLength(floor, wall);
    const start = openingStartFromA(op, len);
    const oldLeft = op.reveal?.left ?? 0;
    if (on) {
      const T = openingThickness(floor, op);
      // stěna s tloušťkou: zárubeň / rám zůstane, kde je (hloubka ostění = jeho odsazení od líce A); jinak 150 mm
      const depth = T !== null ? Math.round(doorLayout(op, T).fo) : 150;
      op.reveal = op.reveal ?? { depth, left: 100, right: 100, top: 0 };
    }
    else delete op.reveal;
    // okno zůstane na stejném místě: otvor se rozšíří (nebo zúží) o ostění kolem okna
    setStartFromA(op, on ? start - (op.reveal?.left ?? 0) : start + oldLeft, len);
  });
}

/** Změní mezeru mezi dvěma sousedními otvory – posune druhý a všechny další za ním. */
export function setGap(floor: Floor, firstId: Id, secondId: Id, gap: number): void {
  const first = floor.openings[firstId];
  const wall = first && floor.walls[first.wallId];
  if (!first || !wall) return;
  const len = wallLength(floor, wall);
  const placed = openingsOnWall(floor, wall);
  const idx = placed.findIndex(p => p.op.id === firstId);
  if (idx < 0 || placed[idx + 1]?.op.id !== secondId) return;
  const shift = placed[idx]!.end + gap - placed[idx + 1]!.start;
  for (let i = idx + 1; i < placed.length; i++) {
    const p = placed[i]!;
    const op = floor.openings[p.op.id]!;
    setStartFromA(op, p.start + shift, len);
  }
}
