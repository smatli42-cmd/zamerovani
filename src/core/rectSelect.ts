/**
 * Výběr obdélníkem jako v CADu: zleva doprava „okno“ (jen prvky celé uvnitř),
 * zprava doleva „křížení“ (prvky, kterých se obdélník dotkne).
 */
import type { Floor, Pt } from '../model/types';
import { arcPolyline, circlePolyline } from './arc';
import { openingsOnWall } from './floorQueries';

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type RectItem = { kind: 'wall' | 'opening' | 'room' | 'text'; id: string };

export const normRect = (a: Pt, b: Pt): Rect => ({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) });
const inside = (r: Rect, p: Pt) => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;

/** Protíná úsečka p–q obdélník? (Liang–Barsky) */
function segHitsRect(r: Rect, p: Pt, q: Pt): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, p.x - r.x1) && clip(dx, r.x2 - p.x) && clip(-dy, p.y - r.y1) && clip(dy, r.y2 - p.y);
}

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
  for (const room of Object.values(floor.rooms)) if (inside(r, room)) out.push({ kind: 'room', id: room.id });
  for (const t of Object.values(floor.texts)) if (inside(r, t)) out.push({ kind: 'text', id: t.id });
  return out;
}
