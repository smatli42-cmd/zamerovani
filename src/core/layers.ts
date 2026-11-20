/**
 * Vrstvy výkresu – JEDINÉ místo s pravidly vrstev (zadání „Vrstvy“, rozhodnutí uživatele 2026-11-19).
 *
 * - Vrstvy patří projektu (`Project.layers`), stejná sada pro všechna podlaží.
 * - Vlastní vrstvu (`layerId`) mají: stěna, kresba, schodiště, štítek místnosti, text, volná kóta.
 *   Otvor (s ostěním) a výstupek / vybrání (na stěně, na konci, v rohu) vlastní vrstvu nemají – dědí vrstvu stěny.
 * - Skrytá vrstva: prvek se nekreslí, nechytá, nevybírá (tedy ani nemaže / neposouvá). Do geometrie (místnosti,
 *   napojení těl, sdílené rohy) se dál počítá a úprava viditelného prvku jím smí pohnout (rozhodnutí uživatele).
 * - Zamčená vrstva: prvek je vidět a chytá, ale nevybírá se; úprava, která by ho změnila (i přes vazbu na jiný
 *   prvek), se neprovede s hlášením (`layerLockViolation`, volá `store.edit`).
 * - Automatické kóty (délky stěn, řetězy otvorů, kóty výstupků) patří vrstvě Kóty a kreslí se jen u viditelné stěny.
 *
 * Kreslení (`canvas/renderer.ts`), výběr a přichytávání (nástroje přes `viewFloor`) i export (`layerContents`)
 * se ptají jen tady. Nový druh prvku s vrstvou přidat do `OWN_KINDS` / `elementLayers`.
 */
import type { Floor, FreeDim, Id, Layer, Project } from '../model/types';
import { dimPoints } from './freeDim';

/** Systémové vrstvy (pevná id – nemění se ani po přejmenování vrstvy). */
export const SYS = { stavba: 'stavba', koty: 'koty', popisky: 'popisky', kresba: 'kresba' } as const;

/** Výchozí sada vrstev nového projektu i migrace (pořadí = pořadí kreslení zdola nahoru). */
export function defaultLayers(): Layer[] {
  const sys = (id: Id, name: string, color: string, order: number): Layer => ({ id, name, color, order, visible: true, locked: false, system: true });
  const usr = (id: Id, name: string, color: string, order: number): Layer => ({ id, name, color, order, visible: true, locked: false, system: false });
  return [
    sys(SYS.stavba, 'Stavba', '#0f172a', 0),
    sys(SYS.kresba, 'Kresba', '#0f172a', 1),
    usr('elektro', 'Elektro', '#dc2626', 2),
    usr('voda', 'Voda', '#2563eb', 3),
    usr('topeni', 'Topení', '#ea580c', 4),
    usr('nabytek', 'Nábytek', '#92400e', 5),
    usr('poznamky', 'Poznámky', '#16a34a', 6),
    sys(SYS.popisky, 'Popisky', '#0f172a', 7),
    sys(SYS.koty, 'Kóty', '#0f172a', 8)
  ];
}

const DEFAULTS: readonly Layer[] = Object.freeze(defaultLayers().map(l => Object.freeze(l)));

/** Vrstvy projektu seřazené podle pořadí kreslení (chybí-li v datech, výchozí sada). */
export function layersOf(p: Pick<Project, 'layers'> | null | undefined): Layer[] {
  const ls = p?.layers?.length ? p.layers : DEFAULTS;
  return [...ls].sort((a, b) => a.order - b.order);
}

export function layerById(p: Pick<Project, 'layers'> | null | undefined, id: Id | undefined): Layer | undefined {
  return id === undefined ? undefined : (p?.layers?.length ? p.layers : DEFAULTS).find(l => l.id === id);
}

/** Druhy prvků s vlastní vrstvou (pole `layerId`) a jejich kolekce v podlaží. */
export const OWN_KINDS = ['wall', 'drawing', 'stair', 'room', 'text', 'dim', 'stroke', 'mark'] as const;
export type OwnKind = (typeof OWN_KINDS)[number];
/** Druhy prvků, které vrstvu dědí od stěny. */
export const CARRIED_KINDS = ['opening', 'protrusion'] as const;
export type ElemKind = OwnKind | (typeof CARRIED_KINDS)[number];

