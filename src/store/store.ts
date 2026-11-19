/**
 * Centrální stav aplikace.
 *
 * - `project`  = data projektu (ukládají se, mají historii Zpět/Vpřed). Mění se jen přes edit().
 * - ostatní    = stav rozhraní (nástroj, výběr, kamera, otevřený panel) – neukládá se do historie.
 *
 * Data projektu jsou neměnná (immer): každá změna vytvoří novou verzi a nezměněné části se sdílí.
 * Díky tomu je historie levná a překreslení/uložení se pozná podle změny odkazu.
 */
import { prunePlaces } from '../core/dimPlace';
import { produce, freeze, current } from 'immer';
import type { Floor, Id, Opening, Project } from '../model/types';
import type { DrawColor, LineStyle } from '../model/types';
import { syncHosted } from '../core/hosting';
import { syncProtrusions } from '../core/protrusion';
import { describeDim, dimKey, lockViolation, pruneLocks, reboundLocks, type DimTarget } from '../core/dimLock';
import { pruneFreeDims, rescueFreeDims } from '../core/freeDim';
import { followDisturbsEdit, followLockedDims } from '../core/dimFollow';
import { keepOpeningsOnResizedWalls } from '../core/openingChain';
import { assignLayers, layerLockViolation, selectableItems, viewFloor } from '../core/layers';

export type ToolId = 'select' | 'wall' | 'line' | 'trim' | 'split' | 'door' | 'window' | 'opening' | 'niche' | 'room' | 'rect' | 'circle' | 'arc' | 'drawLine' | 'drawDouble' | 'drawTrim' | 'text' | 'leader' | 'dim' | 'stair' | 'paste' | 'pan';

export type SingleSelection =
  | { kind: 'wall'; id: Id }
  | { kind: 'node'; id: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'room'; id: Id }
  | { kind: 'text'; id: Id }
  /** Výstupek / vybrání stěny (KATALOG-STEN.md, sekce I). */
  | { kind: 'protrusion'; id: Id }
  /** Kresba – grafický prvek (čára, tvar, dvojitá čára; core/drawing.ts). */
  | { kind: 'drawing'; id: Id }
  /** Volná kóta mezi dvěma body (core/freeDim.ts). */
  | { kind: 'dim'; id: Id }
  /** Schodiště – 2D značka (core/stairs.ts). */
  | { kind: 'stair'; id: Id };

/** Výběr: jeden prvek, skupina prvků (výběr obdélníkem) nebo nic. */
export type Selection = SingleSelection | { kind: 'multi'; items: SingleSelection[] } | null;

/** Je prvek vybraný (samostatně nebo jako člen skupiny)? */
export function isSelected(s: Selection, kind: SingleSelection['kind'], id: Id): boolean {
  if (!s) return false;
  if (s.kind === 'multi') return s.items.some(i => i.kind === kind && i.id === id);
  return s.kind === kind && s.id === id;
}

/** Co právě zadáváme na číselné klávesnici: kóta (core/dimLock.ts) nebo obecné číselné pole panelu. */
export type NumPadTarget =
  | DimTarget
  /** Obecné číselné pole panelu (výška, parapet, úhel…); hodnotu zapíše funkce předaná v `openField`. */
  | { kind: 'field'; label: string; unit: string; min: number; allowEmpty?: boolean };

export interface NumPadState {
  target: NumPadTarget;
  buffer: string;
  /** Další napsaná číslice nahradí výchozí hodnotu. */
  fresh: boolean;
  /** Kóta je zamčená a uživatel jednou stiskl Potvrdit – další potvrzení hodnotu přepíše (zámek zůstane). */
  confirmLock?: boolean;
}

export interface Camera {
  /** Posun počátku [0,0] na obrazovce (px). */
  x: number;
  y: number;
  /** Kolik px na obrazovce odpovídá 1 mm. */
  zoom: number;
}

