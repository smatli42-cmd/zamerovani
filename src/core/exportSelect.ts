/**
 * Výběr prvků pro export (EXPORT-NAVRH.md, rozhodnutí uživatele 2026-11-23) – JEDINÉ místo pravidla
 * „co se exportuje“: **rozsah × obsah × vrstvy**, pro formát PDF i DXF (později BIM-light). Exportéry ho jen
 * využívají – samy nic nevybírají ani nepřejmenovávají.
 *
 * - **Kategorie obsahu** (`EXPORT_CATEGORIES`): druh prvku → kategorie, výchozí zapnutí pro PDF / DXF, co do
 *   formátu nesmí, a **název hladiny DXF** (mění se jen tady).
 * - **Vrstvy**: základ je `layerContents` (core/layers.ts, katalog V10); sada exportu může vybrat vrstvy sama,
 *   výchozí = aktuálně viditelné (rozhodnutí uživatele 2026-11-23).
 * - **Rozsah**: celý projekt / podlaží / místnosti (sousední stěny šedě jako „okolí“) / obdélníkový výřez.
 * - **Kóty**: hlavní × pracovní (core/dimRole.ts) – automatické kóty se rozhodují po jedné (`dimCategory`).
 * - **Hladina DXF** = podlaží + vrstva + kategorie (`dxfLayerName`), okolí na hladině podlaží „Okolí“.
 *
 * Nový druh prvku: doplnit kategorii do `itemCategory` (switch je úplný) a řádek do tabulky v EXPORT-NAVRH.md
 * + test `store/exportSelect.test.ts`.
 */
import type { Floor, Id, Project, Pt } from '../model/types';
import { inRect, segHitsRect, type Rect } from './rect';
import { openingsOnWall } from './floorQueries';
import { protrusionOutline } from './protrusion';
import { endOutline } from './endProtrusion';
import { cornerOutline } from './cornerProtrusion';
import { arcPolyline, circlePolyline } from './arc';
import type { DimTarget } from './dimLock';
import { isMainDim } from './dimRole';
import { elementLayer, layerContents, layersOf, type LayerItem } from './layers';
import { LOOSE_KINDS, type LooseKindId } from './looseElements';
import { selectInRect } from './rectSelect';
import { roomRegion } from './roomArea';
import { pointInPolygon, wallBodies } from './wallBody';

export type ExportFormat = 'pdf' | 'dxf';

/** Kategorie obsahu (řádky tabulky „druh prvku × výstup“). */
export type ExportCategory =
  | 'walls'
  | 'openings'
  | 'reveals'
  | 'protrusions'
  | 'lintels'
  | 'stairs'
  | 'drawing'
  | 'hatch'
  | 'rooms'
  | 'texts'
  | 'mainDims'
  | 'workDims'
  | 'marks'
  | 'strokes'
  | 'photos';

/** Zapnutí kategorie ve formátu: `on` výchozí zapnuto, `off` výchozí vypnuto, `never` do formátu nejde. */
type Use = 'on' | 'off' | 'never';

export interface CategoryDef {
  id: ExportCategory;
  /** Název v aplikaci. */
  label: string;
  /** Název hladiny DXF (část za podlažím a vrstvou). */
  dxf: string;
  pdf: Use;
  dxfUse: Use;
  /** V DXF se hladina zapíše vypnutá (pracovní kóty). */
  dxfLayerOff?: true;
}

/**
 * Tabulka kategorií – jediné místo názvů hladin a výchozího obsahu (EXPORT-NAVRH.md, rozhodnutí 2026-11-23).
 * Pomocná čára zatím jako prvek neexistuje (řádek přibude s ní).
 */
