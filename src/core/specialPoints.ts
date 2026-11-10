/**
 * Zvláštní body tvarů pro přichytávání: středy rovných stěn, vrcholy a středy oblouků,
 * kvadranty (4 body na obvodu) kruhů a oblouků. Středy kruhů jsou běžné rohy.
 */
import type { Floor, Pt } from '../model/types';
import { arcGeometry, nearestOnArc } from './arc';
import { isCircle } from './floorQueries';
import { bodySnapPoints } from './wallBody';

export interface SpecialPoint extends Pt {
  /** Leží bod na stěně (lze ji v něm rozdělit)? Střed oblouku na stěně neleží. */
  onWall: boolean;
}

export function specialPoints(floor: Floor): SpecialPoint[] {
  const out: SpecialPoint[] = [];
  for (const w of Object.values(floor.walls)) {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    if (isCircle(w)) {
      const r = w.radius ?? 0;
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) out.push({ x: a.x + dx, y: a.y + dy, onWall: true });
      continue;
    }
    const g = arcGeometry(a, b, w.sagitta ?? 0);
    if (!g) {
      out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, onWall: true });
      continue;
    }
    out.push({ ...g.apex, onWall: true }, { ...g.center, onWall: false });
    for (const [dx, dy] of [[g.r, 0], [-g.r, 0], [0, g.r], [0, -g.r]] as const) {
      const q = { x: g.center.x + dx, y: g.center.y + dy };
      if (nearestOnArc(q, a, b, w.sagitta ?? 0).distance < 1) out.push({ ...q, onWall: true });
    }
  }
  // tělo stěn s tloušťkou: vnější rohy a středy čel volných konců (stěnu nedělí)
  for (const p of bodySnapPoints(floor)) out.push({ ...p, onWall: false });
  return out;
}

/** Nejbližší zvláštní bod do vzdálenosti `tol` (mm). */
export function findSpecialNear(floor: Floor, p: Pt, tol: number): SpecialPoint | null {
  let best: SpecialPoint | null = null;
  let bestD = tol;
  for (const s of specialPoints(floor)) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}
