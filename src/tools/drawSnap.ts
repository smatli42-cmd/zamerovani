/**
 * Přichytávání kresby (samostatná čára, tvary, dvojitá čára, úchyty kresby) – JEDNO místo pro všechny nástroje kresby.
 * Přichycení je jen pomůcka při kreslení: vrací bod, kresba si roh, stěnu ani jinou kresbu nepamatuje
 * (výsledek se nikdy nepředává akcím stěn – žádné napojení, dělení ani výstupek).
 */
import { add, dist, dot, normal, projectToSegment, scale, sub, unit } from '../core/geometry';
import { dragParams, drawLinesFrom, linesNear, resolveDragPoint, type DragLine } from '../core/dragResolve';
import { drawingPaths, drawingSnapPoints, drawingsOf, findDrawingPointNear } from '../core/drawing';
import { stairPointNear } from '../core/stairRefs';
import { findFaceNear, wallFrame, worldToProfile } from '../core/protrusion';
import { snapEnd, snapPoint, type SnapResult } from '../core/snapping';
import { isCurved } from '../core/floorQueries';
import type { Floor, Pt } from '../model/types';
import { store } from '../store/store';
import { HIT_PX } from './types';
import { snapOptions } from './wallTool';

/**
 * Výsledek přichycení kresby; `guide` = zachycená pomocná čára (vodorovně / svisle / kolmo ke stěně, pokračování
 * nebo kolmice k čáře kresby) pro náhled; `guides` = zarovnání s bodem kresby / rohem (tečkovaně od toho bodu).
 */
export type DrawSnapResult = SnapResult & { guide?: DragLine };

const NEAR_PX = 60;

const free = (p: Pt): SnapResult => ({ pt: { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 }, node: null, wallHit: null, guides: [] });

/**
 * Bod kresby u pera: bod jiné kresby, roh schodiště, roh nebo zvláštní bod, líc stěny s tloušťkou, čára stěny; jinak po 10 mm
 * (konec úseku `from`→ i se zarovnáním do os a s rohy). `skip` = kresba, jejíž bod se právě táhne.
 * Zarovnání (připomínka uživatele 2026-11-19 – čtverec čarami se nedal nakreslit bez odhadu): bod se přichytí na
 * svislici / vodorovnou přes bod kresby nebo roh stěn (i na zachycené pomocné čáře) a ukáže se čárkovaně od toho bodu.
 */
export function drawSnap(floor: Floor, raw: Pt, from: Pt | null, skip?: string, opts: { align?: boolean; lines?: readonly DragLine[] } = {}): DrawSnapResult {
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
  // zarovnání jen v nástrojích, které ho ukazují (Čára, Dvojitá čára), a jen k bodům v okolí pera
  const sources = opts.align ? alignSources(floor, from, skip, raw, ALIGN_NEAR_PX / camera.zoom) : [];
  // pomocné čáry z počátku úseku (jako u nástroje Stěna): vodorovně, svisle, kolmo ke stěně. Zachycená čára platí
  // až ke stěně: u líce / čáry stěny se konec dá na jejich PRŮSEČÍK s pomocnou čárou (kolmo na protější stěnu –
  // připomínka uživatele 2026-11-17), ne na nejbližší bod líce.
  const g = from ? guideAt(floor, from, raw, camera.zoom, sources, skip, opts.lines) : null;
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
    return { pt: g.pt, node: null, wallHit: null, guides: g.align ? [{ from: g.align, to: g.pt }] : [], guide: line };
  }
  if (face && (!r.wallHit || face.distance < dist(raw, r.wallHit.point))) return { pt: face.point, node: null, wallHit: null, guides: [], special: true };
  if (r.wallHit) return r;
  // volný bod: přichytit x / y k bodu kresby nebo rohu (u počátku úseku jen mimo osy – ty řeší pomocné čáry)
  return alignFree(raw, r, sources, HIT_PX.snapAlign / camera.zoom);
}

/** Do jaké vzdálenosti od pera (px) se berou body pro zarovnání (ve velkém výkresu by se zarovnávalo skoro všude). */
const ALIGN_NEAR_PX = 500;

/** Body pro zarovnání: body kresby (kromě `skip`) a rohy stěn do vzdálenosti `near` od pera; počátek úseku se vynechá. */
function alignSources(floor: Floor, from: Pt | null, skip: string | undefined, raw: Pt, near: number): Pt[] {
  let all = srcCache.get(floor);
  if (!all) {
    all = [];
    for (const d of drawingsOf(floor)) for (const q of drawingSnapPoints(d)) all.push({ p: q, owner: d.id });
    for (const n of Object.values(floor.nodes)) all.push({ p: { x: n.x, y: n.y }, owner: null });
    if (Object.isFrozen(floor)) srcCache.set(floor, all);
  }
  return all.filter(s => s.owner !== skip || !skip).map(s => s.p).filter(q => dist(q, raw) <= near && (!from || dist(q, from) > 1));
}

const srcCache = new WeakMap<Floor, { p: Pt; owner: string | null }[]>();