export const EXPORT_CATEGORIES: readonly CategoryDef[] = [
  { id: 'walls', label: 'Stěny', dxf: 'Stěny', pdf: 'on', dxfUse: 'on' },
  { id: 'openings', label: 'Otvory (okna, dveře)', dxf: 'Otvory', pdf: 'on', dxfUse: 'on' },
  { id: 'reveals', label: 'Ostění', dxf: 'Ostění', pdf: 'on', dxfUse: 'on' },
  { id: 'protrusions', label: 'Výstupky a vybrání', dxf: 'Výstupky', pdf: 'on', dxfUse: 'on' },
  { id: 'lintels', label: 'Překlady (dvojitá čára)', dxf: 'Překlady', pdf: 'on', dxfUse: 'on' },
  { id: 'stairs', label: 'Schodiště', dxf: 'Schodiště', pdf: 'on', dxfUse: 'on' },
  { id: 'drawing', label: 'Kresba (čára, obdélník, kruh, oblouk)', dxf: 'Kresba', pdf: 'on', dxfUse: 'on' },
  { id: 'hatch', label: 'Šrafy', dxf: 'Šrafy', pdf: 'on', dxfUse: 'on' },
  { id: 'rooms', label: 'Místnosti (číslo, název, plocha)', dxf: 'Místnosti', pdf: 'on', dxfUse: 'on' },
  { id: 'texts', label: 'Texty', dxf: 'Texty', pdf: 'on', dxfUse: 'on' },
  { id: 'mainDims', label: 'Hlavní kóty', dxf: 'Kóty', pdf: 'on', dxfUse: 'on' },
  // PDF: všechny kóty ve výchozím stavu (rozhodnutí uživatele 2026-11-23 po zkoušce, mění KOTY-ZAMEK-EXPORT B „PDF jen hlavní“)
  { id: 'workDims', label: 'Pracovní kóty', dxf: 'Kóty pracovní', pdf: 'on', dxfUse: 'on', dxfLayerOff: true },
  { id: 'marks', label: 'Poznámky (číslo a název)', dxf: 'Poznámky', pdf: 'on', dxfUse: 'on' },
  { id: 'strokes', label: 'Kresba od ruky (Pero)', dxf: 'Kresba od ruky', pdf: 'on', dxfUse: 'on' },
  { id: 'photos', label: 'Fotky a skici poznámek (příloha)', dxf: '', pdf: 'on', dxfUse: 'never' }
];

/** Hladina sousedních stěn u exportu místnosti (za předponou podlaží). */
export const CONTEXT_LAYER = 'Okolí';

const CAT = new Map(EXPORT_CATEGORIES.map(c => [c.id, c]));
export const categoryDef = (id: ExportCategory): CategoryDef => CAT.get(id)!;

/** Obsah: zapnutí kategorií (chybí = výchozí podle formátu). */
export type ExportContent = Partial<Record<ExportCategory, boolean>>;

/** Je kategorie ve formátu zapnutá? (`never` vždy ne, jinak volba obsahu, jinak výchozí) */
export function categoryOn(format: ExportFormat, content: ExportContent | undefined, id: ExportCategory): boolean {
  const def = categoryDef(id);
  const use = format === 'pdf' ? def.pdf : def.dxfUse;
  if (use === 'never') return false;
  return content?.[id] ?? use === 'on';
}

/** Rozsah exportu. Místnosti a výřez jsou v jednom podlaží. */
export type ExportScope =
  | { kind: 'project' }
  | { kind: 'floors'; floorIds: Id[] }
  | { kind: 'rooms'; floorId: Id; roomIds: Id[] }
  | { kind: 'rect'; floorId: Id; rect: Rect };

export interface ExportSpec {
  format: ExportFormat;
  scope: ExportScope;
  content?: ExportContent;
  /** Exportované vrstvy (chybí = aktuálně viditelné). */
  layers?: Id[];
}

/** Položka exportu: prvek (nebo automatické kóty stěny `wallDims`), jeho vrstva a kategorie. */
export interface ExportItem {
  kind: LayerItem['kind'];
  id: Id;
  layerId: Id;
  /** Kategorie; automatické kóty stěny = null (rozhoduje se po kótách – `dimCategory`). */
  category: ExportCategory | null;
  /** Okolí (sousední stěna u exportu místnosti): šedě, bez kót a popisků, v DXF hladina „Okolí“. */
  context?: true;
}

export interface FloorExport {
  floor: Floor;
  /** Prvky v pořadí kreslení (po vrstvách). */
  items: ExportItem[];
  /** Ořez kreslení (místnost s okolím / výřez); null = celé podlaží. */
  clip: Rect | null;
  /** Vlastní rozsah (místnost s tloušťkou stěn / výřez): poloha napojení se kótuje jen uvnitř; null = celé podlaží. */
  focus: Rect | null;
  format: ExportFormat;
  content: ExportContent | undefined;
}