export interface Settings {
  snap: boolean;
  showDims: boolean;
  showGrid: boolean;
  /** Prst jen posouvá plátno, kreslí se stylusem (ochrana proti dlani). */
  fingerPan: boolean;
  /** Velikost písma kót (1 = výchozí). */
  dimScale: number;
  /** Styl čáry nově kreslené kresby (čára, obdélník, kruh, oblouk). */
  shapeStyle: LineStyle;
  /** Barva čáry nově kreslené kresby. */
  drawColor: DrawColor;
  /** Dvojitá čára: vzdálenost čar (mm), uzavřené konce, styl čáry. */
  doubleWidth: number;
  /** Konce nové dvojité čáry; výchozí otevřené = jen dvě čáry (připomínka uživatele 2026-11-17). */
  doubleEnds: 'open' | 'closed';
  doubleStyle: LineStyle;
  /** Nástroj Okno: vkládá běžné nebo francouzské okno. */
  windowKind: 'window' | 'french';
  /** Nástroj Stěna: kreslí rovnou nebo obloukovou stěnu. */
  wallShape: 'straight' | 'arc';
  /** Nástroj Stěna: osa nové stěny = líc nebo střed tloušťky (B1, B10). */
  wallAxis: 'face' | 'center';
  /** Nástroj Stěna: kreslení řetězem – další tah navazuje na konec poslední stěny (A2). */
  wallChain: boolean;
  /** Nástroj Rozdělit: dvěma ťuknutími vyjme úsek stěny (D4 „s mezerou“). */
  splitGap: boolean;
  /** Nástroj Do rohu: zkrátit / prodloužit jen první stěnu k hraně druhé (T) místo společného rohu (D3). */
  trimEdge: boolean;
  /** Nástroj Ořezat (kresba): oříznout k průsečíkům, nebo prodloužit konec k nejbližší čáře. */
  drawTrimMode: 'trim' | 'extend';
  /** Nevypínat displej, dokud je aplikace otevřená (Screen Wake Lock, input/wakeLock.ts). */
  keepAwake: boolean;
  /** Nástroj Schodiště: rameno z rohu do rohu (tažení / dvě ťuknutí), zadanými rozměry, nebo točité schodiště. */
  stairMode: 'rect' | 'size' | 'spiral';
  /** Nástroj Schodiště, zadané rozměry: šířka a délka ramene (mm). */
  stairWidth: number;
  stairLength: number;
}

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

/** Zkopírovaný otvor ke vložení do jiné stěny; `rel` = poloha začátku vůči prvnímu otvoru skupiny (mm). */
export interface OpeningClip {
  op: Opening;
  rel: number;
}

export interface AppState {
  screen: 'projects' | 'editor';
  project: Project | null;
  floorId: Id | null;
  tool: ToolId;
  selection: Selection;
  hover: Selection;
  /** Zkopírované otvory (nástroj Vložit). */
  clipboard: OpeningClip[] | null;
  numpad: NumPadState | null;
  camera: Camera;
  settings: Settings;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  /** Krátká zpráva aktivního nástroje v liště voleb (např. nástroj Do rohu: co ťuknout, proč to nešlo). */
  toolMsg: string | null;
  /** Kreslení řetězem: roh, ve kterém začne další stěna (null = řetěz neběží). */
  chainNode: string | null;
  /** Nástroj Schodiště kreslí další rameno ke schodišti s tímto id (tlačítko v panelu); null = nové schodiště. */
  stairAppend: string | null;
  /**
   * Úprava se neprovedla: zamčená kóta, která brání (klíč pro zvýraznění, `target` pro tlačítko Odemknout),
   * nebo jiný důvod (bez `target`, např. otvor by vyjel ze stěny). Hlášení dole na plátně.
   */
  lockBlock: { key: string; text: string; target?: DimTarget } | null;
}

/** Volby úpravy výkresu. */
export interface EditOptions {
  /** Kóta, kterou uživatel vědomě přepisuje (NumPad po potvrzení) – její zámek úpravu nezastaví. */
  allowKey?: string;
}

const SETTINGS_KEY = 'zamerovani.settings';

