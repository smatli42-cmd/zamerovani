/**
 * Volná kóta (POZADAVKY.md 3; rozhodnutí uživatele 2026-11-18): řídicí – zadaná délka posune zvolený konec ve směru
 * kóty; vzniká nástrojem Kóta dvěma ťuknutími na body / hrany (core/dimRefs.ts), odsazení se upraví tažením.
 * Kóta mezi rovnoběžnými hranami nebo hranou a bodem měří kolmou vzdálenost (zarovnaná kóta jako v CAD).
 * Všechna pravidla volné kóty jsou tady (hodnota, posun konce, znovunapojení a úklid po úpravách).
 *
 * Posun konce jede s prvkem:
 * - úhlopříčka uzavřené místnosti (oba konce rohy téže místnosti): délky stěn zůstanou, místnost se zkosí (core/diagonal.ts),
 * - roh stěny: jako při změně délky stěny (řešič „gumička“, core/solver.ts); když druhý konec není roh, posune se
 *   celá skupina stěn, která na rohu visí,
 * - líc / čára stěny: posune se celá stěna (jen oba rohy, sousední stěny se protáhnou – `moveWallStretch`),
 * - bod kresby / čára kresby: celá kresba; oba konce na téže kresbě → jen ten bod / úsek (obdélník zůstane obdélníkem;
 *   dvojitá čára: 1. / 2. čára = změna šířky, uzavřený konec = posun bodu na tom konci),
 * - okraj otvoru: otvor se posune po stěně,
 * - hrana výstupku / vybrání: core/protrusionDimMove.ts (jen hrana; čelní hrana = celá stěna; zamčený rozměr = celek),
 * - pevný bod: jen bod,
 * - bod na oblouku / střed oblouku: obloukové stěny = celá stěna (tvar oblouku zůstane), kresby = celá kresba.
 */
import type { DimEnd, Drawing, Floor, FreeDim, Id, Node, Pt } from '../model/types';
import { add, dist, dot, normal, projectToSegment, scale, sub, unit } from './geometry';
import { DEFAULT_DOUBLE_WIDTH, moveDrawingVertex, placeDrawing } from './drawing';
import { moveNodeWithRubberBand, moveWallStretch } from './solver';
import { drawSeg, drawSegCount, measurePoints, protById, refGeom, rescueArcEnd } from './dimRefs';
import { moveProtEdge, ownProtEnd } from './protrusionDimMove';
import { setRoomDiagonal } from './diagonal';
import { openingSpan, openingStartFromA } from './floorQueries';
import { stairPoints } from './stairs';
import { fullFloorOf } from './layers';

export const freeDimsOf = (floor: Floor): FreeDim[] => Object.values(floor.dims ?? {});

/** Body, mezi kterými kóta měří [1., 2.]; null = některý konec zanikl nebo hrany nejsou rovnoběžné. */
export function dimPoints(floor: Floor, d: FreeDim): [Pt, Pt] | null {
  const g1 = refGeom(floor, d.a);
  const g2 = refGeom(floor, d.b);
  return g1 && g2 ? measurePoints(g1, g2) : null;
}

/** Délka kóty (mm); null = kóta teď neexistuje. */
export function freeDimValue(floor: Floor, id: Id): number | null {
  const d = floor.dims?.[id];
  const pts = d && dimPoints(floor, d);
  return pts ? dist(pts[0], pts[1]) : null;
}

/** Kótovací čára (body posunuté o odsazení); null = kóta se nekreslí. */
export function dimLine(floor: Floor, d: FreeDim): [Pt, Pt] | null {
  const pts = dimPoints(floor, d);
  if (!pts || dist(pts[0], pts[1]) < 1e-6) return null;
  const o = scale(normal(unit(pts[0], pts[1])), d.offset);
  return [add(pts[0], o), add(pts[1], o)];
}

/** Konec, jehož posun hýbe stěnami (roh, líc stěny). Okraj otvoru, kresba a pevný bod posunou jen sebe. */
const movesWalls = (e: DimEnd): boolean => 'node' in e || wallOf(e) !== null;

/**
 * Výchozí posouvaný konec kóty (NumPad, panel): 2. bod; když ale 2. konec hýbe stěnami a 1. ne (okraj otvoru,
 * kresba, pevný bod), posune se 1. – zadáním kóty k oknu se má posunout okno, ne stěna (chyba od uživatele 2026-11-18).
 */
