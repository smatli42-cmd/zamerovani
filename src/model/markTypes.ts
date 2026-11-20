/**
 * Značka v půdorysu (ZNACKY-POZNAMKY-DETAILY.md): jedna značka nahrazuje dřívější značku detailu, značku fotky
 * a poznámkový špendlík. Pravidla v core/marks.ts.
 */
import type { Id, Pt } from './types';

/** Styl směru pohledu: kužel (výchozí) nebo šipka. */
export type MarkDirStyle = 'cone' | 'arrow';

/** Volitelný směr pohledu značky. */
export interface MarkDir {
  on: boolean;
  /** Úhel ve stupních (0 = doprava, po směru hodinových ručiček, osa Y dolů jako na obrazovce). */
  angle: number;
  style: MarkDirStyle;
}

/** Tah perem nebo přímka ve skice (souřadnice skici – px při zoomu 100 %). */
export interface SketchStroke {
  mode: 'free' | 'line';
  color: string;
  width: number;
  pts: Pt[];
}

/** Textový popisek ve skice. */
export interface SketchLabel {
  x: number;
  y: number;
  text: string;
  color: string;
}

/** Kóta ve skice: čára s libovolným textem (ne měřená). */
export interface SketchDim {
  a: Pt;
  b: Pt;
  text: string;
}

/**
 * Strana obsahu značky: skica (krok A). Seznam stran připravuje přidání fotek bez migrace (krok B – fotka jako
 * podklad strany, kresba nad ní).
 */
export interface MarkPage {
  id: Id;
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
