/**
 * Akce: otvory (dveře, okna, průchody, niky), ostění a zárubně.
 */
import { createOpening, hasLeaf, isWindowKind } from '../../model/factory';
import { applyRevealPart, doorLayout, leafSwingIntoRoom, openingThickness, outwardSwing, type RevealPart } from '../../core/doorLayout';
import type { Floor, Id, Opening, OpeningKind } from '../../model/types';
import { openingSpan, openingStartFromA, wallLength } from '../../core/floorQueries';
import { store } from '../store';

/** Vloží otvor na stěnu v místě ťuknutí (t = 0..1 od rohu A). Měří se od bližšího rohu. */
export function addOpening(wallId: Id, kind: OpeningKind, t: number): Id | null {
  let createdId: Id | null = null;
  const applied = store.edit(floor => {
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
    // stěna s tloušťkou: nika na vnitřním líci (zahlubuje se do těla), dveře a francouzské okno se otevírají do místnosti (od těla)
    if (T !== null && kind === 'niche') op.swing = wall.side;
    if (T !== null && hasLeaf(kind)) op.swing = leafSwingIntoRoom(wall);
    setStartFromA(op, startFromA, len);
    floor.openings[op.id] = op;
    createdId = op.id;
  });
  if (!applied) return null; // zastaveno zámkem kóty
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

/**
 * Zapne / vypne ostění z vnitřního a vnějšího líce. Obě vypnuté = bez ostění (`reveal` zmizí).
 * Zárubeň / rám i okno zůstanou na místě: při prvním zapnutí se otvor rozšíří o ostění kolem, při vypnutí zúží.
 */
export function setRevealSides(id: Id, inner: boolean, outer: boolean): void {
  store.edit(floor => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    if (!op || !wall) return;
    const len = wallLength(floor, wall);
    const start = openingStartFromA(op, len);
    const T = openingThickness(floor, op);
    const oldLeft = op.reveal?.left ?? 0;
    const fo = Math.round(doorLayout(op, T).fo);
    if (inner || outer) {
      if (op.reveal) {
        op.reveal.inner = inner;
        op.reveal.outer = outer;
        return;
      }
      // stěna s tloušťkou: zárubeň / rám zůstane, kde je (hloubka ostění = jeho odsazení od líce A); jinak 150 mm
      op.reveal = { depth: T !== null ? fo : 150, left: 100, right: 100, top: 0, inner, outer };
      setStartFromA(op, start - op.reveal.left, len);
    } else {
      if (!op.reveal) return;
      delete op.reveal;
      // zárubeň / rám zůstane ve stejné hloubce
      if (op.frame && T !== null) op.frame.offset = fo;
      setStartFromA(op, start + oldLeft, len);
    }
  });
}

/** Zapne (výchozí hodnoty, ostění z obou líců) nebo vypne ostění otvoru. */
export function setRevealEnabled(id: Id, on: boolean): void {
  setRevealSides(id, on, on);
}

/**
 * Změní druh okna (okno / francouzské okno): nastaví výchozí parapet; francouzské okno ve stěně s tloušťkou
 * dostane křídlo otevírané do místnosti (jako dveře).
 */
export function setWindowKind(id: Id, kind: 'window' | 'french'): void {
  store.edit(floor => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    if (!op || !wall || op.kind === kind || !isWindowKind(op.kind)) return;
    op.kind = kind;
    op.sill = createOpening(floor, wall.id, kind).sill;
    if (kind === 'french' && openingThickness(floor, op) !== null) op.swing = leafSwingIntoRoom(wall);
  });
}
