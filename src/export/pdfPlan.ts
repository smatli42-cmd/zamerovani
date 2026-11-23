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
import { MARGIN, MM_PER_PX, paperSize, STAMP_BOX_H, STAMP_W, type SheetFormat } from './sheetFormat';

export { autoScale, drawArea, MARGIN, MM_PER_PX, paperSize, planRegion, SCALES, STAMP_BOX_H, STAMP_H, STAMP_W, type Paper, type SheetFormat } from './sheetFormat';

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

/** Razítko vpravo dole: projekt a list, měřítko, datum zaměření, kdo měřil, číslo listu. */
export function drawStamp(page: PDFPage, fonts: PdfFonts, project: Project, f: SheetFormat, s: StampInfo): void {
  const [w] = paperSize(f);
  const P = PT_PER_MM;
  // minimalistické razítko (přání uživatele 2026-11-23): projekt a list, pod tím měřítko, datum, kdo měřil, číslo
  // listu; adresa a další údaje jsou na úvodní straně
  const bw = STAMP_W;
  const x0 = (w - MARGIN - bw) * P;
  const y0 = MARGIN * P;
  const h = STAMP_BOX_H * P;
  const line = rgb(0.06, 0.09, 0.16);
  page.drawRectangle({ x: x0, y: y0, width: bw * P, height: h, borderColor: line, borderWidth: 0.6 });
  const maxW = (bw - 4) * P;
  // 1. řádek: název listu tučně (zkracuje se jako poslední), za ním projekt obyčejně ve zbylém místě
  const title = fit(s.title, fonts.bold, 8, maxW);
  const tw = fonts.bold.widthOfTextAtSize(title, 8);
  page.drawText(title, { x: x0 + 2 * P, y: y0 + h - 4.6 * P, size: 8, font: fonts.bold, color: line });
  const rest = maxW - tw - 3 * P;
  if (rest > 12 * P && project.name) page.drawText(fit(`· ${project.name}`, fonts.regular, 7, rest), { x: x0 + 2 * P + tw + 3 * P, y: y0 + h - 4.6 * P, size: 7, font: fonts.regular, color: line });
  // 2. řádek: číslo listu vpravo (neuřízne se), vlevo měřítko, datum, kdo měřil (prázdné se vynechá)
  const list = `List ${s.page} / ${s.pages}`;
  const lw = fonts.regular.widthOfTextAtSize(list, 7);
  page.drawText(list, { x: x0 + (bw - 2) * P - lw, y: y0 + 2.6 * P, size: 7, font: fonts.regular, color: line });
  const date = project.surveyDate ? czDate(project.surveyDate) : '';
  const info = [s.scale ? `M 1 : ${s.scale}` : '', date, project.surveyor ? `zaměřil ${project.surveyor}` : ''].filter(Boolean).join('   ·   ');
  if (info) page.drawText(fit(info, fonts.regular, 7, maxW - lw - 4 * P), { x: x0 + 2 * P, y: y0 + 2.6 * P, size: 7, font: fonts.regular, color: line });
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
