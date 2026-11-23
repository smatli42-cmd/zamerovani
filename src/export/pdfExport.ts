/**
 * Export do PDF (EXPORT-NAVRH.md, krok 2): seznam listů z nastavení exportu. Co jde na list, rozhoduje
 * výběr prvků (core/exportSelect.ts); kreslí se stejnými funkcemi jako plátno (canvas/drawFloor.ts) přes
 * „papír“ PDF (export/pdfCanvas.ts). Písmo Noto Sans (česká diakritika) je vložené do PDF.
 */
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Id, Project } from '../model/types';
import { selectExport, type ExportContent, type ExportScope, type FloorExport } from '../core/exportSelect';
import { drawPlanSheet, drawStamp, newPage, type SheetFormat } from './pdfPlan';
import { markSheets, openingsSheets, roomsSheets, type PhotoLoader, type Sheet } from './pdfPages';

export interface PdfOptions extends SheetFormat {
  scope: ExportScope;
  content?: ExportContent;
  /** Exportované vrstvy (chybí = viditelné). */
  layers?: Id[];
  /** Měřítko půdorysu (1 : n) nebo automaticky. */
  scale: number | 'auto';
  /** Které listy: půdorys (podlaží / místnost / výřez), výpis místností, výpis otvorů, strany poznámek. */
  sheets: { plan: boolean; rooms: boolean; openings: boolean; marks: boolean };
}

export interface PdfAssets {
  fontRegular: Uint8Array;
  fontBold: Uint8Array;
  loadPhoto: PhotoLoader;
}

/** Rozsah půdorysů: u místností jeden list na místnost, jinak podle výběru (podlaží / výřez). */
function planExports(project: Project, o: PdfOptions): FloorExport[] {
  const spec = { format: 'pdf' as const, content: o.content, layers: o.layers };
  const sc = o.scope;
  if (sc.kind === 'rooms') return sc.roomIds.flatMap(id => selectExport(project, { ...spec, scope: { kind: 'rooms', floorId: sc.floorId, roomIds: [id] } }));
  return selectExport(project, { ...spec, scope: sc });
}

/** Nadpis listu půdorysu. */
function planTitle(fe: FloorExport, scope: ExportScope): string {
  if (scope.kind === 'rooms') {
    const r = fe.items.find(i => i.kind === 'room' && !i.context);
    const room = r ? fe.floor.rooms[r.id] : undefined;
    const name = room ? [room.number, room.name].filter(Boolean).join(' ') : '';
    return `Půdorys místnosti ${name}`.trim() + ` (${fe.floor.name})`;
  }
  if (scope.kind === 'rect') return `Výřez – ${fe.floor.name}`;
  return `Půdorys ${fe.floor.name}`;
}

/** Vytvoří PDF (bajty) a upozornění (oříznutý list). Prázdný výběr = jeden list s upozorněním. */
export async function buildPdf(project: Project, o: PdfOptions, assets: PdfAssets): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const warnings: string[] = [];
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
    for (const fe of planExports(project, o)) {
      const page = newPage(doc, o);
      const res = drawPlanSheet(page, fonts, project, fe, o, o.scale, o.layers);
      if (!res) {
        doc.removePage(doc.getPageCount() - 1);
        continue;
      }
      sheets.push({ page, title: planTitle(fe, o.scope), scale: res.scale });
      if (res.cropped) warnings.push(`${planTitle(fe, o.scope)}: kresba se v měřítku 1 : ${res.scale} nevejde na papír – je oříznutá (zvolte větší papír nebo jiné měřítko).`);
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
  sheets.forEach((s, i) => drawStamp(s.page, fonts, project, o, { title: s.title, scale: s.scale, page: i + 1, pages: sheets.length }));
  return { bytes: await doc.save(), warnings };
}

/** Název souboru: projekt_datum.pdf (bez znaků, které soubor nesmí mít). */
export function pdfFileName(project: Project, suffix = ''): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_') || 'zamereni';
  return `${safe(project.name)}${suffix ? `_${safe(suffix)}` : ''}_${project.surveyDate || 'export'}.pdf`;
}