export function defaultFreeDimMove(d: FreeDim): 'a' | 'b' {
  return movesWalls(d.b) && !movesWalls(d.a) ? 'a' : 'b';
}

/** Kóta, jejíž kótovací čára leží do `tol` od bodu (nejbližší). */
export function pickFreeDim(floor: Floor, p: Pt, tol: number): Id | null {
  let best: Id | null = null;
  let bestD = tol;
  // pohled bez skrytých prvků (core/layers.ts): kóty z pohledu, body z celého podlaží
  const geo = fullFloorOf(floor);
  for (const d of freeDimsOf(floor)) {
    const line = dimLine(geo, d);
    if (!line) continue;
    const h = projectToSegment(p, line[0], line[1]).distance;
    if (h <= bestD) {
      best = d.id;
      bestD = h;
    }
  }
  return best;
}

/** Odsazení kóty podle bodu p (kolmá vzdálenost od spojnice bodů se znaménkem, po 10 mm). */
export function offsetTowards(floor: Floor, d: FreeDim, p: Pt): number | null {
  const pts = dimPoints(floor, d);
  if (!pts || dist(pts[0], pts[1]) < 1e-6) return null;
  return Math.round(dot(sub(p, pts[0]), normal(unit(pts[0], pts[1]))) / 10) * 10;
}

/** Jsou dva konce tentýž bod / hrana? */
export function sameEnd(a: DimEnd, b: DimEnd): boolean {
  const key = (e: DimEnd) => JSON.stringify({ ...e, at: undefined });
  return key(a) === key(b);
}

/** Kresba, ke které konec patří (bod nebo úsek); null = jiný prvek. */
const drawingOf = (e: DimEnd): Id | null =>
  'drawing' in e ? e.drawing : 'seg' in e ? e.seg : 'arcSeg' in e ? e.arcSeg : 'center' in e && e.i !== undefined ? e.center : null;

/** Schodiště, ke kterému konec patří (roh, hrana); null = jiný prvek. */
const stairOf = (e: DimEnd): Id | null => ('stair' in e ? e.stair : 'stairSeg' in e ? e.stairSeg : null);

/** Stěna, kterou konec posouvá celou (líc rovné stěny, bod na oblouku stěny, střed obloukové stěny). */
const wallOf = (e: DimEnd): Id | null => ('wall' in e ? e.wall : 'arcWall' in e ? e.arcWall : 'center' in e && e.i === undefined ? e.center : null);

/**
 * Dvojitá čára, posun jejího úseku (druhý konec kóty na téže kresbě): 1. / 2. čára = změna šířky (druhá čára
 * stojí / první stojí), uzavřený konec = posun bodu na tom konci.
 */
function moveDoubleSeg(dr: Drawing, i: number, dx: number, dy: number): boolean {
  const a = dr.pts[0];
  const b = dr.pts[1];
  if (!a || !b || dist(a, b) < 1e-6) return false;
  const n = normal(unit(a, b));
  const shift = dx * n.x + dy * n.y;
  let k = (dr.side ?? 1) * (dr.width ?? DEFAULT_DOUBLE_WIDTH);
  if (i === 0) {
    for (const p of [a, b]) {
      p.x += dx;
      p.y += dy;
    }
    k -= shift;
  } else if (i === 1) k += shift;
  else if (i === 2 || i === 3) {
    const p = i === 2 ? b : a;
    p.x += dx;
    p.y += dy;
    return true;
  } else return false;
  if (Math.abs(k) < 1) return false; // čáry by splynuly
  dr.side = k < 0 ? -1 : 1;
  dr.width = Math.round(Math.abs(k) * 10) / 10;
  return true;
}

