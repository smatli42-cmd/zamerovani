/**
 * Akce: vrstvy projektu (pravidla v core/layers.ts). Všechno kromě volby aktivní vrstvy je v historii Zpět/Vpřed
 * (pravidlo 6) a platí pro všechna podlaží.
 */
import type { Id, Layer, Project } from '../../model/types';
import { newId } from '../../model/factory';
import { CARRIED_KINDS, layerById, layersOf, OWN_KINDS, ownCollection, SYS, type ElemKind, type OwnKind } from '../../core/layers';
import { looseKind } from '../../core/looseElements';
import { store, type SingleSelection } from '../store';
import { cleanup } from './shared';

/** Vrstvy projektu v datech (starší projekt bez vrstev dostane výchozí sadu při první úpravě). */
function draftLayers(p: Project): Layer[] {
  if (!p.layers?.length) p.layers = layersOf(p).map(l => ({ ...l }));
  return p.layers;
}

/** Pořadí 0..n-1 podle seznamu (zdola nahoru). */
function renumber(ls: Layer[]): void {
  [...ls].sort((a, b) => a.order - b.order).forEach((l, i) => (l.order = i));
}

/** Aktivní vrstva – do ní jde nová kresba (core/layers.ts, `newElementLayer`). Mimo historii. */
export function setActiveLayer(id: Id): void {
  const p = store.get().project;
  if (!layerById(p, id)) return;
  store.editProjectSettings(d => {
    d.activeLayer = id;
    // aktivní vrstva je vždy vidět (jako v CAD: aktuální hladinu nejde zmrazit)
  });
  if (!layerById(store.get().project, id)!.visible) setLayerVisible(id, true);
}

/** Nová uživatelská vrstva nad aktivní vrstvou; stane se aktivní. Vrací její id. */
export function addLayer(name = 'Nová vrstva', color = '#7c3aed'): Id {
  const id = newId('ly');
  store.editLayers(p => {
    const ls = draftLayers(p);
    const active = ls.find(l => l.id === p.activeLayer);
    const at = active ? active.order + 0.5 : Math.max(...ls.map(l => l.order)) + 1;
    ls.push({ id, name: name.trim() || 'Nová vrstva', color, order: at, visible: true, locked: false, system: false });
    renumber(ls);
  });
  store.editProjectSettings(d => {
    d.activeLayer = id;
  });
  return id;
}

/** Přejmenování (systémové vrstvy ne – jejich název je pevný). */
export function renameLayer(id: Id, name: string): boolean {
  const n = name.trim();
  const l = layerById(store.get().project, id);
  if (!l || l.system || !n || n === l.name) return false;
  return store.editLayers(p => {
    draftLayers(p).find(x => x.id === id)!.name = n;
  });
}

export function setLayerColor(id: Id, color: string): void {
  store.editLayers(p => {
    const l = draftLayers(p).find(x => x.id === id);
    if (!l || l.color === color) return false;
    l.color = color;
  });
}

/** Zobrazit / skrýt (pravidlo 1). Aktivní vrstvu skrýt nejde. */
export function setLayerVisible(id: Id, visible: boolean): boolean {
  const p0 = store.get().project;
  if (!visible && p0?.activeLayer === id) {
    store.set({ lockBlock: { key: '', text: 'Aktivní vrstvu nejde skrýt – nejdřív zvolte jinou aktivní vrstvu.' } });
    return false;
  }
  return store.editLayers(p => {
    const l = draftLayers(p).find(x => x.id === id);
    if (!l || l.visible === visible) return false;
    l.visible = visible;
  });
}

/** Zamknout / odemknout (pravidlo 2). */
export function setLayerLocked(id: Id, locked: boolean): void {
  store.editLayers(p => {
    const l = draftLayers(p).find(x => x.id === id);
    if (!l || l.locked === locked) return false;
    l.locked = locked;
  });
}