type Rec = Record<Id, { id: Id; layerId?: Id }>;
export function ownCollection(floor: Floor, kind: OwnKind): Rec {
  switch (kind) {
    case 'wall': return floor.walls;
    case 'drawing': return floor.drawings ?? {};
    case 'stair': return floor.stairs ?? {};
    case 'room': return floor.rooms;
    case 'text': return floor.texts;
    case 'dim': return floor.dims ?? {};
    case 'stroke': return floor.strokes ?? {};
    case 'mark': return floor.marks ?? {};
  }
}

/** Zapíše kolekci druhu do podlaží (migrace). Prázdnou nepovinnou kolekci nevytváří. */
export function setCollection(floor: Floor, kind: OwnKind, rec: Rec): void {
  const r = rec as never;
  switch (kind) {
    case 'wall': floor.walls = r; break;
    case 'room': floor.rooms = r; break;
    case 'text': floor.texts = r; break;
    case 'drawing': if (floor.drawings) floor.drawings = r; break;
    case 'stair': if (floor.stairs) floor.stairs = r; break;
    case 'dim': if (floor.dims) floor.dims = r; break;
    case 'stroke': if (floor.strokes) floor.strokes = r; break;
    case 'mark': if (floor.marks) floor.marks = r; break;
  }
}

/** Pevná vrstva druhu (stěna a schodiště Stavba, kóta Kóty, text, štítek a značka Popisky); kresba nemá pevnou. */
const FIXED: Partial<Record<OwnKind, Id>> = { wall: SYS.stavba, stair: SYS.stavba, dim: SYS.koty, text: SYS.popisky, room: SYS.popisky, mark: SYS.popisky };

/** Vrstva prvku bez `layerId` (starší data) – stejná jako u nového prvku bez aktivní vrstvy. */
export function kindDefaultLayer(kind: OwnKind): Id {
  return FIXED[kind] ?? SYS.kresba;
}

/**
 * Aktivní vrstva = vrstva, do které se kreslí (rozhodnutí uživatele 2026-11-20): jen VLASTNÍ vrstva, systémová
 * (Stavba, Kresba, Popisky, Kóty) aktivní být nemůže. Zvolená vlastní vrstva, jinak nejnižší vlastní vrstva;
 * jen když žádná vlastní vrstva není, Kresba. Všichni (nové prvky, Pero, Guma, panel) se ptají jen tady.
 */
export function activeDrawLayer(p: Pick<Project, 'layers' | 'activeLayer'> | null | undefined): Layer {
  const chosen = layerById(p, p?.activeLayer);
  if (chosen && !chosen.system) return chosen;
  const ls = layersOf(p);
  return ls.find(l => !l.system) ?? ls.find(l => l.id === SYS.kresba) ?? ls[0]!;
}

/**
 * Vrstva NOVÉHO prvku (pravidlo 4, rozhodnutí uživatele 2026-11-19, upraveno 2026-11-20): stěna a schodiště → Stavba,
 * volná kóta → Kóty, text, štítek místnosti a značka → Popisky; kresba a ruční tah (později symbol) → aktivní vrstva
 * (`activeDrawLayer` – vždy vlastní, do systémové se nekreslí). Jinam se prvek přesune tlačítkem „Přesunout do vrstvy“.
 */
export function newElementLayer(p: Pick<Project, 'layers' | 'activeLayer'> | null, kind: OwnKind): Id {
  return FIXED[kind] ?? activeDrawLayer(p).id;
}

/**
 * Vrstvy, na kterých prvek závisí: vlastní, u otvoru a výstupku vrstva stěny; výstupek v rohu leží ve dvou stěnách
 * (skrytý / zamčený je, když je skrytá / zamčená kterákoli z nich; pro export platí vrstva první stěny).
 */
