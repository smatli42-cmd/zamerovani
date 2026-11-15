/**
 * Změny propojení stěn: rozdělení stěny v rohu (dnes jen nástroj / testy – napojení stěnu nedělí, viz
 * core/hosting.ts), sloučení rovného pokračování a migrace starých rozdělených stěn a oblouků.
 */
import { newId } from '../model/factory';
import type { Floor, Id, Wall } from '../model/types';
import { arcGeometry, nearestOnArc, splitArcSagittas } from './arc';
import { dist } from './geometry';
import { openingSpan, openingStartFromA, wallLength, wallNodes } from './floorQueries';
import { straightContinuation } from './wallSide';
import { moveProtrusions, wallFrame } from './protrusion';
import { redistributeCarried } from './carried';

/** Jak blízko (mm) musí roh ležet u stěny, aby ji rozdělil. */
const ON_WALL_TOL = 1;
/** Minimální délka části stěny po rozdělení (mm). */
const MIN_PART = 5;

/**
 * Rozdělí stěnu v rohu `nodeId` (roh musí ležet na stěně).
 * Vrací ID nových dvou stěn [A–roh, roh–B], nebo null, pokud nejde rozdělit.
 */
export function splitWallAt(floor: Floor, wallId: Id, nodeId: Id): [Id, Id] | null {
  const wall = floor.walls[wallId];
  const node = floor.nodes[nodeId];
  if (!wall || !node || wall.a === nodeId || wall.b === nodeId || wall.radius !== undefined) return null;
  const n = wallNodes(floor, wall);
  if (!n) return null;
  const [nA, nB] = n;
  const len = dist(nA, nB);
  const sag = wall.sagitta ?? 0;
  const pr = nearestOnArc(node, nA, nB, sag);
  // u oblouku se míry částí berou jako tětivy
  const lenA = dist(nA, pr.point);
  const lenB = dist(pr.point, nB);
  if (pr.distance > ON_WALL_TOL || lenA < MIN_PART || lenB < MIN_PART) return null;
  // poloha podél PŮVODNÍ stěny (u oblouku po oblouku osy) – pro rozdělení nesených prvků
  const frame = wallFrame(floor, wall);
  if (!frame) return null;
  const uOf = (p: { x: number; y: number }) => frame.project(p).u;
  const uAt = uOf(pr.point);

  // Přesně na stěnu (bez zaokrouhlovací odchylky)
  node.x = pr.point.x;
  node.y = pr.point.y;
  const sagParts = sag ? splitArcSagittas(nA, nB, sag, pr.point) : null;
  const part = (a: Id, b: Id, partSag: number | null): Wall => {
    const w: Wall = {
      id: newId('w'),
      a,
      b,
      thickness: wall.thickness,
      side: wall.side,
      label: { ...wall.label }
    };
    if (partSag) w.sagitta = partSag;
    if (wall.style) w.style = wall.style;
    if (wall.sideLocked) w.sideLocked = true;
    if (wall.axis) w.axis = wall.axis;
    return w;
  };
  const wA = part(wall.a, nodeId, sagParts ? sagParts[0] : null);
  const wB = part(nodeId, wall.b, sagParts ? sagParts[1] : null);
  // příznak „nespojovat“ patří původním koncům; nový roh uprostřed ho nemá
  if (wall.noJoinA) wA.noJoinA = true;
  if (wall.noJoinB) wB.noJoinB = true;
  // prvky nesené stěnou přejdou na část, na které leží, a zůstanou na místě; prvek přes dělicí bod
  // zanikne (F4, I1.13 – rozhodnutí uživatele 2026-11-15; core/carried.ts). Ještě před odebráním původní
  // stěny – výstupek přes roh potřebuje její polohu.
  redistributeCarried(floor, wallId, len, [
    { wallId: wA.id, from: 0, to: uAt },
    { wallId: wB.id, from: uAt, to: frame.len }
  ], uOf);
  delete floor.walls[wallId];
  floor.walls[wA.id] = wA;
  // zamčená délka / tloušťka celé stěny → zamčené i obě části (celek zůstane držený); zámek celku zanikne
  const locks = floor.dimLocks;
  if (locks) {
    const len = locks[`wall-length:${wallId}`];
    const thk = locks[`wall-thickness:${wallId}`];
    delete locks[`wall-length:${wallId}`];
    delete locks[`wall-thickness:${wallId}`];
    for (const id of [wA.id, wB.id]) {
      if (len) locks[`wall-length:${id}`] = { kind: 'wall-length', wallId: id, move: 'both' };
      if (thk) locks[`wall-thickness:${id}`] = { kind: 'wall-thickness', wallId: id };
    }
  }
  floor.walls[wB.id] = wB;
  return [wA.id, wB.id];
}

