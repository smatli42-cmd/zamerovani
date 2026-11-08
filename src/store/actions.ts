/**
 * Všechny změny výkresu na jednom místě. Rozhraní i nástroje volají tyto funkce,
 * nikdy nemění data přímo.
 */
import { createCircleWall, createFloor, createOpening, createRoom, createText, createWall, newId } from '../model/factory';
import type { Floor, Id, LineStyle, Opening, OpeningKind, Pt, Room, TextNote, Wall, WallLabel } from '../model/types';
import { dist } from '../core/geometry';
import { openingStartFromA, openingsOnWall, wallLength, wallsAtNode } from '../core/floorQueries';
import { setWallLength, type MoveTarget } from '../core/solver';
import { componentGap, setComponentGap } from '../core/components';
import { partitionPoints } from '../core/partition';
import { splitWallsAtNode } from '../core/topology';
import { store, type NumPadTarget } from './store';

const MERGE_TOL = 1; // mm – rohy blíž než toto jsou jeden roh

function getOrCreateNode(floor: Floor, p: Pt, existingId?: Id | null): Id {
  if (existingId && floor.nodes[existingId]) return existingId;
  const found = Object.values(floor.nodes).find(n => dist(n, p) < MERGE_TOL);
  if (found) return found.id;
  const id = newId('n');
  floor.nodes[id] = { id, x: Math.round(p.x), y: Math.round(p.y) };
  return id;
}

