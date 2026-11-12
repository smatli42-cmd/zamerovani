/**
 * Nástroj „Stěna“: tažením perem se nakreslí stěna (čára líce = modře, tělo v aktuální tloušťce šedě),
 * rovná nebo oblouková (menu Stěny; oblouk se vyklene o „výšku oblouku“ na stranu těla, tj. ven).
 * Začátek i konec se přichytávají na rohy, směr do 90°, zarovnání s rohy.
 * Odchýlením pera na jednu nebo druhou stranu od čáry se tělo překlopí (zvolená strana se zapamatuje).
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { add, dist, dot, normal, scale, sub } from '../core/geometry';
import { dragParams, drawLinesFrom, linesNear, resolveDragPoint, type DragLine } from '../core/dragResolve';
import { findWallNear } from '../core/floorQueries';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import { facePath, initialSideAt, sideFromPen, straightContinuation } from '../core/wallBody';
import type { Floor, Pt, Wall } from '../model/types';
import { addWall } from '../store/actions';
import { activeWallArcHeight, activeWallThickness } from '../model/factory';
import { store, type Camera } from '../store/store';
import { pickAny } from './pick';
import { drawGuides, grabArcHandle, selectTool } from './selectTool';
import { HIT_PX, type PointerInput, type Tool } from './types';

interface Drawing {
  start: SnapResult;
  end: SnapResult;
  /** Skutečné místo dotyku (bez přichycení) – pro výběr prvku ťuknutím. */
  downAt: Pt;
  /** Strana těla zvolená odchýlením pera (null = automaticky). */
  side: 1 | -1 | null;
  /** Pomocné čáry z počátku (vodorovně / svisle, pokračování, kolmice) a zachycená čára (hystereze). */
  lines: DragLine[];
  lock: string | null;
  guide: { line: DragLine | null; point: Pt; lines: DragLine[] } | null;
}

/** Poloměr zachycení pomocné čáry (px) a vzdálenost, do které se nabízí kolmice ke stěně. */
const capturePx = (p: PointerInput) => (p.device === 'touch' ? 16 : 10);
const NEAR_PX = 60;

/**
 * Konec kreslené stěny: roh a zvláštní bod mají přednost; pak pomocná čára (délka po 10 mm, na průsečíku
 * se stěnou přesně, konec na stěně se na ni napojí); jinak libovolný směr (D11/D13 i pro kreslení).
 */
function guidedEnd(floor: Floor, d: Drawing, p: PointerInput): SnapResult {
  const { settings, camera } = store.get();
  const base = snapEnd(floor, d.start.pt, p.world, snapOptions(d.start.node?.id));
  d.guide = null;
  if (!settings.snap || base.node || base.special) {
    d.lock = null;
    return base;
  }
  const ls = linesNear(d.lines, p.world, NEAR_PX / camera.zoom);
  const r = resolveDragPoint(p.world, ls, d.lock, dragParams(capturePx(p), camera.zoom));
  d.lock = r.line?.id ?? null;
  if (!r.line) return base;
  let pt = r.point;
  if (!(r.line.stops ?? []).some(s => dist(s, pt) < 1e-6)) {
    const len = Math.round(dot(sub(pt, r.line.origin), r.line.dir) / 10) * 10;
    pt = add(r.line.origin, scale(r.line.dir, len));
  }
  d.guide = { line: r.line, point: pt, lines: [] };
  const hit = findWallNear(floor, pt, 1.5);
  return { pt, node: null, wallHit: hit ? { ...hit, point: pt } : null, guides: [] };
}

/** O kolik px se musí pero odchýlit od čáry, aby se tělo překlopilo. */
const FLIP_PX = 10;

let drawing: Drawing | null = null;
let hoverSnap: SnapResult | null = null;

export function snapOptions(startNodeId?: string) {
  const { settings, camera } = store.get();
  return {
    // kreslí se libovolným směrem; vodorovně / svisle pomáhají pomocné čáry (dřív přepínač Pravé úhly)
    ortho: false,
    snap: settings.snap,
    nodeTol: HIT_PX.snapNode / camera.zoom,
    alignTol: HIT_PX.snapAlign / camera.zoom,
    startNodeId
  };
}

let handleDrag = false;

/** Strana těla kreslené stěny: zvolená perem, jinak automaticky. */
function drawingSide(d: Drawing): 1 | -1 {
  const floor = store.floor();
  if (d.side || !floor) return d.side ?? 1;
  return initialSideAt(floor, d.start.pt, d.end.pt, d.start.node?.id ?? null, d.end.node?.id ?? null);
}

/** Vzepětí kreslené stěny: u obloukové výška oblouku na stranu těla (max. půlkruh), u rovné 0. */
function drawingSagitta(d: Drawing): number {
  const { settings, project } = store.get();
  if (settings.wallShape !== 'arc') return 0;
  const half = dist(d.start.pt, d.end.pt) / 2;
  return drawingSide(d) * Math.min(activeWallArcHeight(project), Math.floor(half));
}

