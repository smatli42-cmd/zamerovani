/**
 * Sada ikon aplikace (návrh ovládání navrh-ovladani/index.html, rozhodnutí uživatele 2026-11-21): čárové ikony
 * na mřížce 24 px, tloušťka 1,8, zaoblené konce, barva = `currentColor` (lišta, karta nástroje, skupina).
 * Stavební prvky jako jejich značka v půdorysu. JEDINÉ místo kreslení ikon – emoji se v ovládání nepoužívají.
 */
import type { JSX } from 'preact';

const dash = (d: string, a = '2 2.2') => <path d={d} stroke-dasharray={a} />;

const P = {
  // nástroje
  select: <path d="M5.5 3.5l12.5 7-5.4 1.5 3.2 5.8-2.3 1.3-3.2-5.8L6.5 17z" />,
  pan: <path d="M8 12.5V6.5a1.5 1.5 0 0 1 3 0v5M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.6 0-4-1.4-5.4-3.6L4 13.6a1.5 1.5 0 0 1 2.5-1.6L8 14" />,
  wall: <path d="M2.5 8h19M2.5 16h19M5 16l4-8M10 16l4-8M15 16l4-8" />,
  bump: (
    <>
      <path d="M2.5 17h19M2.5 11h5V6.5h9V11h5" />
      {dash('M7.5 11h9', '1.6 2.4')}
    </>
  ),
  trim: (
    <>
      <path d="M5 21V5h16M9 21V9h12" />
      <circle cx="5" cy="5" r="1.6" />
    </>
  ),
  split: (
    <>
      <path d="M2.5 8h7M14.5 8h7M2.5 16h7M14.5 16h7M9.5 8v8M14.5 8v8" />
      {dash('M12 3.5v17')}
    </>
  ),
  door: (
    <>
      <path d="M2 19h4M18 19h4M6 19V5.5M6 19h12" />
      {dash('M6 5.5A13.5 13.5 0 0 1 18.5 19', '2 2')}
    </>
  ),
  window: <path d="M2 8.5h4M2 15.5h4M18 8.5h4M18 15.5h4M6 8.5h12v7H6zM6 12h12" />,
  opening: (
    <>
      <path d="M2 8.5h5.5v7H2M22 8.5h-5.5v7H22" />
      {dash('M9.5 12h5', '1.5 2')}
    </>
  ),
  niche: <path d="M2.5 7.5h19M2.5 16.5h5.5v-4.5h8v4.5h5.5" />,
  room: <path d="M3.5 3.5h17v17h-17zM7.5 9.5h9M7.5 13h6M7.5 16.5h4" />,
  mark: <path d="M4 3.5h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4zM8 7.5h6M8 11.5l-3.5 9M12 11.5l3.5 9" />,
  dim: <path d="M3 14.5h18M3 10v9M21 10v9M2 16.5l2-4M20 16.5l2-4M9 8.5h6" />,
  text: <path d="M5.5 6V4.5h13V6M12 4.5v15M9 19.5h6" />,
  leader: <path d="M4 20l8.5-8.5h8.5M4 20l1.2-4.6M4 20l4.6-1.2M13.5 7.5h7" />,
  line: (
    <>
      <path d="M6 18L18 6" />
      <circle cx="5" cy="19" r="1.8" />
      <circle cx="19" cy="5" r="1.8" />
    </>
  ),
  double: <path d="M3.5 15.5L15.5 3.5M8.5 20.5l12-12" />,
  rect: <path d="M3.5 6h17v12h-17z" />,
  circle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  arc: (
    <>
      <path d="M4 18a8.5 8.5 0 0 1 16 0" />
      <circle cx="4" cy="18" r="1.6" />
      <circle cx="20" cy="18" r="1.6" />
    </>
  ),
  cut: (
    <>
      <path d="M3.5 20.5l17-17M3.5 3.5l7.5 7.5" />
      {dash('M13 13l7.5 7.5', '1.6 2.4')}
    </>
  ),
  pen: <path d="M15 4.5l4.5 4.5L9 19.5H4.5V15zM12.5 7l4.5 4.5" />,
  eraser: <path d="M9 20h11M5.2 14.8l8.3-8.3a2 2 0 0 1 2.8 0l2.5 2.5a2 2 0 0 1 0 2.8L12 18.6 9.5 20H8zM9 11l5 5" />,
  stair: <path d="M6 3.5h12v17H6zM6 8h12M6 12.5h12M6 17h12M12 18.5V5.5M10 7.5l2-2 2 2" />,
  items: (
    <>
      <path d="M4 9.5h16v10H4zM7 9.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3.5" />
      <circle cx="12" cy="14.5" r="2.4" />
    </>
  ),
  paste: <path d="M8.5 4.5h7v3h-7zM8.5 6H5.5v14.5h13V6h-3M9 13.5h6M12 10.5v6" />,
  // akce
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  layers: <path d="M12 3.5l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9z" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  backup: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 17.5v3h16v-3" />,
  export: <path d="M13.5 3.5H6v17h12V8zM13.5 3.5V8H18M9 14h6M12.5 11.5L15 14l-2.5 2.5" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </>
  ),
  back: <path d="M14.5 5l-7 7 7 7" />,
  floor: <path d="M5 20.5V4h14v16.5M3 20.5h18M5 12h14M9 8h2M13 8h2M9 16h2M13 16h2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M15 4.5l4.5 4.5L9 19.5H4.5V15z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5v.5" />
    </>
  ),
  lock: <path d="M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  copy: <path d="M8.5 8.5h11v11h-11zM15.5 5.5v-1h-11v11h1" />,
  trash: <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13.5h10l1-13.5M10 10.5v6M14 10.5v6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: (
    <>
      <path d="M3.5 8h4l1.5-2.5h6L16.5 8h4v11.5h-17z" />
      <circle cx="12" cy="13.5" r="3.3" />
    </>
  )
} satisfies Record<string, JSX.Element>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 24, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={`ico ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={size >= 40 ? 1.5 : size >= 28 ? 1.7 : 1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}

/** Seznam názvů ikon (test, že každý nástroj má ikonu). */
export const ICON_NAMES = Object.keys(P) as IconName[];
