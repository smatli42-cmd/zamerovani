/**
 * Společné pro panely vlastností.
 */
import type { LineStyle } from '../../model/types';
import { store } from '../../store/store';

export const close = () => store.set({ selection: null });

export const LINE_STYLES: { v: LineStyle; label: string }[] = [
  { v: 'solid', label: 'Plná' },
  { v: 'dashed', label: 'Čárkovaná' },
  { v: 'dashdot', label: 'Čerchovaná' }
];

/** Styly čáry kresby (navíc čerchovaná se dvěma tečkami – překlad, prvky nad rovinou řezu). */
export const DRAW_LINE_STYLES: { v: LineStyle; label: string }[] = [...LINE_STYLES, { v: 'dashdot2', label: 'Čerch. 2 tečky' }];
