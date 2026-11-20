/**
 * Nástroje Pero a Guma (ruční tahy, core/strokes.ts). Pero kreslí do aktivní vrstvy od ruky nebo tvar (čára –
 * navazuje na předchozí čáru, obdélník, kruh, oblouk – tětiva a pak vzepětí); vše je ruční tah. Prst posouvá a zoomuje
 * (input/pointer.ts – u těchto nástrojů prst vždy posouvá). Tah se při zvednutí vyhladí a uloží jako vektor.
 * Guma maže celé tahy v aktivní vrstvě; jedno gumování = jeden krok Zpět. Tahy se nechytají.
 */
import { addStroke, appendStrokePoint, eraseStrokesAt } from '../store/actions';
import { dist } from '../core/geometry';
import { sagittaTowards } from '../core/drawing';
import { drawSnap } from './drawSnap';
import { HIT_PX } from './types';
import type { SnapResult } from '../core/snapping';
import { drawSnapMarker } from './wallTool';
import { activeDrawLayer } from '../core/layers';
import { shapeStroke, smoothStroke } from '../core/strokes';
import type { Pt } from '../model/types';
import { store, type Camera } from '../store/store';
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import type { PointerInput, Tool } from './types';

let raw: Pt[] | null = null;

/** Barva aktivní vrstvy (náhled tahu). */
const activeColor = () => {
  const p = store.get().project;
  return activeDrawLayer(p).color;
};

/** Menší tažení tvaru (mm) se nebere – ťuknutí tvar nevytvoří. */
const MIN_SHAPE = 20;

/** Navázání na konec čáry: tah a jeho konec (`b` = poslední bod, `a` = první). */
type Chain = { id: string; end: 'a' | 'b' };

/**
 * Tvar: tažený začátek a konec; u oblouku po tětivě druhý krok – vzepětí (`bulge`). `floorId` = podlaží, na kterém
 * tvar začal (po přepnutí podlaží se rozpracovaný tvar zahodí). `snap` = přichycený bod (značka v náhledu).
 */
let shape: { a: Pt; b: Pt; sag: number; phase: 'drag' | 'bulge'; floorId: string | null; chain: Chain | null; snap: SnapResult | null } | null = null;
/** Poslední nakreslená čára (pokračování řetězu z jejího konce, jako u Čáry kresby). */
let lastLine: string | null = null;

const penShape = () => store.get().settings.penShape;

/** Bod tvaru: přichycení jako u kresby (jen pomůcka – rohy, stěny, kresba, zarovnání; tahy se nechytají). */
function snapShape(p: Pt, from: Pt | null): SnapResult {
  const v = store.view('snap');
  return v ? drawSnap(v, p, from) : { pt: p, node: null, wallHit: null, guides: [] };
}

/**
 * Konec poslední čáry pod perem → navázání. Jen viditelná a odemčená čára v aktivní vrstvě se stejnou tloušťkou
 * (tah má jednu tloušťku); jinak vznikne nový tah.
 */
function chainEnd(p: Pt): { pt: Pt; chain: Chain } | null {
  const s = lastLine ? store.view('pick')?.strokes?.[lastLine] : null;
  const pr = store.get().project;
  if (!s || s.pts.length < 2 || s.layerId !== activeDrawLayer(pr).id || s.width !== store.get().settings.penWidth) return null;
  const tol = HIT_PX.node / store.get().camera.zoom;
  const first = s.pts[0]!;
  const last = s.pts[s.pts.length - 1]!;
  if (dist(first, last) < 0.5) return null; // uzavřená
  if (dist(last, p) <= tol) return { pt: last, chain: { id: s.id, end: 'b' } };
  if (dist(first, p) <= tol) return { pt: first, chain: { id: s.id, end: 'a' } };
  return null;
}

/** Druhý konec navazované čáry (dosednutím na něj se lomená čára uzavře). */
function closingPoint(chain: Chain | null): Pt | null {
  const s = chain ? store.floor()?.strokes?.[chain.id] : null;
  if (!s || s.pts.length < 2) return null;
  return chain!.end === 'b' ? s.pts[0]! : s.pts[s.pts.length - 1]!;
}