/** Posune prvek konce `e` o (dx, dy); `other` = druhý konec kóty (rozhoduje, co se posune). false = nejde. */
function moveEnd(floor: Floor, e: DimEnd, other: DimEnd, otherPt: Pt, dx: number, dy: number): boolean {
  if ('node' in e) {
    const n = floor.nodes[e.node];
    if (!n) return false;
    // pevný konec, který není roh: pomocný „roh“ mimo graf – posune se vše, co visí na posouvaném rohu
    const anchor: Node = 'node' in other && floor.nodes[other.node] ? floor.nodes[other.node]! : { id: '\u0000kotva', x: otherPt.x, y: otherPt.y };
    if (anchor.id === n.id) return false;
    moveNodeWithRubberBand(floor, n, anchor, dx, dy);
    return true;
  }
  const wallId = wallOf(e);
  if (wallId) {
    // celá stěna (i oblouková – tvar oblouku zůstane): oba rohy, sousední stěny se protáhnou (core/solver.ts)
    return moveWallStretch(floor, wallId, dx, dy);
  }
  const drId = drawingOf(e);
  if (drId) {
    const dr = floor.drawings?.[drId];
    if (!dr) return false;
    const same = drawingOf(other) === drId;
    // bod na oblouku / střed oblouku vůči jinému bodu téže kresby: posun celé kresby by délku nezměnil
    if (same && ('arcSeg' in e || 'center' in e)) return false;
    if (same && 'drawing' in e) {
      const q = dr.pts[e.i];
      if (!q) return false;
      moveDrawingVertex(dr, e.i, { x: q.x + dx, y: q.y + dy });
    } else if (same && 'seg' in e && dr.shape === 'double') {
      if (!moveDoubleSeg(dr, e.i, dx, dy)) return false;
    } else if (same && 'seg' in e) {
      // úsek posunutý kolmo – oba jeho body (obdélník zůstane obdélníkem)
      for (const k of [e.i, (e.i + 1) % dr.pts.length]) {
        const q = dr.pts[k]!;
        q.x += dx;
        q.y += dy;
      }
    } else
      placeDrawing(
        dr,
        dr.pts.map(p => ({ x: p.x, y: p.y })),
        dx,
        dy
      );
    return true;
  }
  if ('prot' in e) {
    // hrana výstupku / vybrání: pravidla v core/protrusionDimMove.ts (jen hrana, čelní hrana = stěna, zámek = celek)
    return moveProtEdge(floor, e.prot, e.i, dx, dy, ownProtEnd(floor, e.prot, other));
  }
  const stId = stairOf(e);
  if (stId) {
    // roh / hrana schodiště: posune se celé schodiště (odstup od stěny); kóta uvnitř téhož schodiště ne (rozměry jen kótami schodiště)
    const s = floor.stairs?.[stId];
    if (!s || stairOf(other) === stId) return false;
    for (const p of stairPoints(s)) {
      p.x += dx;
      p.y += dy;
    }
    return true;
  }
  if ('opening' in e) {
    const op = floor.openings[e.opening];
    const w = op && floor.walls[op.wallId];
    const a = w && floor.nodes[w.a];
    const b = w && floor.nodes[w.b];
    if (!op || !a || !b) return false;
    const len = dist(a, b);
    const shift = dot({ x: dx, y: dy }, unit(a, b));
    const start0 = openingStartFromA(op, len);
    // oba konce na okrajích téhož otvoru = šířka otvoru (druhý okraj stojí)
    const widthOnly = 'opening' in other && other.opening === op.id && other.edge !== e.edge;
    let start = start0;
    if (widthOnly) {
      const dw = e.edge === 'end' ? shift : -shift;
      if (op.width + dw < 10) return false;
      if (e.edge === 'start') start = start0 + shift;
      op.width = Math.round(op.width + dw);
    } else start = start0 + shift;
    const span = openingSpan(op);
    if (start < -0.5 || start + span > len + 0.5) return false; // otvor by vyjel ze stěny
    // otvor nesmí najet na jiný otvor na stejné stěně
    for (const o of Object.values(floor.openings)) {
      if (o.id === op.id || o.wallId !== op.wallId) continue;
      const os = openingStartFromA(o, len);
      if (start < os + openingSpan(o) - 0.5 && os < start + span - 0.5) return false;
    }
    const s = Math.round(Math.max(0, Math.min(len - span, start)));
    op.offset = op.ref === 'a' ? s : Math.max(0, Math.round(len - s - span));
    return true;
  }
  if (!('x' in e)) return false;
  e.x = Math.round((e.x + dx) * 10) / 10;
  e.y = Math.round((e.y + dy) * 10) / 10;
  return true;
}

/**
 * Nastaví délku kóty posunem konce `move` ve směru kóty (mění `floor`). false = nejde (nulová délka, konec zanikl,
 * výsledek nesedí – např. posunem se pohne i druhý konec).
 */