export function elementLayers(floor: Floor, kind: ElemKind, id: Id): Id[] {
  if (kind === 'opening') {
    const o = floor.openings[id];
    return o ? elementLayers(floor, 'wall', o.wallId) : [];
  }
  if (kind === 'protrusion') {
    const w = floor.protrusions?.[id]?.wallId ?? floor.endProtrusions?.[id]?.wallId;
    if (w) return elementLayers(floor, 'wall', w);
    const cp = floor.cornerProtrusions?.[id];
    return cp ? [...new Set(cp.walls.flatMap(wid => elementLayers(floor, 'wall', wid)))] : [];
  }
  const el = ownCollection(floor, kind)[id];
  return el ? [el.layerId ?? kindDefaultLayer(kind)] : [];
}

/** Vrstva prvku (pro panel a export); u výstupku v rohu vrstva první stěny. */
export function elementLayer(floor: Floor, kind: ElemKind, id: Id): Id | null {
  return elementLayers(floor, kind, id)[0] ?? null;
}

/** Skryté a zamčené vrstvy projektu. */
export interface LayerState {
  hidden: Set<Id>;
  locked: Set<Id>;
}

const stateCache = new WeakMap<object, LayerState>();
export function layerState(p: Pick<Project, 'layers'> | null | undefined): LayerState {
  const key = p?.layers ?? DEFAULTS;
  let s = stateCache.get(key);
  if (!s) {
    const ls = layersOf(p);
    s = { hidden: new Set(ls.filter(l => !l.visible).map(l => l.id)), locked: new Set(ls.filter(l => l.locked).map(l => l.id)) };
    stateCache.set(key, s);
  }
  return s;
}

/** Pravidlo 1: prvek ve skryté vrstvě se nekreslí, nechytá a nevybírá. */
export function isHidden(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, kind: ElemKind, id: Id): boolean {
  const { hidden } = layerState(p);
  return hidden.size > 0 && elementLayers(floor, kind, id).some(l => hidden.has(l));
}

/** Pravidlo 2: prvek v zamčené vrstvě je vidět a chytá, ale nevybírá se a nedá se změnit. */
export function isLocked(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, kind: ElemKind, id: Id): boolean {
  const { locked } = layerState(p);
  return locked.size > 0 && elementLayers(floor, kind, id).some(l => locked.has(l));
}

/** Jde prvek vybrat (k úpravě, posunu, smazání)? Roh: patří-li aspoň jedné viditelné odemčené stěně a žádné zamčené. */
export function isSelectable(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, kind: ElemKind | 'node', id: Id): boolean {
  if (kind === 'node') {
    const walls = Object.values(floor.walls).filter(w => w.a === id || w.b === id);
    if (walls.some(w => isLocked(p, floor, 'wall', w.id))) return false;
    return walls.length === 0 || walls.some(w => !isHidden(p, floor, 'wall', w.id));
  }
  return !isHidden(p, floor, kind, id) && !isLocked(p, floor, kind, id);
}

/** Jde na čáru kresby navázat novým úsekem? Jen ve vrstvě, kam jde nová kresba, viditelné a odemčené. */
export function canJoinDrawing(p: Pick<Project, 'layers' | 'activeLayer'> | null | undefined, floor: Floor, id: Id): boolean {
  const l = elementLayer(floor, 'drawing', id);
  return l === newElementLayer(p ?? null, 'drawing') && isSelectable(p, floor, 'drawing', id);
}

/** Výběr bez prvků ve skrytých a zamčených vrstvách (např. po skrytí vrstvy s vybraným prvkem). */
export function selectableItems<T extends { kind: string; id: Id }>(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, items: T[]): T[] {
  const { hidden, locked } = layerState(p);
  if (!hidden.size && !locked.size) return items;
  return items.filter(i => isSelectable(p, floor, i.kind as ElemKind | 'node', i.id));
}