/** Rozdělí všechny stěny, na jejichž vnitřku leží roh `nodeId`. */
export function splitWallsAtNode(floor: Floor, nodeId: Id): void {
  const node = floor.nodes[nodeId];
  if (!node) return;
  for (const w of Object.values(floor.walls)) {
    if (w.a === nodeId || w.b === nodeId || w.radius !== undefined) continue;
    const n = wallNodes(floor, w);
    if (!n) continue;
    const pr = nearestOnArc(node, n[0], n[1], w.sagitta ?? 0);
    if (pr.distance <= ON_WALL_TOL) splitWallAt(floor, w.id, nodeId);
  }
}

/**
 * Sloučí stěnu `wallId` se stěnou, na jejíž volný konec v rohu `nodeId` rovně navazuje (stejná tloušťka).
 * Zůstane původní stěna (její strana těla, popisek, otvory na svém místě), prodloužená o novou;
 * roh mezi nimi zanikne (smaže ho úklid volajícího). Vrací ID výsledné stěny.
 * `throughT` (migrace starých rozdělených stěn): slučuje i přes roh, kde se napojují další stěny – pak tam
 * zůstane roh napojený na sloučenou stěnu (T bez dělení, core/hosting.ts); musí sedět i strana těla a styl.
 */
export function mergeStraightAt(floor: Floor, wallId: Id, nodeId: Id, throughT = false): Id {
  const w = floor.walls[wallId];
  const node = floor.nodes[nodeId];
  if (!w || !node || w.sagitta || (w.a !== nodeId && w.b !== nodeId)) return wallId;
  const wFarId = w.a === nodeId ? w.b : w.a;
  const wFar = floor.nodes[wFarId];
  if (!wFar) return wallId;
  const o = straightContinuation(floor, nodeId, node, wFar, w.thickness, w.id, throughT);
  if (!o || o.axis !== w.axis) return wallId; // různá osa = dvě stěny
  // zamčená délka stěny (zámek kót) – pokračování se nepřipojí, zůstanou dvě stěny a zamčená kóta platí dál
  if (floor.dimLocks?.[`wall-length:${o.id}`] || floor.dimLocks?.[`wall-length:${w.id}`]) return wallId;
  if (throughT) {
    // roh už nese jinou průběžnou stěnu (staré křížení „+“): slučuje se jen jedna průběžná dvojice
    if (node.host) return wallId;
    // stejný směr řetězu (a→roh→b) = stejná strana; obrácený = opačná (u čar bez tloušťky na straně nezáleží)
    const sameDir = (o.b === nodeId && w.a === nodeId) || (o.a === nodeId && w.b === nodeId);
    const noJoinAt = (x: typeof w) => (x.a === nodeId && x.noJoinA) || (x.b === nodeId && x.noJoinB);
    const sideOk = w.thickness === 0 || (sameDir ? o.side === w.side : o.side !== w.side);
    if (!sideOk || (o.style ?? 'solid') !== (w.style ?? 'solid') || noJoinAt(o) || noJoinAt(w)) return wallId;
  }
  const oldLen = wallLength(floor, o);
  const added = dist(node, wFar);
  const starts = Object.values(floor.openings)
    .filter(op => op.wallId === o.id)
    .map(op => ({ op, start: openingStartFromA(op, oldLen) + (o.a === nodeId ? added : 0) }));
  // otvory nakreslené na nové části (nebývají, ale pro jistotu) se přesunou na sloučenou stěnu
  const wLen = wallLength(floor, w);
  for (const op of Object.values(floor.openings)) {
    if (op.wallId !== w.id) continue;
    const s0 = openingStartFromA(op, wLen);
    // poloha od rohu nodeId podél nové části
    const fromNode = w.a === nodeId ? s0 : wLen - s0 - openingSpan(op);
    const start = o.b === nodeId ? oldLen + fromNode : added - fromNode - openingSpan(op);
    starts.push({ op, start });
    op.wallId = o.id;
  }
  // výstupky: u se měří od rohu A sloučené stěny (u o se posune, když se A přesune na vzdálený konec nové části)
  const fromNode = (u: number) => (w.a === nodeId ? u : wLen - u);
  if (o.a === nodeId) {
    moveProtrusions(floor, o.id, o.id, u => u + added);
    moveProtrusions(floor, w.id, o.id, u => added - fromNode(u), w.a === nodeId);
  } else moveProtrusions(floor, w.id, o.id, u => oldLen + fromNode(u), w.b === nodeId);
  // vzdálený konec nové části se stává koncem sloučené stěny – přenese se i jeho příznak
  const wFarNoJoin = w.a === nodeId ? w.noJoinB : w.noJoinA;
  // směr slučované části vůči sloučené stěně (rohy na líci části w: strana líce se počítá podél a→b)
  const wSameDir = (o.b === nodeId && w.a === nodeId) || (o.a === nodeId && w.b === nodeId);
  if (o.a === nodeId) {
    o.a = wFarId;
    if (wFarNoJoin) o.noJoinA = true;
    else delete o.noJoinA;
  } else {
    o.b = wFarId;
    if (wFarNoJoin) o.noJoinB = true;
    else delete o.noJoinB;
  }
  delete floor.walls[w.id];
  // výstupek na vzdáleném konci slučované části přejde na sloučenou stěnu (ten konec je teď jejím koncem);
  // výstupek na konci v místě sloučení zanikne (konec už neexistuje, F4)
  for (const ep of Object.values(floor.endProtrusions ?? {})) {
    if (ep.wallId === o.id && (ep.end === 'a' ? o.a : o.b) === wFarId) {
      delete floor.endProtrusions![ep.id];
      continue;
    }
    if (ep.wallId !== w.id) continue;
    const endNode = ep.end === 'a' ? w.a : w.b;
    if (endNode !== wFarId) continue;
    ep.wallId = o.id;
    ep.end = o.a === wFarId ? 'a' : 'b';
    if (!wSameDir) ep.side = ep.side === 1 ? -1 : 1;
  }
  // výstupky přes roh na slučované části přejdou na sloučenou stěnu (obrácený směr = líc a směr na druhou stranu)
  for (const cp of Object.values(floor.cornerProtrusions ?? {})) {
    const i = cp.walls.indexOf(w.id);
    if (i < 0) continue;
    cp.walls[i] = o.id;
    if (!wSameDir) {
      cp.sides[i] = cp.sides[i] === 1 ? -1 : 1;
      cp.dirs[i] = cp.dirs[i] === 1 ? -1 : 1;
    }
  }
  // rohy napojené na slučovanou část teď leží na sloučené stěně; přes T zůstává roh napojený
  for (const n of Object.values(floor.nodes)) {
    if (n.host !== w.id) continue;
    n.host = o.id;
    if (n.hostFace && !wSameDir) n.hostFace = n.hostFace === 1 ? -1 : 1;
  }
  if (throughT && Object.values(floor.walls).some(x => x.a === nodeId || x.b === nodeId)) {
    node.host = o.id;
    delete node.hostFace; // roh v místě sloučení leží na ose
  }
  const newLen = oldLen + added;
  for (const { op, start } of starts) {
    const s = Math.max(0, Math.round(start));
    op.offset = op.ref === 'a' ? s : Math.max(0, Math.round(newLen - s - openingSpan(op)));
  }
  return o.id;
}

