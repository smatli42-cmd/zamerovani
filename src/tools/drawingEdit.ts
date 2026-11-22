/**
 * Úpravy vybrané kresby tažením úchytů (vrchol, vzepětí úseku, poloměr kruhu, vzdálenost čar dvojité čáry).
 * Používá nástroj Vybrat i nástroje kreslení (přes grabArcHandle v selectTool.ts).
 */
import { toScreen } from '../canvas/view';
import { drawingHandles } from '../core/drawing';
import type { DragLine } from '../core/dragResolve';
import { dist, unit } from '../core/geometry';
import type { Drawing, Id, Pt } from '../model/types';
import { dragDrawingBulge, dragDrawingWidth, setDrawingRadius, setDrawingVertex } from '../store/actions';
import { store } from '../store/store';
import { drawSnap } from './drawSnap';
import type { PointerInput } from './types';

export type DrawHandleDrag =
  /** `from` / `dir` = sousední bod a původní směr koncového úseku (konec čáry / dvojité čáry) – pomocná čára směru. */
  | { kind: 'vertex'; id: Id; i: number; from?: Pt; dir?: Pt }
  | { kind: 'bulge'; id: Id; seg: number }
  | { kind: 'radius'; id: Id }
  | { kind: 'width'; id: Id };

const HANDLE_PX = 18;

/** Úchyt vybrané kresby pod perem (nejbližší). */
export function drawingHandleUnderPen(p: PointerInput): DrawHandleDrag | null {
  const floor = store.floor();
  const sel = store.get().selection;
  const d = floor && sel?.kind === 'drawing' ? floor.drawings?.[sel.id] : null;
  if (!d) return null;
  let best: DrawHandleDrag | null = null;
  let bestD = HANDLE_PX;
  for (const h of drawingHandles(d)) {
    const dd = dist(toScreen(h.at, store.get().camera), p.screen);
    if (dd > bestD) continue;
    bestD = dd;
    best = h.kind === 'vertex' ? { kind: 'vertex', id: d.id, i: h.i, ...endDir(d, h.i) } : h.kind === 'bulge' ? { kind: 'bulge', id: d.id, seg: h.seg } : { kind: h.kind, id: d.id };
  }
  return best;
}

/**
 * Konec otevřené čáry / dvojité čáry s rovným koncovým úsekem: sousední bod a směr úseku (přání uživatele 2026-11-22 –
 * při tažení konce vybrané čáry se ukáže pomocná čára v jejím směru jako při kreslení, čára jde pohodlně prodloužit /
 * zkrátit). Jinak nic (vnitřní bod, obdélník, oblouk, obloukový úsek).
 */
function endDir(d: Drawing, i: number): { from: Pt; dir: Pt } | Record<string, never> {
  const n = d.pts.length;
  const open = (d.shape === 'line' && !d.closed) || d.shape === 'double';
  if (!open || n < 2 || (i !== 0 && i !== n - 1)) return {};
  const j = i === 0 ? 1 : i - 1;
  if (d.pts[Math.min(i, j)]!.s) return {};
  const from = { x: d.pts[j]!.x, y: d.pts[j]!.y };
  return dist(from, d.pts[i]!) < 1 ? {} : { from, dir: unit(from, d.pts[i]!) };
}

/** Co ukázat při tažení úchytu: zachycená pomocná čára, bod, trvale ukázané čáry (původní směr). */
export type HandleGuide = { line: DragLine | null; point: Pt; lines: DragLine[]; align: { from: Pt; to: Pt }[] };

/** Tažení úchytu kresby (v gestu – jeden krok Zpět). Vrací pomocné čáry k nakreslení (jen konec čáry). */
export function dragDrawingHandle(h: DrawHandleDrag, p: PointerInput): HandleGuide | null {
  const floor = store.floor();
  const d = floor?.drawings?.[h.id];
  if (!floor || !d) return null;
  switch (h.kind) {
    case 'vertex': {
      // při vypnutém přichytávání bez pomocných čar (jako tažení rohu)
      if (h.from && h.dir && store.get().settings.snap) {
        // pomocné čáry jako při kreslení z bodu `from` + původní směr úseku (přednostně)
        const orig: DragLine = { id: 'orig:dir', origin: h.from, dir: h.dir, weight: 1.5 };
        const r = drawSnap(store.view('snap')!, p.world, h.from, h.id, { align: true, lines: [orig] });
        setDrawingVertex(h.id, h.i, r.pt);
        return { line: r.guide ?? null, point: r.pt, lines: [orig], align: r.guides };
      }
      setDrawingVertex(h.id, h.i, drawSnap(store.view('snap')!, p.world, null, h.id).pt);
      break;
    }
    case 'bulge':
      dragDrawingBulge(h.id, h.seg, p.world);
      break;
    case 'radius': {
      const c = d.pts[0];
      if (c) setDrawingRadius(h.id, Math.max(10, Math.round(dist(c, p.world) / 10) * 10));
      break;
    }
    case 'width':
      dragDrawingWidth(h.id, p.world);
      break;
  }
  return null;
}
