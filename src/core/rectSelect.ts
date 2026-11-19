/**
 * Výběr obdélníkem jako v CADu: zleva doprava „okno“ (jen prvky celé uvnitř),
 * zprava doleva „křížení“ (prvky, kterých se obdélník dotkne).
 */
import type { Floor } from '../model/types';
import { arcPolyline, circlePolyline } from './arc';
import { openingsOnWall } from './floorQueries';
import { LOOSE_KINDS, type LooseKindId } from './looseElements';
import { inRect as inside, segHitsRect, type Rect } from './rect';

export type RectItem = { kind: 'wall' | 'opening' | LooseKindId; id: string };

export { normRect, type Rect } from './rect';

export function selectInRect(floor: Floor, r: Rect, crossing: boolean): RectItem[] {
  const out: RectItem[] = [];
  for (const w of Object.values(floor.walls)) {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    const pts = w.radius !== undefined ? circlePolyline(a, w.radius) : arcPolyline(a, b, w.sagitta ?? 0);
    const hit = crossing ? pts.some((p, i) => inside(r, p) || (i > 0 && segHitsRect(r, pts[i - 1]!, p))) : pts.every(p => inside(r, p));
    if (hit) out.push({ kind: 'wall', id: w.id });
    if (w.radius !== undefined) continue;
    for (const po of openingsOnWall(floor, w)) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = (po.start + po.end) / 2 / len;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (inside(r, p)) out.push({ kind: 'opening', id: po.op.id });
    }
  }
  // volné prvky (štítky místností, texty, kresba, kóty…) – core/looseElements.ts
  for (const k of LOOSE_KINDS) for (const id of k.inRect(floor, r, crossing)) out.push({ kind: k.kind, id });
  return out;
}
