/**
 * Strana těla stěny: výchozí strana nové stěny, natočení těl ven z uzavřené místnosti, strana podle pera
 * při kreslení a navázání kreslené stěny rovně na volný konec jiné stěny.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, centroid, dist, dot, normal, sub, unit } from './geometry';
import { wallSegments } from './floorQueries';
import { protrusionsOf } from './protrusion';
import { bodyNormal, hasBody } from './wallFace';
import { pointInPolygon } from './wallBody';

/**
 * Výchozí strana těla nové stěny: navazuje-li stěna na konec jediné jiné stěny, pokračuje na stejné straně
 * (tělo se drží „venku“ podél celého tahu); jinak ven od středu ostatních rohů.
 */
export function initialSide(floor: Floor, wall: Wall): 1 | -1 {
  const a = floor.nodes[wall.a];
  const b = floor.nodes[wall.b];
  if (!a || !b) return 1;
  return initialSideAt(floor, a, b, wall.a, wall.b, wall.id);
}

/**
 * Výchozí strana těla pro stěnu z bodu `a` do `b` (i pro stěnu, která se teprve kreslí):
 * `aId`/`bId` = rohy, na které se konce napojují (null = nový roh).
 */
export function initialSideAt(floor: Floor, a: Pt, b: Pt, aId: Id | null, bId: Id | null, excludeWallId?: Id): 1 | -1 {
  const others = Object.values(floor.walls).filter(w => w.id !== excludeWallId && hasBody(w));
  for (const [id, atStart] of [[aId, true], [bId, false]] as const) {
    if (!id) continue;
    const at = others.filter(w => w.a === id || w.b === id);
    if (at.length !== 1) continue;
    const w = at[0]!;
    // tah p→q→r: stejná strana; protisměrně opačná
    const sameDir = (atStart && w.b === id) || (!atStart && w.a === id);
    return sameDir ? w.side : w.side === 1 ? -1 : 1;
  }
  const rest = Object.values(floor.nodes).filter(n => n.id !== aId && n.id !== bId && dist(n, a) > 1 && dist(n, b) > 1);
  if (rest.length === 0 || dist(a, b) < 1) return 1;
  const c = centroid(rest);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return dot(sub(mid, c), normal(unit(a, b))) >= 0 ? 1 : -1;
}

/**
 * Uzavřela stěna místnost (smyčku stěn s tloušťkou)? Pak se těla všech stěn smyčky natočí ven z ní
 * (kromě stěn s ručně přehozenou stranou). Vrací true, pokud smyčku našla.
 */