/**
 * Pohled na podlaží pro nástroje: 'snap' = bez skrytých prvků (přichytávání), 'pick' = bez skrytých a zamčených
 * (výběr ťuknutím a obdélníkem). Data se nemění; bez skrytých / zamčených vrstev je to totéž podlaží.
 * Volné kóty měřené ke skrytému prvku v pohledu zůstávají (jejich viditelnost je nezávislá, pravidlo 8) –
 * jejich body se počítají z celého podlaží (`fullFloorOf`).
 */
export function viewFloor(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, mode: 'snap' | 'pick'): Floor {
  const st = layerState(p);
  const drop = mode === 'snap' ? st.hidden : new Set([...st.hidden, ...st.locked]);
  if (!drop.size) return floor;
  const cacheKey = `${mode}:${[...drop].sort().join(',')}`;
  let perFloor = viewCache.get(floor);
  if (!perFloor) viewCache.set(floor, (perFloor = new Map()));
  const hit = perFloor.get(cacheKey);
  if (hit) return hit;
  const view = filterFloor(floor, (kind, id) => elementLayers(floor, kind, id).some(l => drop.has(l)));
  fullOf.set(view, floor);
  perFloor.set(cacheKey, view);
  return view;
}

const viewCache = new WeakMap<Floor, Map<string, Floor>>();
const fullOf = new WeakMap<Floor, Floor>();

/** Celé podlaží k pohledu z `viewFloor` (body volných kót ke skrytým prvkům); jinak totéž podlaží. */
export function fullFloorOf(floor: Floor): Floor {
  return fullOf.get(floor) ?? floor;
}

function keep<T extends { id: Id }>(rec: Record<Id, T> | undefined, ok: (x: T) => boolean): Record<Id, T> {
  const out: Record<Id, T> = {};
  for (const x of Object.values(rec ?? {})) if (ok(x)) out[x.id] = x;
  return out;
}

/** Podlaží bez prvků, které `drop` vyřadí (otvory a výstupky odejdou se stěnou, rohy zůstanou u zbylých stěn). */
function filterFloor(floor: Floor, drop: (kind: ElemKind, id: Id) => boolean): Floor {
  const walls = keep(floor.walls, w => !drop('wall', w.id));
  const used = new Set(Object.values(walls).flatMap(w => [w.a, w.b]));
  const nodes: Floor['nodes'] = {};
  for (const n of Object.values(floor.nodes)) {
    if (!used.has(n.id)) continue;
    // roh napojený na vyřazenou stěnu je v pohledu obyčejný roh
    nodes[n.id] = n.host && !walls[n.host] ? { id: n.id, x: n.x, y: n.y } : n;
  }
  const out: Floor = {
    ...floor,
    nodes,
    walls,
    openings: keep(floor.openings, o => !!walls[o.wallId]),
    protrusions: keep(floor.protrusions, x => !!walls[x.wallId]),
    endProtrusions: keep(floor.endProtrusions, x => !!walls[x.wallId]),
    cornerProtrusions: keep(floor.cornerProtrusions, x => x.walls.every(w => !!walls[w])),
    drawings: keep(floor.drawings, x => !drop('drawing', x.id)),
    stairs: keep(floor.stairs, x => !drop('stair', x.id)),
    rooms: keep(floor.rooms, x => !drop('room', x.id)),
    texts: keep(floor.texts, x => !drop('text', x.id)),
    dims: keep(floor.dims, x => !drop('dim', x.id)),
    strokes: keep(floor.strokes, x => !drop('stroke', x.id)),
    marks: keep(floor.marks, x => !drop('mark', x.id))
  };
  return out;
}

/**
 * Pravidlo 2 (rozhodnutí uživatele 2026-11-19): úprava, která by změnila prvek v zamčené vrstvě – přímo i přes
 * vazbu (sdílený roh, napojení, zamčená kóta, změna délky) –, se neprovede. Do zamčené vrstvy také nic nepřibude:
 * nový prvek (stěna, kresba, schodiště, štítek, text, kóta, ruční tah, otvor / výstupek na zamčené stěně) ani prvek
 * přesunutý z jiné vrstvy (rozhodnutí uživatele 2026-11-20). Vrací text hlášení, nebo null.
 * Porovnává se stav před a po úpravě (zámky podle stavu před úpravou).
 */
