/**
 * Obrysy ikon obsahu (mřížka 24 px), které se kreslí i do plátna (štítek značky – canvas/drawMarks.ts) –
 * jediné místo obrysů sdílené s ui/icons.tsx (fotoaparát, pero, poznámka). `base` tmavě, `acc` zvýraznění.
 */
export interface IconOutline {
  base: string;
  acc: string;
  /** Kružnice zvýraznění [cx, cy, r]. */
  circle?: [number, number, number];
}

export const CONTENT_ICONS: Record<'photo' | 'sketch' | 'text', IconOutline> = {
  photo: { base: 'M3 8h4.5L9 5.5h6L16.5 8H21v12H3z', acc: '', circle: [12, 14, 3.5] },
  sketch: { base: 'M15.5 3.5l5 5L10 19l-5 1 1-5z', acc: 'M13 6l5 5M3 22c3 0 4-2 7-2' },
  text: { base: 'M5.5 3.5h9l4 4v13h-13z', acc: 'M8.5 11h7M8.5 14.5h7M8.5 18h4' }
};
