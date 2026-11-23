/**
 * „Papír“ pro kreslicí funkce plátna: přijímá stejné příkazy jako `CanvasRenderingContext2D` (jen ty, které
 * kreslení výkresu používá – canvas/*.ts) a zapisuje je jako **vektory** do stránky PDF (pdf-lib). Díky tomu
 * PDF vypadá jako výkres v aplikaci a geometrie i vzhled jsou na jednom místě (canvas/drawFloor.ts).
 *
 * Jednotky: kreslicí funkce pracují v „px“; tady 1 px = `mmPerPx` mm na papíře (výchozí 0,25 mm – písmo 12 px
 * ≈ 3 mm). Souřadnice se převedou na body PDF (pt, počátek vlevo dole). Barva pozadí plátna = bílý papír.
 * Režim `gray` (okolí místnosti) kreslí vše šedě a tence.
 */
import { PDFName, PDFOperator, PDFPage, degrees, rgb, setGraphicsState, type PDFFont, type PDFImage } from 'pdf-lib';
import {
  appendBezierCurve,
  clip,
  clipEvenOdd,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingRgbColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  LineCapStyle,
  LineJoinStyle
} from 'pdf-lib';

export const PT_PER_MM = 72 / 25.4;

/** Afinní matice [a, b, c, d, e, f] jako v Canvas2D. */
type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
];

interface State {
  m: M;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  dash: number[];
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
}

export interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

type RGB = [number, number, number];

/** Barva z CSS zápisu (#rgb, #rrggbb, rgb(), rgba(), několik jmen) → [r, g, b] 0–1 a průhlednost. */
export function parseColor(css: string): { c: RGB; a: number } | null {
  const s = css.trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return null;
  if (s === 'white') return { c: [1, 1, 1], a: 1 };
  if (s === 'black') return { c: [0, 0, 0], a: 1 };
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 || h.length === 4 ? [...h].map(x => x + x).join('') : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return { c: [n(0), n(2), n(4)], a: full.length === 8 ? n(6) : 1 };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return { c: [p[0]! / 255, p[1]! / 255, p[2]! / 255], a: p[3] ?? 1 };
  }
  return { c: [0, 0, 0], a: 1 };
}

/** Pozadí plátna editoru (mazání pod otvorem apod.) = papír. */
const CANVAS_BG = ['#f8fafc', '#ffffff', '#fff'];

export class PdfCanvas {
  private st: State;
  private stack: State[] = [];
  /** Cesta v bodech PDF. */
  private path: { op: 'M' | 'L' | 'C' | 'Z'; p: number[] }[] = [];
  private cur: [number, number] | null = null;
  private start: [number, number] | null = null;
  /** px → pt: x' = ox + x·k, y' = oy − y·k. */
  private readonly base: M;
  /** Šedý režim (okolí místnosti). */
  gray = false;
  private images = new WeakMap<object, PDFImage>();

  constructor(
    readonly page: PDFPage,
    private readonly fonts: PdfFonts,
    /** Levý horní roh kreslicí plochy na stránce (pt) a měřítko px → mm papíru. */
    origin: { x: number; y: number },
    readonly mmPerPx = 0.25
  ) {
    const k = mmPerPx * PT_PER_MM;
    this.base = [k, 0, 0, -k, origin.x, origin.y];
    this.st = {
      m: [1, 0, 0, 1, 0, 0],
      strokeStyle: '#000',
      fillStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      dash: [],
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1
    };
  }

  /** Obrázek (fotka) pro `drawImage` – zdroj z prohlížeče se spáruje s vloženým obrázkem PDF. */
  registerImage(src: object, img: PDFImage): void {
    this.images.set(src, img);
  }

