/** Vzory čar (stěna, kresba, skica poznámky) – samostatně, bez závislosti na stavu aplikace. */
import type { LineStyle } from '../model/types';

/** Vzory čar pro stěnu tloušťky 3 px (s kulatými konci by se mezery slily, proto se čárkované kreslí s ostrými konci). */
export const LINE_DASH: Record<LineStyle, number[]> = {
  solid: [],
  dashed: [14, 8],
  dashdot: [18, 7, 4, 7],
  dashdot2: [18, 6, 3, 6, 3, 6]
};
