/**
 * Úpravy hran těl stěn po napojení: výstupky a vybrání v těle (líc se v jejich šířce nekreslí) a ořez hran
 * uvnitř spojů (křížení, T bez dělení). Tělo stěny počítá core/wallBody.ts.
 */
import type { Floor, Id, Pt } from '../model/types';
import { add, dist, scale, sub } from './geometry';
import { faceOffset, protrusionExtent, protrusionOutline, protrusionPolygon, protrusionsOf, wallFrame, type Frame } from './protrusion';
import { pointInPolygon, type WallBody } from './wallBody';
import { cornerFaceCover, cornerOutline, cornerPolygon, cornerProtrusionsOf } from './cornerProtrusion';

/**
 * Výstupky a vybrání: líc se v jejich šířce nekreslí, přidá se jejich obrys; plochy se vyplní (výstupek)
 * nebo vyříznou (vybrání) při kreslení. Stěna zůstává jedna (I1.1, I1.5).
 */
export function applyProtrusions(floor: Floor, bodies: Map<Id, WallBody>): void {
  for (const p of protrusionsOf(floor)) {
    const body = bodies.get(p.wallId);
    const w = floor.walls[p.wallId];
    const outline = protrusionOutline(floor, p);
    const area = protrusionPolygon(floor, p);
    const f = w && wallFrame(floor, w);
    if (!body || !w || !outline || !area || !f) continue;
    const { u0, u1 } = protrusionExtent(p);
    body.edges = cutAlongFace(body.edges, f, faceOffset(w, p.side), u0, u1);
    for (let i = 0; i + 1 < outline.length; i++) body.edges.push([outline[i]!, outline[i + 1]!]);
    (p.mode === 'add' ? body.adds : body.holes).push(area);
    for (const q of outline) body.snaps.push(q);
  }
  // výstupky přes roh (I1.11): líce obou stěn se od rohu po obrys nekreslí, obrys a plocha patří první stěně
  for (const cp of cornerProtrusionsOf(floor)) {
    // těla se právě počítají – kontrola rohu dostane rozpracovaná (jinak by se volal výpočet znovu)
    const outline = cornerOutline(floor, cp, bodies);
    const area = cornerPolygon(floor, cp, bodies);
    const owner = bodies.get(cp.walls[0]);
    if (!outline || !area || !owner) continue;
    for (const i of [0, 1] as const) {
      const w = floor.walls[cp.walls[i]];
      const body = bodies.get(cp.walls[i]);
      const f = w && wallFrame(floor, w);
      const cover = cornerFaceCover(floor, cp, i);
      if (!w || !body || !f || !cover) continue;
      const [ua, ub] = cover.map(p => f.project(p).u) as [number, number];
      body.edges = cutAlongFace(body.edges, f, faceOffset(w, cp.sides[i]), Math.min(ua, ub), Math.max(ua, ub));
    }
    for (let i = 0; i + 1 < outline.length; i++) owner.edges.push([outline[i]!, outline[i + 1]!]);
    owner.adds.push(area);
    for (const q of outline) owner.snaps.push(q);
  }
  clipEdgesAtAdds(bodies);
}

/**
 * Výstupek přiložený k sousední stěně (např. tvar U nakreslený v rohu, chyba od uživatele 2026-11-15): čára,
 * která má z obou stran tělo stěny nebo plochu výstupku, se nekreslí – u stěn, jejichž výstupek se dotýká
 * jiného těla, a u těl, kterých se dotýká cizí výstupek.
 */
function clipEdgesAtAdds(bodies: Map<Id, WallBody>): void {
  const ids = new Set<Id>();
  const all = [...bodies.values()].map(b => ({ b, box: boxOf(b.poly) }));
  for (const { b } of all) {
    for (const a of b.adds) {
      const ab = boxOf(a);
      for (const { b: o, box } of all) {
        if (o.wallId === b.wallId || !boxesOverlap(ab, box, 1)) continue;
        ids.add(b.wallId);
        ids.add(o.wallId);
      }
    }
  }
  if (ids.size) clipInsideEdges(bodies, ids, true);
}

/**
 * Z hran ležících na líci (posun `off` od osy stěny – rovné i oblouku) vyřízne úsek (u0, u1); ostatní hrany
 * beze změny. U oblouku jsou hrany líce krátké tětivy – poloha uvnitř hrany se dopočítá lineárně.
 */
