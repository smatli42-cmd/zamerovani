/**
 * Volba druhu a tloušťky čáry ve skice poznámky (přání uživatele 2026-11-22): náhledy čar místo textu.
 * Platí pro pero a tvary (čára, obdélník, kruh, oblouk, dvojitá čára); u vybraného prvku kresby změní ten prvek.
 */
import type { LineStyle } from '../model/types';
import { SKETCH_WIDTHS } from '../core/sketch';
import { DRAW_LINE_STYLES } from './panels/common';

/** Vzory náhledu (px) – stejné poměry jako canvas/lineDash.ts. */
const PREVIEW_DASH: Record<LineStyle, string> = { solid: '', dashed: '7 4', dashdot: '9 3.5 2 3.5', dashdot2: '9 3 1.5 3 1.5 3' };

export function SketchLineOptions(props: { style: LineStyle; width: number; onStyle: (s: LineStyle) => void; onWidth: (w: number) => void }) {
  return (
    <span class="sketch-line-opts">
      {DRAW_LINE_STYLES.map(o => (
        <button key={o.v} type="button" class={`btn btn-sm line-opt ${props.style === o.v ? 'active' : ''}`} title={o.label} aria-label={`Čára ${o.label}`} onClick={() => props.onStyle(o.v)}>
          <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
            <line x1="2" y1="6" x2="32" y2="6" stroke="currentColor" stroke-width="2" stroke-dasharray={PREVIEW_DASH[o.v]} />
          </svg>
        </button>
      ))}
      {SKETCH_WIDTHS.map(o => (
        <button key={o.v} type="button" class={`btn btn-sm line-opt ${props.width === o.v ? 'active' : ''}`} title={`${o.label} čára`} aria-label={`${o.label} čára`} onClick={() => props.onWidth(o.v)}>
          <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
            <line x1="3" y1="6" x2="23" y2="6" stroke="currentColor" stroke-width={o.v * 1.2} stroke-linecap="round" />
          </svg>
        </button>
      ))}
    </span>
  );
}