function loadSettings(): Settings {
  const defaults: Settings = { snap: true, showDims: true, showGrid: true, fingerPan: true, dimScale: 1, shapeStyle: 'solid', drawColor: 'black', doubleWidth: 250, doubleEnds: 'open', doubleStyle: 'dashdot2', windowKind: 'window', wallShape: 'straight', wallAxis: 'face', wallChain: false, splitGap: false, trimEdge: false, drawTrimMode: 'trim', keepAwake: true, stairMode: 'rect', stairWidth: 1000, stairLength: 3000 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

type Listener = (state: AppState, prev: AppState) => void;

const MAX_HISTORY = 200;

/** Přerušení úpravy, která by porušila zamčenou kótu (zachytí ho `edit`). */
const LOCK_ABORT = new Error('lock');
/** Přerušení úpravy, kterou recept odmítl (vrátil false). */
const EDIT_ABORT = new Error('abort');

class Store {
  private state: AppState = {
    screen: 'projects',
    project: null,
    floorId: null,
    tool: 'wall',
    selection: null,
    hover: null,
    clipboard: null,
    numpad: null,
    camera: { x: 0, y: 0, zoom: 0.15 },
    settings: loadSettings(),
    saveStatus: 'saved',
    canUndo: false,
    canRedo: false,
    toolMsg: null,
    chainNode: null,
    stairAppend: null,
    lockBlock: null
  };

  private listeners = new Set<Listener>();
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private gestureStart: Project | null = null;
  private inGesture = false;

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Změna stavu rozhraní (ne dat projektu). */
  set(patch: Partial<AppState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    // vrstvy: prvek ve skryté / zamčené vrstvě nesmí zůstat vybraný (core/layers.ts)
    if (('project' in patch || 'selection' in patch) && this.state.selection) this.state.selection = this.selectable(this.state.selection);
    if ('settings' in patch) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
      } catch {
        /* nevadí */
      }
    }
    for (const fn of this.listeners) fn(this.state, prev);
  }

  private selectable(sel: Selection): Selection {
    const floor = this.floor();
    if (!sel || !floor) return sel;
    const items = sel.kind === 'multi' ? sel.items : [sel];
    const ok = selectableItems(this.state.project, floor, items);
    if (ok.length === items.length) return sel;
    if (sel.kind !== 'multi' || ok.length === 0) return null;
    return ok.length === 1 ? ok[0]! : { kind: 'multi', items: ok };
  }

  /**
   * Podlaží pro nástroje: 'pick' = bez prvků ve skrytých a zamčených vrstvách (výběr), 'snap' = bez skrytých
   * (přichytávání; zamčené chytají). Pravidla jen v core/layers.ts.
   */
  view(mode: 'pick' | 'snap'): Floor | null {
    const floor = this.floor();
    return floor && viewFloor(this.state.project, floor, mode);
  }

  /** Aktuální podlaží (jen pro čtení). */
  floor(): Floor | null {
    const { project, floorId } = this.state;
    return project?.floors.find(f => f.id === floorId) ?? null;
  }

  /** Otevře projekt v editoru (vymaže historii). */
  openProject(project: Project): void {
    this.undoStack = [];
    this.redoStack = [];
    this.gestureStart = null;
    this.inGesture = false;
    this.set({
      screen: 'editor',
      chainNode: null,
      project: freeze(project, true),
      floorId: project.floors[0]?.id ?? null,
      selection: null,
      hover: null,
      numpad: null,
      saveStatus: 'saved',
      canUndo: false,
      canRedo: false
    });
  }

  closeProject(): void {
    this.set({ screen: 'projects', project: null, floorId: null, selection: null, hover: null, numpad: null });
  }

  /**
   * Změna dat projektu. `recipe` dostane měnitelnou kopii projektu.
   * Uvnitř gesta (tažení) se do historie uloží jen stav před začátkem gesta.
   */
  editProject(recipe: (draft: Project) => void, extra: Partial<AppState> = {}): void {
    const before = this.state.project;
    if (!before) return;
    const after = produce(before, recipe);
    if (after === before) {
      if (Object.keys(extra).length) this.set(extra);
      return;
    }
    if (!this.inGesture) this.pushUndo(before);
    this.set({ ...extra, project: after, saveStatus: 'dirty', canUndo: this.undoStack.length > 0 || this.inGesture, canRedo: this.redoStack.length > 0 });
  }

  /**
   * Změna nastavení projektu mimo historii Zpět/Vpřed (např. vybraná tloušťka stěn) – jen se uloží.
   */
  editProjectSettings(recipe: (draft: Project) => void): void {
    const before = this.state.project;
    if (!before) return;
    const after = produce(before, recipe);
    if (after !== before) this.set({ project: after, saveStatus: 'dirty' });
  }

  /**
   * Změna aktuálního podlaží. Vrací false, když se úprava neprovedla, protože by změnila zamčenou kótu
   * (KOTY-ZAMEK-EXPORT.md, A) – pak se nic nezmění a `lockBlock` řekne, která kóta brání.
   */
  edit(recipe: (floor: Floor, project: Project) => void | boolean, extra: Partial<AppState> = {}, opts: EditOptions = {}): boolean {
    const floorId = this.state.floorId;
    const before = this.state.project?.floors.find(x => x.id === floorId);
    let blocked: AppState['lockBlock'] = null;
    try {
      this.editProject(p => {
        const f = p.floors.find(x => x.id === floorId);
        if (!f) return;
        // recept vrátil false = akce nejde → nic se nezmění (žádný krok Zpět)
        if (recipe(f, p) === false) throw EDIT_ABORT;
        // nový prvek dostane vrstvu (pravidlo 4, core/layers.ts)
        assignLayers(p, f);
        // napojené rohy (T bez dělení) sledují svou průběžnou stěnu
        syncHosted(before, f);
        // výstupky drží místo na stěně i při změně jejího vzepětí
        syncProtrusions(before, f);
        // volné kóty, jejichž bod zanikl, a zámky smazaných prvků zmizí s nimi
        rescueFreeDims(before, f);
        pruneFreeDims(f);
        pruneLocks(f);
        prunePlaces(f);
        // zamčená volná kóta = pevné spojení: prvek na druhém konci se posune s tím, co se pohnulo (core/dimFollow.ts)
        const hasFreeLock = !!before?.dimLocks && Object.keys(before.dimLocks).some(k => k.startsWith('free-dim:'));
        const preFollow = hasFreeLock ? (current(f) as Floor) : null;
        if (preFollow && followLockedDims(before, f, opts.allowKey)) {
          syncHosted(preFollow, f);
          // dorovnání nesmí pohnout tím, co úprava sama změnila (jinak by se zadaná úprava přepsala)
          if (followDisturbsEdit(before!, preFollow, f, opts.allowKey)) {
            blocked = { key: '', text: 'Nelze – zamčené kóty by úpravu vrátily zpět (prvek je zamčenými kótami přivázaný z obou stran).' };
            throw LOCK_ABORT;
          }
          // stěny posunuté kótou: prvky nesené stěnou zůstanou ve výkresu na místě (core/openingChain.ts)
          if (keepOpeningsOnResizedWalls(preFollow, f) !== true) {
            blocked = { key: '', text: 'Nelze – zamčená kóta by posunula stěnu a otvor, výstupek nebo napojená příčka by přesáhl souseda nebo konec stěny.' };
            throw LOCK_ABORT;
          }
        }
        // zamčená vrstva: úprava nesmí změnit žádný její prvek, ani přes vazbu (pravidlo 2)
        const lockedLayer = layerLockViolation(this.state.project, before, f);
        if (lockedLayer !== null) {
          blocked = { key: '', text: `Nelze – úprava by změnila prvek v zamčené vrstvě „${lockedLayer}“.` };
          throw LOCK_ABORT;
        }
        const v = lockViolation(before, f, opts.allowKey);
        if (v) {
          blocked = { key: dimKey(v), text: `Nelze – brání zamčená kóta: ${describeDim(before!, v)}`, target: v };
          throw LOCK_ABORT;
        }
        // kóta měřená od souseda, který přibyl / zmizel, je jiná kóta – původní zámek zaniká
        for (const key of reboundLocks(before, f)) delete f.dimLocks![key];
        if (f.dimLocks && Object.keys(f.dimLocks).length === 0) delete f.dimLocks;
      }, { ...extra, ...(this.state.lockBlock ? { lockBlock: null } : {}) });
    } catch (e) {
      if (e === EDIT_ABORT) return false;
      if (e !== LOCK_ABORT) throw e;
      this.set({ lockBlock: blocked });
      return false;
    }
    return true;
  }

  /**
   * Změna vrstev projektu (platí pro všechna podlaží; core/layers.ts) – v historii Zpět/Vpřed. Po úpravě se na každém
   * podlaží uklidí kóty a zámky smazaných prvků; úprava, která by změnila prvek v zamčené vrstvě, se neprovede.
   */
  editLayers(recipe: (p: Project) => void | boolean, extra: Partial<AppState> = {}): boolean {
    const beforeP = this.state.project;
    let blocked: AppState['lockBlock'] = null;
    try {
      this.editProject(p => {
        if (recipe(p) === false) throw EDIT_ABORT;
        for (const f of p.floors) {
          const before = beforeP?.floors.find(x => x.id === f.id);
          rescueFreeDims(before, f);
          pruneFreeDims(f);
          pruneLocks(f);
          prunePlaces(f);
          const lockedLayer = layerLockViolation(beforeP, before, f);
          if (lockedLayer !== null) {
            blocked = { key: '', text: `Nelze – úprava by změnila prvek v zamčené vrstvě „${lockedLayer}“.` };
            throw LOCK_ABORT;
          }
        }
      }, { ...extra, ...(this.state.lockBlock ? { lockBlock: null } : {}) });
    } catch (e) {
      if (e === EDIT_ABORT) return false;
      if (e !== LOCK_ABORT) throw e;
      this.set({ lockBlock: blocked });
      return false;
    }
    return true;
  }

  /** Začátek tažení – všechny změny až do endGesture() budou jeden krok Zpět. */
  beginGesture(): void {
    this.inGesture = true;
    this.gestureStart = this.state.project;
  }

  /** Zrušení tažení: projekt se vrátí do stavu na začátku gesta, bez kroku Zpět. */
  cancelGesture(): void {
    if (!this.inGesture) return;
    const start = this.gestureStart;
    this.inGesture = false;
    this.gestureStart = null;
    if (start && start !== this.state.project) this.set({ project: start, saveStatus: 'dirty' });
    this.set({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  endGesture(): void {
    if (!this.inGesture) return;
    this.inGesture = false;
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start && start !== this.state.project) {
      this.pushUndo(start);
    }
    this.set({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  private pushUndo(p: Project): void {
    this.undoStack.push(p);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev || !this.state.project) return;
    this.redoStack.push(this.state.project);
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next || !this.state.project) return;
    this.undoStack.push(this.state.project);
    this.restore(next);
  }

  private restore(snapshot: Project): void {
    // Zpět/Vpřed nemění nastavení projektu (vybraná tloušťka a předvolby stěn)
    const cur = this.state.project;
    const p: Project = cur ? { ...snapshot, wallThickness: cur.wallThickness, wallPresets: cur.wallPresets, activeLayer: cur.activeLayer } : snapshot;
    const floorId = p.floors.some(f => f.id === this.state.floorId) ? this.state.floorId : (p.floors[0]?.id ?? null);
    this.set({
      project: p,
      floorId,
      selection: null,
      numpad: null,
      saveStatus: 'dirty',
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0
    });
  }

  updateSettings(patch: Partial<Settings>): void {
    this.set({ settings: { ...this.state.settings, ...patch } });
  }
}

export const store = new Store();