export function setFreeDimLength(floor: Floor, id: Id, value: number, move: 'a' | 'b', verify = true): boolean {
  const d = floor.dims?.[id];
  const pts = d && dimPoints(floor, d);
  if (!d || !pts || !Number.isFinite(value) || value < 1) return false;
  const cur = dist(pts[0], pts[1]);
  if (cur < 1) return false; // bez směru
  const delta = value - cur;
  if (Math.abs(delta) < 0.05) return true;
  const from = move === 'a' ? pts[0] : pts[1];
  const to = move === 'a' ? pts[1] : pts[0];
  const u = unit(to, from); // od pevného konce k posouvanému
  const mv = move === 'a' ? d.a : d.b;
  const fx = move === 'a' ? d.b : d.a;
  // úhlopříčka uzavřené místnosti: délky stěn zůstanou, místnost se zkosí (core/diagonal.ts)
  const diag = 'node' in mv && 'node' in fx ? setRoomDiagonal(floor, fx.node, mv.node, value) : null;
  const ok = diag !== null ? diag : moveEnd(floor, move === 'a' ? d.a : d.b, move === 'a' ? d.b : d.a, to, u.x * delta, u.y * delta);
  if (!verify) return ok; // ověří volající (až po vrácení otvorů na místo)
  const after = freeDimValue(floor, id);
  return ok && after !== null && Math.abs(after - value) < 0.5;
}

/**
 * Po úpravě výkresu `before` → `after` se znovu napojí konce kót, jejichž roh / bod kresby zmizel či se přečísloval
 * (jedno místo pro všechny operace – sloučení rovných stěn, spojení / obrácení čáry kresby…):
 * - roh: roh ve stejném místě → ten roh; když místem dál vede stěna (sloučení rovného pokračování) → pevný bod;
 *   jinak kóta zanikne. (Do rohu / K hraně přepojí konec stěny výslovně – `remapDimNode` v core/trimExtend.ts.)
 * - bod kresby: na svém místě je dál → beze změny; jinak vrchol kresby (přednostně téže) ve stejném místě; když se
 *   vrchol jen posunul (úchyt, posun kresby), kóta jde s ním,
 * - úsek kresby: úsek se stejnými body (i obráceně) → ten úsek.
 * - líc stěny, která zanikla (dělení, sloučení): líc jiné rovné stěny na stejné přímce, přednostně ta, na které
 *   leží místo dosednutí (strana se přepočítá podle směru stěny); jinak kóta zanikne,
 * - bod na oblouku / střed oblouku: přečíslovaný úsek kresby, zkrácení / dělení (bod na místě), změna tvaru (úměrně),
 *   narovnání (líc rovné stěny) – `rescueArcEnd` v core/dimArcRefs.ts.
 * Okraje otvorů mají stálá ID (zaniknou s otvorem).
 */
export function rescueFreeDims(before: Floor | undefined, after: Floor): void {
  if (!before || !after.dims) return;
  const near = (p: Pt, q: Pt, tol = 0.5) => dist(p, q) <= tol;
  for (const d of freeDimsOf(after)) {
    for (const k of ['a', 'b'] as const) {
      const e = d[k];
      if ('node' in e && !after.nodes[e.node]) {
        const old = before.nodes[e.node];
        if (!old) continue;
        const same = Object.values(after.nodes).find(n => near(n, old, 1));
        if (same) d[k] = { node: same.id };
        else if (wallThrough(after, old)) d[k] = { x: old.x, y: old.y };
      } else if ('drawing' in e) {
        const old = before.drawings?.[e.drawing]?.pts[e.i];
        const now = after.drawings?.[e.drawing]?.pts[e.i];
        if (!old || (now && near(now, old))) continue;
        const own = after.drawings?.[e.drawing];
        const cands = [...(own ? [own] : []), ...Object.values(after.drawings ?? {}).filter(x => x.id !== e.drawing)];
        for (const dr of cands) {
          const i = dr.pts.findIndex(q => near(q, old));
          if (i >= 0) {
            d[k] = { drawing: dr.id, i };
            break;
          }
        }
      } else if ('arcWall' in e || 'arcSeg' in e || 'center' in e) {
        // bod na oblouku / střed: pravidla v core/dimArcRefs.ts (`rescueArcEnd`)
        const hit = rescueArcEnd(before, after, e);
        if (hit) d[k] = hit;
      } else if ('wall' in e && !after.walls[e.wall]) {
        const g = refGeom(before, e);
        if (g?.kind !== 'line') continue;
        const hit = faceOnLine(after, g.p, g.d);
        if (hit) d[k] = hit;
      } else if ('seg' in e) {
        const old = drawSeg(before.drawings?.[e.seg], e.i);
        if (!old) continue;
        const [p0, p1] = old;
        // úseky kresby (i druhá čára a konce dvojité čáry) – jediné číslování v core/dimRefs.ts
        const segAt = (dr: Drawing, i: number): [Pt, Pt] | null => drawSeg(dr, i);
        const segCount = drawSegCount;
        const nd = after.drawings?.[e.seg];
        const now = nd ? segAt(nd, e.i) : null;
        if (now && near(now[0], p0) && near(now[1], p1)) continue; // beze změny
        // dvojitá čára má pevné číslování úseků – úsek, který dál existuje, se jen posunul (nepřeskakovat na jinou čáru)
        if (now && nd?.shape === 'double') continue;
        const cands = [...(nd ? [nd] : []), ...Object.values(after.drawings ?? {}).filter(x => x.id !== e.seg)];
        let found = false;
        for (const dr of cands) {
          for (let i = 0; i < segCount(dr) && !found; i++) {
            const sq = segAt(dr, i);
            if (!sq) continue;
            const [q0, q1] = sq;
            if (near(q0, p0) && near(q1, p1)) {
              d[k] = { seg: dr.id, i, at: e.at };
              found = true;
            } else if (near(q0, p1) && near(q1, p0)) {
              d[k] = { seg: dr.id, i, at: Math.round((dist(p0, p1) - e.at) * 10) / 10 };
              found = true;
            }
          }
          if (found) break;
        }
      }
    }
  }
}

