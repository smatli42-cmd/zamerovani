/**
 * Sada ikon aplikace (návrh ovládání, rozhodnutí uživatele 2026-11-21; dvoubarevný styl podle předlohy
 * uživatele): čárové ikony na mřížce 24 px – základ tmavě (`currentColor`), zvýrazněná část modře
 * (`--ic-acc`, v CSS `ui/chrome.css`: třída `a` = čára, `af` = plocha, `al` = světlá plocha). Stavební prvky
 * jako jejich značka v půdorysu. JEDINÉ místo kreslení ikon – emoji se v ovládání nepoužívají.
 */
import type { JSX } from 'preact';
import { CONTENT_ICONS } from './iconPaths';

/** Zvýrazněná čára (modře). */
const A = ({ d, dash }: { d: string; dash?: string }) => <path class="a" d={d} stroke-dasharray={dash} />;
/** Zvýrazněná plocha (modře). */
const AF = ({ d }: { d: string }) => <path class="af" d={d} />;
/** Světlá zvýrazněná plocha (průsvitně modře). */
const AL = ({ d }: { d: string }) => <path class="al" d={d} />;
/** Plný bod v barvě základu. */
const Dot = ({ x, y, r = 1.7 }: { x: number; y: number; r?: number }) => <circle class="bf" cx={x} cy={y} r={r} />;

