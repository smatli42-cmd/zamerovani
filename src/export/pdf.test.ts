/**
 * Export do PDF (krok 2): listy, měřítko, razítko, co se na půdorys nakreslí (podle výběru exportu),
 * okolí šedě, kóty hlavní / pracovní, diakritika, výpisy, strany poznámek.
 */
// @ts-ignore – testy běží v Node (typy Node projekt nemá)
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createProject } from '../model/factory';
import type { Id } from '../model/types';
import { addDrawCircle, addDrawDouble, addDrawLine, addDrawRect, addFloor, addFreeDim, addLine, addMark, addOpening, addRoom, addStair, addStroke, addText, addWall, setLayerVisible, setRevealEnabled, toggleDimMain, updateDrawing, updateRoom } from '../store/actions';
import { protrusionsOf } from '../core/protrusion';
import type { ExportCategory, ExportContent } from '../core/exportSelect';
import { store } from '../store/store';
import { selectExport } from '../core/exportSelect';
import { autoScale, drawPlanSheet, paperSize, SCALES } from './pdfPlan';
import { buildPdf, pdfFileName, type PdfOptions } from './pdfExport';
import { PdfCanvas, parseColor, type PdfFonts } from './pdfCanvas';

const regular = new Uint8Array(readFileSync('public/fonts/NotoSans-Regular.ttf'));
const bold = new Uint8Array(readFileSync('public/fonts/NotoSans-Bold.ttf'));
const assets = { fontRegular: regular, fontBold: bold, loadPhoto: async () => null };

let fonts: PdfFonts;
let doc: PDFDocument;
beforeAll(async () => {
  doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  fonts = { regular: await doc.embedFont(regular), bold: await doc.embedFont(bold) };
});

/** Stránka, která si zapisuje texty a barvy čar (místo skutečného PDF). */
function fakePage() {
  const texts: string[] = [];
  const strokes: number[][] = [];
  const ops: string[] = [];
  const page = {
    doc,
    node: { newExtGState: () => PDFName.of('GSa1') },
    pushOperators: (...list: { toString(): string }[]) => {
      for (const op of list) {
        const s = op.toString();
        ops.push(s);
        const m = s.match(/^([\d.]+) ([\d.]+) ([\d.]+) RG$/);
        if (m) strokes.push([+m[1]!, +m[2]!, +m[3]!]);
      }
    },
    drawText: (t: string) => texts.push(t),
    drawImage: () => undefined
  };
  return { page: page as unknown as PDFPage, texts, strokes, ops };
}

const P = () => store.get().project!;
const f = () => store.floor()!;
const A4: PdfOptions = { paper: 'A4', landscape: false, scope: { kind: 'project' }, scale: 'auto', sheets: { plan: true, rooms: false, openings: false, marks: false } };

/** Místnost 4000 × 3000 se stěnami 200 ven, okno v dolní stěně, štítek „Kuchyň“. */
function room(): { room: Id; bottom: Id; op: Id } {
  const p = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 }
  ];
  for (let i = 0; i < 4; i++) addWall(p[i]!, null, p[(i + 1) % 4]!, null, false, { thickness: 200, side: -1 });
  const bottom = Object.values(f().walls).find(w => f().nodes[w.a]!.y === 0 && f().nodes[w.b]!.y === 0)!.id;
  const op = addOpening(bottom, 'window', 0.5)!;
  const r = addRoom({ x: 2000, y: 1500 })!;
  updateRoom(r, { name: 'Kuchyň' });
  return { room: r, bottom, op };
}

beforeEach(() => store.openProject(createProject({ name: 'Rodinný dům Šťastných' })));