/**
 * Migrace (T bez dělení i u oblouků, 2026-11-12): dvě části oblouku na téže kružnici, které se potkávají
 * v rohu `nodeId`, se spojí do jednoho oblouku (stejná tloušťka, osa, styl, popisek, strana těla; bez
 * rozpojeného konce). Zbudou-li v rohu další stěny, roh se na spojený oblouk napojí. Vrací true, když spojil.
 */
export function mergeArcAt(floor: Floor, nodeId: Id): boolean {
  const node = floor.nodes[nodeId];
  if (!node || node.host) return false;
  const at = Object.values(floor.walls).filter(w => (w.a === nodeId || w.b === nodeId) && w.sagitta && w.radius === undefined && w.a !== w.b);
  for (const w1 of at) {
    for (const w2 of at) {
      if (w1 === w2) continue;
      const p = floor.nodes[w1.a === nodeId ? w1.b : w1.a];
      const q = floor.nodes[w2.a === nodeId ? w2.b : w2.a];
      const g1 = wallNodes(floor, w1) && arcGeometry(floor.nodes[w1.a]!, floor.nodes[w1.b]!, w1.sagitta!);
      const g2 = wallNodes(floor, w2) && arcGeometry(floor.nodes[w2.a]!, floor.nodes[w2.b]!, w2.sagitta!);
      if (!p || !q || p.id === q.id || !g1 || !g2) continue;
      if (dist(g1.center, g2.center) > 0.5 || Math.abs(g1.r - g2.r) > 0.5) continue;
      if (w1.thickness !== w2.thickness || w1.axis !== w2.axis || (w1.style ?? 'solid') !== (w2.style ?? 'solid')) continue;
      if (JSON.stringify(w1.label) !== JSON.stringify(w2.label)) continue;
      const noJoinAt = (x: Wall) => (x.a === nodeId && x.noJoinA) || (x.b === nodeId && x.noJoinB);
      if (noJoinAt(w1) || noJoinAt(w2)) continue;
      // strana těla vůči směru řetězu p → roh → q
      const s1 = w1.b === nodeId ? w1.side : -w1.side;
      const s2 = w2.a === nodeId ? w2.side : -w2.side;
      if (w1.thickness > 0 && s1 !== s2) continue;
      // vzepětí oblouku p → q procházejícího rohem: vrchol na straně rohu od tětivy
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const len = dist(p, q);
      const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      const side = Math.sign((node.x - m.x) * n.x + (node.y - m.y) * n.y) || 1;
      const dc = (g1.center.x - m.x) * n.x + (g1.center.y - m.y) * n.y;
      const sagitta = dc + side * g1.r;
      // části musí z rohu pokračovat na opačné strany (výseče se nepřekrývají): součet výsečí = výseč celku
      const whole = arcGeometry(p, q, sagitta);
      if (!whole || Math.abs(Math.abs(g1.sweep) + Math.abs(g2.sweep) - Math.abs(whole.sweep)) > 1e-3) continue;
      const farNoJoin1 = w1.a === nodeId ? w1.noJoinB : w1.noJoinA;
      const farNoJoin2 = w2.a === nodeId ? w2.noJoinB : w2.noJoinA;
      w1.a = p.id;
      w1.b = q.id;
      w1.side = s1 as 1 | -1;
      w1.sagitta = sagitta;
      if (farNoJoin1) w1.noJoinA = true;
      else delete w1.noJoinA;
      if (farNoJoin2) w1.noJoinB = true;
      else delete w1.noJoinB;
      delete floor.walls[w2.id];
      // oblouk nenese rohy na líci (Node.hostFace jen u rovné stěny) – napojení na oblouk je vždy na ose
      for (const x of Object.values(floor.nodes)) if (x.host === w2.id) {
        x.host = w1.id;
        delete x.hostFace;
      }
      if (Object.values(floor.walls).some(x => x.a === nodeId || x.b === nodeId)) {
        node.host = w1.id;
        delete node.hostFace;
      }
      return true;
    }
  }
  return false;
}
