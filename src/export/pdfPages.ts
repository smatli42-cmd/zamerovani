/**
 * PDF: výpisy (místnosti, otvory) a strany poznámek (číslo + název, text, skica, fotka).
 * Prvky bere jen z výběru exportu (core/exportSelect.ts).
 */
import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import { PDFName } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { MarkPage, Project, Pt } from '../model/types';
import type { FloorExport } from '../core/exportSelect';
import { partOn } from '../core/exportSelect';
import { formatArea, roomArea } from '../core/roomArea';
import { MARK_PREFIX } from '../core/marks';
import { sketchPolylines, labelBox } from '../core/sketch';
import { OPENING_DEFAULTS } from '../model/factory';
import { drawSketch } from '../canvas/drawSketch';
import { PdfCanvas, PT_PER_MM, type PdfFonts } from './pdfCanvas';
import { czDate, drawArea, fit, MM_PER_PX, newPage, paperSize, type SheetFormat } from './pdfPlan';

const INK = rgb(0.06, 0.09, 0.16);
const P = PT_PER_MM;

/** Vytvořený list a jeho nadpis do razítka. */
export interface Sheet {
  page: PDFPage;
  title: string;
  scale?: number;
}

interface Column {
  head: string;
  /** Šířka (mm). */
  w: number;
  right?: true;
}

/** Tabulka přes víc listů: nadpis, záhlaví sloupců, řádky. */
function table(doc: PDFDocument, fonts: PdfFonts, f: SheetFormat, title: string, cols: Column[], rows: string[][]): Sheet[] {
  const a = drawArea(f);
  const [, ph] = paperSize(f);
  const rowH = 6.5;
  const sheets: Sheet[] = [];
  let page: PDFPage | null = null;
  let y = 0;
  const start = () => {
    page = newPage(doc, f);
    sheets.push({ page, title });
    page.drawText(fit(title, fonts.bold, 14, (a.x2 - a.x1) * P), { x: a.x1 * P, y: (ph - a.y1 - 6) * P, size: 14, font: fonts.bold, color: INK });
    y = a.y1 + 14;
    row(cols.map(c => c.head), true);
  };
  const row = (cells: string[], head = false) => {
    let x = a.x1;
    const font = head ? fonts.bold : fonts.regular;
    cells.forEach((text, i) => {
      const c = cols[i]!;
      const t = fit(text, font, 9, (c.w - 2) * P);
      const tw = font.widthOfTextAtSize(t, 9);
      page!.drawText(t, { x: (c.right ? x + c.w - 1 : x + 1) * P - (c.right ? tw : 0), y: (ph - y - 4.5) * P, size: 9, font, color: INK });
      x += c.w;
    });
    page!.drawLine({ start: { x: a.x1 * P, y: (ph - y - rowH) * P }, end: { x: x * P, y: (ph - y - rowH) * P }, thickness: head ? 0.8 : 0.3, color: INK });
    y += rowH;
  };
  start();
  if (!rows.length) row(['(žádné)']);
  for (const r of rows) {
    if (y + rowH > a.y2) start();
    row(r);
  }
  return sheets;
}

const mm = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v)));

/** Výpis místností (podlaží, číslo, název, plocha, výšky) – místnosti ve výběru exportu. */
export function roomsSheets(doc: PDFDocument, fonts: PdfFonts, f: SheetFormat, fes: FloorExport[]): Sheet[] {
  const rows: string[][] = [];
  let total = 0;
  for (const fe of fes) {
    for (const it of fe.items) {
      if (it.kind !== 'room' || it.context) continue;
      const r = fe.floor.rooms[it.id];
      if (!r) continue;
      const area = roomArea(fe.floor, r);
      if (area) total += area;
      rows.push([fe.floor.name, r.number, r.name, area ? formatArea(area) : 'neuzavřená', r.heights.map(h => mm(h.value) + (h.note ? ` (${h.note})` : '')).join(', ')]);
    }
  }
  if (rows.length) rows.push(['', '', 'Celkem', formatArea(total), '']);
  return table(doc, fonts, f, 'Výpis místností', [
    { head: 'Podlaží', w: 25 },
    { head: 'Číslo', w: 20 },
    { head: 'Název', w: 60 },
    { head: 'Plocha', w: 28, right: true },
    { head: 'Světlé výšky (mm)', w: 55 }
  ], rows);
}

