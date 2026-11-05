/**
 * Automatické ukládání: po každé změně projektu se během chvíle uloží do tabletu.
 * Při skrytí aplikace (přepnutí do jiné aplikace, zhasnutí displeje) se uloží okamžitě.
 */
import type { Project } from '../model/types';
import { store } from '../store/store';
import { saveProject } from './db';

const DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Project | null = null;
let lastSaved: Project | null = null;

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (!p || p === lastSaved) return;
  store.set({ saveStatus: 'saving' });
  try {
    const stamped = { ...p, updatedAt: Date.now() };
    await saveProject(stamped);
    lastSaved = p;
    // Pokud mezitím nepřišla další změna, je vše uloženo.
    if (!pending && store.get().project === p) store.set({ saveStatus: 'saved' });
  } catch (err) {
    console.error('Uložení selhalo', err);
    store.set({ saveStatus: 'error' });
  }
}

export function startAutosave(): void {
  store.subscribe((s, prev) => {
    if (!s.project || s.project === prev.project) return;
    // Nově otevřený projekt (jiné ID) neukládáme – je už uložený.
    if (!prev.project || prev.project.id !== s.project.id) {
      lastSaved = s.project;
      return;
    }
    pending = s.project;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DELAY_MS);
  });

  const flushNow = () => void flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  window.addEventListener('pagehide', flushNow);
}

/** Okamžité uložení (např. před zavřením projektu). */
export function saveNow(): Promise<void> {
  return flush();
}