export function orientLoopOutward(floor: Floor, wallId: Id): boolean {
  const start = floor.walls[wallId];
  if (!start || !hasBody(start)) return false;
  const adj = new Map<Id, { wall: Wall; to: Id; fromPt: Pt; toPt: Pt }[]>();
  // průběžné stěny s napojenými rohy (T bez dělení) a kříženími se v grafu rozdělí virtuálně
  const pts = new Map<Id, Pt>();
  const own: Id[] = [];
  for (const { wall: w, from, to, fromPt, toPt } of wallSegments(floor)) {
    pts.set(from, fromPt);
    pts.set(to, toPt);
    if (w.id === wallId) {
      // body na nové stěně (rohy i křížení) – místnost se hledá mezi kterýmikoli dvěma z nich
      if (!own.includes(from)) own.push(from);
      if (!own.includes(to)) own.push(to);
      continue;
    }
    if (!hasBody(w)) continue;
    (adj.get(from) ?? adj.set(from, []).get(from)!).push({ wall: w, to, fromPt, toPt });
    (adj.get(to) ?? adj.set(to, []).get(to)!).push({ wall: w, to: from, fromPt: toPt, toPt: fromPt });
  }
  // nejkratší cesta mezi dvěma body nové stěny (bez ní); přesahující konce nové stěny do místnosti nepatří
  let found: { src: Id; dst: Id; prev: Map<Id, { from: Id; wall: Wall; mid: Pt }> } | null = null;
  for (const src of own) {
    const prev = new Map<Id, { from: Id; wall: Wall; mid: Pt }>();
    const queue = [src];
    const seen = new Set([src]);
    let dst: Id | null = null;
    while (queue.length && !dst) {
      const id = queue.shift()!;
      for (const e of adj.get(id) ?? []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        prev.set(e.to, { from: id, wall: e.wall, mid: { x: (e.fromPt.x + e.toPt.x) / 2, y: (e.fromPt.y + e.toPt.y) / 2 } });
        if (own.includes(e.to)) {
          dst = e.to;
          break;
        }
        queue.push(e.to);
      }
    }
    if (dst && (!found || prev.size < found.prev.size)) found = { src, dst, prev };
  }
  if (!found) return false;
  // stěna smyčky → bod uprostřed jejího úseku ve smyčce (u přesahující stěny ne střed celé stěny)
  const sp = pts.get(found.src)!;
  const dp = pts.get(found.dst)!;
  const loop = new Map<Wall, Pt>([[start, { x: (sp.x + dp.x) / 2, y: (sp.y + dp.y) / 2 }]]);
  const polyIds: Id[] = [found.dst];
  for (let id = found.dst; id !== found.src; ) {
    const p = found.prev.get(id)!;
    if (!loop.has(p.wall)) loop.set(p.wall, p.mid);
    polyIds.push(p.from);
    id = p.from;
  }
  const poly = polyIds.map(id => floor.nodes[id] ?? pts.get(id)).filter((p): p is Pt => !!p);
  if (poly.length < 3) return false;
  for (const [w, segMid] of loop) {
    // ručně zvolená strana se nemění; u osy uprostřed se strana jen pamatuje pro návrat na líc (B4) – také ne
    if (w.sideLocked || w.axis === 'center') continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    const bn = bodyNormal(floor, w);
    if (!a || !b || !bn) continue;
    // oblouk: střed tětivy celé stěny (jako dřív); rovná stěna: střed úseku ve smyčce
    const base = w.sagitta ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : segMid;
    const probe = add(base, bn);
    if (pointInPolygon(probe, poly)) {
      w.side = w.side === 1 ? -1 : 1;
      if (w.sagitta) {
        w.sagitta = -w.sagitta;
        // oblouk se zrcadlí podle tětivy → výstupky se zrcadlí s ním a zůstanou na svém líci (I1.7);
        // u, v i vzepětí úseků obrysu zůstávají, mění se jen strana líce
        for (const p of protrusionsOf(floor)) if (p.wallId === w.id) p.side = p.side === 1 ? -1 : 1;
      }
    }
  }
  return true;
}

/**
 * Strana těla podle polohy pera při kreslení: když se pero odchýlí od (přichycené) čáry stěny
 * o víc než `threshold` (mm), tělo se překlopí na stranu pera; jinak zůstane `current` (null = automaticky).
 */
export function sideFromPen(start: Pt, end: Pt, pen: Pt, threshold: number, current: 1 | -1 | null): 1 | -1 | null {
  if (dist(start, end) < 1) return current;
  const off = dot(sub(pen, end), normal(unit(start, end)));
  if (Math.abs(off) <= threshold) return current;
  return off > 0 ? 1 : -1;
}

/**
 * Navazuje kreslená stěna `from`→`to` rovně na volný konec existující stěny se stejnou tloušťkou
 * v rohu `nodeId` (pokračování stejným směrem)? Vrací tu stěnu – kreslená se s ní sloučí do jedné.
 */
export function straightContinuation(floor: Floor, nodeId: Id | null, from: Pt, to: Pt, thickness: number, excludeWallId?: Id, throughT = false): Wall | null {
  // throughT (migrace): i čáry bez tloušťky
  if (!nodeId || (thickness <= 0 && !throughT) || dist(from, to) < 1) return null;
  // roh napojený doprostřed jiné stěny (T bez dělení) není volný konec
  if (!throughT && floor.nodes[nodeId]?.host) return null;
  const at = Object.values(floor.walls).filter(w => w.id !== excludeWallId && (w.a === nodeId || w.b === nodeId));
  if (!throughT && at.length !== 1) return null;
  const d1 = unit(from, to);
  for (const o of at) {
    if ((!throughT && !hasBody(o)) || o.thickness !== thickness || o.sagitta || o.radius !== undefined || o.a === o.b) continue;
    const far = floor.nodes[o.a === nodeId ? o.b : o.a];
    if (!far) continue;
    const d2 = unit(from, far);
    const cross = d1.x * d2.y - d1.y * d2.x;
    // opačné směry od rohu = rovné pokračování
    if (cross < 0.002 && cross > -0.002 && dot(d1, d2) < -0.999) return o;
  }
  return null;
}