/** Výpis otvorů (podlaží, číslo, druh, šířka, výška, parapet, poznámka) – otvory ve výběru exportu. */
export function openingsSheets(doc: PDFDocument, fonts: PdfFonts, f: SheetFormat, fes: FloorExport[]): Sheet[] {
  const rows: string[][] = [];
  for (const fe of fes) {
    const ops = fe.items.filter(i => i.kind === 'opening' && !i.context).map(i => fe.floor.openings[i.id]!).filter(Boolean);
    ops.sort((a, b) => a.number.localeCompare(b.number, 'cs', { numeric: true }));
    for (const op of ops) {
      const sill = op.kind === 'window' || op.kind === 'french' ? mm(op.sill) : '';
      rows.push([fe.floor.name, op.number, OPENING_DEFAULTS[op.kind].label, mm(op.width), mm(op.height), sill, op.note]);
    }
  }
  return table(doc, fonts, f, 'Výpis otvorů', [
    { head: 'Podlaží', w: 22 },
    { head: 'Číslo', w: 16 },
    { head: 'Druh', w: 32 },
    { head: 'Šířka', w: 18, right: true },
    { head: 'Výška', w: 18, right: true },
    { head: 'Parapet', w: 18, right: true },
    { head: 'Poznámka', w: 64 }
  ], rows);
}

/** Zalomení textu na šířku (pt). */
function wrap(text: string, font: PdfFonts['regular'], size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(fit(next, font, size, 1e9), size) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Obal skici (px skici): fotka, jinak tahy, popisky a kóty. */
function sketchBounds(pg: MarkPage): { x: number; y: number; w: number; h: number } | null {
  if (pg.photo) return { x: 0, y: 0, w: pg.photo.w, h: pg.photo.h };
  const pts: Pt[] = [...pg.strokes.flatMap(st => sketchPolylines(st).flat()), ...pg.dims.flatMap(d => [d.a, d.b])];
  for (const lb of pg.labels) {
    const b = labelBox(lb.text, lb.x, lb.y, lb.k ?? 1);
    pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
  }
  if (!pts.length) return null;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const x = Math.min(...xs) - 20;
  const y = Math.min(...ys) - 20;
  return { x, y, w: Math.max(...xs) + 20 - x, h: Math.max(...ys) + 20 - y };
}

/** Fotka strany (JPEG) – načte ji volající (persistence/photos.ts v prohlížeči). */
export type PhotoLoader = (photoId: string) => Promise<Uint8Array | null>;

/**
 * Strany poznámek: jedna (či víc) stran na poznámku – číslo a název, podlaží, text poznámky a strany skici
 * (s fotkou jako podkladem, je-li zapnutá kategorie fotek a skic).
 */
export async function markSheets(doc: PDFDocument, fonts: PdfFonts, f: SheetFormat, fes: FloorExport[], loadPhoto: PhotoLoader): Promise<Sheet[]> {
  const sheets: Sheet[] = [];
  const a = drawArea(f);
  const [, ph] = paperSize(f);
  const W = (a.x2 - a.x1) * P;
  for (const fe of fes) {
    const withPages = partOn(fe, 'photos');
    const marks = fe.items.filter(i => i.kind === 'mark' && !i.context).map(i => fe.floor.marks?.[i.id]).filter((m): m is NonNullable<typeof m> => !!m);
    marks.sort((x, y) => x.num - y.num);
    for (const m of marks) {
      const title = `Poznámka ${MARK_PREFIX}${m.num}${m.name ? ` – ${m.name}` : ''}`;
      const pages = withPages ? m.pages : [];
      const count = Math.max(1, pages.length);
      for (let i = 0; i < count; i++) {
        const page = newPage(doc, f);
        sheets.push({ page, title });
        page.drawText(fit(i ? `${title} (pokračování)` : title, fonts.bold, 14, W), { x: a.x1 * P, y: (ph - a.y1 - 6) * P, size: 14, font: fonts.bold, color: INK });
        page.drawText(fit(`Podlaží ${fe.floor.name}`, fonts.regular, 9, W), { x: a.x1 * P, y: (ph - a.y1 - 11) * P, size: 9, font: fonts.regular, color: INK });
        let top = a.y1 + 15;
        if (i === 0 && m.note.trim()) {
          for (const ln of wrap(m.note, fonts.regular, 10, W)) {
            page.drawText(fit(ln, fonts.regular, 10, W), { x: a.x1 * P, y: (ph - top - 4) * P, size: 10, font: fonts.regular, color: INK });
            top += 5;
          }
          top += 3;
        }
        const pg = pages[i];
        if (pg) await drawSketchBox(page, fonts, pg, { x1: a.x1, y1: top, x2: a.x2, y2: a.y2 }, ph, loadPhoto);
      }
    }
  }
  return sheets;
}

async function drawSketchBox(page: PDFPage, fonts: PdfFonts, pg: MarkPage, box: { x1: number; y1: number; x2: number; y2: number }, ph: number, loadPhoto: PhotoLoader): Promise<void> {
  const b = sketchBounds(pg);
  if (!b || box.y2 - box.y1 < 20) return;
  const cv = new PdfCanvas(page, fonts, { x: box.x1 * P, y: (ph - box.y1) * P }, MM_PER_PX);
  const wpx = (box.x2 - box.x1) / MM_PER_PX;
  const hpx = (box.y2 - box.y1) / MM_PER_PX;
  const s = Math.min(wpx / b.w, hpx / b.h);
  let photo: { img: object; w: number; h: number } | null = null;
  if (pg.photo) {
    const bytes = await loadPhoto(pg.photo.id);
    if (bytes) {
      const img: PDFImage = await page.doc.embedJpg(bytes);
      const key = {};
      cv.registerImage(key, img);
      photo = { img: key, w: pg.photo.w, h: pg.photo.h };
    }
  }
  const ctx = cv.asContext();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, b.w * s, b.h * s);
  ctx.clip();
  drawSketch(ctx, b.w * s, b.h * s, { s, ox: -b.x * s, oy: -b.y * s }, pg, { photo: photo as never });
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, b.w * s, b.h * s);
}