/** Kategorie prvku (u automatických kót stěny null – rozhoduje `dimCategory`). */
export function itemCategory(floor: Floor, item: LayerItem): ExportCategory | null {
  switch (item.kind) {
    case 'wall':
      return 'walls';
    case 'opening':
      return 'openings';
    case 'protrusion':
      return 'protrusions';
    case 'drawing':
      return floor.drawings?.[item.id]?.shape === 'double' ? 'lintels' : 'drawing';
    case 'stair':
      return 'stairs';
    case 'room':
      return 'rooms';
    case 'text':
      return 'texts';
    case 'dim':
      return dimRoleCategory(floor, { kind: 'free-dim', dimId: item.id, move: 'b' });
    case 'stroke':
      return 'strokes';
    case 'mark':
      return 'marks';
    case 'wallDims':
      return null;
  }
}

const dimRoleCategory = (floor: Floor, t: DimTarget): ExportCategory => (isMainDim(floor, t) ? 'mainDims' : 'workDims');

/** Kategorie kóty (automatické i volné), nebo null = kóta do exportu nejde (kategorie vypnutá). */
export function dimCategory(fe: FloorExport, t: DimTarget): ExportCategory | null {
  if (!dimInScope(fe, t)) return null;
  const c = dimRoleCategory(fe.floor, t);
  return categoryOn(fe.format, fe.content, c) ? c : null;
}

/**
 * Kóta jde jen s prvky, které měří: stěna / otvor / výstupek / schodiště / volná kóta musí být v exportu plně;
 * dílčí kóty (otvor, výstupek, poloha napojení) jen u prvků uvnitř vlastního rozsahu (místnost – „kóty jen
 * vybraných prvků“); kóty ostění jen se zapnutou kategorií Ostění.
 */
function dimInScope(fe: FloorExport, t: DimTarget): boolean {
  const full = (kind: string, id: Id) => fe.items.some(i => i.kind === kind && i.id === id && !i.context);
  const inFocus = (item: LayerItem) => !fe.focus || carriedPoints(fe.floor, item).some(p => inRect(fe.focus!, p));
  const opening = (id: Id) => full('opening', id) && inFocus({ kind: 'opening', id });
  switch (t.kind) {
    case 'opening-reveal':
      return opening(t.openingId) && categoryOn(fe.format, fe.content, 'reveals');
    case 'opening-offset':
    case 'opening-width':
      return opening(t.openingId);
    case 'opening-gap':
      return opening(t.firstId) && opening(t.secondId);
    case 'protrusion-dim':
    case 'protrusion-sagitta':
    case 'corner-dim':
    case 'end-dim':
      return full('protrusion', t.protrusionId) && inFocus({ kind: 'protrusion', id: t.protrusionId });
    case 'stair-dim':
      return full('stair', t.stairId);
    case 'free-dim':
      return full('dim', t.dimId);
    case 'junction-gap': {
      const n = fe.floor.nodes[t.nodeId];
      return full('wallDims', t.wallId) && (!fe.focus || (!!n && inRect(fe.focus, n)));
    }
    case 'wall-length':
    case 'wall-face-length':
    case 'wall-sagitta':
    case 'circle-diameter':
    case 'wall-thickness':
    case 'comp-gap':
      return full('wallDims', t.wallId);
  }
}

/** Je zapnutá část prvku (ostění otvoru, šrafa kresby, fotky a skici poznámky)? */
export function partOn(fe: FloorExport, part: 'reveals' | 'hatch' | 'photos'): boolean {
  return categoryOn(fe.format, fe.content, part);
}