/** Konec čáry / tvaru pod perem: u navazované čáry přednostně začátek řetězu (uzavření). */
function shapeEnd(p: Pt): void {
  if (!shape) return;
  const close = penShape() === 'line' ? closingPoint(shape.chain) : null;
  if (close && dist(close, p) <= HIT_PX.node / store.get().camera.zoom) {
    shape.b = close;
    shape.snap = { pt: close, node: null, wallHit: null, special: true, guides: [] };
    return;
  }
  const r = snapShape(p, penShape() === 'line' || penShape() === 'arc' ? shape.a : null);
  shape.b = r.pt;
  shape.snap = r;
}

/** Nápověda v liště Pera (druhý krok oblouku). */
export function penShapeMsg(): string | null {
  if (shape?.phase === 'bulge') return 'Oblouk: tažením perem nastav vyklenutí (zvednutím se oblouk nakreslí; na tětivě = rovná čára).';
  return null;
}

function lockedActive(): boolean {
  // zamčená aktivní vrstva: pero do ní nekreslí (vrstvy V2, stejně jako guma v ní nemaže)
  const pr = store.get().project;
  const l = activeDrawLayer(pr);
  if (!l.locked) return false;
  store.set({ lockBlock: { key: '', text: `Aktivní vrstva „${l.name}“ je zamčená – pero do ní nekreslí.` } });
  return true;
}

/** Výchozí vzepětí oblouku = čtvrtina tětivy (jako Oblouk kresby). */
const defaultSag = (a: Pt, b: Pt) => Math.max(10, Math.round(dist(a, b) / 4 / 10) * 10);

/** Rozpracovaný tvar z jiného podlaží / projektu se zahodí. */
function staleShape(): boolean {
  if (shape && shape.floorId !== store.get().floorId) {
    shape = null;
    lastLine = null;
    store.set({ toolMsg: null });
    return true;
  }
  return false;
}