function cutAlongFace(edges: [Pt, Pt][], f: Frame, off: number, u0: number, u1: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const e of edges) {
    const [p, q] = e;
    const pp = f.project(p);
    const pq = f.project(q);
    // u oblouku jsou hrany líce tětivy – kontrolují se jen jejich konce (leží na kružnici líce)
    if (Math.abs(pp.across - off) > 0.5 || Math.abs(pq.across - off) > 0.5) {
      out.push(e);
      continue;
    }
    const lo = Math.min(pp.u, pq.u);
    const hi = Math.max(pp.u, pq.u);
    if (hi <= u0 + 1e-6 || lo >= u1 - 1e-6 || hi - lo < 1e-9) {
      out.push(e);
      continue;
    }
    const [from, to] = pp.u <= pq.u ? [p, q] : [q, p];
    // bod řezu přesně na líci (u oblouku na kružnici, ne na tětivě hrany)
    const at = (u: number) => {
      const o = f.at(u);
      return add(o.p, scale(o.n, off));
    };
    if (u0 - lo > 0.01) out.push([from, at(u0)]);
    if (hi - u1 > 0.01) out.push([at(u1), to]);
  }
  return out;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (pts: readonly Pt[]): Box => ({
  minX: Math.min(...pts.map(p => p.x)),
  minY: Math.min(...pts.map(p => p.y)),
  maxX: Math.max(...pts.map(p => p.x)),
  maxY: Math.max(...pts.map(p => p.y))
});
const boxesOverlap = (a: Box, b: Box, pad: number) => a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;

/** Ořízne hrany stěn `ids` o těla ostatních stěn (kusy, které mají obě strany uvnitř těl, se nekreslí). */
export function clipInsideEdges(bodies: Map<Id, WallBody>, ids: Set<Id>, withAdds = false): void {
  // withAdds: i plochy výstupků se počítají jako tělo (patří své stěně)
  // vybrání (holes) se z těla vyřezávají – bod ve vybrání je „venku“ (jeho obrys se kreslí dál)
  const polys = [...bodies.values()].flatMap(b => [
    { id: b.wallId, poly: b.poly, box: boxOf(b.poly), holes: withAdds ? b.holes : [] },
    ...(withAdds ? b.adds : []).map(poly => ({ id: b.wallId, poly, box: boxOf(poly), holes: [] as Pt[][] }))
  ]);
  const insideAny = (p: Pt, cands: typeof polys) =>
    cands.some(c => p.x >= c.box.minX && p.x <= c.box.maxX && p.y >= c.box.minY && p.y <= c.box.maxY && pointInPolygon(p, c.poly) && !c.holes.some(h => pointInPolygon(p, h)));
  for (const id of ids) {
    const body = bodies.get(id);
    if (!body) continue;
    const kept: [Pt, Pt][] = [];
    for (const [p, q] of body.edges) {
      const eb = boxOf([p, q]);
      const near = polys.filter(c => boxesOverlap(eb, c.box, 1));
      if (near.length < 2) {
        kept.push([p, q]); // jen vlastní tělo – nic k ořezu
        continue;
      }
      const d = sub(q, p);
      const len = Math.hypot(d.x, d.y);
      if (len < 1e-6) continue;
      // body, kde hrana protíná obrysy okolních těl
      const ts = [0, 1];
      for (const c of near) {
        if (c.id === id) continue;
        for (let i = 0; i < c.poly.length; i++) {
          const a = c.poly[i]!;
          const b = c.poly[(i + 1) % c.poly.length]!;
          const e = sub(b, a);
          const den = d.x * e.y - d.y * e.x;
          if (Math.abs(den) < 1e-12) continue;
          const w = sub(a, p);
          const t = (w.x * e.y - w.y * e.x) / den;
          const s = (w.x * d.y - w.y * d.x) / den;
          if (t > 1e-9 && t < 1 - 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
        }
      }
      ts.sort((x, y) => x - y);
      const n = { x: -d.y / len, y: d.x / len };
      for (let i = 0; i + 1 < ts.length; i++) {
        const t0 = ts[i]!;
        const t1 = ts[i + 1]!;
        if ((t1 - t0) * len < 0.01) continue;
        const m = add(p, scale(d, (t0 + t1) / 2));
        const both = insideAny(add(m, scale(n, 0.5)), near) && insideAny(add(m, scale(n, -0.5)), near);
        if (both) continue;
        const a = add(p, scale(d, t0));
        const b = add(p, scale(d, t1));
        // navazující kusy spojit do jedné úsečky
        const last = kept[kept.length - 1];
        if (last && t0 > 0 && dist(last[1], a) < 1e-6) last[1] = b;
        else kept.push([a, b]);
      }
    }
    body.edges = kept;
  }
}