/** Bezpečný název hladiny DXF (zakázané znaky pryč). */
const dxfSafe = (s: string): string => s.replace(/[<>/\\":;?*|=,`]/g, '').trim();

/** Předpona podlaží v názvu hladiny (např. „1NP“). */
export const floorPrefix = (floor: Floor): string => dxfSafe(floor.name).replace(/\s+/g, '') || 'Podlazi';

/** Hladina DXF položky: podlaží + vrstva + kategorie, okolí „podlaží_Okolí“ (rozhodnutí uživatele 2026-11-23). */
export function dxfLayerName(p: Pick<Project, 'layers'> | null | undefined, floor: Floor, layerId: Id, cat: ExportCategory | typeof CONTEXT_LAYER): string {
  const pre = floorPrefix(floor);
  if (cat === CONTEXT_LAYER) return `${pre}_${CONTEXT_LAYER}`;
  const layer = layersOf(p).find(l => l.id === layerId);
  return `${pre}_${dxfSafe(layer?.name ?? layerId)}_${categoryDef(cat).dxf}`;
}

/** Projekt s viditelností vrstev podle výběru exportu (layerContents i kreslení berou jen viditelné). */
export function exportLayers(p: Pick<Project, 'layers'>, ids: Id[] | undefined): Pick<Project, 'layers'> {
  if (!ids) return p;
  const want = new Set(ids);
  return { layers: layersOf(p).map(l => ({ ...l, visible: want.has(l.id) })) };
}

/** Body čáry stěny (líce těla, u čáry bez tloušťky osa). */
function wallOutline(floor: Floor, wallId: Id): Pt[][] {
  const body = wallBodies(floor).get(wallId);
  if (body && body.poly.length) return [body.poly];
  const w = floor.walls[wallId];
  const a = w && floor.nodes[w.a];
  const b = w && floor.nodes[w.b];
  if (!w || !a || !b) return [];
  return [w.radius !== undefined ? circlePolyline(a, w.radius) : arcPolyline(a, b, w.sagitta ?? 0)];
}

const boxOf = (pts: Pt[]): Rect | null => {
  if (!pts.length) return null;
  const r: Rect = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const p of pts) {
    r.x1 = Math.min(r.x1, p.x);
    r.y1 = Math.min(r.y1, p.y);
    r.x2 = Math.max(r.x2, p.x);
    r.y2 = Math.max(r.y2, p.y);
  }
  return r;
};
const grow = (r: Rect, d: number): Rect => ({ x1: r.x1 - d, y1: r.y1 - d, x2: r.x2 + d, y2: r.y2 + d });

/** Okolí místnosti: sousední stěny do této vzdálenosti od stěn místnosti (mm, rozhodnutí v EXPORT-NAVRH.md „(já)“). */
export const ROOM_CONTEXT = 1000;
/** Volné prvky (kóty, popisky) smí místnost přesahovat o tolik (mm) – vnější kóty stěn místnosti. */
export const ROOM_LOOSE_MARGIN = 800;

/** Hustota vzorků po obrysu stěny pro test „hraničí s místností“ (mm) a odstup vzorku od líce. */
const SAMPLE = 100;
const PROBE = 2;

/**
 * Stěny, které místnost ohraničují (některý bod těsně vedle obrysu těla / čáry leží v místnosti), a body
 * uvnitř místnosti u nich (rozsah místnosti – průběžná stěna přes víc místností ho nezvětší).
 */
function roomWalls(floor: Floor, inRoom: (q: Pt) => boolean): { walls: Set<Id>; inside: Pt[] } {
  const walls = new Set<Id>();
  const inside: Pt[] = [];
  for (const id in floor.walls) {
    for (const ring of wallOutline(floor, id)) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const steps = Math.max(1, Math.ceil(len / SAMPLE));
        for (let s = 0; s <= steps; s++) {
          const t = (s + 0.5) / (steps + 1);
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          for (const q of [{ x: p.x + nx * PROBE, y: p.y + ny * PROBE }, { x: p.x - nx * PROBE, y: p.y - ny * PROBE }]) {
            if (!inRoom(q)) continue;
            walls.add(id);
            inside.push(q);
          }
        }
      }
    }
  }
  return { walls, inside };
}

/** Stěna, ke které prvek nesený stěnou patří (výstupek v rohu: obě stěny). */
function carrierWalls(floor: Floor, item: LayerItem): Id[] {
  if (item.kind === 'opening') return [floor.openings[item.id]?.wallId].filter((x): x is Id => !!x);
  if (item.kind === 'protrusion') {
    const w = floor.protrusions?.[item.id]?.wallId ?? floor.endProtrusions?.[item.id]?.wallId;
    if (w) return [w];
    return floor.cornerProtrusions?.[item.id]?.walls ?? [];
  }
  if (item.kind === 'wall' || item.kind === 'wallDims') return [item.id];
  return [];
}

