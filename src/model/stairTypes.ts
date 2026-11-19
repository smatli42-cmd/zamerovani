/**
 * Datový model schodiště (oddělen z model/types.ts; pravidla v core/stairs.ts).
 */
import type { Id, Pt } from './types';

/**
 * Rameno schodiště (2D značka, rozhodnutí uživatele 2026-11-19 – žádné 3D): obdélník kolem osy `a` → `b`
 * (`a` = první stupeň, `b` = výstup), `width` = šířka napříč osou (půlka na každou stranu).
 * `steps` = počet stoupání v rameni; nášlapů je `steps − 1` (poslední výstup je podesta / podlaha).
 */
export interface StairFlight {
  id: Id;
  a: Pt;
  b: Pt;
  width: number;
  steps: number;
  /**
   * Napojení na předchozí rameno přes podestu (L / U vlevo / vpravo, `straight` = rovně za podestou); u 1. ramene chybí.
   * `free` = rameno nakreslené ručně – stojí, kde je, podesta před ním má vlastní tvar.
   * `tee` = atypické T: rameno vychází z téže podesty jako předchozí rameno (L), na opačnou stranu; je vždy poslední.
   */
  turn?: 'left' | 'right' | 'u-left' | 'u-right' | 'straight' | 'free' | 'tee';
  /** Hloubka podesty před ramenem (mm, podél předchozího ramene); chybí = šířka ramene. */
  depth?: number;
  /**
   * Rameno po oblouku (obloukové i točité schodiště): střed oblouku osy. Osa vede od `a` (poloměr = |a − center|)
   * o úhel `sweep`; `b` = konec osy (dopočítá se).
   */
  center?: Pt;
  /** Úhel oblouku osy ve stupních se znaménkem (kladně = po směru hodinových ručiček na výkresu). */
  sweep?: number;
}

/** Podesta schodiště: obrys (mnohoúhelník). */
export interface StairLanding {
  id: Id;
  pts: Pt[];
  /** Místo podesty zabíhavé stupně (počet stupňů v rohu L / v otočce U). */
  winders?: number;
}

/**
 * Schodiště = ramena a podesty (L a U vznikají přidáním podesty a dalšího ramene). Ukládají se jen vstupy;
 * šířka a výška stupně se dopočítávají (core/stairs.ts). Ramena jsou v pořadí výstupu (směr = od 1. ramene).
 * `outline` = ruční obrys (zabíhavé, točité…): obrys schodiště, osa výstupu = `flights[0]` (šířka se nepoužije).
 */
export interface Stair {
  id: Id;
  /** Vrstva prvku (Project.layers, core/layers.ts); chybí = výchozí vrstva druhu. */
  layerId?: Id;
  flights: StairFlight[];
  landings: StairLanding[];
  /** Celková výška schodiště (mm); chybí = nezadaná (výška stupně se nepočítá). */
  height?: number;
  /** Ruční obrys schodiště (mm). */
  outline?: Pt[];
  /** Ruční obrys: čáry nášlapů se nekreslí automaticky (kreslí se ručně kresbou). */
  manualTreads?: true;
  /** Popisek „N × v/š“ se nekreslí. */
  noLabel?: true;
  /** Výstup opačným směrem (od konce posledního ramene k prvnímu); šipka se kreslí obráceně. */
  reverse?: true;
}