export function layerLockViolation(pBefore: Pick<Project, 'layers'> | null | undefined, before: Floor | undefined, after: Floor): string | null {
  if (!before) return null;
  const { locked } = layerState(pBefore);
  if (!locked.size) return null;
  const isLockedIn = (ids: Id[]) => ids.find(l => locked.has(l));
  const name = (l: Id) => `Nelze – úprava by změnila prvek v zamčené vrstvě „${layerById(pBefore, l)?.name ?? l}“.`;
  const added = (l: Id) => `Nelze – vrstva „${layerById(pBefore, l)?.name ?? l}“ je zamčená, nic do ní nepřibude.`;
  for (const kind of OWN_KINDS) {
    const b = ownCollection(before, kind);
    const a = ownCollection(after, kind);
    for (const el of Object.values(b)) {
      const l = isLockedIn([el.layerId ?? kindDefaultLayer(kind)]);
      if (!l) continue;
      // kóta přepojená na jiný prvek (dělení stěny, přečíslování) se nezměnila, měří-li stejné body se stejným odsazením
      if (!same(el, a[el.id]) && !(kind === 'dim' && sameDim(before, after, el as FreeDim, a[el.id] as FreeDim | undefined))) return name(l);
      if (kind === 'wall') {
        const w = el as Floor['walls'][string];
        for (const n of [w.a, w.b]) if (!same(before.nodes[n], after.nodes[n])) return name(l);
      }
    }
    // nový prvek v zamčené vrstvě nebo prvek do ní přesunutý (V2, 2026-11-20)
    for (const el of Object.values(a)) {
      const l = isLockedIn([el.layerId ?? kindDefaultLayer(kind)]);
      if (!l) continue;
      const old = b[el.id];
      if (!old || (old.layerId ?? kindDefaultLayer(kind)) !== (el.layerId ?? kindDefaultLayer(kind))) return added(l);
    }
  }
  const carried: [Record<Id, { id: Id }> | undefined, Record<Id, { id: Id }> | undefined, ElemKind][] = [
    [before.openings, after.openings, 'opening'],
    [before.protrusions, after.protrusions, 'protrusion'],
    [before.endProtrusions, after.endProtrusions, 'protrusion'],
    [before.cornerProtrusions, after.cornerProtrusions, 'protrusion']
  ];
  for (const [b, a, kind] of carried) {
    for (const el of Object.values(b ?? {})) {
      const l = isLockedIn(elementLayers(before, kind, el.id));
      if (l && !same(el, a?.[el.id])) return name(l);
    }
    // nový otvor / výstupek na stěně zamčené vrstvy = změna té stěny
    for (const el of Object.values(a ?? {})) {
      if (b?.[el.id]) continue;
      const l = isLockedIn(elementLayers(after, kind, el.id));
      if (l) return added(l);
    }
  }
  return null;
}

function sameDim(before: Floor, after: Floor, d: FreeDim, e: FreeDim | undefined): boolean {
  if (!e || d.offset !== e.offset) return false;
  const p = dimPoints(before, d);
  const q = dimPoints(after, e);
  return !!p && !!q && p.every((pt, i) => Math.hypot(pt.x - q[i]!.x, pt.y - q[i]!.y) < 0.01);
}

function same(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (!x || !y) return false;
  return JSON.stringify(x) === JSON.stringify(y);
}

/**
 * Doplní vrstvu prvkům bez `layerId` (nové prvky – pravidlo 4; volá `store.edit` po každé úpravě).
 * Kopie si vrstvu originálu nesou samy (pravidlo 5).
 */
export function assignLayers(p: Pick<Project, 'layers' | 'activeLayer'> | null, floor: Floor): void {
  for (const kind of OWN_KINDS) {
    const rec = ownCollection(floor, kind);
    for (const id in rec) {
      const el = rec[id]!;
      if (el.layerId === undefined || !layerById(p, el.layerId)) {
        el.layerId = newElementLayer(p, kind);
        // nový prvek do skryté vrstvy: vrstva se zobrazí (prvek nesmí po vytvoření zmizet), ve stejném kroku Zpět
        const layer = p?.layers?.find(l => l.id === el.layerId);
        if (layer && !layer.visible) layer.visible = true;
      }
    }
  }
}

