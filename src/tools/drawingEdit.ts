/**
 * Úpravy vybrané kresby tažením úchytů (vrchol, vzepětí úseku, poloměr kruhu, vzdálenost čar dvojité čáry).
 * Používá nástroj Vybrat i nástroje kreslení (přes grabArcHandle v selectTool.ts).
 */
import { toScreen } from '../canvas/view';
import { drawingHandles } from '../core/drawing';
import { dist } from '../core/geometry';
import type { Id } from '../model/types';
import { dragDrawingBulge, dragDrawingWidth, setDrawingRadius, setDrawingVertex } from '../store/actions';
import { store } from '../store/store';
import { drawSnap } from './drawSnap';
import type { PointerInput } from './types';

export type DrawHandleDrag =
  | { kind: 'vertex'; id: Id; i: number }
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
    best = h.kind === 'vertex' ? { kind: 'vertex', id: d.id, i: h.i } : h.kind === 'bulge' ? { kind: 'bulge', id: d.id, seg: h.seg } : { kind: h.kind, id: d.id };
  }
  return best;
}

/** Tažení úchytu kresby (v gestu – jeden krok Zpět). */
export function dragDrawingHandle(h: DrawHandleDrag, p: PointerInput): void {
  const floor = store.floor();
  const d = floor?.drawings?.[h.id];
  if (!floor || !d) return;
  switch (h.kind) {
    case 'vertex':
      setDrawingVertex(h.id, h.i, drawSnap(floor, p.world, null, h.id).pt);
      break;
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
}
