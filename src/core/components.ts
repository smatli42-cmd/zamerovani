/**
 * Souvislé skupiny stěn (např. sloup nakreslený obdélníkem, samostatná příčka) a jejich odstup od okolí.
 *
 * Skupina = stěny spojené společnými rohy. Odstup od stěn mimo skupinu se měří ve směru os výkresu
 * z obálky skupiny; zadáním odstupu se celá skupina posune.
 */
import type { Floor, Id, Pt } from '../model/types';
import { arcPolyline, circlePolyline } from './arc';
import { wallNodes } from './floorQueries';

export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Rohy skupiny, do které patří stěna. */
export function componentNodes(floor: Floor, wallId: Id): Set<Id> {
  const start = floor.walls[wallId];
  const seen = new Set<Id>();
  if (!start) return seen;
  const stack = [start.a, start.b];
  seen.add(start.a);
  seen.add(start.b);
  const walls = Object.values(floor.walls);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const w of walls) {
      const next = w.a === cur ? w.b : w.b === cur ? w.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** Lomená čára stěny (oblouk po úsečkách). */
function wallPoints(floor: Floor, wallId: Id): Pt[] {
  const w = floor.walls[wallId];
  const n = w && wallNodes(floor, w);
  if (!w || !n) return [];
  return w.radius !== undefined ? circlePolyline(n[0], w.radius) : arcPolyline(n[0], n[1], w.sagitta ?? 0);
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Obálka všech stěn skupiny. */
export function componentBounds(floor: Floor, nodes: Set<Id>): Bounds | null {
  const pts = Object.values(floor.walls)
    .filter(w => nodes.has(w.a))
    .flatMap(w => wallPoints(floor, w.id));
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map(p => p.x)),
    maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxY: Math.max(...pts.map(p => p.y))
  };
}

export interface ComponentGap {
  from: Pt;
  hit: Pt;
  value: number;
}

/**
 * Vzdálenost obálky skupiny k nejbližší stěně mimo skupinu v dané straně
 * (paprsek ze středu hrany obálky). null = tím směrem nic není.
 */
export function componentGap(floor: Floor, wallId: Id, side: Side): ComponentGap | null {
  const nodes = componentNodes(floor, wallId);
  const b = componentBounds(floor, nodes);
  if (!b) return null;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const horizontal = side === 'left' || side === 'right';
  const from: Pt = side === 'left' ? { x: b.minX, y: cy } : side === 'right' ? { x: b.maxX, y: cy } : side === 'top' ? { x: cx, y: b.minY } : { x: cx, y: b.maxY };
  const u0 = horizontal ? from.x : from.y;
  const v0 = horizontal ? from.y : from.x;
  let best: ComponentGap | null = null;
  for (const w of Object.values(floor.walls)) {
    if (nodes.has(w.a)) continue;
    const pts = wallPoints(floor, w.id);
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const pu = horizontal ? p.x : p.y;
      const qu = horizontal ? q.x : q.y;
      const pv = horizontal ? p.y : p.x;
      const qv = horizontal ? q.y : q.x;
      if (pv === qv) continue; // úsek rovnoběžný s paprskem
      const t = (v0 - pv) / (qv - pv);
      if (t < 0 || t > 1) continue;
      const u = pu + t * (qu - pu);
      const forward = side === 'left' || side === 'top' ? u0 - u : u - u0;
      if (forward < -0.5) continue;
      const value = Math.max(0, forward);
      if (!best || value < best.value) best = { from, hit: horizontal ? { x: u, y: v0 } : { x: v0, y: u }, value };
    }
  }
  return best;
}

/** Posune celou skupinu tak, aby odstup ve straně `side` byl `value`. */
export function setComponentGap(floor: Floor, wallId: Id, side: Side, value: number): boolean {
  const gap = componentGap(floor, wallId, side);
  const nodes = componentNodes(floor, wallId);
  const b = componentBounds(floor, nodes);
  if (!gap || !b) return false;
  let dx = 0;
  let dy = 0;
  if (side === 'left') dx = gap.hit.x + value - b.minX;
  else if (side === 'right') dx = gap.hit.x - value - b.maxX;
  else if (side === 'top') dy = gap.hit.y + value - b.minY;
  else dy = gap.hit.y - value - b.maxY;
  for (const id of nodes) {
    const n = floor.nodes[id];
    if (n) {
      n.x = Math.round((n.x + dx) * 10) / 10;
      n.y = Math.round((n.y + dy) * 10) / 10;
    }
  }
  return true;
}
