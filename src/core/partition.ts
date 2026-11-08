/**
 * Příčka nakreslená „dvojčárou“: dvě rovnoběžné stěny ve vzdálenosti tloušťky.
 * Konce se napojují na stěny, o které se opírají (v místě napojení je rozdělí),
 * volné konce se uzavřou krátkou stěnou o délce tloušťky.
 */
import type { Floor, Pt } from '../model/types';
import { isCurved, wallNodes } from './floorQueries';
import { dist, projectToSegment } from './geometry';

/** Jak blízko (mm) musí bod ležet u stěny, aby se o ni příčka opírala. */
const HOST_TOL = 2;

/**
 * Druhá čára je posunutá doleva (side = 1) nebo doprava (side = -1) od směru kreslení a→b,
 * jak to vidí kreslící na obrazovce (osa Y míří dolů).
 */
export function partitionOffset(a: Pt, b: Pt, thickness: number, side: 1 | -1): Pt {
  const len = dist(a, b) || 1;
  return { x: ((b.y - a.y) / len) * thickness * side, y: (-(b.x - a.x) / len) * thickness * side };
}

/** Průsečík přímky (p, směr d) s přímkou q1–q2. */
function intersect(p: Pt, d: Pt, q1: Pt, q2: Pt): Pt | null {
  const ex = q2.x - q1.x;
  const ey = q2.y - q1.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q1.x - p.x) * ey - (q1.y - p.y) * ex) / den;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/** Konec druhé čáry: pokud konec první čáry leží na stěně, druhá čára končí na téže stěně. */
function secondEnd(floor: Floor, end: Pt, other: Pt, off: Pt, thickness: number): Pt {
  const plain = { x: end.x + off.x, y: end.y + off.y };
  const dir = { x: end.x - other.x, y: end.y - other.y };
  for (const w of Object.values(floor.walls)) {
    const n = wallNodes(floor, w);
    if (!n || isCurved(w)) continue; // o oblouk se druhá čára neopírá přesně – skončí volně
    const pr = projectToSegment(end, n[0], n[1]);
    if (pr.distance > HOST_TOL) continue;
    // konec přímo v rohu stěny se za „opření“ nepočítá
    if (dist(end, n[0]) < HOST_TOL || dist(end, n[1]) < HOST_TOL) continue;
    const hit = intersect(plain, dir, n[0], n[1]);
    if (hit && dist(hit, plain) <= thickness * 6) return hit;
  }
  return plain;
}

/** Konce druhé čáry příčky (pro kreslení náhledu i vytvoření). */
export function partitionPoints(floor: Floor, a: Pt, b: Pt, thickness: number, side: 1 | -1): { a2: Pt; b2: Pt } {
  const off = partitionOffset(a, b, thickness, side);
  return { a2: secondEnd(floor, a, b, off, thickness), b2: secondEnd(floor, b, a, off, thickness) };
}
