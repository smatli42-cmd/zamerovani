/**
 * T-napojení bez dělení průběžné stěny (požadavek uživatele 2026-11-12, katalog C2/5 „A se nepřerušuje“).
 *
 * Konec stěny, který dosedne doprostřed jiné stěny (rovné i oblouku), dostane roh s `host` = ID té stěny.
 * Průběžná stěna zůstává jedna (jde vybrat, posunout a smazat celá). Tělo v místě napojení počítá
 * `wallBodies` (virtuální konce průběžné stěny), graf skupin a místností `wallSegments`. Když se průběžná
 * stěna pohne nebo změní vzepětí, napojený roh ji sleduje (`syncHosted`, volá se po každé úpravě výkresu).
 * Oblouky se také nedělí (požadavek uživatele 2026-11-12).
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, scale, sub, unit } from './geometry';
import { arcGeometry, nearestOnArc } from './arc';
export { hostedOn, wallSegments } from './floorQueries';
import { openingsOnWall } from './floorQueries';

/** Jak blízko (mm) musí roh ležet u stěny, aby se na ni napojil / zůstal napojený. */
export const ON_HOST_TOL = 1;

/** Může stěna nést napojené rohy (rovná i oblouk, ne kruh)? */
export const canHost = (w: Wall | undefined): w is Wall => !!w && w.radius === undefined && w.a !== w.b;

/** Poloha bodu podél stěny a–b (0 = a, 1 = b), vzdálenost od ní a nejbližší bod (u oblouku na oblouku). */
function onHost(p: Pt, h: Wall, a: Pt, b: Pt): { t: number; off: number; foot: Pt } {
  if (h.sagitta) {
    const r = nearestOnArc(p, a, b, h.sagitta);
    return { t: r.t, off: r.distance, foot: r.point };
  }
  const e = sub(b, a);
  const len2 = dot(e, e) || 1;
  const t = dot(sub(p, a), e) / len2;
  const foot = add(a, scale(e, t));
  return { t, off: dist(p, foot), foot };
}

/** Průsečík přímky (o, d) se stěnou (přímka / kružnice oblouku) nejblíž bodu `near`; null = žádný. */
function lineWithHost(o: Pt, d: Pt, h: Wall, a: Pt, b: Pt, near: Pt): Pt | null {
  const g = arcGeometry(a, b, h.sagitta ?? 0);
  if (!g) {
    const e = sub(b, a);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) return null;
    const s = ((a.x - o.x) * e.y - (a.y - o.y) * e.x) / den;
    return add(o, scale(d, s));
  }
  const f = sub(o, g.center);
  const bb = dot(f, d);
  const disc = bb * bb - (dot(f, f) - g.r * g.r);
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const p1 = add(o, scale(d, -bb - sq));
  const p2 = add(o, scale(d, -bb + sq));
  return dist(p1, near) <= dist(p2, near) ? p1 : p2;
}

