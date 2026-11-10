/**
 * Datový model aplikace.
 *
 * Pravidla:
 * - Všechny rozměry a souřadnice jsou v milimetrech (osa Y míří dolů jako na obrazovce).
 * - Prvky jsou uložené v objektech podle ID (rychlé dohledání, snadné odkazy).
 * - Model je čistá data (žádné funkce, žádné odkazy na plátno) – dá se uložit jako JSON.
 * - Při změně struktury zvýšit SCHEMA_VERSION a doplnit migraci v persistence/migrate.ts.
 */

export const SCHEMA_VERSION = 7;

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

/** Textový popisek stěny (typ, materiál, poznámka). Tloušťka je přímo u stěny (`Wall.thickness`). */
export interface WallLabel {
  type: WallType | null;
  material: string;
  note: string;
}

/** Stěna = čára vnitřního líce mezi dvěma rohy; tělo stěny tloušťky `thickness` leží na straně `side`. */
export interface Wall {
  id: Id;
  a: Id;
  b: Id;
  /** Tloušťka těla stěny v mm; 0 = čára bez tloušťky (tvary: obdélník, kruh, oblouk). */
  thickness: number;
  /** Na kterou stranu od čáry líce roste tělo: 1 = ve směru normal(a→b), -1 = opačně. */
  side: 1 | -1;
  /** Strana byla přehozena ručně – automatické natočení „ven od místnosti“ ji už nemění. */
  sideLocked?: true;
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

/** `french` = francouzské okno (stejná značka jako okno, výchozí parapet 50 mm). */
export type OpeningKind = 'door' | 'window' | 'french' | 'opening' | 'niche';

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
  /**
   * Ostění (volitelné): okno/dveře jsou zasazené o `depth` dál do stěny a otvor ve stěně je o `left` a `right`
   * širší než okno samotné. `top` je jen údaj pro export a pohledy (v půdorysu se nekreslí). Vše v mm.
   */
  reveal?: Reveal;
  /** Zárubeň dveří / rám okna (volitelné): `width` na každé straně, `depth` ve směru tloušťky stěny. Dveře a okna. */
  frame?: { width: number; depth: number; /** Odsazení zárubně od líce A (jen bez ostění; chybí = uprostřed). */ offset?: number };
}

export interface Reveal {
  depth: number;
  left: number;
  right: number;
  top: number;
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

/** Samostatný text na výkresu (poznámka, popis). Poloha = střed textu, velikost = výška písma v mm. */
export interface TextNote {
  id: Id;
  x: number;
  y: number;
  /** Text, může mít víc řádků (oddělené 
). */
  text: string;
  /** Výška písma v mm výkresu. */
  size: number;
  /** Natočení ve stupních (po směru hodinových ručiček, Y míří dolů). */
  angle: number;
  /** Hrot odkazové šipky (místo, na které text ukazuje); bez něj je text bez šipky. */
  leader?: Pt;
}

/** Podlaží = jeden půdorys. */
export interface Floor {
  id: Id;
  name: string;
  nodes: Record<Id, Node>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
  texts: Record<Id, TextNote>;
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
  /** Naposledy vybraná tloušťka nových stěn (mm); chybí = výchozí 300. */
  wallThickness?: number;
  /** Vlastní předvolby tloušťky stěn přidané k výchozím (mm). */
  wallPresets?: number[];
  /** Výška oblouku (vzepětí) nově kreslených obloukových stěn (mm); chybí = 500. */
  wallArcHeight?: number;
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