/** Odstraní rohy bez stěn a otvory bez stěny. */
function cleanup(floor: Floor): void {
  const used = new Set<Id>();
  for (const w of Object.values(floor.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(floor.nodes)) if (!used.has(id)) delete floor.nodes[id];
  for (const op of Object.values(floor.openings)) if (!floor.walls[op.wallId]) delete floor.openings[op.id];
}

// ---------------------------------------------------------------- Stěny

/** Je tu už stejná stěna (stejné rohy a stejný tvar)? Dvě půlkružnice mezi týmiž rohy jsou různé stěny. */
function findSameWall(floor: Floor, a: Id, b: Id, sagitta: number): Wall | undefined {
  return Object.values(floor.walls).find(w => {
    if (w.a === a && w.b === b) return Math.abs((w.sagitta ?? 0) - sagitta) < 0.5;
    if (w.a === b && w.b === a) return Math.abs((w.sagitta ?? 0) + sagitta) < 0.5;
    return false;
  });
}

/** Vloží stěnu mezi dva rohy (pokud tam taková ještě není) a vrátí ji. */
function linkWall(floor: Floor, a: Id, b: Id, sagitta = 0, style?: LineStyle): Wall | null {
  if (a === b) return null;
  const same = findSameWall(floor, a, b, sagitta);
  if (same) return same;
  const wall = createWall(a, b, sagitta);
  if (style && style !== 'solid') wall.style = style;
  floor.walls[wall.id] = wall;
  return wall;
}

/** Nová stěna; `sagitta` ≠ 0 = oblouková stěna. Konce na jiných stěnách je rozdělí. */
export function addWall(start: Pt, startNodeId: Id | null, end: Pt, endNodeId: Id | null, select = true, opts: { sagitta?: number; style?: LineStyle } = {}): Id | null {
  let createdId: Id | null = null;
  store.edit(floor => {
    const a = getOrCreateNode(floor, start, startNodeId);
    const b = getOrCreateNode(floor, end, endNodeId);
    if (a === b) return;
    const wall = linkWall(floor, a, b, opts.sagitta ?? 0, opts.style);
    if (!wall) return;
    createdId = wall.id;
    // Konec na jiné stěně → rozdělit ji v místě napojení
    splitWallsAtNode(floor, a);
    splitWallsAtNode(floor, b);
  });
  if (createdId && select) store.set({ selection: { kind: 'wall', id: createdId } });
  return createdId;
}

/**
 * Příčka dvěma čarami: dvě rovnoběžné stěny ve vzdálenosti `thickness`.
 * Konce na jiných stěnách je rozdělí v místě napojení (vzniknou samostatné úseky s kótami),
 * volný konec se uzavře krátkou stěnou o délce tloušťky.
 */
export function addPartition(start: Pt, startNodeId: Id | null, end: Pt, endNodeId: Id | null, thickness: number, side: 1 | -1): void {
  store.edit(floor => applyPartition(floor, start, startNodeId, end, endNodeId, thickness, side));
}

/** Vlastní vytvoření příčky nad podlažím (bez store – testovatelné). */
export function applyPartition(floor: Floor, start: Pt, startNodeId: Id | null, end: Pt, endNodeId: Id | null, thickness: number, side: 1 | -1): void {
  const second = partitionPoints(floor, start, end, thickness, side);
  const a = getOrCreateNode(floor, start, startNodeId);
  const b = getOrCreateNode(floor, end, endNodeId);
  const a2 = getOrCreateNode(floor, second.a2, null);
  const b2 = getOrCreateNode(floor, second.b2, null);
  if (new Set([a, b, a2, b2]).size < 4) return;
  const link = (x: Id, y: Id) => void linkWall(floor, x, y);
  link(a, b);
  link(a2, b2);
  for (const id of [a, b, a2, b2]) splitWallsAtNode(floor, id);
  // Konec opřený o stěnu už uzavírá úsek rozdělené stěny, volný konec dostane krátkou stěnu
  link(a, a2);
  link(b, b2);
}

/** Obdélník ze čtyř stěn (např. sloup, komín); rohy na jiných stěnách je rozdělí. */
export function addRectWalls(p: Pt, q: Pt, style: LineStyle): void {
  store.edit(floor => {
    const ids = [
      { x: p.x, y: p.y },
      { x: q.x, y: p.y },
      { x: q.x, y: q.y },
      { x: p.x, y: q.y }
    ].map(c => getOrCreateNode(floor, c, null));
    if (new Set(ids).size < 4) return;
    for (let i = 0; i < 4; i++) linkWall(floor, ids[i]!, ids[(i + 1) % 4]!, 0, style);
    for (const id of ids) splitWallsAtNode(floor, id);
  });
}

/** Kruh: jedna stěna se středovým rohem a poloměrem. */
export function addCircleWalls(center: Pt, radius: number, style: LineStyle): void {
  let id: Id | null = null;
  store.edit(floor => {
    const c = getOrCreateNode(floor, center, null);
    const wall = createCircleWall(c, Math.round(radius));
    if (style !== 'solid') wall.style = style;
    floor.walls[wall.id] = wall;
    id = wall.id;
  });
  // Vybraný kruh má na obvodu úchyt pro změnu poloměru
  if (id) store.set({ selection: { kind: 'wall', id } });
}

/** Změní poloměr kruhové stěny (tažení bodu na obvodu, kóta průměru). */
export function setCircleRadius(wallId: Id, radius: number): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w && w.radius !== undefined && radius >= 5) w.radius = Math.round(radius);
  });
}

/** Změní vzepětí obloukové stěny (tažení středového bodu); 0 = rovná stěna. */
export function setWallSagitta(wallId: Id, sagitta: number): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    if (Math.abs(sagitta) < 0.5) delete w.sagitta;
    else w.sagitta = Math.round(sagitta);
  });
}

/** Změna vlastností stěny mimo popisek (styl čáry, vzepětí). */
export function updateWall(wallId: Id, patch: { style?: LineStyle | undefined; sagitta?: number | undefined }): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    if ('style' in patch) {
      if (!patch.style || patch.style === 'solid') delete w.style;
      else w.style = patch.style;
    }
    if ('sagitta' in patch) {
      if (!patch.sagitta || Math.abs(patch.sagitta) < 0.5) delete w.sagitta;
      else w.sagitta = Math.round(patch.sagitta);
    }
  });
}

export function applyWallLength(wallId: Id, length: number, move: MoveTarget): boolean {
  let ok = false;
  store.edit(floor => {
    ok = setWallLength(floor, wallId, length, move);
  });
  return ok;
}

export function unlockWall(wallId: Id): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w) w.measured = null;
  });
}

export function updateWallLabel(wallId: Id, patch: Partial<WallLabel>): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w) w.label = { ...w.label, ...patch };
  });
}