export const penTool: Tool = {
  down(p: PointerInput) {
    staleShape();
    if (lockedActive()) {
      raw = null;
      shape = null;
      store.set({ toolMsg: null });
      return;
    }
    store.set({ selection: null, numpad: null });
    const kind = penShape();
    if (kind === 'free') {
      raw = [p.world];
    } else if (shape?.phase === 'bulge') {
      shape.sag = sagittaTowards(shape.a, shape.b, p.world);
    } else {
      const c = kind === 'line' ? chainEnd(p.world) : null;
      const s = c ? null : snapShape(p.world, null);
      const a = c?.pt ?? s!.pt;
      shape = { a, b: a, sag: 0, phase: 'drag', floorId: store.get().floorId, chain: c?.chain ?? null, snap: s };
    }
    requestRender();
  },
  drag(p) {
    if (raw) raw.push(p.world);
    else if (shape?.phase === 'bulge') shape.sag = sagittaTowards(shape.a, shape.b, p.world);
    else if (shape) shapeEnd(p.world);
    requestRender();
  },
  hover(p) {
    if (shape?.phase === 'bulge' && !staleShape()) {
      shape.sag = sagittaTowards(shape.a, shape.b, p.world);
      requestRender();
    }
  },
  up(p) {
    const width = store.get().settings.penWidth;
    if (raw) {
      raw.push(p.world);
      const zoom = store.get().camera.zoom;
      // vyhlazení podle zoomu: body po ~1 px, odchylka ~0,4 px
      const pts = smoothStroke(raw, 1 / zoom, 0.4 / zoom);
      raw = null;
      lastLine = null;
      addStroke(pts, width);
      requestRender();
      return;
    }
    if (!shape || staleShape()) return;
    const kind = penShape();
    if (kind === 'free') {
      shape = null;
      return;
    }
    if (shape.phase === 'bulge') {
      // oblouk: druhý krok hotový; vyklenutí 0 (ťuknutí na tětivu) = rovná čára
      const s = shape;
      shape = null;
      lastLine = null;
      addStroke(shapeStroke('arc', s.a, s.b, s.sag), width);
      store.set({ toolMsg: null });
      requestRender();
      return;
    }
    const { a, b, chain } = shape;
    const big = kind === 'rect' ? Math.abs(b.x - a.x) >= MIN_SHAPE && Math.abs(b.y - a.y) >= MIN_SHAPE : dist(a, b) >= MIN_SHAPE;
    if (!big) {
      shape = null;
      requestRender();
      return;
    }
    if (kind === 'arc') {
      shape = { ...shape, sag: defaultSag(a, b), phase: 'bulge', snap: null };
      store.set({ toolMsg: penShapeMsg() });
      requestRender();
      return;
    }
    shape = null;
    if (kind === 'line') {
      // navázání na konec poslední čáry: lomená čára (dosednutím na její začátek se uzavře)
      const end = shapeStroke('line', a, b)[1]!;
      if (chain && store.floor()?.strokes?.[chain.id]) appendStrokePoint(chain.id, chain.end, end);
      else lastLine = addStroke(shapeStroke('line', a, b), width);
    } else {
      // jiný tvar ukončí řetěz čar
      lastLine = null;
      addStroke(shapeStroke(kind, a, b), width);
    }
    requestRender();
  },
  cancel() {
    raw = null;
    shape = null;
    lastLine = null;
    store.set({ toolMsg: null });
    requestRender();
  },
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    const kind = penShape();
    let pts: Pt[] | null = raw;
    if (!pts && shape) {
      if (kind === 'arc' && shape.phase === 'bulge') pts = shapeStroke('arc', shape.a, shape.b, shape.sag);
      else if (kind !== 'free' && dist(shape.a, shape.b) > 0) pts = shapeStroke(kind, shape.a, shape.b);
      else pts = [shape.a];
    }
    if (!pts || !pts.length) return;
    ctx.save();
    ctx.strokeStyle = activeColor();
    ctx.lineWidth = Math.max(1, store.get().settings.penWidth * cam.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((q, i) => {
      const s = toScreen(q, cam);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (pts.length === 1) ctx.lineTo(toScreen(pts[0]!, cam).x + 0.01, toScreen(pts[0]!, cam).y);
    ctx.stroke();
    ctx.restore();
    // značka přichyceného bodu (roh, stěna, zvláštní bod), aby bylo vidět, proč konec „skočil“
    if (shape?.snap) drawSnapMarker(ctx, cam, shape.snap);
  }
};

/** Poloměr gumy na obrazovce (px). */
const ERASER_PX = 14;
let erasing = false;
let eraserAt: Pt | null = null;
/** Minulá poloha gumy (mm) – maže se i mezi vzorky pohybu (rychlé máchnutí). */
let lastErase: Pt | null = null;

function erase(p: PointerInput): void {
  eraserAt = p.screen;
  const r = ERASER_PX / store.get().camera.zoom;
  const from = lastErase ?? p.world;
  const n = Math.max(1, Math.ceil(Math.hypot(p.world.x - from.x, p.world.y - from.y) / r));
  for (let i = 1; i <= n; i++) eraseStrokesAt({ x: from.x + ((p.world.x - from.x) * i) / n, y: from.y + ((p.world.y - from.y) * i) / n }, r);
  lastErase = p.world;
  requestRender();
}

export function eraserMsg(): string {
  const p = store.get().project;
  const l = activeDrawLayer(p);
  if (l.locked) return `Aktivní vrstva „${l.name}“ je zamčená – guma nic nesmaže.`;
  if (!l.visible) return `Aktivní vrstva „${l.name}“ je skrytá – guma nic nesmaže.`;
  return `Guma maže celé ruční tahy jen v aktivní vrstvě „${l.name}“.`;
}

export const eraserTool: Tool = {
  down(p) {
    erasing = true;
    lastErase = null;
    store.beginGesture();
    erase(p);
  },
  drag(p) {
    if (erasing) erase(p);
  },
  up() {
    if (!erasing) return;
    erasing = false;
    store.endGesture();
  },
  hover(p) {
    eraserAt = p.screen;
    requestRender();
  },
  cancel() {
    if (erasing) store.endGesture();
    erasing = false;
    eraserAt = null;
  },
  drawOverlay(ctx: CanvasRenderingContext2D) {
    if (!eraserAt) return;
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(eraserAt.x, eraserAt.y, ERASER_PX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
};