/** Body prvku neseného stěnou (střed otvoru na čáře líce, obrys výstupku) – kde na stěně leží. */
function carriedPoints(floor: Floor, item: LayerItem): Pt[] {
  if (item.kind === 'opening') {
    const op = floor.openings[item.id];
    const w = op && floor.walls[op.wallId];
    const a = w && floor.nodes[w.a];
    const b = w && floor.nodes[w.b];
    if (!w || !a || !b || w.radius !== undefined) return [];
    const po = openingsOnWall(floor, w).find(x => x.op.id === item.id);
    if (!po) return [];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = (po.start + po.end) / 2 / len;
    return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }];
  }
  if (item.kind === 'protrusion') {
    const p = floor.protrusions?.[item.id];
    if (p) return protrusionOutline(floor, p) ?? [];
    const e = floor.endProtrusions?.[item.id];
    if (e) return endOutline(floor, e) ?? [];
    const c = floor.cornerProtrusions?.[item.id];
    if (c) return cornerOutline(floor, c) ?? [];
  }
  return [];
}

const LOOSE = new Map(LOOSE_KINDS.map(k => [k.kind, k]));
const touchesBox = (r: Rect, pts: Pt[]): boolean => {
  const b = boxOf(pts);
  return !!b && b.x2 >= r.x1 && b.x1 <= r.x2 && b.y2 >= r.y1 && b.y1 <= r.y2;
};

/** Zasahuje uzavřený obrys do obdélníku? (vrchol uvnitř, hrana přes, nebo obdélník uvnitř obrysu) */
function polyHitsRect(r: Rect, poly: Pt[]): boolean {
  if (poly.some(p => inRect(r, p))) return true;
  for (let i = 0; i < poly.length; i++) if (segHitsRect(r, poly[i]!, poly[(i + 1) % poly.length]!)) return true;
  return poly.length > 2 && pointInPolygon({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 }, poly);
}

/** Rozsah v jednom podlaží: která položka je plně, která jako okolí, ořez a vlastní rozsah. */
interface ScopeFilter {
  keep(item: LayerItem): 'full' | 'context' | null;
  clip: Rect | null;
  focus: Rect | null;
}