/** Posun rohu (volá se během tažení uvnitř gesta). */
export function moveNode(nodeId: Id, p: Pt): void {
  store.edit(floor => {
    const n = floor.nodes[nodeId];
    if (n) {
      n.x = Math.round(p.x);
      n.y = Math.round(p.y);
    }
  });
}

/** Po přetažení rohu na jiný roh je sloučí do jednoho. */
export function mergeNodeIfCoincident(nodeId: Id): void {
  store.edit(floor => {
    const moved = floor.nodes[nodeId];
    if (!moved) return;
    const other = Object.values(floor.nodes).find(n => n.id !== nodeId && dist(n, moved) < MERGE_TOL);
    if (!other) {
      // Roh přetažený na stěnu ji rozdělí
      splitWallsAtNode(floor, nodeId);
      return;
    }
    for (const w of Object.values(floor.walls)) {
      if (w.a === nodeId) w.a = other.id;
      if (w.b === nodeId) w.b = other.id;
      if (w.a === w.b && w.radius === undefined) delete floor.walls[w.id];
    }
    // Odstranění zdvojených stěn mezi stejnými rohy
    const seen = new Set<string>();
    for (const w of Object.values(floor.walls)) {
      // klíč zahrnuje i vzepětí (vztažené k pořadí rohů), aby se dvě půlkružnice nepovažovaly za duplicitu
      const flip = w.a < w.b ? 1 : -1;
      const key = `${[w.a, w.b].sort().join('|')}|${Math.round((w.sagitta ?? 0) * flip)}`;
      if (seen.has(key)) delete floor.walls[w.id];
      else seen.add(key);
    }
    cleanup(floor);
  });
}

// ---------------------------------------------------------------- Mazání

export function deleteSelection(): void {
  const sel = store.get().selection;
  if (!sel) return;
  store.edit(
    floor => {
      switch (sel.kind) {
        case 'wall':
          delete floor.walls[sel.id];
          break;
        case 'node':
          for (const w of wallsAtNode(floor, sel.id)) delete floor.walls[w.id];
          break;
        case 'opening':
          delete floor.openings[sel.id];
          break;
        case 'room':
          delete floor.rooms[sel.id];
          break;
        case 'text':
          delete floor.texts[sel.id];
          break;
      }
      cleanup(floor);
    },
    { selection: null, numpad: null }
  );
}

// ---------------------------------------------------------------- Otvory

/** Vloží otvor na stěnu v místě ťuknutí (t = 0..1 od rohu A). Měří se od bližšího rohu. */
export function addOpening(wallId: Id, kind: OpeningKind, t: number): Id | null {
  let createdId: Id | null = null;
  store.edit(floor => {
    const wall = floor.walls[wallId];
    if (!wall) return;
    const len = wallLength(floor, wall);
    const probe = createOpening(floor, wallId, kind);
    const width = Math.min(probe.width, Math.max(100, Math.round(len - 100)));
    const ref: 'a' | 'b' = t < 0.5 ? 'a' : 'b';
    const center = t * len;
    const startFromA = Math.max(0, Math.min(len - width, Math.round((center - width / 2) / 10) * 10));
    const op: Opening = { ...probe, width, ref, hinge: ref, offset: 0 };
    setStartFromA(op, startFromA, len);
    floor.openings[op.id] = op;
    createdId = op.id;
  });
  if (createdId) store.set({ selection: { kind: 'opening', id: createdId } });
  return createdId;
}

