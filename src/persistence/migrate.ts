/**
 * Převod starších uložených projektů na aktuální strukturu dat.
 * Při každé změně SCHEMA_VERSION sem přidat krok „z verze N na N+1“.
 */
import { SCHEMA_VERSION, type Project } from '../model/types';

export function migrateProject(raw: unknown): Project {
  const p = raw as Project;
  if (typeof p !== 'object' || p === null || typeof p.id !== 'string' || !Array.isArray(p.floors)) {
    throw new Error('Soubor neobsahuje platný projekt.');
  }
  if ((p.schema ?? 1) > SCHEMA_VERSION) {
    throw new Error('Projekt byl uložen novější verzí aplikace. Aktualizujte aplikaci.');
  }
  // Zatím existuje jen verze 1.
  return { ...p, schema: SCHEMA_VERSION };
}