describe('PDF – půdorys', () => {
  it('hlavní kóty ano, pracovní (otvor) jen když se zapnou; název místnosti s diakritikou', () => {
    room();
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'project' } })[0]!;
    const a = fakePage();
    drawPlanSheet(a.page, fonts, P(), fe, A4, 'auto', undefined);
    expect(a.texts).toContain('4000');
    expect(a.texts.some(t => t.includes('Kuchyň'))).toBe(true);
    expect(a.texts).not.toContain('1200'); // šířka okna = pracovní kóta
    const fw = selectExport(P(), { format: 'pdf', scope: { kind: 'project' }, content: { workDims: true } })[0]!;
    const b = fakePage();
    drawPlanSheet(b.page, fonts, P(), fw, A4, 'auto', undefined);
    expect(b.texts).toContain('1200');
  });

  it('kóta přepnutá na pracovní v PDF chybí; vypnuté hlavní kóty = žádné kóty', () => {
    const { bottom } = room();
    toggleDimMain({ kind: 'wall-length', wallId: bottom, move: 'both' });
    const a = fakePage();
    drawPlanSheet(a.page, fonts, P(), selectExport(P(), { format: 'pdf', scope: { kind: 'project' } })[0]!, A4, 'auto', undefined);
    expect(a.texts.filter(t => t === '4000')).toHaveLength(1); // horní stěna ano, dolní ne
    const b = fakePage();
    drawPlanSheet(b.page, fonts, P(), selectExport(P(), { format: 'pdf', scope: { kind: 'project' }, content: { mainDims: false } })[0]!, A4, 'auto', undefined);
    expect(b.texts).not.toContain('4000');
  });

  it('vypnutá kategorie (texty) se nenakreslí; volná kóta je hlavní', () => {
    room();
    addText({ x: 1000, y: 1000 });
    store.edit(fl => void (Object.values(fl.texts)[0]!.text = 'Komín'));
    addFreeDim({ x: 0, y: -2000 }, { x: 2500, y: -2000 });
    const a = fakePage();
    drawPlanSheet(a.page, fonts, P(), selectExport(P(), { format: 'pdf', scope: { kind: 'project' } })[0]!, A4, 'auto', undefined);
    expect(a.texts.some(t => t.includes('Komín'))).toBe(true);
    expect(a.texts).toContain('2500');
    const b = fakePage();
    drawPlanSheet(b.page, fonts, P(), selectExport(P(), { format: 'pdf', scope: { kind: 'project' }, content: { texts: false } })[0]!, A4, 'auto', undefined);
    expect(b.texts.some(t => t.includes('Komín'))).toBe(false);
  });

  it('místnost: okolí šedě (šedé čáry), kóty a štítek jen vybrané místnosti', () => {
    const { room: r } = room();
    // sousední místnost vpravo
    const q = [
      { x: 4400, y: 0 },
      { x: 7400, y: 0 },
      { x: 7400, y: 3000 },
      { x: 4400, y: 3000 }
    ];
    for (let i = 0; i < 4; i++) addWall(q[i]!, null, q[(i + 1) % 4]!, null, false, { thickness: 200, side: -1 });
    const other = addRoom({ x: 5900, y: 1500 })!;
    updateRoom(other, { name: 'Spíž' });
    const fe = selectExport(P(), { format: 'pdf', scope: { kind: 'rooms', floorId: f().id, roomIds: [r] } })[0]!;
    const a = fakePage();
    drawPlanSheet(a.page, fonts, P(), fe, A4, 'auto', undefined);
    expect(a.texts.some(t => t.includes('Kuchyň'))).toBe(true);
    expect(a.texts.some(t => t.includes('Spíž'))).toBe(false);
    expect(a.texts).not.toContain('3000 '); // kóta sousední místnosti (3000) – její stěny jsou jen okolí
    expect(a.strokes.some(([r1, g1, b1]) => Math.abs(r1! - 0.6) < 0.01 && r1 === g1 && g1 === b1)).toBe(true);
  });

  it('automatické měřítko: nejpodrobnější, do kterého se kresba vejde', () => {
    expect(SCALES).toEqual([20, 25, 50, 100, 200, 500]);
    const fmt = { paper: 'A4' as const, landscape: false };
    expect(autoScale({ x1: 0, y1: 0, x2: 3000, y2: 3000 }, fmt)).toBe(20);
    expect(autoScale({ x1: 0, y1: 0, x2: 7000, y2: 6000 }, fmt)).toBe(50);
    expect(autoScale({ x1: 0, y1: 0, x2: 15000, y2: 10000 }, fmt)).toBe(100);
    expect(paperSize({ paper: 'A3', landscape: true })).toEqual([420, 297]);
  });
});

