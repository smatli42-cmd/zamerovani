/**
 * PDF: list papíru, měřítko, půdorys (stejné kreslení jako plátno – canvas/drawFloor.ts) a razítko.
 * Co se kreslí, rozhoduje jen výběr exportu (core/exportSelect.ts); tady se jen kreslí.
 */
import type { PDFDocument, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { Floor, Id, Project } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { categoryOn, dimCategory, exportBounds, exportLayers, partOn, type FloorExport } from '../core/exportSelect';
import { drawFloorLayers } from '../canvas/drawFloor';
import { clearDimLabels, flushDimLabels, setDimFilter } from '../canvas/dimLine';
import { PdfCanvas, PT_PER_MM, type PdfFonts } from './pdfCanvas';
import { autoFits, autoScale, drawArea, MARGIN, MM_PER_PX, paperSize, STAMP_H, type SheetFormat } from './sheetFormat';

export { autoScale, drawArea, MARGIN, MM_PER_PX, paperSize, SCALES, STAMP_H, type Paper, type SheetFormat } from './sheetFormat';

export function newPage(doc: PDFDocument, f: SheetFormat): PDFPage {
  const [w, h] = paperSize(f);
  return doc.addPage([w * PT_PER_MM, h * PT_PER_MM]);
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

export interface PlanResult {
  scale: number;
  /** Kresba se nevešla ani do nejmenšího měřítka – list je oříznutý. */
  cropped: boolean;
}

/**
 * Půdorys do listu: měřítko (zadané / automatické), vycentrování rozsahu, ořez, okolí šedě, pak plně
 * exportované prvky; kóty jen podle výběru exportu (hlavní / pracovní, rozsah).
 */
export function drawPlanSheet(page: PDFPage, fonts: PdfFonts, project: Project, fe: FloorExport, f: SheetFormat, scale: number | 'auto', layers: Id[] | undefined): PlanResult | null {
  const bounds = exportBounds(fe);
  if (!bounds) return null;
  const n = scale === 'auto' ? autoScale(bounds, f) : scale;
  const a = drawArea(f);
  const [, ph] = paperSize(f);
  const cv = new PdfCanvas(page, fonts, { x: a.x1 * PT_PER_MM, y: (ph - a.y1) * PT_PER_MM }, MM_PER_PX);
  const ctx = cv.asContext();
  const zoom = 1 / (n * MM_PER_PX);
  const wpx = (a.x2 - a.x1) / MM_PER_PX;
  const hpx = (a.y2 - a.y1) / MM_PER_PX;
  const cam: Camera = { zoom, x: wpx / 2 - ((bounds.x1 + bounds.x2) / 2) * zoom, y: hpx / 2 - ((bounds.y1 + bounds.y2) / 2) * zoom };
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
      cv.gray = true;
      setDimFilter(() => false);
      drawFloorLayers(ctx, lp, exportFloor(fe, 'context'), cam, { ...base, walls: id => around.has(id) });
      cv.gray = false;
    }
    // kóta bez popisu (neklikací – řada napojení se skrytou stěnou) se neexportuje: nejde určit její role ani rozsah
    setDimFilter(t => !!t && dimCategory(fe, t) !== null);
    drawFloorLayers(ctx, lp, exportFloor(fe, 'full'), cam, { ...base, walls: id => full.has(id), allDims: allDimSelections(fe), faceDims: id => full.has(id) });
    flushDimLabels();
  } finally {
    clearDimLabels();
    setDimFilter(null);
    cv.gray = false;
    ctx.restore();
  }
  return { scale: n, cropped: !autoFits(bounds, f, n) };
}

export interface StampInfo {
  title: string;
  scale?: number;
  page: number;
  pages: number;
}

/** Razítko vpravo dole: projekt, adresa, list, měřítko, datum zaměření, kdo měřil, číslo listu. */
export function drawStamp(page: PDFPage, fonts: PdfFonts, project: Project, f: SheetFormat, s: StampInfo): void {
  const [w] = paperSize(f);
  const P = PT_PER_MM;
  const bw = 120;
  const x0 = (w - MARGIN - bw) * P;
  const y0 = MARGIN * P;
  const h = (STAMP_H - 4) * P;
  const line = rgb(0.06, 0.09, 0.16);
  page.drawRectangle({ x: x0, y: y0, width: bw * P, height: h, borderColor: line, borderWidth: 0.8 });
  page.drawLine({ start: { x: x0, y: y0 + h * 0.5 }, end: { x: x0 + bw * P, y: y0 + h * 0.5 }, thickness: 0.4, color: line });
  page.drawLine({ start: { x: x0 + 70 * P, y: y0 }, end: { x: x0 + 70 * P, y: y0 + h * 0.5 }, thickness: 0.4, color: line });
  const t = (text: string, x: number, y: number, size: number, bold = false) =>
    page.drawText(fit(text, bold ? fonts.bold : fonts.regular, size, (bw - 4) * P), { x, y, size, font: bold ? fonts.bold : fonts.regular, color: line });
  page.drawText(fit(project.name || 'Projekt', fonts.bold, 10, (bw - 25) * P), { x: x0 + 2 * P, y: y0 + h - 5 * P, size: 10, font: fonts.bold, color: line });
  if (project.address) t(project.address, x0 + 2 * P, y0 + h - 9.5 * P, 7.5);
  t(s.title, x0 + 2 * P, y0 + h * 0.5 - 5 * P, 9, true);
  t(`Měřítko: ${s.scale ? `1 : ${s.scale}` : '—'}`, x0 + 2 * P, y0 + 3 * P, 7.5);
  t(`Zaměřil: ${project.surveyor || '—'}`, x0 + 72 * P, y0 + h * 0.5 - 5 * P, 7.5);
  t(`Datum: ${czDate(project.surveyDate)}`, x0 + 72 * P, y0 + 3 * P, 7.5);
  const list = `List ${s.page} / ${s.pages}`;
  page.drawText(list, { x: x0 + (bw - 2) * P - fonts.regular.widthOfTextAtSize(list, 7.5), y: y0 + h - 5 * P, size: 7.5, font: fonts.regular, color: line });
}

/** RRRR-MM-DD → D. M. RRRR. */
export function czDate(iso: string): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso || '—';
}

/** Text zkrácený na šířku (pt) – i se znaky, které písmo nemá. */
export function fit(text: string, font: PdfFonts['regular'], size: number, maxW: number): string {
  const set = new Set(font.getCharacterSet());
  let t = [...text].map(ch => (set.has(ch.codePointAt(0)!) || ch === ' ' ? ch : '?')).join('');
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + '…';
  return t;
}
