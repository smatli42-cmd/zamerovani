/**
 * Datový model aplikace.
 *
 * Pravidla:
 * - Všechny rozměry a souřadnice jsou v milimetrech (osa Y míří dolů jako na obrazovce).
 * - Prvky jsou uložené v objektech podle ID (rychlé dohledání, snadné odkazy).
 * - Model je čistá data (žádné funkce, žádné odkazy na plátno) – dá se uložit jako JSON.
 * - Při změně struktury zvýšit SCHEMA_VERSION a doplnit migraci v persistence/migrate.ts.
 */

import type { DimTarget } from '../core/dimLock';

export const SCHEMA_VERSION = 26;

export type Id = string;

export interface Pt {
  x: number;
  y: number;
}

/** Roh / koncový bod stěny. */
export interface Node extends Pt {
  id: Id;
  /**
   * Roh leží na rovné stěně `host` (T-napojení, ne její konec): průběžná stěna se nedělí a zůstává v celku,
   * napojená stěna ji sleduje při posunu (core/hosting.ts). Chybí = obyčejný roh.
   */
  host?: Id;
  /**
   * Roh napojený na LÍC průběžné stěny (ne na její osu): strana líce podél normal(a→b) průběžné stěny
   * (1 / −1, poloha = `faceOffset`). Jen u rovné průběžné stěny s tloušťkou; chybí = roh na ose (čáře) stěny.
   * Napojená stěna pak začíná na líci (její délka je viditelná délka), tělo se napojí jako u T na osu.
   */
  hostFace?: 1 | -1;
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
  /**
   * Osa (referenční čára a→b): chybí = líc (tělo na straně `side`), 'center' = střed tloušťky
   * (tělo na obě strany po polovině; `side` se pamatuje pro návrat na líc). B1, B4, B10.
   */
  axis?: 'center';
  /** Konec A / B se nenapojuje na ostatní stěny v rohu (má vlastní čelo); chybí = napojuje se. */
  noJoinA?: true;
  noJoinB?: true;
  /**
   * Zastaralé (do 2026-11-14 „změřeno × náčrt“): pojem byl zrušen, nahradil ho zámek kót (`Floor.dimLocks`).
   * Ve starých datech může zůstat, aplikace ho nečte ani nezapisuje.
   */
  measured?: number | null;
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
  /** Odsazení zárubně / rámu od vnitřního líce (líc A) = hloubka vnitřního ostění. */
  depth: number;
  left: number;
  right: number;
  top: number;
  /**
   * Ostění z vnitřního líce (líc A, čára stěny) / z vnějšího líce (líc B). Vypnutá strana má okraj stěny rovně
   * až k zárubni / rámu (otvor v tom líci je o `left` + `right` užší). Obě vypnuté = `reveal` chybí. Od verze 12.
   */
  inner: boolean;
  outer: boolean;
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
/** Styl čáry; `dashdot2` = čerchovaná se dvěma tečkami (překlad, prvky nad rovinou řezu – KRESLENI-PREKLADU.md). */
export type LineStyle = 'solid' | 'dashed' | 'dashdot' | 'dashdot2';

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

/** Bod obrysu výstupku v souřadnicích stěny: `u` = mm podél stěny od rohu A, `v` = mm kolmo od líce (kladně ven od těla). */
export interface ProfilePt {
  u: number;
  v: number;
  /** Úsek k dalšímu bodu je oblouk: vzepětí v mm (znaménko jako `Wall.sagitta`, počítáno v souřadnicích u, v); chybí = rovný. */
  s?: number;
}

/**
 * Výstupek / vybrání stěny (přizdívka, pilastr, výklenek – KATALOG-STEN.md, sekce I). Samostatný prvek s odkazem
 * na rovnou stěnu s tloušťkou; stěna zůstává celá. Obrys je v souřadnicích stěny, takže se stěnou cestuje
 * (posun, otočení, prodloužení) a u protějšího líce sleduje změnu tloušťky.
 */
export interface Protrusion {
  id: Id;
  wallId: Id;
  /** Líc, ke kterému patří: 1 = líc na straně normal(a→b), −1 = na opačné straně (jako `bodyRange`). */
  side: 1 | -1;
  /** `add` = výstupek (ven od těla), `subtract` = vybrání (do těla). */
  mode: 'add' | 'subtract';
  /** Otevřený obrys od jednoho konce na líci k druhému (první a poslední bod mají v = 0). */
  pts: ProfilePt[];
  /** Výška (mm); chybí = neurčeno (jako stěna). */
  height?: number;
  name: string;
  material: string;
  note: string;
}

/** Bod obrysu výstupku přes roh: p = X + s·e1 + t·e2 (X = průsečík líců v rohu, e1 / e2 podél stěn od rohu). */
export interface CornerPt {
  s: number;
  t: number;
}

/**
 * Výstupek přes roh dvou rovných stěn (KATALOG-STEN.md I1.11, rozhodnutí uživatele 2026-11-15): vnitřní i vnější roh,
 * drží se rohu – obrys je v souřadnicích rohu (průsečík líců `sides` obou stěn a směry stěn od rohu), takže při posunu
 * stěn nebo změně tloušťky zůstane přilepený na lících obou stěn se stejnými rozměry.
 */
export interface CornerProtrusion {
  id: Id;
  /** Společný roh obou stěn. */
  node: Id;
  /** Stěny rohu; obrys začíná na líci první a končí na líci druhé. */
  walls: [Id, Id];
  /** Líce obou stěn, které se v rohu potkávají (1 / −1 vůči normal(a→b) dané stěny, jako `Protrusion.side`). */
  sides: [1 | -1, 1 | -1];
  /**
   * Směr od rohu podél stěny vůči jejímu a→b (1 = k b, −1 = k a). Rozhoduje jen u průběžné stěny, na kterou je roh
   * napojený doprostřed (T bez dělení); u stěny, která v rohu končí, se směr bere od jejího konce.
   */
  dirs: [1 | -1, 1 | -1];
  /** `subtract` = vybrání v rohu (obrys vede tělem stěn, plocha se z nich vyřízne; od verze 19); chybí = výstupek. */
  mode?: 'subtract';
  /** Otevřený obrys od líce první stěny (t = 0) k líci druhé (s = 0); roh X uzavírá plochu. */
  pts: CornerPt[];
  /** Výška (mm); chybí = neurčeno. */
  height?: number;
  name: string;
  material: string;
  note: string;
}

/**
 * Bod obrysu výstupku na konci stěny: s = mm od čela podél stěny dovnitř (záporně za čelem), v = mm kolmo ven od líce
 * `f` (0 = líc, na kterém obrys začíná; 1 = protější líc). Body vztažené k protějšímu líci jedou s ním při změně tloušťky.
 */
export interface EndPt {
  s: number;
  v: number;
  f: 0 | 1;
}

/**
 * Výstupek přes volný konec stěny (KATALOG-STEN.md I1.11, rozhodnutí uživatele 2026-11-15): obrys z líce kolem čela
 * na protější líc; drží se konce stěny (souřadnice od čela). Když konec přestane být volný, jen se nekreslí.
 */
export interface EndProtrusion {
  id: Id;
  wallId: Id;
  /** Konec stěny, kolem jehož čela obrys vede. */
  end: 'a' | 'b';
  /** Líc, na kterém obrys začíná (1 / −1 vůči normal(a→b), jako `Protrusion.side`); končí na protějším. */
  side: 1 | -1;
  pts: EndPt[];
  height?: number;
  name: string;
  material: string;
  note: string;
}

/** Šrafa uzavřeného tvaru (bez nastavení úhlu a rozteče – rozhodnutí uživatele 2026-11-17). */
export type HatchKind = 'diag' | 'cross' | 'dots' | 'solid';

/** Základní barvy kresby (čára i šrafa). */
export type DrawColor = 'black' | 'gray' | 'red' | 'blue' | 'green';

/** Bod kresby; `s` = vzepětí úseku k dalšímu bodu (znaménko jako `Wall.sagitta`), chybí = rovný úsek. */
export interface DrawPt {
  x: number;
  y: number;
  s?: number;
}

/**
 * Kresba = čistě grafický prvek (KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md): samostatná čára, obdélník, kruh, oblouk,
 * dvojitá čára. Nikdy není stěnou ani výstupkem, nevyplňuje se šedou, s ničím není svázaná (přichycení při
 * kreslení je jen pomůcka). Geometrie a všechna pravidla kresby: `core/drawing.ts`.
 */
export interface Drawing {
  id: Id;
  /** Čím vznikla (název v panelu, chování úchytů): `line` lomená čára, `rect`, `circle`, `arc`, `double` dvojitá čára. */
  shape: 'line' | 'rect' | 'circle' | 'arc' | 'double';
  /** Body: lomená čára / obdélník = vrcholy; oblouk = 2 body; kruh = [střed]; dvojitá čára = 2 body první čáry. */
  pts: DrawPt[];
  /** Lomená čára se vrací do prvního bodu (obdélník je uzavřený vždy). */
  closed?: true;
  /** Kruh: poloměr (mm). */
  r?: number;
  /** Dvojitá čára: vzdálenost čar (mm), strana druhé čáry vůči směru pts[0]→pts[1] (1 = normal), uzavřené konce. */
  width?: number;
  side?: 1 | -1;
  closedEnds?: true;
  /** Styl a barva čáry; chybí = plná, černá. */
  style?: LineStyle;
  color?: DrawColor;
  /** Šrafa (jen uzavřený tvar); chybí = bez šrafy. Barva šrafy; chybí = barva čáry. */
  hatch?: HatchKind;
  hatchColor?: DrawColor;
}

/**
 * Konec volné kóty (core/dimRefs.ts) – bod nebo hrana, ke které se kóta přichytila a se kterou jede:
 * - body: roh stěny, bod kresby (vrchol `i`, u kruhu střed), pevný bod výkresu,
 * - hrany: líc rovné stěny (`side` 1 / −1 jako `Protrusion.side`, 0 = čára stěny bez tloušťky; `at` = mm od rohu A
 *   po ose – místo, kde kóta na hranu dosedá), úsek `i` čáry kresby (`at` = mm od bodu `i`), okraj otvoru ve stěně
 *   (`at` = mm kolmo od osy stěny).
 * Kóta mezi rovnoběžnými hranami / hranou a bodem měří kolmou vzdálenost (jako zarovnaná kóta v CAD).
 */
export type DimEnd =
  | { node: Id }
  | { drawing: Id; i: number }
  | { x: number; y: number }
  | { wall: Id; side: 1 | -1 | 0; at: number }
  | { seg: Id; i: number; at: number }
  | { opening: Id; edge: 'start' | 'end'; at: number }
  /** Rovný úsek `i` obrysu výstupku / vybrání (na stěně, v rohu, na konci stěny – id se hledá ve všech třech); `at` = mm od bodu `i`. */
  | { prot: Id; i: number; at: number }
  /**
   * Bod na oblouku (rozhodnutí uživatele 2026-11-19): líc obloukové stěny (`side` jako u líce rovné stěny), `at` = mm
   * po oblouku osy od rohu A. Měří se k bodu (od rovné hrany kolmo).
   */
  | { arcWall: Id; side: 1 | -1 | 0; at: number }
  /** Bod na obloukovém úseku `i` kresby (oblouk, oblouk v lomené čáře, kruh = úseky 0 a 1), `at` = mm po oblouku od jeho začátku. */
  | { arcSeg: Id; i: number; at: number }
  /** Střed oblouku: obloukové stěny (id stěny, bez `i`) nebo obloukového úseku `i` kresby. */
  | { center: Id; i?: number }
  /**
   * Bod schodiště (odstup od stěny): roh `i` části `part` – `f<k>` rameno k (rohy jako `flightRect`, u oblouku bod 4 =
   * střed), `l<k>` podesta k, `o` ruční obrys (core/stairRefs.ts).
   */
  | { stair: Id; part: string; i: number }
  /** Rovná hrana `i` části schodiště (od bodu i k bodu i + 1), `at` = mm od bodu `i`. */
  | { stairSeg: Id; part: string; i: number; at: number };

/**
 * Volná kóta mezi dvěma body (POZADAVKY.md 3, rozhodnutí uživatele 2026-11-18: řídicí – zadaná délka posune zvolený
 * konec, odsazení tažením; i úhlopříčka místnosti a kóta kresby). Hodnota se nepamatuje, počítá se z bodů.
 */
export interface FreeDim {
  id: Id;
  a: DimEnd;
  b: DimEnd;
  /** Odsazení kótovací čáry od spojnice bodů (mm, kladně na stranu normal(a→b)). */
  offset: number;
}

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
   * Napojení na předchozí rameno přes podestu (L / U vlevo / vpravo); u 1. ramene chybí.
   * `free` = rameno nakreslené ručně – stojí, kde je, podesta před ním má vlastní tvar.
   */
  turn?: 'left' | 'right' | 'u-left' | 'u-right' | 'free';
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

/** Podlaží = jeden půdorys. */
export interface Floor {
  id: Id;
  name: string;
  nodes: Record<Id, Node>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
  texts: Record<Id, TextNote>;
  /** Výstupky a vybrání stěn (od verze 10; chybí = žádné). */
  protrusions?: Record<Id, Protrusion>;
  /** Výstupky přes roh dvou stěn (I1.11, od verze 15; chybí = žádné). */
  cornerProtrusions?: Record<Id, CornerProtrusion>;
  /** Výstupky přes volný konec stěny (I1.11, od verze 16; chybí = žádné). */
  endProtrusions?: Record<Id, EndProtrusion>;
  /** Kresba – grafické prvky (čáry, tvary, dvojité čáry; od verze 17; chybí = žádné). */
  drawings?: Record<Id, Drawing>;
  /** Schodiště – 2D značka v půdorysu (od verze 25; chybí = žádné; core/stairs.ts). */
  stairs?: Record<Id, Stair>;
  /** Volné kóty mezi dvěma body (od verze 20; chybí = žádné). */
  dims?: Record<Id, FreeDim>;
  /**
   * Zamčené kóty (KOTY-ZAMEK-EXPORT.md, A): klíč = `dimKey(kóta)`, hodnota = popis kóty. Chybí = vše odemčeno.
   * Zamčená kóta drží hodnotu – úprava, která by ji změnila, se neprovede (core/dimLock.ts).
   */
  dimLocks?: Record<string, DimTarget>;
  /**
   * Poloha kót posunutých tažením za číslo (od verze 23; chybí = výchozí poloha, core/dimPlace.ts).
   * Klíč = řada kót (`off`) nebo jedna kóta (`along`, posun čísla podél kótovací čáry).
   */
  dimPlace?: Record<string, DimPlace>;
}

/**
 * Posun kóty proti výchozí poloze (mm): `off` = kolmo na kótu (kladně od prvku ven, celá řada),
 * `along` = číslo podél kótovací čáry (jen tato kóta). `owner` = kóta, se kterou záznam zaniká.
 */
export interface DimPlace {
  off?: number;
  along?: number;
  owner: DimTarget;
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