describe('PDF – celý soubor', () => {
  it('listy: půdorys, výpis místností, výpis otvorů, poznámka; jde načíst; formát A3 na šířku', async () => {
    room();
    const m = addMark({ x: 1000, y: 2000 })!;
    store.edit(fl => {
      fl.marks![m]!.name = 'Vlhká zeď';
      fl.marks![m]!.note = 'Na stěně je plíseň do výšky 40 cm. Ověřit izolaci.';
    });
    const { bytes } = await buildPdf(P(), { ...A4, paper: 'A3', landscape: true, sheets: { plan: true, rooms: true, openings: true, marks: true } }, assets);
    const back = await PDFDocument.load(bytes);
    expect(back.getPageCount()).toBe(4);
    const [w, h] = [back.getPage(0).getWidth(), back.getPage(0).getHeight()];
    expect(Math.round((w / 72) * 25.4)).toBe(420);
    expect(Math.round((h / 72) * 25.4)).toBe(297);
    expect(back.getTitle()).toBe('Rodinný dům Šťastných');
  });

  it('prázdný projekt: jeden list s upozorněním; podlaží zvlášť', async () => {
    const empty = await PDFDocument.load((await buildPdf(P(), A4, assets)).bytes);
    expect(empty.getPageCount()).toBe(1);
    room();
    addFloor('2.NP');
    const { bytes } = await buildPdf(P(), A4, assets);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('název souboru bez zakázaných znaků', () => {
    expect(pdfFileName({ ...P(), name: 'Dům: Nová/ulice', surveyDate: '2026-11-23' })).toBe('Dům_Nováulice_2026-11-23.pdf');
  });
});

describe('PDF – převod kreslení', () => {
  it('barvy: #rgb, #rrggbb, rgba, průhlednost', () => {
    expect(parseColor('#fff')!.c).toEqual([1, 1, 1]);
    expect(parseColor('#0f172a')!.c[0]).toBeCloseTo(15 / 255);
    expect(parseColor('rgba(37,99,235,0.25)')!.a).toBe(0.25);
    expect(parseColor('transparent')).toBeNull();
  });

  it('text: chybějící znaky se nahradí, měření šířky z vloženého písma', () => {
    const a = fakePage();
    const cv = new PdfCanvas(a.page, fonts, { x: 0, y: 800 });
    cv.font = '500 12px system-ui';
    expect(cv.measureText('Kóta').width).toBeGreaterThan(10);
    cv.fillStyle = '#000';
    cv.fillText('Plocha 12,5 m² 😀', 10, 10);
    expect(a.texts[0]).toBe('Plocha 12,5 m² ?');
  });
});

describe('PDF – tabulka druh prvku × výstup (každý druh se nakreslí, vypnutá kategorie ne)', () => {
  /** Počet kreslicích příkazů a texty listu pro daný obsah. */
  const draw = (content: ExportContent = {}) => {
    const a = fakePage();
    drawPlanSheet(a.page, fonts, P(), selectExport(P(), { format: 'pdf', scope: { kind: 'project' }, content })[0]!, A4, 'auto', undefined);
    return { n: a.ops.filter(o => /^(S|f|f\*|c|l)$|\s(S|f|c|l)$/.test(o)).length, texts: a.texts };
  };
  const CASES: [string, ExportCategory, () => void][] = [
    ['stěna', 'walls', () => void addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })],
    ['otvor', 'openings', () => void addOpening(addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!, 'door', 0.5)],
    [
      'výstupek',
      'protrusions',
      () => {
        addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 });
        addLine({ x: 1500, y: 0 }, null, { x: 1500, y: -200 }, null);
        addLine({ x: 1500, y: -200 }, null, { x: 2500, y: -200 }, null);
        addLine({ x: 2500, y: -200 }, null, { x: 2500, y: 0 }, null);
        expect(protrusionsOf(f())).toHaveLength(1);
      }
    ],
    ['překlad (dvojitá čára)', 'lintels', () => void addDrawDouble({ x: 0, y: 0 }, { x: 3000, y: 0 }, 250, 1)],
    ['schodiště', 'stairs', () => void addStair({ x: 0, y: 0 }, { x: 1000, y: 3000 })],
    ['kresba – čára', 'drawing', () => void addDrawLine({ x: 0, y: 0 }, { x: 3000, y: 1000 })],
    ['kresba – kruh', 'drawing', () => void addDrawCircle({ x: 0, y: 0 }, 800)],
    ['šrafa', 'hatch', () => updateDrawing(addDrawRect({ x: 0, y: 0 }, { x: 2000, y: 1000 })!, { hatch: 'cross' as never })],
    ['místnost (štítek)', 'rooms', () => void addRoom({ x: 0, y: 0 })],
    ['text', 'texts', () => void addText({ x: 0, y: 0 })],
    ['volná kóta (hlavní)', 'mainDims', () => void addFreeDim({ x: 0, y: 0 }, { x: 2000, y: 0 })],
    ['ruční tah', 'strokes', () => void addStroke([{ x: 0, y: 0 }, { x: 1000, y: 600 }, { x: 2000, y: 0 }], 25)],
    ['poznámka', 'marks', () => void addMark({ x: 0, y: 0 })]
  ];
  for (const [name, cat, make] of CASES) {
    it(`${name}: kategorie „${cat}“ zapnutá kreslí, vypnutá ne`, () => {
      make();
      // stěna musí zůstat kvůli otvoru / výstupku – porovnává se jen vypnutí dané kategorie
      const on = draw();
      const off = draw({ [cat]: false });
      expect(on.n).toBeGreaterThan(off.n);
    });
  }

  it('ostění: otvor s ostěním se nakreslí (ostění je součást tvaru otvoru)', () => {
    const w = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const op = addOpening(w, 'window', 0.5)!;
    const before = draw().n;
    setRevealEnabled(op, true);
    expect(draw().n).toBeGreaterThan(before);
  });

  it('pracovní kóty: zapnuté přidají kóty (otvor), vypnuté ne', () => {
    addOpening(addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!, 'window', 0.5);
    expect(draw({ workDims: true }).n).toBeGreaterThan(draw().n);
  });

  it('volná kóta ke kresbě ve skryté vrstvě se nakreslí (pravidlo 8 – konce v celém podlaží)', () => {
    const line = addDrawLine({ x: 0, y: 0 }, { x: 2600, y: 0 })!;
    addFreeDim({ drawing: line, i: 0 }, { drawing: line, i: 1 }, -500);
    const layer = f().drawings![line]!.layerId!;
    setLayerVisible(layer, false);
    expect(Object.keys(f().dims ?? {})).toHaveLength(1);
    expect(draw().texts).toContain('2600');
  });

  it('volná kóta ke stěně, když jsou stěny vypnuté, se nakreslí', () => {
    addWall({ x: 0, y: 0 }, null, { x: 3300, y: 0 }, null, false, { thickness: 300, side: 1 });
    addFreeDim({ x: 0, y: 0 }, { x: 3300, y: 0 }, -800);
    expect(draw({ walls: false }).texts).toContain('3300');
  });
});

describe('PDF – převod oblouku', () => {
  it('čtvrtkruh po směru (plátno: y dolů) končí dole; celý kruh jen ve směru kreslení', () => {
    const a = fakePage();
    const cv = new PdfCanvas(a.page, fonts, { x: 0, y: 0 }, 25.4 / 72); // 1 px = 1 pt
    cv.beginPath();
    cv.arc(0, 0, 10, 0, Math.PI / 2);
    cv.strokeStyle = '#000';
    cv.stroke();
    const curve = a.ops.find(o => o.endsWith(' c'))!.split(' ').map(Number);
    // konec (0, 10) v px plátna = (0, −10) v bodech PDF (osa y nahoru)
    expect(curve[4]).toBeCloseTo(0, 5);
    expect(curve[5]).toBeCloseTo(-10, 5);
    const b = fakePage();
    const cv2 = new PdfCanvas(b.page, fonts, { x: 0, y: 0 });
    cv2.beginPath();
    cv2.arc(0, 0, 10, 0, Math.PI * 2, true);
    cv2.stroke();
    expect(b.ops.filter(o => o.endsWith(' c'))).toHaveLength(0);
  });
});
