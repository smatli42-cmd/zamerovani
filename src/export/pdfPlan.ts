/**
 * PDF: list papíru, půdorys (rozvržení a kreslení export/planDraw.ts – stejné jako náhled) a razítko.
 * Co se kreslí, rozhoduje jen výběr exportu (core/exportSelect.ts); tady se jen kreslí.
 */
import type { PDFDocument, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { Id, Project } from '../model/types';
import type { FloorExport } from '../core/exportSelect';
import { drawPlanInto, planLayout, type PlanView } from './planDraw';
import { PdfCanvas, PT_PER_MM, type PdfFonts } from './pdfCanvas';
import { MARGIN, MM_PER_PX, paperSize, STAMP_H, STAMP_W, type SheetFormat } from './sheetFormat';

export { autoScale, drawArea, MARGIN, MM_PER_PX, paperSize, planRegion, SCALES, STAMP_H, STAMP_W, type Paper, type SheetFormat } from './sheetFormat';

export function newPage(doc: PDFDocument, f: SheetFormat): PDFPage {
  const [w, h] = paperSize(f);
  return doc.addPage([w * PT_PER_MM, h * PT_PER_MM]);
}

export interface PlanResult {
  scale: number;
  /** Kresba se do zvoleného měřítka nevešla – list je oříznutý. */
  cropped: boolean;
}

/**
 * Půdorys do listu PDF: rozvržení a kreslení jsou společné s náhledem (export/planDraw.ts); tady jen „papír“ PDF
 * (okolí šedě přes `PdfCanvas.gray`).
 */
export function drawPlanSheet(page: PDFPage, fonts: PdfFonts, project: Project, fe: FloorExport, f: SheetFormat, view: PlanView, layers: Id[] | undefined): PlanResult | null {
  const lay = planLayout(fe, f, view);
  if (!lay) return null;
  const [, ph] = paperSize(f);
  const cv = new PdfCanvas(page, fonts, { x: lay.region.x1 * PT_PER_MM, y: (ph - lay.region.y1) * PT_PER_MM }, MM_PER_PX);
  drawPlanInto(cv.asContext(), project, fe, lay, layers, on => (cv.gray = on));
  return { scale: lay.n, cropped: lay.cropped };
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
  const bw = STAMP_W;
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
