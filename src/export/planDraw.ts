/**
 * Půdorys na listu – rozvržení (měřítko, posun, plocha listu) a kreslení stejnými funkcemi jako plátno
 * (canvas/drawFloor.ts). Bez knihovny PDF: používá ho PDF (export/pdfPlan.ts, „papír“ PdfCanvas) i náhled listu
 * v okně Export (ui/ExportPreview.tsx, obyčejné plátno) – náhled tak ukazuje přesně to, co bude v PDF.
 * Co se kreslí, rozhoduje jen výběr exportu (core/exportSelect.ts).
 */
import type { Floor, Id, Project, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { categoryOn, dimCategory, exportBounds, exportLayers, partOn, selectExport, type ExportContent, type ExportScope, type FloorExport } from '../core/exportSelect';
import type { Rect } from '../core/rect';
import { drawFloorLayers } from '../canvas/drawFloor';
import { setHitEnabled } from '../canvas/hitTargets';
import { setWallFilter } from '../canvas/layerDraw';
import { clearDimLabels, flushDimLabels, setDimFilter, setLabelAvoid } from '../canvas/dimLine';
import { autoFits, autoScale, DIM_ROOM, drawArea, MM_PER_PX, planRegion, type SheetFormat } from './sheetFormat';

/** Měřítko a posun jednoho listu půdorysu (zvolené v náhledu; posun = mm výkresu od středu rozsahu). */
export interface PlanView {
  scale: number | 'auto';
  pan?: Pt;
  /** V náhledu zvolené „Vlastní…“ měřítko (pole pro číslo zůstane vidět). */
  custom?: true;
}

/** Nastavení půdorysů, které potřebuje rozvržení i náhled (část nastavení PDF). */
export interface PlanSpec {
  scope: ExportScope;
  content?: ExportContent;
  layers?: Id[];
  /** Výchozí měřítko listů bez vlastního nastavení. */
  scale: number | 'auto';
  /** Nastavení jednotlivých listů podle klíče (`PlanSheet.key`). */
  views?: Record<string, PlanView>;
}

/** List půdorysu: klíč (podlaží nebo místnost), nadpis a výběr prvků. */
export interface PlanSheet {
  key: string;
  title: string;
  fe: FloorExport;
}

/** Listy půdorysu: u místností jeden list na místnost, jinak list na podlaží (výřez = jeden list). */
export function planSheets(project: Project, o: PlanSpec): PlanSheet[] {
  const spec = { format: 'pdf' as const, content: o.content, layers: o.layers };
  const sc = o.scope;
  if (sc.kind === 'rooms') {
    return sc.roomIds.flatMap(id =>
      selectExport(project, { ...spec, scope: { kind: 'rooms', floorId: sc.floorId, roomIds: [id] } }).map(fe => {
        const room = fe.floor.rooms[id];
        const name = room ? [room.number, room.name].filter(Boolean).join(' ') : '';
        return { key: `room:${id}`, title: `Půdorys místnosti ${name}`.trim() + ` (${fe.floor.name})`, fe };
      })
    );
  }
  // klíč i s druhem rozsahu – posun podlaží se nepřenese na výřez téhož podlaží
  return selectExport(project, { ...spec, scope: sc }).map(fe => ({ key: `${sc.kind === 'rect' ? 'rect' : 'floor'}:${fe.floor.id}`, title: sc.kind === 'rect' ? `Výřez – ${fe.floor.name}` : `Půdorys ${fe.floor.name}`, fe }));
}

/** Rozvržení půdorysu na listu. */
export interface PlanLayout {
  /** Měřítko 1 : n. */
  n: number;
  /** Plocha listu pro kresbu (mm od levého horního rohu papíru). */
  region: Rect;
  /** Kamera v px kreslení (1 px = MM_PER_PX mm papíru), počátek = levý horní roh plochy. */
  cam: Camera;
  wpx: number;
  hpx: number;
  /** Rozsah se v měřítku na list nevejde (část je mimo). */
  cropped: boolean;
}

/** Rozvržení: měřítko (zvolené / automatické), plocha nad razítkem nebo vedle něj, střed rozsahu + posun. */
export function planLayout(fe: FloorExport, f: SheetFormat, view: PlanView): PlanLayout | null {
  const bounds = exportBounds(fe);
  if (!bounds) return null;
  const n = view.scale === 'auto' ? autoScale(bounds, f) : view.scale;
  // plocha, do které se kresba vycentruje (nad razítkem nebo vedle něj); nevejde-li se, nad razítkem a ořízne se
  const region = planRegion(bounds, f, n) ?? drawArea(f);
  const zoom = 1 / (n * MM_PER_PX);
  const wpx = (region.x2 - region.x1) / MM_PER_PX;
  const hpx = (region.y2 - region.y1) / MM_PER_PX;
  const cx = (bounds.x1 + bounds.x2) / 2 + (view.pan?.x ?? 0);
  const cy = (bounds.y1 + bounds.y2) / 2 + (view.pan?.y ?? 0);
  const cam = { zoom, x: wpx / 2 - cx * zoom, y: hpx / 2 - cy * zoom };
  // oříznutí: rozsah s místem pro kóty (i po posunu v náhledu) přesahuje plochu listu
  const d = DIM_ROOM / MM_PER_PX;
  const out = bounds.x1 * zoom + cam.x - d < -0.5 || bounds.y1 * zoom + cam.y - d < -0.5 || bounds.x2 * zoom + cam.x + d > wpx + 0.5 || bounds.y2 * zoom + cam.y + d > hpx + 0.5;
  return { n, region, cam, wpx, hpx, cropped: out || !autoFits(bounds, f, n) };
}

/**
 * Podlaží pro jeden průchod kreslení: jen prvky z výběru exportu – plně (`full`), nebo okolí (`context`: jen
 * otvory a výstupky sousedních stěn, bez volných prvků). Stěny zůstávají kvůli napojení (kreslí se podle filtru);
 * vynechaný otvor / výstupek se tak nenakreslí ani nevyřízne z těla stěny.
 */
function exportFloor(fe: FloorExport, pass: 'full' | 'context'): Floor {
  const ctx = pass === 'context';
  const keep = (kind: string) => new Set(fe.items.filter(i => i.kind === kind && !!i.context === ctx && (ctx ? kind === 'opening' || kind === 'protrusion' : true)).map(i => i.id));
  const pick = <T,>(rec: Record<Id, T> | undefined, kind: string): Record<Id, T> => {
    const ids = keep(kind);
    return Object.fromEntries(Object.entries(rec ?? {}).filter(([id]) => ids.has(id)));
  };
  const hatch = partOn(fe, 'hatch');
  const drawings = pick(fe.floor.drawings, 'drawing');
  return {
    ...fe.floor,
    openings: pick(fe.floor.openings, 'opening'),
    protrusions: pick(fe.floor.protrusions, 'protrusion'),
    cornerProtrusions: pick(fe.floor.cornerProtrusions, 'protrusion'),
    endProtrusions: pick(fe.floor.endProtrusions, 'protrusion'),
    drawings: hatch ? drawings : Object.fromEntries(Object.entries(drawings).map(([id, d]) => [id, { ...d, hatch: undefined, hatchColor: undefined }])),
    stairs: pick(fe.floor.stairs, 'stair'),
    rooms: pick(fe.floor.rooms, 'room'),
    texts: pick(fe.floor.texts, 'text'),
    dims: pick(fe.floor.dims, 'dim'),
    strokes: pick(fe.floor.strokes, 'stroke'),
    marks: pick(fe.floor.marks, 'mark')
  };
}

/** Prvky, u kterých se kreslí i kóty „jen u vybraného“, když jsou zapnuté pracovní kóty. */
function allDimSelections(fe: FloorExport): Selection[] {
  if (!categoryOn(fe.format, fe.content, 'workDims')) return [null];
  const out: Selection[] = [];
  for (const it of fe.items) {
    if (it.context) continue;
    if (it.kind === 'wall' || it.kind === 'opening' || it.kind === 'protrusion' || it.kind === 'stair') out.push({ kind: it.kind, id: it.id } as Selection);
  }
  return out.length ? out : [null];
}

/**
 * Nakreslí půdorys do plochy listu (kontext: počátek = levý horní roh plochy, 1 jednotka = 1 px kreslení):
 * ořez plochy a rozsahu, okolí (`setGray` přepne šedé kreslení), pak plně exportované prvky; kóty jen podle výběru.
 */
export function drawPlanInto(ctx: CanvasRenderingContext2D, project: Project, fe: FloorExport, lay: PlanLayout, layers: Id[] | undefined, setGray: (on: boolean) => void): void {
  const { cam, wpx, hpx } = lay;
  const zoom = cam.zoom;
  const lp = exportLayers(project, layers);
  // geometrie (konce volných kót, plocha místnosti) z celého podlaží; klikací popisky export nevytváří
  const base = { selection: null, hover: null, dimScale: 1, lockBlock: null, helpers: false, geo: fe.floor, hits: false } as const;
  const full = new Set(fe.items.filter(i => i.kind === 'wall' && !i.context).map(i => i.id));
  const around = new Set(fe.items.filter(i => i.kind === 'wall' && i.context).map(i => i.id));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, wpx, hpx);
  ctx.clip();
  if (fe.clip) {
    const c = fe.clip;
    ctx.beginPath();
    ctx.rect(c.x1 * zoom + cam.x, c.y1 * zoom + cam.y, (c.x2 - c.x1) * zoom, (c.y2 - c.y1) * zoom);
    ctx.clip();
  }
  try {
    // okolí (sousední stěny u místnosti): šedě, bez kót a popisků
    if (around.size) {
      setGray(true);
      setDimFilter(() => false);
      drawFloorLayers(ctx, lp, exportFloor(fe, 'context'), cam, { ...base, walls: id => around.has(id) });
      setGray(false);
    }
    // kóta bez popisu (neklikací – řada napojení se skrytou stěnou) se neexportuje: nejde určit její role ani rozsah
    setDimFilter(t => !!t && dimCategory(fe, t) !== null);
    // čísla kót se nepřekrývají (přání uživatele 2026-11-23) – odsunou se podél kótovací čáry
    setLabelAvoid(true);
    drawFloorLayers(ctx, lp, exportFloor(fe, 'full'), cam, { ...base, walls: id => full.has(id), allDims: allDimSelections(fe), faceDims: id => full.has(id) });
    flushDimLabels();
  } finally {
    clearDimLabels();
    setDimFilter(null);
    setLabelAvoid(false);
    // po chybě uprostřed kreslení: editor musí mít klikací pole a kreslit všechny stěny
    setHitEnabled(true);
    setWallFilter(null);
    setGray(false);
    ctx.restore();
  }
}
