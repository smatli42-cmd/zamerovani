/**
 * Formát listu exportu (papír, okraje, pruh razítka) a měřítko – bez knihovny PDF, aby je okno Export mohlo
 * použít, aniž by se knihovna načetla do aplikace dřív, než je potřeba.
 */
import type { Rect } from '../core/rect';

export type Paper = 'A4' | 'A3';
const PAPER: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] };

/** Měřítka listu (1 : n) od nejpodrobnějšího; automaticky se vezme nejpodrobnější, do kterého se kresba vejde. */
export const SCALES = [20, 25, 50, 100, 200, 500] as const;

/** Okraj papíru a výška pruhu s razítkem (mm). */
export const MARGIN = 10;
export const STAMP_H = 30;
/**
 * Místo pro kóty kolem kresby (mm na papíře): v PDF jsou ve výchozím stavu všechny kóty – řady za vnějším lícem
 * otvory 6,5 mm, napojení + 7,5 mm, délka + 9,5 mm a polovina čísla.
 */
export const DIM_ROOM = 26;
/** 1 px kreslicích funkcí = 0,25 mm papíru (písmo kót 12 px ≈ 3 mm). */
export const MM_PER_PX = 0.25;

export interface SheetFormat {
  paper: Paper;
  landscape: boolean;
}

/** Rozměr papíru (mm) [šířka, výška]. */
export function paperSize(f: SheetFormat): [number, number] {
  const [a, b] = PAPER[f.paper];
  return f.landscape ? [b, a] : [a, b];
}

/** Šířka razítka (mm) – razítko leží v pravém dolním rohu. */
export const STAMP_W = 120;

/** Kreslicí plocha listu bez razítka (mm od levého horního rohu papíru): nad pruhem razítka (výpisy, poznámky). */
export function drawArea(f: SheetFormat): Rect {
  const [w, h] = paperSize(f);
  return { x1: MARGIN, y1: MARGIN, x2: w - MARGIN, y2: h - MARGIN - STAMP_H };
}

/**
 * Kam se půdorys v měřítku 1 : n vejde (s místem pro kóty): nad razítko (celá šířka), nebo vedle razítka
 * (celá výška) – razítko zabírá jen pravý dolní roh (přání uživatele 2026-11-23: půdorys byl zbytečně malý).
 * null = nevejde se.
 */
export function planRegion(bounds: Rect, f: SheetFormat, n: number): Rect | null {
  const [pw, ph] = paperSize(f);
  const w = Math.max(1, bounds.x2 - bounds.x1) / n + DIM_ROOM * 2;
  const h = Math.max(1, bounds.y2 - bounds.y1) / n + DIM_ROOM * 2;
  const above: Rect = { x1: MARGIN, y1: MARGIN, x2: pw - MARGIN, y2: ph - MARGIN - STAMP_H };
  const beside: Rect = { x1: MARGIN, y1: MARGIN, x2: pw - MARGIN - STAMP_W - 2, y2: ph - MARGIN };
  for (const r of [above, beside]) if (w <= r.x2 - r.x1 && h <= r.y2 - r.y1) return r;
  return null;
}

/** Měřítko listu: nejpodrobnější, do kterého se rozsah vejde (s místem pro kóty). */
export function autoScale(bounds: Rect, f: SheetFormat): number {
  for (const n of SCALES) if (planRegion(bounds, f, n)) return n;
  return SCALES[SCALES.length - 1]!;
}

/** Vejde se rozsah v měřítku 1 : n na list (s místem pro kóty)? */
export function autoFits(bounds: Rect, f: SheetFormat, n: number): boolean {
  return !!planRegion(bounds, f, n);
}
