/**
 * T-napojení bez dělení průběžné stěny (požadavek uživatele 2026-11-12, katalog C2/5 „A se nepřerušuje“).
 *
 * Konec stěny, který dosedne doprostřed jiné rovné stěny, dostane roh s `host` = ID té stěny. Průběžná
 * stěna zůstává jedna (jde vybrat, posunout a smazat celá). Tělo v místě napojení počítá `wallBodies`
 * (virtuální konce průběžné stěny), graf skupin a místností `wallSegments`. Když se průběžná stěna
 * pohne, napojený roh ji sleduje (`syncHosted`, volá se po každé úpravě výkresu).
 * Oblouky se dál dělí (splitWallsAtNode).
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, scale, sub, unit } from './geometry';
import { isCurved } from './floorQueries';
export { hostedOn, wallSegments } from './floorQueries';
import { splitWallsAtNode } from './topology';

/** Jak blízko (mm) musí roh ležet u stěny, aby se na ni napojil / zůstal napojený. */
export const ON_HOST_TOL = 1;

/** Může stěna nést napojené rohy (rovná, ne kruh)? */
export const canHost = (w: Wall | undefined): w is Wall => !!w && w.radius === undefined && !isCurved(w) && w.a !== w.b;

/** Poloha bodu podél stěny a–b (0 = a, 1 = b) a vzdálenost od její přímky. */
function along(p: Pt, a: Pt, b: Pt): { t: number; off: number; foot: Pt } {
  const e = sub(b, a);
  const len2 = dot(e, e) || 1;
  const t = dot(sub(p, a), e) / len2;
  const foot = add(a, scale(e, t));
  return { t, off: dist(p, foot), foot };
}

/**
 * Roh `nodeId` leží uvnitř jiné stěny: u rovné se na ni napojí (zůstane v celku), oblouk se rozdělí jako dřív.
 */
export function attachOrSplitAtNode(floor: Floor, nodeId: Id): void {
  const node = floor.nodes[nodeId];
  if (!node) return;
  for (const w of Object.values(floor.walls)) {
    if (w.a === nodeId || w.b === nodeId || !canHost(w)) continue;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b) continue;
    const r = along(node, a, b);
    const len = dist(a, b);
    if (r.off > ON_HOST_TOL || r.t * len < 5 || (1 - r.t) * len < 5) continue;
    node.x = r.foot.x;
    node.y = r.foot.y;
    node.host = w.id;
    return;
  }
  splitWallsAtNode(floor, nodeId);
}

/**
 * Po úpravě výkresu (porovnání s `before`): napojený roh sleduje svou průběžnou stěnu.
 * - stěna zmizela / už ho nenese → napojení se zruší,
 * - pohnula se průběžná stěna (a roh ne) → roh se přesune na její přímku ve směru napojené stěny
 *   (kolmá příčka se jen prodlouží / zkrátí, posun podél stěny napojení nemění),
 * - roh se pohnul sám (tažení) → zůstane napojený, jen když leží na stěně; jinak se odpojí.
 */
export function syncHosted(before: Floor | undefined, floor: Floor): void {
  for (const node of Object.values(floor.nodes)) {
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
    const hostMoved = moved(a0, a) || moved(b0, b);
    if (!nodeMoved && !hostMoved) continue;
    if (!nodeMoved && n0) {
      // průběžná stěna se pohnula: průsečík přímky napojené stěny (přes její vzdálený konec) s přímkou stěny
      const att = Object.values(floor.walls).find(w => (w.a === node.id || w.b === node.id) && w.id !== h.id);
      const far = att && floor.nodes[att.a === node.id ? att.b : att.a];
      const e = sub(b, a);
      let p: Pt | null = null;
      if (far && dist(far, n0) > 1) {
        const d = unit(far, n0);
        const den = d.x * e.y - d.y * e.x;
        if (Math.abs(den) > 1e-9) {
          const s = ((a.x - far.x) * e.y - (a.y - far.y) * e.x) / den;
          p = add(far, scale(d, s));
        }
      }
      if (!p) p = along(n0, a, b).foot;
      node.x = p.x;
      node.y = p.y;
    }
    const r = along(node, a, b);
    const len = dist(a, b);
    if (r.off <= ON_HOST_TOL && r.t * len >= 5 && (1 - r.t) * len >= 5) {
      node.x = r.foot.x;
      node.y = r.foot.y;
    } else delete node.host; // mimo stěnu (odtažený roh, zkrácená stěna) → samostatný roh
  }
}
