/**
 * Centrální stav aplikace.
 *
 * - `project`  = data projektu (ukládají se, mají historii Zpět/Vpřed). Mění se jen přes edit().
 * - ostatní    = stav rozhraní (nástroj, výběr, kamera, otevřený panel) – neukládá se do historie.
 *
 * Data projektu jsou neměnná (immer): každá změna vytvoří novou verzi a nezměněné části se sdílí.
 * Díky tomu je historie levná a překreslení/uložení se pozná podle změny odkazu.
 */
import { produce, freeze } from 'immer';
import type { Floor, Id, Opening, Project } from '../model/types';
import type { LineStyle } from '../model/types';
import { syncHosted } from '../core/hosting';
import { syncProtrusions } from '../core/protrusion';
import { describeDim, dimKey, lockViolation, pruneLocks, reboundLocks, type DimTarget } from '../core/dimLock';

export type ToolId = 'select' | 'wall' | 'line' | 'trim' | 'door' | 'window' | 'opening' | 'niche' | 'room' | 'rect' | 'circle' | 'arc' | 'text' | 'leader' | 'paste' | 'pan';

export type SingleSelection =
  | { kind: 'wall'; id: Id }
  | { kind: 'node'; id: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'room'; id: Id }
  | { kind: 'text'; id: Id }
  /** Výstupek / vybrání stěny (KATALOG-STEN.md, sekce I). */
  | { kind: 'protrusion'; id: Id };

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
  /** Styl čáry nově kreslených tvarů (obdélník, kruh, oblouk). */
  shapeStyle: LineStyle;
  /** Nástroj Okno: vkládá běžné nebo francouzské okno. */
  windowKind: 'window' | 'french';
  /** Nástroj Stěna: kreslí rovnou nebo obloukovou stěnu. */
  wallShape: 'straight' | 'arc';
  /** Nástroj Stěna: osa nové stěny = líc nebo střed tloušťky (B1, B10). */
  wallAxis: 'face' | 'center';
  /** Nevypínat displej, dokud je aplikace otevřená (Screen Wake Lock, input/wakeLock.ts). */
  keepAwake: boolean;
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
  /** Úprava se neprovedla, protože by změnila zamčenou kótu: která (klíč pro zvýraznění) a hlášení do lišty. */
  lockBlock: { key: string; text: string; target: DimTarget } | null;
}

/** Volby úpravy výkresu. */
export interface EditOptions {
  /** Kóta, kterou uživatel vědomě přepisuje (NumPad po potvrzení) – její zámek úpravu nezastaví. */
  allowKey?: string;
}

const SETTINGS_KEY = 'zamerovani.settings';

function loadSettings(): Settings {
  const defaults: Settings = { snap: true, showDims: true, showGrid: true, fingerPan: true, dimScale: 1, shapeStyle: 'solid', windowKind: 'window', wallShape: 'straight', wallAxis: 'face', keepAwake: true };
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
    if ('settings' in patch) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
      } catch {
        /* nevadí */
      }
    }
    for (const fn of this.listeners) fn(this.state, prev);
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
  edit(recipe: (floor: Floor, project: Project) => void, extra: Partial<AppState> = {}, opts: EditOptions = {}): boolean {
    const floorId = this.state.floorId;
    const before = this.state.project?.floors.find(x => x.id === floorId);
    let blocked: AppState['lockBlock'] = null;
    try {
      this.editProject(p => {
        const f = p.floors.find(x => x.id === floorId);
        if (!f) return;
        recipe(f, p);
        // napojené rohy (T bez dělení) sledují svou průběžnou stěnu
        syncHosted(before, f);
        // výstupky drží místo na stěně i při změně jejího vzepětí
        syncProtrusions(before, f);
        // zámky smazaných prvků zmizí s nimi
        pruneLocks(f);
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
    const p: Project = cur ? { ...snapshot, wallThickness: cur.wallThickness, wallPresets: cur.wallPresets } : snapshot;
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
