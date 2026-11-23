/**
 * Export do PDF (EXPORT-NAVRH.md, krok 2): seznam listů z nastavení exportu. Co jde na list, rozhoduje
 * výběr prvků (core/exportSelect.ts); kreslí se stejnými funkcemi jako plátno (canvas/drawFloor.ts) přes
 * „papír“ PDF (export/pdfCanvas.ts). Písmo Noto Sans (česká diakritika) je vložené do PDF.
 */
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Project } from '../model/types';
import { selectExport } from '../core/exportSelect';
import { planSheets, type PlanSpec } from './planDraw';
import { drawPlanSheet, drawStamp, newPage, type SheetFormat } from './pdfPlan';
import { coverSheets, markSheets, openingsSheets, roomsSheets, type PhotoLoader, type Sheet } from './pdfPages';

export interface PdfOptions extends SheetFormat, PlanSpec {
  /** Které listy: půdorys (podlaží / místnost / výřez), výpis místností, výpis otvorů, strany poznámek. */
  sheets: { cover?: boolean; plan: boolean; rooms: boolean; openings: boolean; marks: boolean };
}

export interface PdfAssets {
  fontRegular: Uint8Array;
  fontBold: Uint8Array;
  loadPhoto: PhotoLoader;
}

/** Vytvoří PDF (bajty) a upozornění (oříznutý list). Prázdný výběr = jeden list s upozorněním. */
export async function buildPdf(project: Project, o: PdfOptions, assets: PdfAssets): Promise<{ bytes: Uint8Array; warnings: string[]; scales: string[] }> {
  const warnings: string[] = [];
  const scales: string[] = [];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(project.name || 'Zaměření');
  doc.setCreator('Zaměřování');
  doc.setProducer('Zaměřování (pdf-lib)');
  const fonts = {
    regular: await doc.embedFont(assets.fontRegular, { subset: false }),
    bold: await doc.embedFont(assets.fontBold, { subset: false })
  };
  const sheets: Sheet[] = [];
  if (o.sheets.plan) {
    for (const ps of planSheets(project, o)) {
      const page = newPage(doc, o);
      const res = drawPlanSheet(page, fonts, project, ps.fe, o, o.views?.[ps.key] ?? { scale: o.scale }, o.layers);
      if (!res) {
        doc.removePage(doc.getPageCount() - 1);
        continue;
      }
      sheets.push({ page, title: ps.title, scale: res.scale });
      scales.push(`${ps.title} 1 : ${res.scale}`);
      if (res.cropped) warnings.push(`${ps.title}: kresba se v měřítku 1 : ${res.scale} celá nevejde na papír – je oříznutá (v náhledu ji posuňte, nebo zvolte větší papír či jiné měřítko).`);
    }
  }
  // výpisy a poznámky z celého rozsahu (u místností z vybraných místností)
  const all = selectExport(project, { format: 'pdf', scope: o.scope, content: o.content, layers: o.layers });
  if (o.sheets.rooms) sheets.push(...roomsSheets(doc, fonts, o, all));
  if (o.sheets.openings) sheets.push(...openingsSheets(doc, fonts, o, all));
  if (o.sheets.marks) sheets.push(...(await markSheets(doc, fonts, o, all, assets.loadPhoto)));
  if (!sheets.length) {
    const page = newPage(doc, o);
    page.drawText('Ve zvoleném rozsahu není nic k exportu.', { x: 40, y: page.getHeight() / 2, size: 14, font: fonts.regular });
    sheets.push({ page, title: 'Prázdný export' });
  }
  // úvodní strana s obsahem: ťuknutím na řádek se skočí na list (přání uživatele 2026-11-23)
  const all2 = o.sheets.cover ? [...coverSheets(doc, fonts, project, o, sheets), ...sheets] : sheets;
  all2.forEach((s, i) => drawStamp(s.page, fonts, project, o, { title: s.title, scale: s.scale, page: i + 1, pages: all2.length }));
  return { bytes: await doc.save(), warnings, scales };
}

/** Název souboru: projekt_datum.pdf (bez znaků, které soubor nesmí mít). */
export function pdfFileName(project: Project, suffix = ''): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_') || 'zamereni';
  return `${safe(project.name)}${suffix ? `_${safe(suffix)}` : ''}_${project.surveyDate || 'export'}.pdf`;
}