function roomScope(floor: Floor, roomIds: Id[]): ScopeFilter {
  const mine = roomIds
    .map(id => floor.rooms[id])
    .map(r => (r ? roomRegion(floor, r) : null))
    .filter((x): x is (q: Pt) => boolean => !!x);
  const inMine = (q: Pt) => mine.some(f => f(q));
  const labels = roomIds.map(id => floor.rooms[id]).filter((r): r is NonNullable<typeof r> => !!r);
  const { walls, inside } = roomWalls(floor, inMine);
  const inner = boxOf(inside);
  if (!inner) {
    // místnost bez uzavřeného obrysu: jen její štítek
    return { keep: it => (it.kind === 'room' && roomIds.includes(it.id) ? 'full' : null), clip: null, focus: null };
  }
  // rozsah místnosti = prostor uvnitř + tloušťka jejích stěn (průběžná stěna přes víc místností ho nezvětší)
  const thick = Math.max(0, ...[...walls].map(id => floor.walls[id]?.thickness ?? 0));
  const focus = grow(inner, thick + PROBE);
  const near = grow(focus, ROOM_CONTEXT);
  const looseBox = grow(focus, ROOM_LOOSE_MARGIN);
  const ctxWall = (id: Id) => touchesBox(near, wallOutline(floor, id).flat());
  return {
    clip: near,
    focus,
    keep(it) {
      if (it.kind === 'room') return roomIds.includes(it.id) ? 'full' : null;
      const carriers = carrierWalls(floor, it);
      if (carriers.length) {
        const own = carriers.some(w => walls.has(w));
        if (it.kind === 'wall' && own) return 'full';
        // kóty stěny jen u stěny místnosti (dílčí kóty jen u prvků místnosti – dimCategory)
        if (it.kind === 'wallDims') return own ? 'full' : null;
        // otvor / výstupek na stěně místnosti plně, jen když leží u místnosti (průběžná stěna jde dál)
        // otvor / výstupek se kreslí se svou stěnou: na stěně místnosti plně (v ořezu; kóty jen u místnosti –
        // dimInScope), na sousední stěně jako okolí
        const shown = carriedPoints(floor, it).some(p => inRect(near, p));
        if (own) return shown ? 'full' : null;
        // okolí: jen stěny a jejich otvory / výstupky, bez kót (EXPORT-NAVRH.md)
        if (it.kind === 'wall') return ctxWall(it.id) ? 'context' : null;
        return shown ? 'context' : null;
      }
      const k = LOOSE.get(it.kind as LooseKindId);
      const pts = k ? k.extent(floor, it.id) : [];
      if (!pts.length || !pts.every(p => inRect(looseBox, p))) return null;
      const c = boxOf(pts)!;
      const mid = { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
      // střed v místnosti, nebo mimo uzavřený prostor (vnější kóta, ve stěně); v jiném prostoru (i bez štítku) ne
      // (prostor kolem středu je „můj“, když obsahuje štítek exportované místnosti – i střed na líci stěny)
      if (inMine(mid)) return 'full';
      const space = roomRegion(floor, mid);
      return !space || labels.some(l => space(l)) ? 'full' : null;
    }
  };
}

function rectScope(floor: Floor, rect: Rect): ScopeFilter {
  const hits = selectInRect(floor, rect, true);
  const walls = new Set(hits.filter(h => h.kind === 'wall').map(h => h.id));
  // i stěna, do jejíhož těla výřez zasahuje, aniž by se dotkl čáry líce
  for (const id in floor.walls) if (!walls.has(id) && wallOutline(floor, id).some(r => polyHitsRect(rect, r))) walls.add(id);
  const set = new Set(hits.map(h => `${h.kind}:${h.id}`));
  return {
    clip: rect,
    focus: rect,
    keep(it) {
      const carriers = carrierWalls(floor, it);
      if (carriers.length) return carriers.some(w => walls.has(w)) ? 'full' : null;
      return set.has(`${it.kind}:${it.id}`) ? 'full' : null;
    }
  };
}

const ALL: ScopeFilter = { keep: () => 'full', clip: null, focus: null };

/** Podlaží v rozsahu exportu (v pořadí projektu). */
function scopeFloors(p: Project, scope: ExportScope): Floor[] {
  if (scope.kind === 'project') return p.floors;
  if (scope.kind === 'floors') return p.floors.filter(f => scope.floorIds.includes(f.id));
  return p.floors.filter(f => f.id === scope.floorId);
}

/**
 * Výběr prvků pro export: pro každé podlaží v rozsahu položky zvolených vrstev a zapnutých kategorií,
 * v pořadí kreslení, s ořezem rozsahu. Automatické kóty stěn jdou jen se stěnou v rozsahu (ne s okolím)
 * a jen když je zapnutá aspoň jedna kategorie kót (po kótách rozhodne `dimCategory`).
 */
export function selectExport(p: Project, spec: ExportSpec): FloorExport[] {
  const lp = exportLayers(p, spec.layers);
  const on = (c: ExportCategory) => categoryOn(spec.format, spec.content, c);
  return scopeFloors(p, spec.scope).map(floor => {
    const scope = spec.scope.kind === 'rooms' ? roomScope(floor, spec.scope.roomIds) : spec.scope.kind === 'rect' ? rectScope(floor, spec.scope.rect) : ALL;
    const items: ExportItem[] = [];
    for (const g of layerContents(lp, floor)) {
      for (const it of g.items) {
        const category = itemCategory(floor, it);
        if (category ? !on(category) : !on('mainDims') && !on('workDims')) continue;
        const where = scope.keep(it);
        if (!where) continue;
        const layerId = it.kind === 'wallDims' ? g.layer.id : (elementLayer(floor, it.kind, it.id) ?? g.layer.id);
        items.push({ kind: it.kind, id: it.id, layerId, category, ...(where === 'context' ? { context: true as const } : {}) });
      }
    }
    return { floor, items, clip: scope.clip, focus: scope.focus, format: spec.format, content: spec.content };
  });
}

/**
 * Rozsah kresby listu (mm): vlastní rozsah (místnost / výřez), jinak obal plně exportovaných prvků (stěny, volné prvky).
 * null = nic ke kreslení.
 */
export function exportBounds(fe: FloorExport): Rect | null {
  // vlastní rozsah (místnost s tloušťkou stěn / výřez), ne okolí – měřítko listu se řídí místností
  if (fe.focus) return fe.focus;
  if (fe.clip) return fe.clip;
  const pts: Pt[] = [];
  for (const it of fe.items) {
    if (it.context) continue;
    if (it.kind === 'wall') pts.push(...wallOutline(fe.floor, it.id).flat());
    else if (it.kind === 'opening' || it.kind === 'protrusion' || it.kind === 'wallDims') continue;
    else pts.push(...(LOOSE.get(it.kind as LooseKindId)?.extent(fe.floor, it.id) ?? []));
  }
  return boxOf(pts);
}
