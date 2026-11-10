/**
 * Akce: nastavení projektu pro kreslení (tloušťka nových stěn a vlastní předvolby). Nejsou v historii Zpět/Vpřed.
 */
import { WALL_PRESETS } from '../../model/factory';
import { store } from '../store';

/** Vybere tloušťku, kterou se budou kreslit nové stěny. */
export function setActiveWallThickness(thickness: number): void {
  const t = Math.round(thickness);
  if (!(t > 0)) return;
  store.editProjectSettings(p => {
    p.wallThickness = t;
  });
}

/** Přidá vlastní předvolbu tloušťky (pokud ještě není) a rovnou ji vybere. */
export function addWallPreset(thickness: number): void {
  const t = Math.round(thickness);
  if (!(t > 0)) return;
  store.editProjectSettings(p => {
    if (!WALL_PRESETS.includes(t) && !(p.wallPresets ?? []).includes(t)) p.wallPresets = [...(p.wallPresets ?? []), t];
    p.wallThickness = t;
  });
}

/** Odebere vlastní předvolbu (výchozí předvolby odebrat nejde). */
export function removeWallPreset(thickness: number): void {
  store.editProjectSettings(p => {
    p.wallPresets = (p.wallPresets ?? []).filter(x => x !== thickness);
  });
}
