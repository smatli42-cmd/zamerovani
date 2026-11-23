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
/** Místo pro kóty kolem kresby (mm na papíře). */
const DIM_ROOM = 18;
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

/** Kreslicí plocha listu (mm od levého horního rohu papíru): nad pruhem razítka. */
export function drawArea(f: SheetFormat): Rect {
  const [w, h] = paperSize(f);
  return { x1: MARGIN, y1: MARGIN, x2: w - MARGIN, y2: h - MARGIN - STAMP_H };
}

/** Měřítko listu: zadané, nebo nejpodrobnější, do kterého se rozsah vejde (s místem pro kóty). */
export function autoScale(bounds: Rect, f: SheetFormat): number {
  const a = drawArea(f);
  const aw = a.x2 - a.x1 - DIM_ROOM * 2;
  const ah = a.y2 - a.y1 - DIM_ROOM * 2;
  const w = Math.max(1, bounds.x2 - bounds.x1);
  const h = Math.max(1, bounds.y2 - bounds.y1);
  for (const n of SCALES) if (w / n <= aw && h / n <= ah) return n;
  return SCALES[SCALES.length - 1]!;
}

/** Vejde se rozsah v měřítku 1 : n na list (s místem pro kóty)? */
export function autoFits(bounds: Rect, f: SheetFormat, n: number): boolean {
  const a = drawArea(f);
  return (bounds.x2 - bounds.x1) / n <= a.x2 - a.x1 - DIM_ROOM * 2 && (bounds.y2 - bounds.y1) / n <= a.y2 - a.y1 - DIM_ROOM * 2;
}

