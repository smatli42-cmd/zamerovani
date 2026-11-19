/**
 * Přichytávání kresby (samostatná čára, tvary, dvojitá čára, úchyty kresby) – JEDNO místo pro všechny nástroje kresby.
 * Přichycení je jen pomůcka při kreslení: vrací bod, kresba si roh, stěnu ani jinou kresbu nepamatuje
 * (výsledek se nikdy nepředává akcím stěn – žádné napojení, dělení ani výstupek).
 */
import { add, dist, dot, normal, scale, sub, unit } from '../core/geometry';
import { dragParams, drawLinesFrom, linesNear, resolveDragPoint, type DragLine } from '../core/dragResolve';
import { findDrawingPointNear } from '../core/drawing';
import { stairPointNear } from '../core/stairRefs';
import { findFaceNear, wallFrame, worldToProfile } from '../core/protrusion';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import { isCurved } from '../core/floorQueries';
import type { Floor, Pt } from '../model/types';
import { store } from '../store/store';
import { HIT_PX } from './types';
import { snapOptions } from './wallTool';

/** Výsledek přichycení kresby; `guide` = zachycená pomocná čára (vodorovně / svisle / kolmo ke stěně) pro náhled. */
export type DrawSnapResult = SnapResult & { guide?: DragLine };

const NEAR_PX = 60;

const free = (p: Pt): SnapResult => ({ pt: { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 }, node: null, wallHit: null, guides: [] });

/**
 * Bod kresby u pera: bod jiné kresby, roh schodiště, roh nebo zvláštní bod, líc stěny s tloušťkou, čára stěny; jinak po 10 mm
 * (konec úseku `from`→ i se zarovnáním do os a s rohy). `skip` = kresba, jejíž bod se právě táhne.
 */
export function drawSnap(floor: Floor, raw: Pt, from: Pt | null, skip?: string): DrawSnapResult {
  const { settings, camera } = store.get();
  if (!settings.snap) return free(raw);
  const tol = HIT_PX.snapNode / camera.zoom;
  const dp = findDrawingPointNear(floor, raw, tol, skip);
  if (dp) return { pt: { x: dp.x, y: dp.y }, node: null, wallHit: null, guides: [], special: true };
  // rohy schodišť (ramena, podesty) – kresba i další rameno navazují na schodiště
  const sp = stairPointNear(floor, raw, tol);
  if (sp) return { pt: { x: sp.pt.x, y: sp.pt.y }, node: null, wallHit: null, guides: [], special: true };
  const r = from ? snapEnd(floor, from, raw, snapOptions()) : snapPoint(floor, raw, snapOptions());
  if (r.node || r.special) return r;
  const face = findFaceNear(floor, raw, tol);
  // pomocné čáry z počátku úseku (jako u nástroje Stěna): vodorovně, svisle, kolmo ke stěně. Zachycená čára platí
  // až ke stěně: u líce / čáry stěny se konec dá na jejich PRŮSEČÍK s pomocnou čárou (kolmo na protější stěnu –
  // připomínka uživatele 2026-11-17), ne na nejbližší bod líce.
  const g = from ? guideAt(floor, from, raw, camera.zoom) : null;
  if (g) {
    const line = g.line;
    if (face) {
      const f = wallFrame(floor, face.wall);
      const x = f && crossLines(line.origin, line.dir, face.point, f.at(face.u).t);
      if (x && dist(x, raw) <= 2 * tol) return { pt: x, node: null, wallHit: null, guides: [], special: true, guide: line };
    }
    if (r.wallHit) {
      const a = floor.nodes[r.wallHit.wall.a];
      const b = floor.nodes[r.wallHit.wall.b];
      const x = a && b && !isCurved(r.wallHit.wall) ? crossLines(line.origin, line.dir, a, sub(b, a)) : null;
      if (x && dist(x, raw) <= 2 * tol) return { pt: x, node: null, wallHit: null, guides: [], special: true, guide: line };
    }
    return { pt: g.pt, node: null, wallHit: null, guides: [], guide: line };
  }
  if (face && (!r.wallHit || face.distance < dist(raw, r.wallHit.point))) return { pt: face.point, node: null, wallHit: null, guides: [], special: true };
  return r;
}

/** Zachycená pomocná čára (držení: dokud pero zůstane u stejné čáry ze stejného počátku). */
let held: { from: Pt; id: string } | null = null;

function guideAt(floor: Floor, from: Pt, raw: Pt, zoom: number): { line: DragLine; pt: Pt } | null {
  const lines = linesNear(drawLinesFrom(floor, from, null), raw, NEAR_PX / zoom);
  const lock = held && dist(held.from, from) < 1e-6 ? held.id : null;
  const g = resolveDragPoint(raw, lines, lock, dragParams(10, zoom));
  held = g.line ? { from, id: g.line.id } : null;
  if (!g.line) return null;
  const stop = (g.line.stops ?? []).find(q => dist(q, g.point) < 1e-6);
  const pt = stop ?? add(g.line.origin, scale(g.line.dir, Math.round(dot(sub(g.point, g.line.origin), g.line.dir) / 10) * 10));
  return { line: g.line, pt };
}

/** Průsečík přímky (p, směr u) s přímkou (q, směr v); rovnoběžky = null. */
function crossLines(p: Pt, u: Pt, q: Pt, v: Pt): Pt | null {
  const den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 1e-9 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den;
  return { x: p.x + u.x * t, y: p.y + u.y * t };
}

/**
 * Dvojitá čára začínající na líci stěny s tloušťkou a vedená podél ní: vzdálenost čar = tloušťka stěny,
 * druhá čára na straně těla (překlad přes celou tloušťku). Jinak null. Jen pomůcka – nic se nepamatuje.
 */
export function doubleAlongWall(floor: Floor, a: Pt, b: Pt): { width: number; side: 1 | -1 } | null {
  if (dist(a, b) < 50) return null;
  const face = findFaceNear(floor, a, 1);
  const f = face && wallFrame(floor, face.wall);
  if (!face || !f || face.wall.thickness <= 0) return null;
  const u = unit(a, b);
  // podél stěny (do ~2°)
  const t = f.at(face.u).t;
  const along = Math.abs(u.x * t.x + u.y * t.y);
  if (along < 0.9994) return null;
  const test = add(a, scale(normal(u), 1));
  const v = worldToProfile(f, face.wall, face.side, test).v;
  return { width: face.wall.thickness, side: v < 0 ? 1 : -1 };
}