  // ---- stav ----
  save(): void {
    this.stack.push({ ...this.st, dash: [...this.st.dash], m: [...this.st.m] as M });
    this.ops(pushGraphicsState());
  }
  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.st = s;
    this.ops(popGraphicsState());
  }
  get strokeStyle(): string { return this.st.strokeStyle; }
  set strokeStyle(v: string) { if (typeof v === 'string') this.st.strokeStyle = v; }
  get fillStyle(): string { return this.st.fillStyle; }
  set fillStyle(v: string) { if (typeof v === 'string') this.st.fillStyle = v; }
  get lineWidth(): number { return this.st.lineWidth; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.st.lineWidth = v; }
  get lineCap(): CanvasLineCap { return this.st.lineCap; }
  set lineCap(v: CanvasLineCap) { this.st.lineCap = v; }
  get lineJoin(): CanvasLineJoin { return this.st.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { this.st.lineJoin = v; }
  get font(): string { return this.st.font; }
  set font(v: string) { this.st.font = v; }
  get textAlign(): CanvasTextAlign { return this.st.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.st.textAlign = v; }
  get textBaseline(): CanvasTextBaseline { return this.st.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.st.textBaseline = v; }
  get globalAlpha(): number { return this.st.globalAlpha; }
  set globalAlpha(v: number) { this.st.globalAlpha = Math.max(0, Math.min(1, v)); }
  setLineDash(d: number[]): void { this.st.dash = [...d]; }
  getLineDash(): number[] { return [...this.st.dash]; }

  // ---- transformace ----
  setTransform(a: number | DOMMatrix2DInit = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    // plátno editoru volá setTransform(dpr…) jen v rendereru; tady 1 px = 1 jednotka kreslení
    if (typeof a === 'object') this.st.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    else this.st.m = [a, b, c, d, e, f];
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.st.m = mul(this.st.m, [a, b, c, d, e, f]);
  }
  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number): void { this.transform(x, 0, 0, y, 0, 0); }
  rotate(r: number): void { this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0); }

  private full(): M {
    return mul(this.base, this.st.m);
  }
  private pt(x: number, y: number): [number, number] {
    const m = this.full();
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  /** Zvětšení uživatelských jednotek na body PDF (průměr os). */
  private unit(): number {
    const m = this.full();
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  }

  // ---- cesta ----
  beginPath(): void {
    this.path = [];
    this.cur = null;
    this.start = null;
  }
  moveTo(x: number, y: number): void {
    const p = this.pt(x, y);
    this.path.push({ op: 'M', p });
    this.cur = p;
    this.start = p;
  }
  lineTo(x: number, y: number): void {
    const p = this.pt(x, y);
    if (!this.cur) {
      this.path.push({ op: 'M', p });
      this.start = p;
    } else this.path.push({ op: 'L', p });
    this.cur = p;
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(x1, y1);
    const p = this.pt(x, y);
    this.path.push({ op: 'C', p: [...this.pt(x1, y1), ...this.pt(x2, y2), ...p] });
    this.cur = p;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const m = this.full();
    const inv = this.cur ? this.toUser(this.cur, m) : [cx, cy];
    const [x0, y0] = inv;
    this.bezierCurveTo(x0! + (2 / 3) * (cx - x0!), y0! + (2 / 3) * (cy - y0!), x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y), x, y);
  }
  private toUser(p: [number, number], m: M): [number, number] {
    const det = m[0] * m[3] - m[1] * m[2];
    const x = p[0] - m[4];
    const y = p[1] - m[5];
    return [(m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det];
  }
  closePath(): void {
    if (!this.path.length) return;
    this.path.push({ op: 'Z', p: [] });
    this.cur = this.start;
  }
  /** Oblouk jako Bézierovy křivky (po čtvrtinách) v uživatelských souřadnicích. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    // úhel jako v plátně: celý kruh jen po směru kreslení o 2π a víc, jinak zbytek po 2π ve směru kreslení
    const TAU = Math.PI * 2;
    const mod = (v: number) => ((v % TAU) + TAU) % TAU;
    const sweep = !ccw ? (a1 - a0 >= TAU ? TAU : mod(a1 - a0)) : a0 - a1 >= TAU ? -TAU : -mod(a0 - a1);
    const sx = cx + r * Math.cos(a0);
    const sy = cy + r * Math.sin(a0);
    if (this.cur) this.lineTo(sx, sy);
    else this.moveTo(sx, sy);
    if (Math.abs(sweep) < 1e-12) return;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const step = sweep / n;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < n; i++) {
      const t0 = a0 + step * i;
      const t1 = t0 + step;
      const p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)];
      const p3 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
      this.bezierCurveTo(p0[0]! - k * r * Math.sin(t0), p0[1]! + k * r * Math.cos(t0), p3[0]! + k * r * Math.sin(t1), p3[1]! - k * r * Math.cos(t1), p3[0]!, p3[1]!);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    this.save();
    this.translate(cx, cy);
    this.rotate(rot);
    this.scale(rx, ry);
    const keep = this.st.m;
    this.arc(0, 0, 1, a0, a1, ccw);
    this.st.m = keep;
    // cesta je už v bodech PDF – obnova stavu ji nezmění
    const path = this.path;
    const cur = this.cur;
    const start = this.start;
    this.restore();
    this.path = path;
    this.cur = cur;
    this.start = start;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number, radii: number | DOMPointInit | (number | DOMPointInit)[] = 0): void {
    // poloměry rohů jako v plátně: 1 hodnota = všechny, 2 = [LH+PD, PH+LD], 4 = LH, PH, PD, LD
    const list = (Array.isArray(radii) ? radii : [radii]).map(v => (typeof v === 'number' ? v : (v?.x ?? 0)));
    const [tl, tr, br, bl] =
      list.length >= 4 ? list : list.length === 3 ? [list[0]!, list[1]!, list[2]!, list[1]!] : list.length === 2 ? [list[0]!, list[1]!, list[0]!, list[1]!] : [list[0] ?? 0, list[0] ?? 0, list[0] ?? 0, list[0] ?? 0];
    const lim = (r: number) => Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    const [a, b, c, d] = [lim(tl!), lim(tr!), lim(br!), lim(bl!)];
    this.moveTo(x + a, y);
    this.lineTo(x + w - b, y);
    if (b) this.arc(x + w - b, y + b, b, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - c);
    if (c) this.arc(x + w - c, y + h - c, c, 0, Math.PI / 2);
    this.lineTo(x + d, y + h);
    if (d) this.arc(x + d, y + h - d, d, Math.PI / 2, Math.PI);
    this.lineTo(x, y + a);
    if (a) this.arc(x + a, y + a, a, Math.PI, Math.PI * 1.5);
    this.closePath();
  }

  // ---- kreslení ----
  private ops(...o: PDFOperator[]): void {
    this.page.pushOperators(...o);
  }
  private pathOps(): PDFOperator[] {
    const out: PDFOperator[] = [];
    for (const s of this.path) {
      if (s.op === 'M') out.push(moveTo(s.p[0]!, s.p[1]!));
      else if (s.op === 'L') out.push(lineTo(s.p[0]!, s.p[1]!));
      else if (s.op === 'C') out.push(appendBezierCurve(s.p[0]!, s.p[1]!, s.p[2]!, s.p[3]!, s.p[4]!, s.p[5]!));
      else out.push(closePath());
    }
    return out;
  }
  /** Barva a průhlednost (v šedém režimu bez průhlednosti, smíchaná s bílým papírem). */
  private paint(css: string, kind: 'stroke' | 'fill'): { c: RGB; a: number } | null {
    if (kind === 'fill' && CANVAS_BG.includes(css.trim().toLowerCase())) return { c: [1, 1, 1], a: 1 };
    const p = parseColor(css);
    if (!p) return null;
    const a = p.a * this.st.globalAlpha;
    if (a <= 0.01) return null;
    if (!this.gray) return { c: p.c, a };
    return { c: this.color(css, kind)!, a: 1 };
  }
  /** Průhlednost výplně i čar (ExtGState, jedna na stránku a hodnotu). */
  private alphaOps(a: number): PDFOperator[] {
    if (a >= 0.995) return [];
    const key = Math.round(a * 100) / 100;
    let byPage = alphaStates.get(this.page);
    if (!byPage) alphaStates.set(this.page, (byPage = new Map()));
    let name = byPage.get(key);
    if (!name) {
      name = this.page.node.newExtGState('GSa', this.page.doc.context.obj({ Type: 'ExtGState', ca: key, CA: key }));
      byPage.set(key, name);
    }
    return [setGraphicsState(name)];
  }
  /** Barva smíchaná s bílým papírem (text, šedý režim). */
  private color(css: string, kind: 'stroke' | 'fill'): RGB | null {
    if (kind === 'fill' && CANVAS_BG.includes(css.trim().toLowerCase())) return [1, 1, 1];
    const p = parseColor(css);
    if (!p) return null;
    const a = p.a * this.st.globalAlpha;
    if (a <= 0.01) return null;
    let c = p.c.map(v => 1 - (1 - v) * a) as RGB;
    if (this.gray) {
      // okolí: tmavé šedě, světlé (výplň těla stěny) světle šedě
      const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      const g = l > 0.9 ? l : kind === 'fill' ? Math.max(0.85, l) : 0.6;
      c = [g, g, g];
    }
    return c;
  }
  /** Cesta jako `Path2D` (ikony) v PDF neumíme přečíst – nekreslí se (a neobtáhne se omylem poslední cesta). */
  stroke(path?: Path2D): void {
    if (path) return;
    const pa = this.paint(this.st.strokeStyle, 'stroke');
    if (!pa || !this.path.length) return;
    const u = this.unit();
    const w = this.st.lineWidth * u * (this.gray ? 0.6 : 1);
    this.ops(
      pushGraphicsState(),
      ...this.alphaOps(pa.a),
      setStrokingRgbColor(...pa.c),
      setLineWidth(Math.max(0.1, w)),
      setLineCap(this.st.lineCap === 'round' ? LineCapStyle.Round : this.st.lineCap === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt),
      setLineJoin(this.st.lineJoin === 'round' ? LineJoinStyle.Round : this.st.lineJoin === 'bevel' ? LineJoinStyle.Bevel : LineJoinStyle.Miter),
      setDashPattern(
        this.st.dash.map(d => d * u),
        0
      ),
      ...this.pathOps(),
      stroke(),
      popGraphicsState()
    );
  }
  fill(rule: CanvasFillRule | Path2D = 'nonzero'): void {
    if (typeof rule === 'object') return;
    const pa = this.paint(this.st.fillStyle, 'fill');
    if (!pa || !this.path.length) return;
    this.ops(pushGraphicsState(), ...this.alphaOps(pa.a), setFillingRgbColor(...pa.c), ...this.pathOps(), rule === 'evenodd' ? PDFOperator.of('f*' as never) : fill(), popGraphicsState());
  }
  clip(rule: CanvasFillRule | Path2D = 'nonzero'): void {
    if (!this.path.length) return;
    this.ops(...this.pathOps(), rule === 'evenodd' ? clipEvenOdd() : clip(), endPath());
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.beginPath();
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.beginPath();
  }
  clearRect(): void {
    /* papír je bílý – nic */
  }

  // ---- text ----
  /** Velikost (px) a řez písma z CSS zápisu „700 12px system-ui“. */
  private fontOf(): { font: PDFFont; px: number } {
    const f = this.st.font;
    const px = Number(f.match(/([\d.]+)px/)?.[1] ?? 10);
    const w = f.match(/\b(bold|[6-9]00)\b/) ? 'bold' : 'regular';
    return { font: this.fonts[w], px };
  }
  /** Znaky, které písmo nemá, se nahradí (PDF by jinak nešlo uložit). */
  private safe(font: PDFFont, text: string): string {
    const set = charSets.get(font) ?? new Set(font.getCharacterSet());
    charSets.set(font, set);
    return [...text].map(ch => (set.has(ch.codePointAt(0)!) || ch === ' ' ? ch : '?')).join('');
  }
  measureText(text: string): TextMetrics {
    const { font, px } = this.fontOf();
    const width = font.widthOfTextAtSize(this.safe(font, String(text)), px);
    return { width, actualBoundingBoxAscent: px * 0.72, actualBoundingBoxDescent: px * 0.24 } as TextMetrics;
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    const pa = this.paint(this.st.fillStyle, 'fill');
    if (!pa) return;
    const c = pa.c;
    const { font } = this.fontOf();
    let { px } = this.fontOf();
    const t = this.safe(font, String(text));
    if (!t.trim()) return;
    let w = font.widthOfTextAtSize(t, px);
    // jako plátno: příliš dlouhý text se zúží na `maxWidth` (tady zmenšením písma)
    if (maxWidth !== undefined && maxWidth > 0 && w > maxWidth) {
      px *= maxWidth / w;
      w = maxWidth;
    }
    const al = this.st.textAlign;
    const dx = al === 'center' ? -w / 2 : al === 'right' || al === 'end' ? -w : 0;
    const bl = this.st.textBaseline;
    const dy = bl === 'middle' ? px * 0.35 : bl === 'top' || bl === 'hanging' ? px * 0.76 : bl === 'bottom' || bl === 'ideographic' ? -px * 0.24 : 0;
    const m = this.full();
    const [px0, py0] = this.pt(x + dx, y + dy);
    const ang = Math.atan2(m[1], m[0]);
    // neplatná poloha (kóta k zaniklému bodu) se nekreslí – PDF by se jinak nevytvořilo
    if (![px0, py0, ang, px].every(Number.isFinite)) return;
    this.page.drawText(t, { x: px0, y: py0, size: px * this.unit(), font, color: rgb(...c), opacity: pa.a, rotate: degrees((ang * 180) / Math.PI) });
  }
  strokeText(): void {
    /* obrys textu (bílý lem pod číslem) se v PDF nekreslí – papír je bílý */
  }

  // ---- obrázky ----
  drawImage(src: object, x: number, y: number, w?: number, h?: number): void {
    const img = this.images.get(src);
    if (!img) return;
    const ww = w ?? img.width;
    const hh = h ?? img.height;
    const [x0, y0] = this.pt(x, y + hh);
    const [x1, y1] = this.pt(x + ww, y);
    this.page.drawImage(img, { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) });
  }

  /** Jako kontext plátna pro kreslicí funkce (canvas/*.ts). */
  asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

const charSets = new WeakMap<PDFFont, Set<number>>();
const alphaStates = new WeakMap<PDFPage, Map<number, PDFName>>();