/** Líc rovné stěny na přímce (bod p, směr d) – přednostně ta, jejíž délka obsahuje p; null = žádný. */
function faceOnLine(floor: Floor, p: Pt, d: Pt): DimEnd | null {
  let best: DimEnd | null = null;
  let bestOut = Infinity;
  for (const w of Object.values(floor.walls)) {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (!a || !b || w.sagitta || w.radius !== undefined || dist(a, b) < 1) continue;
    const u = unit(a, b);
    if (Math.abs(u.x * d.y - u.y * d.x) > 0.0175) continue;
    const n = normal(u);
    const at = dot(sub(p, a), u);
    const len = dist(a, b);
    for (const side of [1, -1, 0] as const) {
      const ge = refGeom(floor, { wall: w.id, side, at });
      if (!ge || Math.abs(dot(sub(p, ge.p), n)) > 0.5 || (side === 0 && w.thickness > 0)) continue;
      const out = Math.max(0, -at, at - len); // jak daleko je místo dosednutí mimo stěnu
      if (out < bestOut) {
        best = { wall: w.id, side, at: Math.round(at * 10) / 10 };
        bestOut = out;
      }
    }
  }
  return best;
}

/** Vede bodem (do 1 mm) osa některé rovné stěny? */
function wallThrough(floor: Floor, p: Pt): boolean {
  return Object.values(floor.walls).some(w => {
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    return !!a && !!b && !w.sagitta && w.radius === undefined && projectToSegment(p, a, b).distance <= 1;
  });
}

/** Úklid: kóty, jejichž konec zanikl (smazaný roh, stěna, otvor, kresba, bod kresby), se smažou. */
export function pruneFreeDims(floor: Floor): void {
  if (!floor.dims) return;
  // hrana výstupku, který se jen dočasně nekreslí (neplatný roh, nevolný konec), kótu nesmaže – zanikne se smazáním výstupku
  const gone = (e: DimEnd) => ('prot' in e ? !protById(floor, e.prot) : !refGeom(floor, e));
  for (const d of freeDimsOf(floor)) if (gone(d.a) || gone(d.b)) delete floor.dims[d.id];
  if (Object.keys(floor.dims).length === 0) delete floor.dims;
}

/** Roh `from` nahrazený rohem `to` (přetažení rohu na roh, Do rohu): kóty přejdou na nový roh. */
export function remapDimNode(floor: Floor, from: Id, to: Id): void {
  for (const d of freeDimsOf(floor)) {
    for (const k of ['a', 'b'] as const) {
      const e = d[k];
      if ('node' in e && e.node === from) d[k] = { node: to };
    }
  }
}

/** Bod konce kóty (bod, nebo místo dosednutí na hranu). */
export function endPoint(floor: Floor, e: DimEnd): Pt | null {
  return refGeom(floor, e)?.p ?? null;
}
