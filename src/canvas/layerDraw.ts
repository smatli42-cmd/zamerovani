/**
 * Které stěny (s otvory, výstupky, rohy a automatickými kótami) právě kreslíme – nastavuje renderer pro každou
 * vrstvu zvlášť (pravidla vrstev jen v core/layers.ts). Bez nastavení se kreslí všechny.
 */
import type { Id } from '../model/types';

let filter: ((wallId: Id) => boolean) | null = null;

export function setWallFilter(f: ((wallId: Id) => boolean) | null): void {
  filter = f;
}

export function wallShown(wallId: Id): boolean {
  return !filter || filter(wallId);
}