export const wallTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    // Středový bod vybraného oblouku se dá táhnout i při kreslení stěn
    handleDrag = grabArcHandle(p);
    if (handleDrag) return;
    const start = snapPoint(floor, p.world, snapOptions());
    drawing = { start, end: start, downAt: p.world, side: null, lines: drawLinesFrom(floor, start.pt, start.node?.id ?? null), lock: null, guide: null };
    hoverSnap = null;
    store.set({ selection: null, numpad: null });
    requestRender();
  },

  drag(p: PointerInput) {
    if (handleDrag) return selectTool.drag?.(p);
    const floor = store.floor();
    if (!floor || !drawing) return;
    const end = guidedEnd(floor, drawing, p);
    drawing.end = end;
    // u přichycení na roh / stěnu se strana už nemění (aby se stěna na poslední chvíli nepřeklopila)
    const T = activeWallThickness(store.get().project);
    const { wallShape, wallAxis } = store.get().settings;
    // sloučí se jen se stěnou se stejnou osou (mergeStraightAt)
    const sameAxis = (w: Wall | null) => !!w && (w.axis ?? 'face') === wallAxis;
    const continues =
      wallShape === 'straight' &&
      (sameAxis(straightContinuation(floor, drawing.start.node?.id ?? null, drawing.start.pt, end.pt, T)) ||
        sameAxis(straightContinuation(floor, end.node?.id ?? null, end.pt, drawing.start.pt, T)));
    if (continues) drawing.side = null; // sloučí se s navazující stěnou → její strana
    else if (!end.node && !end.wallHit && !end.special) {
      drawing.side = sideFromPen(drawing.start.pt, end.pt, p.world, FLIP_PX / store.get().camera.zoom, drawing.side);
    }
    requestRender();
  },

  up(p) {
    if (handleDrag) {
      selectTool.up?.(p);
      handleDrag = false;
      return;
    }
    const d = drawing;
    drawing = null;
    if (!d) return;
    if (dist(d.start.pt, d.end.pt) >= 50) {
      // Při kreslení se panel vlastností neotevírá (nepřekáží v kreslení)
      const sagitta = drawingSagitta(d);
      addWall(d.start.pt, d.start.node?.id ?? null, d.end.pt, d.end.node?.id ?? null, false, {
        thickness: activeWallThickness(store.get().project),
        ...(d.side ? { side: d.side } : {}),
        ...(sagitta ? { sagitta } : {}),
        ...(store.get().settings.wallAxis === 'center' ? { axis: 'center' as const } : {})
      });
    } else {
      // Ťuknutí bez tažení = výběr prvku pod perem (otevře jeho vlastnosti)
      const floor = store.floor();
      if (floor) store.set({ selection: pickAny(floor, d.downAt, store.get().camera, store.get().selection) });
    }
    requestRender();
  },

  hover(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const s = snapPoint(floor, p.world, snapOptions());
    hoverSnap = s.node || s.wallHit || s.special ? s : null;
    requestRender();
  },

  cancel() {
    if (handleDrag) selectTool.cancel?.();
    handleDrag = false;
    drawing = null;
    hoverSnap = null;
    requestRender();
  },

  drawOverlay(ctx, cam) {
    if (hoverSnap && !drawing) drawSnapMarker(ctx, cam, hoverSnap);
    if (!drawing) return;
    const a = toScreen(drawing.start.pt, cam);
    const b = toScreen(drawing.end.pt, cam);

    // Pomocná čára kreslení (vodorovně / svisle, kolmice ⊥) – stejně jako při tažení konce
    if (drawing.guide) drawGuides(ctx, drawing.guide, cam);

    // Vodítka zarovnání
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    for (const g of drawing.end.guides) {
      const f = toScreen(g.from, cam);
      const t = toScreen(g.to, cam);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.restore();

    // Náhled těla stěny (šedě) na zvolené / automatické straně; oblouková stěna podél oblouku
    const T = activeWallThickness(store.get().project);
    const path = facePath(drawing.start.pt, drawing.end.pt, drawingSagitta(drawing));
    if (T > 0 && dist(drawing.start.pt, drawing.end.pt) >= 1) {
      const side = drawingSide(drawing);
      // osa uprostřed: tělo na obě strany po polovině, jinak od líce na stranu těla
      const s0 = store.get().settings.wallAxis === 'center' ? -T / 2 : 0;
      const off = (k: number) => path.pts.map((p, i) => add(p, scale(normal(path.tans[i]!), side * k)));
      const q = [...off(s0), ...off(s0 + T).reverse()].map(p => toScreen(p, cam));
      ctx.save();
      ctx.fillStyle = 'rgba(161,161,170,0.55)';
      ctx.strokeStyle = '#71717a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Náhled čáry líce (osa, od které se měří a kam přibývá / ubývá zdivo)
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    path.pts.forEach((p, i) => {
      const s = toScreen(p, cam);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();

    drawSnapMarker(ctx, cam, drawing.start);
    drawSnapMarker(ctx, cam, drawing.end);
    drawLengthBadge(ctx, a, b, Math.round(dist(drawing.start.pt, drawing.end.pt)));
  }
};

export function drawSnapMarker(ctx: CanvasRenderingContext2D, cam: Camera, s: SnapResult): void {
  if (!s.node && !s.wallHit && !s.special) return;
  const p = toScreen(s.pt, cam);
  ctx.save();
  ctx.strokeStyle = s.node ? '#16a34a' : s.special ? '#7c3aed' : '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (s.node) ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  else if (s.special) {
    ctx.moveTo(p.x, p.y - 9);
    ctx.lineTo(p.x + 9, p.y);
    ctx.lineTo(p.x, p.y + 9);
    ctx.lineTo(p.x - 9, p.y);
    ctx.closePath();
  } else ctx.rect(p.x - 6, p.y - 6, 12, 12);
  ctx.stroke();
  ctx.restore();
}

export function drawLengthBadge(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, mm: number): void {
  const text = `${mm} mm`;
  ctx.save();
  ctx.font = '600 14px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  const x = b.x + 16;
  const y = b.y - 28;
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 7, y + 12);
  ctx.restore();
  void a;
}
