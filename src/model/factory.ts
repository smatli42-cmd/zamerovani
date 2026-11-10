/**
 * Vytváření nových prvků modelu s výchozími hodnotami.
 */
import {
  SCHEMA_VERSION,
  type Floor,
  type Id,
  type Opening,
  type OpeningKind,
  type Project,
  type Room,
  type TextNote,
  type Wall,
  type WallLabel
} from './types';

let counter = 0;

/** Unikátní ID (čas + náhoda + počítadlo) – bezpečné i při importu z jiného tabletu. */
export function newId(prefix: string): Id {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${rand}${counter.toString(36)}`;
}

export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function createFloor(name: string): Floor {
  return { id: newId('fl'), name, nodes: {}, walls: {}, openings: {}, rooms: {}, texts: {} };
}

export function createProject(fields: Partial<Pick<Project, 'name' | 'address' | 'surveyor' | 'surveyDate' | 'note'>> = {}): Project {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: newId('prj'),
    name: fields.name?.trim() || 'Nový projekt',
    address: fields.address ?? '',
    surveyor: fields.surveyor ?? '',
    surveyDate: fields.surveyDate || todayIso(),
    note: fields.note ?? '',
    createdAt: now,
    updatedAt: now,
    floors: [createFloor('1.NP')]
  };
}

export function emptyWallLabel(): WallLabel {
  return { type: null, material: '', note: '' };
}

/** Výchozí tloušťka nové stěny (mm). */
export const DEFAULT_WALL_THICKNESS = 300;

/** Výchozí předvolby tloušťky v menu Stěny (mm). */
export const WALL_PRESETS = [100, 150, 200, 300];

/** Tloušťka, kterou se kreslí nové stěny (naposledy vybraná v projektu). */
export const activeWallThickness = (project: Project | null): number => project?.wallThickness ?? DEFAULT_WALL_THICKNESS;

/** Výška oblouku, kterou se kreslí nové obloukové stěny (mm). */
export const activeWallArcHeight = (project: Project | null): number => project?.wallArcHeight ?? 500;

/** Všechny předvolby tloušťky projektu (výchozí + vlastní), seřazené. */
export function wallPresets(project: Project | null): number[] {
  return [...new Set([...WALL_PRESETS, ...(project?.wallPresets ?? [])])].sort((a, b) => a - b);
}

/** Nová stěna; `thickness` 0 = čára bez tloušťky (tvary). */
export function createWall(a: Id, b: Id, sagitta = 0, thickness = 0, side: 1 | -1 = 1): Wall {
  const wall: Wall = { id: newId('w'), a, b, thickness, side, measured: null, label: emptyWallLabel() };
  if (sagitta) wall.sagitta = sagitta;
  return wall;
}

/** Kruhová stěna: jeden roh (střed) a poloměr. */
export function createCircleWall(center: Id, radius: number): Wall {
  return { id: newId('w'), a: center, b: center, thickness: 0, side: 1, measured: null, label: emptyWallLabel(), radius };
}

/** Výchozí zárubeň dveří: 50 mm na každé straně, hloubka 100 mm. */
export const DOOR_FRAME = { width: 50, depth: 100 };

/** Výchozí rám okna: 50 mm na každé straně, hloubka 50 mm. */
export const WINDOW_FRAME = { width: 50, depth: 50 };

/** Okno nebo francouzské okno (stejná značka). */
export const isWindowKind = (kind: OpeningKind): boolean => kind === 'window' || kind === 'french';

export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number; depth: number; prefix: string; label: string }> = {
  door: { width: 800, height: 1970, sill: 0, depth: 0, prefix: 'D', label: 'Dveře' },
  window: { width: 1200, height: 1500, sill: 900, depth: 0, prefix: 'O', label: 'Okno' },
  french: { width: 900, height: 2200, sill: 50, depth: 0, prefix: 'O', label: 'Francouzské okno' },
  opening: { width: 900, height: 2100, sill: 0, depth: 0, prefix: 'P', label: 'Otvor' },
  niche: { width: 600, height: 1200, sill: 900, depth: 200, prefix: 'N', label: 'Nika' }
};

/** Další volné číslo otvoru daného druhu v podlaží (D1, D2…). */
export function nextOpeningNumber(floor: Floor, kind: OpeningKind): string {
  const prefix = OPENING_DEFAULTS[kind].prefix;
  let max = 0;
  for (const op of Object.values(floor.openings)) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(op.number);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export function createOpening(floor: Floor, wallId: Id, kind: OpeningKind, fields: Partial<Opening> = {}): Opening {
  const d = OPENING_DEFAULTS[kind];
  return {
    id: newId('op'),
    wallId,
    kind,
    number: nextOpeningNumber(floor, kind),
    width: d.width,
    height: d.height,
    sill: d.sill,
    depth: d.depth,
    offset: 300,
    ref: 'a',
    hinge: 'a',
    swing: 1,
    note: '',
    ...(kind === 'door' ? { frame: { ...DOOR_FRAME } } : isWindowKind(kind) ? { frame: { ...WINDOW_FRAME } } : {}),
    ...fields
  };
}

/** Další volné číslo místnosti v podlaží (101, 102… podle pořadí podlaží se doplní později). */
export function createRoom(floor: Floor, x: number, y: number): Room {
  const count = Object.keys(floor.rooms).length;
  return {
    id: newId('rm'),
    x: Math.round(x),
    y: Math.round(y),
    number: String(count + 1).padStart(2, '0'),
    name: '',
    heights: [{ value: 2700, note: '' }],
    note: ''
  };
}

/** Nový text na výkresu, výchozí výška písma 100 mm (= velikost „Střední“). */
export function createText(x: number, y: number): TextNote {
  return { id: newId('tx'), x: Math.round(x), y: Math.round(y), text: 'Text', size: 100, angle: 0 };
}