/** Je stěna vidět (její vrstva není skrytá)? Pro automatické kóty a rohy. */
export function wallVisible(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, wallId: Id): boolean {
  return !isHidden(p, floor, 'wall', wallId);
}

/** Položka exportu: prvek, nebo automatické kóty stěny (`wallDims`, kreslí se ve vrstvě Kóty). */
export interface LayerItem {
  kind: ElemKind | 'wallDims';
  id: Id;
}

/**
 * Pravidlo 10 (příprava exportu PDF / DXF): prvky ke kreslení pro zadané vrstvy (`ids`; chybí = všechny) –
 * jen viditelné vrstvy, v pořadí kreslení. Otvory a výstupky jdou s vrstvou své stěny; automatické kóty stěny
 * patří vrstvě Kóty a jen u stěny, která se kreslí (rozhodnutí uživatele 2026-11-19).
 */
export function layerContents(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, ids?: Id[]): { layer: Layer; items: LayerItem[] }[] {
  const want = ids ? new Set(ids) : null;
  const layers = layersOf(p).filter(l => l.visible && (!want || want.has(l.id)));
  const byLayer = new Map<Id, LayerItem[]>(layers.map(l => [l.id, []]));
  const put = (kind: LayerItem['kind'], id: Id, layer: Id | null) => {
    if (layer !== null) byLayer.get(layer)?.push({ kind, id });
  };
  const drawnWall = (id: Id) => byLayer.has(elementLayer(floor, 'wall', id) ?? '');
  for (const kind of OWN_KINDS) for (const id in ownCollection(floor, kind)) put(kind, id, elementLayer(floor, kind, id));
  for (const id in floor.openings) put('opening', id, elementLayer(floor, 'opening', id));
  for (const rec of [floor.protrusions, floor.endProtrusions, floor.cornerProtrusions]) {
    for (const id in rec ?? {}) {
      // výstupek v rohu se kreslí, jen když se kreslí obě jeho stěny
      if (elementLayers(floor, 'protrusion', id).every(l => byLayer.has(l))) put('protrusion', id, elementLayer(floor, 'protrusion', id));
    }
  }
  for (const id in floor.walls) if (drawnWall(id) && !isHidden(p, floor, 'wall', id)) put('wallDims', id, SYS.koty);
  return layers.map(layer => ({ layer, items: byLayer.get(layer.id)! }));
}

/**
 * Podlaží pro kreslení jedné vrstvy: kresba, schodiště, štítky, texty a volné kóty jen z vrstvy `layerId`
 * (stěny, rohy a otvory zůstávají kvůli geometrii – které stěny se kreslí, řídí renderer).
 */
export function layerSlice(floor: Floor, layerId: Id): Floor {
  const mine = <T extends { id: Id; layerId?: Id }>(rec: Record<Id, T> | undefined, kind: OwnKind) => keep(rec, x => (x.layerId ?? kindDefaultLayer(kind)) === layerId);
  return {
    ...floor,
    drawings: mine(floor.drawings, 'drawing'),
    stairs: mine(floor.stairs, 'stair'),
    rooms: mine(floor.rooms, 'room'),
    texts: mine(floor.texts, 'text'),
    dims: mine(floor.dims, 'dim'),
    strokes: mine(floor.strokes, 'stroke'),
    marks: mine(floor.marks, 'mark')
  };
}

/** Které druhy prvků vrstva v podlaží obsahuje (kreslení přeskočí prázdné). */
export function kindsInLayer(floor: Floor, layerId: Id): Set<OwnKind> {
  const out = new Set<OwnKind>();
  for (const kind of OWN_KINDS) {
    for (const el of Object.values(ownCollection(floor, kind))) {
      if ((el.layerId ?? kindDefaultLayer(kind)) === layerId) {
        out.add(kind);
        break;
      }
    }
  }
  return out;
}