function alignFree(raw: Pt, r: SnapResult, sources: readonly Pt[], tol: number): SnapResult {
  let bx: Pt | null = null;
  let by: Pt | null = null;
  for (const q of sources) {
    if (Math.abs(q.x - raw.x) <= tol && (!bx || Math.abs(q.x - raw.x) < Math.abs(bx.x - raw.x))) bx = q;
    if (Math.abs(q.y - raw.y) <= tol && (!by || Math.abs(q.y - raw.y) < Math.abs(by.y - raw.y))) by = q;
  }
  if (!bx && !by) return r;
  const pt = { x: bx ? bx.x : r.pt.x, y: by ? by.y : r.pt.y };
  return { pt, node: null, wallHit: null, guides: [bx, by].filter((q): q is Pt => !!q && dist(q, pt) > 1).map(q => ({ from: q, to: pt })) };
}

/** Zachycená pomocná čára (držení: dokud pero zůstane u stejné čáry ze stejného počátku). */
let held: { from: Pt; id: string } | null = null;

/** Rovné úseky kresby (i obdélník, dvojitá čára) kromě `skip`. */
function drawingSegs(floor: Floor, skip?: string): { id: string; a: Pt; b: Pt }[] {
  const out: { id: string; a: Pt; b: Pt }[] = [];
  for (const d of drawingsOf(floor)) {
    if (d.id === skip) continue;
    drawingPaths(d).forEach((path, k) => path.forEach((sg, i) => sg.s === 0 && dist(sg.a, sg.b) > 1 && out.push({ id: `${d.id}:${k}:${i}`, a: sg.a, b: sg.b })));
  }
  return out;
}

/**
 * Pomocné čáry kresby z bodu `from`: pokračování a kolmice čáry kresby, která v něm končí nebo jím prochází
 * („odpojená“ čára drží původní směr), kolmice k ostatním čarám kresby (pata kolmice = zarážka).
 */
function drawingGuideLines(from: Pt, segs: readonly { id: string; a: Pt; b: Pt }[]): DragLine[] {
  const lines: DragLine[] = [];
  for (const sg of segs) {
    const u = unit(sg.a, sg.b);
    const pr = projectToSegment(from, sg.a, sg.b);
    if (pr.distance < 1) {
      lines.push({ id: `dcont:${sg.id}`, origin: from, dir: u, weight: 1.2 });
      lines.push({ id: `dperp:${sg.id}`, origin: from, dir: normal(u), weight: 1.2, perpTo: sg.id }); // bez perpSeg – nabízí se vždy, ne jen u čáry
      continue;
    }
    const foot = pr.t > 1e-6 && pr.t < 1 - 1e-6 ? pr.point : null;
    lines.push({ id: `dfoot:${sg.id}`, origin: from, dir: normal(u), weight: 1, perpTo: sg.id, perpSeg: [sg.a, sg.b], stops: foot ? [foot] : [] });
  }
  return lines;
}

function guideAt(floor: Floor, from: Pt, raw: Pt, zoom: number, sources: readonly Pt[], skip?: string, extra: readonly DragLine[] = []): { line: DragLine; pt: Pt; align: Pt | null } | null {
  const segs = drawingSegs(floor, skip);
  // `extra` = pomocné čáry volajícího (původní směr taženého úseku kresby)
  const near = linesNear([...extra, ...drawLinesFrom(floor, from, null), ...drawingGuideLines(from, segs)], raw, NEAR_PX / zoom);
  // zarážky navíc: průsečík s čárami kresby a místa zarovnaná s body kresby / rohy (svisle nebo vodorovně)
  const aligned = new Map<Pt, Pt>();
  const lines = near.map(l => {
    const extra: Pt[] = [];
    for (const sg of segs) {
      const x = crossLines(l.origin, l.dir, sg.a, sub(sg.b, sg.a));
      if (x && projectToSegment(x, sg.a, sg.b).distance < 0.5) extra.push(x);
    }
    for (const q of sources) {
      for (const x of [Math.abs(l.dir.x) > 1e-6 ? at(l, (q.x - l.origin.x) / l.dir.x) : null, Math.abs(l.dir.y) > 1e-6 ? at(l, (q.y - l.origin.y) / l.dir.y) : null]) {
        if (x && dist(x, q) > 1) {
          extra.push(x);
          aligned.set(x, q);
        }
      }
    }
    return { ...l, stops: [...(l.stops ?? []), ...extra] };
  });
  const lock = held && dist(held.from, from) < 1e-6 ? held.id : null;
  const g = resolveDragPoint(raw, lines, lock, dragParams(10, zoom));
  held = g.line ? { from, id: g.line.id } : null;
  if (!g.line) return null;
  const stop = (g.line.stops ?? []).find(q => dist(q, g.point) < 1e-6);
  const pt = stop ?? add(g.line.origin, scale(g.line.dir, Math.round(dot(sub(g.point, g.line.origin), g.line.dir) / 10) * 10));
  return { line: g.line, pt, align: stop ? (aligned.get(stop) ?? null) : null };
}

const at = (l: DragLine, t: number): Pt => add(l.origin, scale(l.dir, t));

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