const P = {
  // ---------------------------------------------------------------- nástroje
  select: (
    <>
      <AL d="M6.5 3.5l11.5 6.6-5 1.4 3 5.4-2.2 1.2-3-5.4L6.5 16.3z" />
      <path d="M6.5 3.5l11.5 6.6-5 1.4 3 5.4-2.2 1.2-3-5.4L6.5 16.3z" />
    </>
  ),
  pan: (
    <>
      <path d="M12 6v12M6 12h12" />
      <AF d="M12 2l3 3.6H9zM12 22l3-3.6H9zM2 12l3.6-3v6zM22 12l-3.6-3v6z" />
    </>
  ),
  wall: (
    <>
      <A d="M8 6.5l8-4M8 11.5l8-4M8 16.5l8-4M8 21.5l8-4" />
      <path d="M8 2.5v19M16 2.5v19" />
    </>
  ),
  bump: (
    <>
      <path d="M2.5 19.5h19M2.5 13.5h5M16.5 13.5h5" />
      <AL d="M7.5 13.5V7.5h9v6z" />
      <A d="M7.5 13.5V7.5h9v6" />
    </>
  ),
  trim: (
    <>
      <path d="M5 21V5h16M9.5 21V9.5H21" />
      <A d="M5 5L2.5 2.5" dash="1.5 1.8" />
      <circle class="af" cx="5" cy="5" r="2" />
    </>
  ),
  split: (
    <>
      <path d="M2.5 8h7M14.5 8h7M2.5 16h7M14.5 16h7M9.5 8v8M14.5 8v8" />
      <A d="M12 3v18" dash="2 2" />
    </>
  ),
  door: (
    <>
      <path d="M2 19.5h4.5M19 19.5h3M3.5 19.5V3.5h17v16" />
      <A d="M6.5 19.5V8" />
      <A d="M6.5 8a11.5 11.5 0 0 1 11.5 11.5" dash="2 1.8" />
    </>
  ),
  window: (
    <>
      <path d="M2 8.5h4v7H2M22 8.5h-4v7h4M6 8.5h12M6 15.5h12" />
      <A d="M6 11h12M6 13h12" />
    </>
  ),
  opening: (
    <>
      <path d="M2 8.5h5v7H2M22 8.5h-5v7h5" />
      <A d="M9 12h6M13 9.8l2.2 2.2-2.2 2.2" />
    </>
  ),
  niche: (
    <>
      <path d="M2.5 6.5h19M2.5 17.5h5.5v-5h8v5h5.5" />
      <AL d="M8 12.5h8v5H8z" />
    </>
  ),
  room: (
    <>
      <path d="M3.5 3.5h17v17h-17z" />
      <A d="M7.5 9h9M7.5 12.5h6M7.5 16h3.5" />
    </>
  ),
  mark: (
    <>
      <AL d="M8 10.5l-3.5 10h10L11 10.5z" />
      <A d="M8 10.5l-3.5 10M11 10.5l3.5 10" />
      <path d="M4 3.5h11a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4z" />
      <circle class="bf" cx="7.5" cy="7" r="1.4" />
    </>
  ),
  dim: (
    <>
      <path d="M3 20.5h18" />
      <A d="M5 6.5v14M19 6.5v14M5 10h14" />
      <AF d="M5 10l3-1.8v3.6zM19 10l-3-1.8v3.6z" />
      <path d="M9.5 15.5h5" />
    </>
  ),
  text: (
    <>
      <path d="M4.5 6V4.5h12V6M10.5 4.5v15M8 19.5h5" />
      <A d="M19.5 13v8" />
    </>
  ),
  leader: (
    <>
      <A d="M4.5 19.5l7-7h9" />
      <AF d="M3.5 20.5l1.3-5 3.7 3.7z" />
      <path d="M12.5 8.5h8M12.5 5h5" />
    </>
  ),
  line: (
    <>
      <A d="M6 18L18 6" />
      <Dot x={5} y={19} />
      <Dot x={19} y={5} />
    </>
  ),
  double: (
    <>
      <A d="M3.5 15L15 3.5M9 20.5L20.5 9" />
      <path d="M3.5 15L9 20.5M15 3.5l5.5 5.5" stroke-dasharray="1.5 2" />
    </>
  ),
  rect: (
    <>
      <A d="M4 6.5h16v11H4z" />
      <Dot x={4} y={6.5} />
      <Dot x={20} y={17.5} />
    </>
  ),
  circle: (
    <>
      <circle class="a" cx="12" cy="12" r="8.5" />
      <path d="M12 12h8.5" />
      <Dot x={12} y={12} />
    </>
  ),
  arc: (
    <>
      <A d="M4 18a8.5 8.5 0 0 1 16 0" />
      <Dot x={4} y={18} />
      <Dot x={20} y={18} />
    </>
  ),
  cut: (
    <>
      <path d="M3.5 20.5L13 11M4 4l8.5 8.5" />
      <A d="M13 11l7.5-7.5" dash="1.6 2.2" />
    </>
  ),
  pen: (
    <>
      <path d={CONTENT_ICONS.sketch.base} />
      <A d={CONTENT_ICONS.sketch.acc} />
    </>
  ),
  eraser: (
    <>
      <path d="M5.2 14.8l8.3-8.3a2 2 0 0 1 2.8 0l2.5 2.5a2 2 0 0 1 0 2.8L12 18.6 10.5 20H8.5z" />
      <AL d="M5.2 14.8L9 11l5 5-3.5 4H8.5z" />
      <A d="M13 20h8" />
    </>
  ),
  stair: (
    <>
      <path d="M3.5 3.5h17v17h-17zM8 3.5v17M3.5 8H8M3.5 12.5H8M3.5 17H8M12 3.5v4.5h8.5" />
      <A d="M5.8 18.5V6h11M14.5 3.8L17 6l-2.5 2.2" />
    </>
  ),
  items: (
    <>
      <path d="M4 3.5h16v17H4zM4 13h16" />
      <AL d="M6.5 6h4.5v4H6.5zM13 6h4.5v4H13z" />
      <A d="M6.5 6h4.5v4H6.5zM13 6h4.5v4H13zM6 16h12" />
    </>
  ),
  paste: (
    <>
      <path d="M8.5 4.5H5.5v16h13v-16h-3M8.5 3h7v3h-7z" />
      <A d="M9 13.5h6M12 10.5v6" />
    </>
  ),
  // ---------------------------------------------------------------- akce
  undo: (
    <>
      <path d="M4.5 9h10a5.5 5.5 0 0 1 0 11H11" />
      <AF d="M3 9l5-4.5v9z" />
    </>
  ),
  redo: (
    <>
      <path d="M19.5 9h-10a5.5 5.5 0 0 0 0 11H13" />
      <AF d="M21 9l-5-4.5v9z" />
    </>
  ),
  layers: (
    <>
      <path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" />
      <AL d="M12 3l9 5-9 5-9-5z" />
      <A d="M12 3l9 5-9 5-9-5z" />
    </>
  ),
  fit: (
    <>
      <path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5" />
      <AL d="M8 8h8v8H8z" />
      <A d="M8 8h8v8H8z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
      <circle class="a" cx="15" cy="7" r="2.5" />
      <circle class="a" cx="9" cy="17" r="2.5" />
    </>
  ),
  backup: (
    <>
      <path d="M4 16.5v4h16v-4" />
      <A d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
    </>
  ),
  export: (
    <>
      <path d="M13.5 3.5H5.5v17h13V8.5zM13.5 3.5v5h5" />
      <A d="M9 14.5h6M12.5 12l2.5 2.5-2.5 2.5" />
    </>
  ),
  more: (
    <>
      <circle class="bf" cx="5.5" cy="12" r="1.7" />
      <circle class="bf" cx="12" cy="12" r="1.7" />
      <circle class="bf" cx="18.5" cy="12" r="1.7" />
    </>
  ),
  back: <path d="M14.5 5l-7 7 7 7" />,
  floor: (
    <>
      <path d="M5 20.5V4h14v16.5M3 20.5h18M8.5 7.5h2M13.5 7.5h2M8.5 16h2M13.5 16h2" />
      <A d="M5 12h14" />
    </>
  ),
  plus: <A d="M12 5v14M5 12h14" />,
  minus: <A d="M5 12h14" />,
  edit: (
    <>
      <path d="M15 4.5l4.5 4.5L9 19.5H4.5V15z" />
      <A d="M12.5 7l4.5 4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <A d="M12 11v5.5M12 7.5v.3" />
    </>
  ),
  lock: (
    <>
      <path d="M5.5 11h13v9.5h-13z" />
      <A d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5" />
    </>
  ),
  copy: (
    <>
      <path d="M15.5 5.5v-2h-12v12h2" />
      <AL d="M8.5 8.5h12v12h-12z" />
      <A d="M8.5 8.5h12v12h-12z" />
    </>
  ),
  trash: (
    <>
      <path d="M6 7l1 13.5h10L18 7M10 11v6M14 11v6" />
      <A d="M4 7h16M9.5 7V4h5v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <A d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: (
    <>
      <path d={CONTENT_ICONS.photo.base} />
      <circle class="a" cx="12" cy="14" r="3.5" />
    </>
  ),
  gallery: (
    <>
      <path d="M3.5 4.5h17v15h-17z" />
      <AL d="M3.5 17l5-5.5 4 4 2.5-2.5 5.5 5.5v1h-17z" />
      <A d="M3.5 17l5-5.5 4 4 2.5-2.5 5.5 5.5" />
      <circle class="a" cx="16" cy="8.5" r="1.6" />
    </>
  ),
  photoOff: (
    <>
      <path d="M3 8h4.5L9 5.5h6L16.5 8H21v12H3z" />
      <A d="M4 4l16 17" />
    </>
  ),
  note: (
    <>
      <path d={CONTENT_ICONS.text.base} />
      <A d={CONTENT_ICONS.text.acc} />
    </>
  ),
  rotate: (
    <>
      <A d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <AF d="M20 3.5v5.5h-5.5z" />
      <Dot x={12} y={12} />
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
      stroke-width={size >= 40 ? 1.4 : size >= 28 ? 1.55 : 1.7}
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
