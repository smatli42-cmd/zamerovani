/**
 * Značka v půdorysu (ZNACKY-POZNAMKY-DETAILY.md): jedna značka nahrazuje dřívější značku detailu, značku fotky
 * a poznámkový špendlík. Pravidla v core/marks.ts.
 */
import type { Id, LineStyle, Pt } from './types';

/** Styl směru pohledu: kužel (výchozí) nebo šipka. */
export type MarkDirStyle = 'cone' | 'arrow';

/**
 * Volitelný směr pohledu značky. Konec kužele / šipky je bod ve výkresu (mm) – při zoomu ukazuje pořád na stejné
 * místo (přání uživatele 2026-11-20); jede se značkou při posunu, otočení i kopii.
 */
export interface MarkDir {
  on: boolean;
  style: MarkDirStyle;
  /** Cíl – konec kužele / šipky ve výkresu (mm). */
  to: Pt;
}

/**
 * Prvek kresby ve skice (souřadnice skici – px při zoomu 100 %; geometrie core/sketch.ts): pero (`free`, body),
 * čára (a, b), obdélník (protější rohy), kruh (střed, bod na obvodu), oblouk (a, b, vzepětí `s`),
 * dvojitá čára (a, b, vzdálenost čar `w`).
 */
export interface SketchStroke {
  mode: 'free' | 'line' | 'rect' | 'circle' | 'arc' | 'double';
  color: string;
  /** Tloušťka v jednotkách skici (volba tloušťky × měřítko podle zoomu při vzniku, `sketchLineWidth`). */
  width: number;
  /** Druh čáry (přání uživatele 2026-11-22); chybí = plná. */
  style?: LineStyle;
  pts: Pt[];
  s?: number;
  w?: number;
}

/** Textový popisek ve skice. */
export interface SketchLabel {
  x: number;
  y: number;
  text: string;
  color: string;
  /** Měřítko velikosti (písmo, rámeček) podle zoomu při vzniku – nad fotkou stejně velké na obrazovce (krok C); chybí = 1. */
  k?: number;
}

/** Kóta ve skice: čára s libovolným textem (ne měřená). Na straně s fotkou jen orientační (core/sketch.ts `dimIsOrient`). */
export interface SketchDim {
  a: Pt;
  b: Pt;
  text: string;
  /** Měřítko velikosti (písmo, zarážky, tloušťka) podle zoomu při vzniku; chybí = 1. */
  k?: number;
}

/**
 * Fotka jako podklad strany (krok B): zmenšená fotka uložená zvlášť od dat projektu (IndexedDB `photos`,
 * persistence/photos.ts), tady jen odkaz a rozměr v px. Ve skice leží v (0, 0) v měřítku 1 jednotka = 1 px fotky.
 */
export interface MarkPhoto {
  id: Id;
  w: number;
  h: number;
}

/**
 * Strana obsahu značky: skica a volitelně fotka pod ní (kresba ve vlastní vrstvě nad fotkou – fotku i kresbu jde
 * smazat zvlášť). Seznam stran připravuje víc fotek bez migrace; UI zatím nabízí jednu stranu.
 */
export interface MarkPage {
  id: Id;
  photo?: MarkPhoto;
  strokes: SketchStroke[];
  labels: SketchLabel[];
  dims: SketchDim[];
}

export interface Mark {
  id: Id;
  /** Pořadové číslo, unikátní v celém projektu (zobrazí se s předponou `MARK_PREFIX`, např. Z3). */
  num: number;
  /** Název (může být prázdný – pak se ukáže jen číslo). */
  name: string;
  x: number;
  y: number;
  color: string;
  /** Textová poznámka (skladba, materiály…). */
  note: string;
  dir?: MarkDir;
  /** Obsah značky – zatím jedna strana se skicou. */
  pages: MarkPage[];
  /** Vrstva (core/layers.ts) – nová značka jde do Popisků. */
  layerId?: Id;
}
