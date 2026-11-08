/**
 * Datový model aplikace.
 *
 * Pravidla:
 * - Všechny rozměry a souřadnice jsou v milimetrech (osa Y míří dolů jako na obrazovce).
 * - Prvky jsou uložené v objektech podle ID (rychlé dohledání, snadné odkazy).
 * - Model je čistá data (žádné funkce, žádné odkazy na plátno) – dá se uložit jako JSON.
 * - Při změně struktury zvýšit SCHEMA_VERSION a doplnit migraci v persistence/migrate.ts.
 */

export const SCHEMA_VERSION = 4;

export type Id = string;

export interface Pt {
  x: number;
  y: number;
}

/** Roh / koncový bod stěny. */
export interface Node extends Pt {
  id: Id;
}

export type WallType = 'obvodova' | 'nosna' | 'pricka' | 'sdk' | 'neovereno';

/** Textový popisek stěny – tloušťka se graficky nekreslí, jen se uvádí. */
export interface WallLabel {
  thickness: number | null;
  type: WallType | null;
  material: string;
  note: string;
}

/** Stěna = čára vnitřního líce mezi dvěma rohy. */
export interface Wall {
  id: Id;
  a: Id;
  b: Id;
  /** Změřená délka v mm, null = jen načrtnuto. */
  measured: number | null;
  label: WallLabel;
  /** Vzepětí oblouku v mm (znaménko = strana vyklenutí od směru a→b); chybí / 0 = rovná stěna. */
  sagitta?: number;
  /** Styl čáry; chybí = plná. */
  style?: LineStyle;
  /** Kruh: poloměr v mm. Kruhová stěna má a === b = střed kruhu. */
  radius?: number;
}

export type OpeningKind = 'door' | 'window' | 'opening' | 'niche';

/** Otvor ve stěně (dveře, okno, průchod, nika). */
export interface Opening {
  id: Id;
  wallId: Id;
  kind: OpeningKind;
  /** Číslo otvoru pro výpis (např. "D1", "O3"). */
  number: string;
  width: number;
  height: number;
  /** Výška parapetu (u dveří 0). */
  sill: number;
  /** Hloubka niky (u ostatních 0). */
  depth: number;
  /** Odstup od rohu, ke kterému se měří (ref). */
  offset: number;
  ref: 'a' | 'b';
  /** Strana pantů dveří (u kterého ostění). */
  hinge: 'a' | 'b';
  /** Na kterou stranu stěny se dveře otevírají / nika ustupuje. */
  swing: 1 | -1;
  note: string;
}

export interface RoomHeight {
  value: number;
  note: string;
}

/** Místnost – zatím štítek umístěný v půdorysu. */
export interface Room {
  id: Id;
  x: number;
  y: number;
  number: string;
  name: string;
  heights: RoomHeight[];
  note: string;
}

/** Styl čáry stěny (výchozí plná; čárkovaná / čerchovaná např. pro překlad nebo konstrukci nad řezem). */
export type LineStyle = 'solid' | 'dashed' | 'dashdot';

/** Podlaží = jeden půdorys. */
export interface Floor {
  id: Id;
  name: string;
  nodes: Record<Id, Node>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
}

/** Projekt = jedna zakázka (budova). */
export interface Project {
  schema: number;
  id: Id;
  name: string;
  address: string;
  surveyor: string;
  /** Datum zaměření ve formátu RRRR-MM-DD. */
  surveyDate: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  floors: Floor[];
}

/** Krátký přehled projektu pro seznam projektů (bez výkresů). */
export interface ProjectSummary {
  id: Id;
  name: string;
  address: string;
  surveyDate: string;
  updatedAt: number;
  floorCount: number;
}