/** Odkaz v PDF: obdélník (pt) na stránce, ťuknutím skok na celou stránku `target`. */
function linkTo(page: PDFPage, rect: [number, number, number, number], target: PDFPage): void {
  const ctx = page.doc.context;
  // akce GoTo (čtečky na Androidu ji znají spolehlivěji než samotné Dest)
  const annot = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: { S: 'GoTo', D: [target.ref, PDFName.of('Fit')] } });
  page.node.addAnnot(ctx.register(annot));
}

/**
 * Úvodní strana s obsahem (přání uživatele 2026-11-23): údaje projektu a seznam listů – číslo listu, název,
 * měřítko; ťuknutím na řádek se skočí na list. Vloží se na začátek dokumentu (i víc stran, když je listů hodně).
 */
export function coverSheets(doc: PDFDocument, fonts: PdfFonts, project: Project, f: SheetFormat, sheets: Sheet[]): Sheet[] {
  const a = drawArea(f);
  const [, ph] = paperSize(f);
  const W = (a.x2 - a.x1) * P;
  const rowH = 8;
  const head = 44;
  const perPage = Math.max(1, Math.floor((a.y2 - a.y1 - head) / rowH));
  const count = Math.max(1, Math.ceil(sheets.length / perPage));
  const out: Sheet[] = [];
  for (let c = 0; c < count; c++) {
    const page = doc.insertPage(c, [paperSize(f)[0] * P, ph * P]);
    out.push({ page, title: 'Obsah' });
    const text = (t: string, x: number, y: number, size: number, bold = false, maxW = W) =>
      page.drawText(fit(t, bold ? fonts.bold : fonts.regular, size, maxW), { x: x * P, y: (ph - y) * P, size, font: bold ? fonts.bold : fonts.regular, color: INK });
    text(project.name || 'Projekt', a.x1, a.y1 + 8, 20, true);
    const info = [project.address, `Datum zaměření: ${czDate(project.surveyDate)}`, project.surveyor ? `Zaměřil: ${project.surveyor}` : ''].filter(Boolean).join('   ·   ');
    text(info, a.x1, a.y1 + 16, 10);
    text(c ? 'Obsah (pokračování)' : 'Obsah', a.x1, a.y1 + 30, 14, true);
    text('Ťuknutím na řádek přejdete na list.', a.x1, a.y1 + 36, 8);
    sheets.slice(c * perPage, (c + 1) * perPage).forEach((s, k) => {
      const i = c * perPage + k;
      const y = a.y1 + head + k * rowH;
      const no = `${count + i + 1}`;
      text(no, a.x1, y + 5.5, 11, true);
      text(s.title, a.x1 + 14, y + 5.5, 11, false, W - 50 * P);
      if (s.scale) text(`1 : ${s.scale}`, a.x2 - 22, y + 5.5, 10);
      page.drawLine({ start: { x: a.x1 * P, y: (ph - y - rowH) * P }, end: { x: a.x2 * P, y: (ph - y - rowH) * P }, thickness: 0.3, color: INK, opacity: 0.4 });
      linkTo(page, [a.x1 * P, (ph - y - rowH) * P, a.x2 * P, (ph - y) * P], s.page);
    });
  }
  return out;
}