/** Roh `nodeId` leží uvnitř jiné stěny (rovné i oblouku): napojí se na ni, stěna zůstane v celku. */
export function attachAtNode(floor: Floor, nodeId: Id): void {
  const node = floor.nodes[nodeId];
  if (!node) return;
  for (const w of Object.values(floor.walls)) {
    if (w.a === nodeId || w.b === nodeId || !canHost(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    const r = onHost(node, w, a, b);
    const len = dist(a, b);
    if (r.off > ON_HOST_TOL || r.t * len < 5 || (1 - r.t) * len < 5) continue;
    node.x = r.foot.x;
    node.y = r.foot.y;
    node.host = w.id;
    return;
  }
}

/**
 * Po úpravě výkresu (porovnání s `before`): napojený roh sleduje svou průběžnou stěnu.
 * - stěna zmizela / už ho nenese → napojení se zruší,
 * - pohnula se průběžná stěna nebo změnila vzepětí (a roh ne) → roh se přesune na ni ve směru napojené stěny
 *   (kolmá příčka se jen prodlouží / zkrátí, posun podél stěny napojení nemění),
 * - roh se pohnul sám (tažení) → zůstane napojený, jen když leží na stěně; jinak se odpojí.
 */
export function syncHosted(before: Floor | undefined, floor: Floor): void {
  // pořadí: nejdřív rohy na stěnách, jejichž konce samy nejsou napojené (řetěz C na B, B na A)
  const depth = new Map<Id, number>();
  const depthOf = (id: Id, guard = 0): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const n = floor.nodes[id];
    const h = n?.host ? floor.walls[n.host] : undefined;
    const d = !h || guard > 20 ? 0 : 1 + Math.max(depthOf(h.a, guard + 1), depthOf(h.b, guard + 1));
    depth.set(id, d);
    return d;
  };
  const hosted = Object.values(floor.nodes).filter(n => n.host).sort((p, q) => depthOf(p.id) - depthOf(q.id));
  for (const node of hosted) {
    if (!node.host) continue;
    const h = floor.walls[node.host];
    const a = h && floor.nodes[h.a];
    const b = h && floor.nodes[h.b];
    if (!canHost(h) || !a || !b || h.a === node.id || h.b === node.id) {
      delete node.host;
      continue;
    }
    const n0 = before?.nodes[node.id];
    const a0 = before?.nodes[h.a];
    const b0 = before?.nodes[h.b];
    const moved = (p: Pt | undefined, q: Pt) => !p || dist(p, q) > 1e-6;
    const nodeMoved = moved(n0, node);
    // pohnula se průběžná stěna: konce, nebo změna vzepětí oblouku (tažení úchytu, panel)
    const hostMoved = moved(a0, a) || moved(b0, b) || (before?.walls[h.id]?.sagitta ?? 0) !== (h.sagitta ?? 0);
    if (!nodeMoved && !hostMoved) continue;
    if (!nodeMoved && n0) {
      // průsečík přímky napojené stěny (přes její vzdálený konec) se stěnou (přímka / oblouk)
      const att = Object.values(floor.walls).find(w => (w.a === node.id || w.b === node.id) && w.id !== h.id);
      const far = att && floor.nodes[att.a === node.id ? att.b : att.a];
      let p: Pt | null = far && dist(far, n0) > 1 ? lineWithHost(far, unit(far, n0), h, a, b, n0) : null;
      if (!p) p = onHost(n0, h, a, b).foot;
      node.x = p.x;
      node.y = p.y;
    }
    const r = onHost(node, h, a, b);
    const len = dist(a, b);
    // pohnulo-li se obojí (posun / otočení výběru), konce i roh se zaokrouhlily každý zvlášť → větší tolerance
    const tol = nodeMoved && hostMoved ? 5 : ON_HOST_TOL;
    if (r.off <= tol && r.t * len >= 5 && (1 - r.t) * len >= 5) {
      node.x = r.foot.x;
      node.y = r.foot.y;
    } else delete node.host; // mimo stěnu (odtažený roh, zkrácená stěna) → samostatný roh
  }
}

/**
 * Napojené rohy (T bez dělení) na rovné stěně seřazené podél ní; `at` = vzdálenost od rohu A po ose (mm).
 * Pro řetězovou kótu polohy napojení (od zrušení dělení ji už nedávají kóty částí stěny).
 */
export function hostedChain(floor: Floor, wallId: Id): { nodeId: Id; at: number }[] {
  const h = floor.walls[wallId];
  const a = h && floor.nodes[h.a];
  const b = h && floor.nodes[h.b];
  if (!canHost(h) || h.sagitta || !a || !b || dist(a, b) < 1) return [];
  const u = unit(a, b);
  return Object.values(floor.nodes)
    .filter(n => n.host === wallId && n.id !== h.a && n.id !== h.b)
    .map(n => ({ nodeId: n.id, at: dot(sub(n, a), u) }))
    .sort((p, q) => p.at - q.at);
}

/**
 * Posune napojení podél průběžné stěny o `delta` mm: roh i napojená stěna se posunou rovnoběžně (vzdálený konec,
 * který je volný nebo napojený na jinou stěnu, jde s nimi; konec v rohu dalších stěn zůstane – stěna se natočí).
 */
function shiftHosted(floor: Floor, nodeId: Id, delta: number): void {
  const node = floor.nodes[nodeId];
  const h = node?.host ? floor.walls[node.host] : undefined;
  const a = h && floor.nodes[h.a];
  const b = h && floor.nodes[h.b];
  if (!node || !h || !a || !b) return;
  const v = scale(unit(a, b), delta);
  const moveNode = (n: Pt) => {
    n.x += v.x;
    n.y += v.y;
  };
  const from = { x: node.x, y: node.y };
  moveNode(node);
  for (const w of Object.values(floor.walls)) {
    if (w.id === h.id || (w.a !== nodeId && w.b !== nodeId) || w.radius !== undefined) continue;
    const farId = w.a === nodeId ? w.b : w.a;
    const far = floor.nodes[farId];
    if (!far || farId === nodeId) continue;
    const others = Object.values(floor.walls).filter(o => o.id !== w.id && (o.a === farId || o.b === farId));
    const fh = far.host ? floor.walls[far.host] : undefined;
    const fa = fh && floor.nodes[fh.a];
    const fb = fh && floor.nodes[fh.b];
    if (fh && fa && fb && canHost(fh)) {
      // konec napojený na jinou stěnu (i šikmou / oblouk): průsečík přímky příčky z posunutého rohu s tou stěnou
      const moved = add(far, v);
      const p = dist(far, from) > 1 ? lineWithHost(node, unit(from, far), fh, fa, fb, moved) : null;
      Object.assign(far, p ?? onHost(moved, fh, fa, fb).foot);
    } else if (others.length === 0) moveNode(far);
    // příčka se natočila (vzdálený konec zůstal v rohu dalších stěn) – změřená délka už neplatí
    else if (w.measured !== null) w.measured = null;
  }
}

/**
 * Zadání kóty polohy napojení: `to` = 'prev' – vzdálenost od předchozího napojení (nebo rohu A) k rohu `nodeId`;
 * 'next' – od rohu `nodeId` k dalšímu napojení (nebo rohu B). Pořadí napojení se nemění. Vrací false u nesmyslné hodnoty.
 */
export function setHostedGap(floor: Floor, wallId: Id, nodeId: Id, to: 'prev' | 'next', value: number): boolean {
  const h = floor.walls[wallId];
  const a = h && floor.nodes[h.a];
  const b = h && floor.nodes[h.b];
  const chain = hostedChain(floor, wallId);
  const i = chain.findIndex(c => c.nodeId === nodeId);
  if (!h || !a || !b || i < 0 || !Number.isFinite(value) || value < 0) return false;
  const len = dist(a, b);
  const lo = i > 0 ? chain[i - 1]!.at : 0;
  const hi = i + 1 < chain.length ? chain[i + 1]!.at : len;
  const target = to === 'prev' ? lo + value : hi - value;
  if (target <= lo + 1 || target >= hi - 1) return false;
  // příčka nesmí dosednout do otvoru (dveře, okno) v průběžné stěně
  const half = Math.max(0, ...Object.values(floor.walls).filter(w => w.id !== wallId && (w.a === nodeId || w.b === nodeId)).map(w => w.thickness / 2));
  if (openingsOnWall(floor, h).some(po => target + half > po.start && target - half < po.end)) return false;
  shiftHosted(floor, nodeId, target - chain[i]!.at);
  return true;
}
