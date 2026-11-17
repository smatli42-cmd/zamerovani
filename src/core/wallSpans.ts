/**
 * Úseky stěny obsazené výstupky – JEDINÉ místo pravidla „výstupky na stěně se nepřekrývají“ (I1.11, kontrola
 * revieweru 2026-11-18): výstupek / vybrání na svém líci, výstupek na konci stěny přes oba líce, výstupek v rohu
 * na líci, kterým se rohu dotýká. Využívá ho vkládání a úpravy výstupku (`protrusionFits`), kóty výstupku v rohu
 * a na konci a změna délky stěny kótou (core/openingChain.ts). Nový druh prvku na líci stěny sem musí přibýt.
 */
import type { Floor, Id } from '../model/types';
import { protrusionExtent, protrusionsOf, wallFrame } from './protrusion';
import { endProtrusionsOf, endSpan } from './endProtrusion';
import { cornerFaceCover, cornerProtrusionsOf } from './cornerProtrusion';

/** Obsazený úsek: `id` prvku, líc (1 / −1, 0 = oba líce), rozsah u od rohu A po ose (mm). */
export interface WallSpan {
  id: Id;
  side: 1 | -1 | 0;
  u0: number;
  u1: number;
}

/** Všechny obsazené úseky stěny `wallId`. */
export function wallSpans(floor: Floor, wallId: Id): WallSpan[] {
  const w = floor.walls[wallId];
  const f = w && wallFrame(floor, w);
  if (!f) return [];
  const out: WallSpan[] = [];
  for (const p of protrusionsOf(floor)) {
    if (p.wallId !== wallId) continue;
    const e = protrusionExtent(p);
    out.push({ id: p.id, side: p.side, u0: e.u0, u1: e.u1 });
  }
  for (const ep of endProtrusionsOf(floor)) {
    const s = ep.wallId === wallId ? endSpan(floor, ep) : null;
    if (s) out.push({ id: ep.id, side: 0, u0: s[0], u1: s[1] });
  }
  for (const cp of cornerProtrusionsOf(floor)) {
    const i = cp.walls.indexOf(wallId);
    const cover = i >= 0 ? cornerFaceCover(floor, cp, i as 0 | 1) : null;
    if (!cover) continue;
    const us = cover.map(q => f.project(q).u);
    out.push({ id: cp.id, side: cp.sides[i]!, u0: Math.min(...us), u1: Math.max(...us) });
  }
  return out;
}

/** Překryv dvou úseků (mm); úseky na různých lících se nepřekrývají. Dotyk a přesah do 0,5 mm = 0. */
function overlap(a: WallSpan, b: WallSpan): number {
  if (a.side && b.side && a.side !== b.side) return 0;
  const o = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0);
  return o > 0.5 ? o : 0;
}

/** Součet překryvů obsazených úseků stěny (mm); s `onlyId` jen dvojice, ve kterých je tento prvek. */
export function wallOverlap(floor: Floor, wallId: Id, onlyId?: Id): number {
  const spans = wallSpans(floor, wallId);
  let sum = 0;
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (onlyId && spans[i]!.id !== onlyId && spans[j]!.id !== onlyId) continue;
      sum += overlap(spans[i]!, spans[j]!);
    }
  }
  return sum;
}