function setStartFromA(op: Opening, startFromA: number, wallLen: number): void {
  const s = Math.max(0, Math.min(Math.max(0, wallLen - op.width), Math.round(startFromA)));
  op.offset = op.ref === 'a' ? s : Math.max(0, Math.round(wallLen - s - op.width));
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
function setOpeningWidth(floor: Floor, op: Opening, width: number): void {
  const wall = floor.walls[op.wallId];
  if (!wall) return;
  op.width = Math.max(100, Math.round(width));
  // offset je měřen od ref rohu → při změně šířky zůstává bližší okraj na místě automaticky
  const len = wallLength(floor, wall);
  setStartFromA(op, openingStartFromA(op, len), len);
}

/** Změní mezeru mezi dvěma sousedními otvory – posune druhý a všechny další za ním. */
function setGap(floor: Floor, firstId: Id, secondId: Id, gap: number): void {
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

// ---------------------------------------------------------------- Místnosti

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

// ---------------------------------------------------------------- Texty

export function addText(p: Pt): Id {
  let id = '';
  store.edit(floor => {
    const t = createText(p.x, p.y);
    floor.texts[t.id] = t;
    id = t.id;
  });
  store.set({ selection: { kind: 'text', id } });
  return id;
}

export function updateText(id: Id, patch: Partial<TextNote>): void {
  store.edit(floor => {
    const t = floor.texts[id];
    if (t) Object.assign(t, patch);
  });
}

export function moveText(id: Id, p: Pt): void {
  store.edit(floor => {
    const t = floor.texts[id];
    if (t) {
      t.x = Math.round(p.x / 10) * 10;
      t.y = Math.round(p.y / 10) * 10;
    }
  });
}

// ---------------------------------------------------------------- Podlaží

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

// ---------------------------------------------------------------- NumPad

/** Výchozí hodnota zobrazená v NumPadu pro daný cíl. */
export function numpadInitialValue(floor: Floor, t: NumPadTarget): number | null {
  switch (t.kind) {
    case 'wall-length': {
      const w = floor.walls[t.wallId];
      return w ? (w.measured ?? Math.round(wallLength(floor, w))) : null;
    }
    case 'opening-offset': {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return null;
      const len = wallLength(floor, wall);
      const start = openingStartFromA(op, len);
      return Math.round(t.ref === 'a' ? start : len - start - op.width);
    }
    case 'opening-width':
      return floor.openings[t.openingId]?.width ?? null;
    case 'wall-sagitta': {
      const w = floor.walls[t.wallId];
      return w ? Math.round(Math.abs(w.sagitta ?? 0)) : null;
    }
    case 'circle-diameter': {
      const w = floor.walls[t.wallId];
      return w?.radius !== undefined ? w.radius * 2 : null;
    }
    case 'comp-gap': {
      const g = componentGap(floor, t.wallId, t.side);
      return g ? Math.round(g.value) : null;
    }
    case 'opening-gap': {
      const a = floor.openings[t.firstId];
      const b = floor.openings[t.secondId];
      const wall = a && floor.walls[a.wallId];
      if (!a || !b || !wall) return null;
      const len = wallLength(floor, wall);
      return Math.round(openingStartFromA(b, len) - (openingStartFromA(a, len) + a.width));
    }
  }
}

/** Zapíše hodnotu z NumPadu do výkresu. */
export function applyNumpadValue(t: NumPadTarget, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (t.kind === 'wall-length') return applyWallLength(t.wallId, value, t.move);
  let ok = false;
  store.edit(floor => {
    if (t.kind === 'opening-offset') {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return;
      const len = wallLength(floor, wall);
      op.ref = t.ref;
      op.offset = Math.round(value);
      setStartFromA(op, openingStartFromA(op, len), len);
      ok = true;
    } else if (t.kind === 'opening-width') {
      const op = floor.openings[t.openingId];
      if (!op || value < 100) return;
      setOpeningWidth(floor, op, value);
      ok = true;
    } else if (t.kind === 'opening-gap') {
      setGap(floor, t.firstId, t.secondId, value);
      ok = true;
    } else if (t.kind === 'wall-sagitta') {
      const w = floor.walls[t.wallId];
      if (!w || value < 1) return;
      w.sagitta = (Math.sign(w.sagitta ?? 0) || 1) * value;
      ok = true;
    } else if (t.kind === 'circle-diameter') {
      const w = floor.walls[t.wallId];
      if (!w || w.radius === undefined || value < 10) return;
      w.radius = Math.round(value / 2);
      ok = true;
    } else if (t.kind === 'comp-gap') {
      ok = setComponentGap(floor, t.wallId, t.side, value);
    }
  });
  return ok;
}