/** Přesune vrstvu v pořadí kreslení na pozici `index` (0 = nejníž). */
export function moveLayerTo(id: Id, index: number): void {
  store.editLayers(p => {
    const ls = draftLayers(p);
    const sorted = [...ls].sort((a, b) => a.order - b.order);
    const from = sorted.findIndex(l => l.id === id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(sorted.length - 1, index));
    if (to === from) return false;
    const [l] = sorted.splice(from, 1);
    sorted.splice(to, 0, l!);
    sorted.forEach((x, i) => (x.order = i));
  });
}

/** Počet prvků ve vrstvě na všech podlažích (dialog mazání). */
export function layerItemCount(p: Project | null, id: Id): number {
  let n = 0;
  for (const f of p?.floors ?? []) for (const kind of OWN_KINDS) for (const el of Object.values(ownCollection(f, kind))) if (el.layerId === id) n++;
  return n;
}

/**
 * Smazání vrstvy (pravidlo 7): prázdná se smaže hned; neprázdná jen s volbou – obsah přesunout do vrstvy `moveTo`,
 * nebo smazat i s obsahem (`moveTo` = null). Systémovou ani zamčenou vrstvu smazat nejde.
 */
export function deleteLayer(id: Id, moveTo: Id | null | undefined): boolean {
  const p0 = store.get().project;
  const l = layerById(p0, id);
  if (!l) return false;
  const fail = (text: string) => (store.set({ lockBlock: { key: '', text } }), false);
  if (l.system) return fail('Systémovou vrstvu nejde smazat.');
  if (l.locked) return fail(`Vrstva „${l.name}“ je zamčená – nejdřív ji odemkněte.`);
  const count = layerItemCount(p0, id);
  if (count > 0 && moveTo === undefined) return fail('Vrstva není prázdná – zvolte, co s obsahem.');
  if (moveTo && (moveTo === id || !layerById(p0, moveTo))) return false;
  return store.editLayers(
    p => {
      for (const f of p.floors) {
        for (const kind of OWN_KINDS) {
          const rec = ownCollection(f, kind);
          for (const el of Object.values(rec)) {
            if (el.layerId !== id) continue;
            if (moveTo) el.layerId = moveTo;
            else if (kind === 'wall') delete f.walls[el.id];
            else looseKind(kind)?.remove(f, el.id);
          }
        }
        if (!moveTo) cleanup(f);
      }
      p.layers = draftLayers(p).filter(x => x.id !== id);
      renumber(p.layers);
      if (p.activeLayer === id) p.activeLayer = moveTo ?? SYS.kresba;
    },
    { selection: null }
  );
}

/** Druhy, které jdou přesunout do jiné vrstvy (otvor a výstupek mají vrstvu své stěny). */
export function canMoveToLayer(kind: SingleSelection['kind']): kind is OwnKind {
  return (OWN_KINDS as readonly string[]).includes(kind);
}

/**
 * Přesun vybraných prvků do vrstvy (pravidlo 3) – jeden krok Zpět. Stěna bere s sebou otvory a výstupky (dědí).
 * Otvor, výstupek a roh se samostatně nepřesouvají (vrací počet přeskočených).
 */
export function moveSelectionToLayer(layerId: Id): { moved: number; skipped: number } {
  const sel = store.get().selection;
  const items = !sel ? [] : sel.kind === 'multi' ? sel.items : [sel];
  const own = items.filter(i => canMoveToLayer(i.kind));
  const skipped = items.length - own.length;
  if (!own.length || !layerById(store.get().project, layerId)) return { moved: 0, skipped };
  const ok = store.edit(f => {
    let changed = false;
    for (const i of own) {
      const el = ownCollection(f, i.kind as OwnKind)[i.id];
      if (el && el.layerId !== layerId) {
        el.layerId = layerId;
        changed = true;
      }
    }
    return changed;
  });
  return { moved: ok ? own.length : 0, skipped };
}

/** Druh prvku výběru pro pravidla vrstev (roh nemá vrstvu). */
export function selectionElemKind(kind: SingleSelection['kind']): ElemKind | null {
  return (OWN_KINDS as readonly string[]).includes(kind) || (CARRIED_KINDS as readonly string[]).includes(kind) ? (kind as ElemKind) : null;
}
