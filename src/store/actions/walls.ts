/**
 * Akce: stěny (kreslení, tvary, oblouky, tloušťka, popisky) a posun rohů / skupin.
 */
import { createCircleWall, createWall, newId } from '../../model/factory';
import type { Floor, Id, LineStyle, Pt, Wall, WallLabel } from '../../model/types';
import { setChainSagitta } from '../../core/arcChain';
import { dist } from '../../core/geometry';
import { setWallLength, type MoveTarget } from '../../core/solver';
import { mergeStraightAt } from '../../core/topology';
import { attachAtNode } from '../../core/hosting';
import { hasBody, initialSide, orientLoopOutward } from '../../core/wallBody';
import { store } from '../store';
import { cleanup, getOrCreateNode, MERGE_TOL, nodeHasNoJoin } from './shared';

/** Je tu už stejná stěna (stejné rohy a stejný tvar)? Dvě půlkružnice mezi týmiž rohy jsou různé stěny. */
function findSameWall(floor: Floor, a: Id, b: Id, sagitta: number): Wall | undefined {
  return Object.values(floor.walls).find(w => {
    if (w.a === a && w.b === b) return Math.abs((w.sagitta ?? 0) - sagitta) < 0.5;
    if (w.a === b && w.b === a) return Math.abs((w.sagitta ?? 0) + sagitta) < 0.5;
    return false;
  });
}

/** Vloží stěnu mezi dva rohy (pokud tam taková ještě není) a vrátí ji. */
function linkWall(floor: Floor, a: Id, b: Id, sagitta = 0, style?: LineStyle, thickness = 0): Wall | null {
  if (a === b) return null;
  const same = findSameWall(floor, a, b, sagitta);
  if (same) return same;
  const wall = createWall(a, b, sagitta, thickness);
  if (style && style !== 'solid') wall.style = style;
  floor.walls[wall.id] = wall;
  return wall;
}

/**
 * Nová stěna; `sagitta` ≠ 0 = oblouková stěna. Konec na jiné stěně se na ni napojí (stěna se nedělí, core/hosting.ts).
 * `thickness` > 0 = stěna s tělem (strana těla navazuje na tah, uzavřená místnost se natočí ven); 0 = čára (tvar).
 */
export function addWall(start: Pt, startNodeId: Id | null, end: Pt, endNodeId: Id | null, select = true, opts: { sagitta?: number; style?: LineStyle; thickness?: number; side?: 1 | -1; axis?: 'center' } = {}): Id | null {
  let createdId: Id | null = null;
  store.edit(floor => {
    const a = getOrCreateNode(floor, start, startNodeId);
    const b = getOrCreateNode(floor, end, endNodeId);
    if (a === b) return;
    const isNew = !findSameWall(floor, a, b, opts.sagitta ?? 0);
    const wall = linkWall(floor, a, b, opts.sagitta ?? 0, opts.style, opts.thickness ?? 0);
    if (!wall) return;
    createdId = wall.id;
    if (isNew && hasBody(wall)) {
      if (opts.axis) wall.axis = opts.axis;
      // strana zvolená při kreslení (překlopení stylusem) platí natrvalo, jinak automaticky
      if (opts.side) {
        wall.side = opts.side;
        wall.sideLocked = true;
      } else wall.side = initialSide(floor, wall);
    }
    // Konec na jiné stěně → napojí se na ni (stěna zůstane v celku)
    attachAtNode(floor, a);
    attachAtNode(floor, b);
    if (isNew && hasBody(wall)) {
      // rovné pokračování stěny se stejnou tloušťkou = jedna stěna (nelze pak překlopit každou část zvlášť)
      let id = mergeStraightAt(floor, wall.id, a);
      id = mergeStraightAt(floor, id, b);
      createdId = id;
      cleanup(floor);
      orientLoopOutward(floor, id);
    }
  });
  if (createdId && select) store.set({ selection: { kind: 'wall', id: createdId } });
  return createdId;
}

/** Obdélník ze čtyř stěn (např. sloup, komín); rohy na jiných stěnách se na ně napojí. */
export function addRectWalls(p: Pt, q: Pt, style: LineStyle): void {
  store.edit(floor => {
    const ids = [
      { x: p.x, y: p.y },
      { x: q.x, y: p.y },
      { x: q.x, y: q.y },
      { x: p.x, y: q.y }
    ].map(c => getOrCreateNode(floor, c, null));
    if (new Set(ids).size < 4) return;
    for (let i = 0; i < 4; i++) linkWall(floor, ids[i]!, ids[(i + 1) % 4]!, 0, style);
    for (const id of ids) attachAtNode(floor, id);
  });
}

/** Kruh: jedna stěna se středovým rohem a poloměrem. */
export function addCircleWalls(center: Pt, radius: number, style: LineStyle): void {
  let id: Id | null = null;
  store.edit(floor => {
    const c = getOrCreateNode(floor, center, null);
    const wall = createCircleWall(c, Math.round(radius));
    if (style !== 'solid') wall.style = style;
    floor.walls[wall.id] = wall;
    id = wall.id;
  });
  // Vybraný kruh má na obvodu úchyt pro změnu poloměru
  if (id) store.set({ selection: { kind: 'wall', id } });
}

/** Změní poloměr kruhové stěny (tažení bodu na obvodu, kóta průměru). */
export function setCircleRadius(wallId: Id, radius: number): void {
  store.edit(floor => {
    resizeCircle(floor, wallId, radius);
  });
}

/** Nový poloměr kruhu; rohy ležící na obvodu (napojené stěny) se posunou radiálně spolu s ním. */
export function resizeCircle(floor: Floor, wallId: Id, radius: number): boolean {
  const w = floor.walls[wallId];
  const c = w && floor.nodes[w.a];
  if (!w || !c || w.radius === undefined || radius < 5) return false;
  const old = w.radius;
  const next = Math.round(radius);
  for (const n of Object.values(floor.nodes)) {
    if (n.id === c.id) continue;
    const d = Math.hypot(n.x - c.x, n.y - c.y);
    if (Math.abs(d - old) > 1.5) continue;
    n.x = c.x + ((n.x - c.x) * next) / d;
    n.y = c.y + ((n.y - c.y) * next) / d;
  }
  w.radius = next;
  return true;
}

/** Změní vzepětí obloukové stěny (tažení středového bodu); 0 = rovná stěna. */
export function setWallSagitta(wallId: Id, sagitta: number): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    if (Math.abs(sagitta) < 0.5) delete w.sagitta;
    else if (!setChainSagitta(floor, wallId, sagitta)) w.sagitta = Math.round(sagitta);
  });
}

/** Změna vlastností stěny mimo popisek (styl čáry, vzepětí). */
export function updateWall(wallId: Id, patch: { style?: LineStyle | undefined; sagitta?: number | undefined }): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    if ('style' in patch) {
      if (!patch.style || patch.style === 'solid') delete w.style;
      else w.style = patch.style;
    }
    if ('sagitta' in patch) {
      if (!patch.sagitta || Math.abs(patch.sagitta) < 0.5) delete w.sagitta;
      else if (!w.sagitta || !setChainSagitta(floor, wallId, patch.sagitta)) w.sagitta = Math.round(patch.sagitta);
    }
  });
}

/** Tloušťka stěny; čára líce zůstává na místě, tělo se rozšíří / zúží. 0 = čára bez tloušťky. */
export function setWallThickness(wallId: Id, thickness: number): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w) w.thickness = Math.max(0, Math.round(thickness));
  });
}

/**
 * Osa stěny: líc (`face`) nebo střed (`center`). Čára (osa) a rohy zůstanou, posune se jen tělo (B4);
 * strana těla se pamatuje, takže návrat na líc vrátí původní stranu.
 */
export function setWallAxis(wallId: Id, axis: 'face' | 'center'): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    if (axis === 'center') w.axis = 'center';
    else delete w.axis;
  });
}

/** Přehodí stranu těla stěny (dvojitá šipka); ručně přehozenou stranu už automatika nemění. */
export function flipWallSide(wallId: Id): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    w.side = w.side === 1 ? -1 : 1;
    w.sideLocked = true;
  });
}

/** Zapne / vypne „nespojovat konec“ (end = 'a' | 'b'): konec má vlastní čelo a nenapojuje se na sousedy. */
export function setWallNoJoin(wallId: Id, end: 'a' | 'b', noJoin: boolean): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (!w) return;
    const nodeId = end === 'a' ? w.a : w.b;
    const node = floor.nodes[nodeId];
    if (!node) return;
    const setFlag = (on: boolean) => {
      if (end === 'a') {
        if (on) w.noJoinA = true;
        else delete w.noJoinA;
      } else if (on) w.noJoinB = true;
      else delete w.noJoinB;
    };
    const setNode = (id: Id) => {
      if (end === 'a') w.a = id;
      else w.b = id;
    };
    const sharedWithOthers = Object.values(floor.walls).some(o => o.id !== w.id && (o.a === nodeId || o.b === nodeId));
    if (noJoin) {
      // fyzicky oddělený konec: stěna dostane vlastní roh na stejných souřadnicích (C1.13)
      if (sharedWithOthers) {
        const id = newId('n');
        floor.nodes[id] = { id, x: node.x, y: node.y };
        setNode(id);
      } else delete node.host; // konec napojený doprostřed stěny (T bez dělení) se od ní odpojí
      setFlag(true);
    } else {
      setFlag(false);
      // zpět na Spojený: roh se sloučí s rohem na stejném místě (pokud tam není další oddělený konec)
      const other = Object.values(floor.nodes).find(n => n.id !== nodeId && dist(n, node) < MERGE_TOL && !nodeHasNoJoin(floor, n.id));
      if (other) setNode(other.id);
      // konec ležící uprostřed jiné stěny se na ni znovu napojí (T bez dělení)
      else attachAtNode(floor, nodeId);
      cleanup(floor);
    }
  });
}

export function applyWallLength(wallId: Id, length: number, move: MoveTarget): boolean {
  let ok = false;
  store.edit(floor => {
    ok = setWallLength(floor, wallId, length, move);
  });
  return ok;
}

export function unlockWall(wallId: Id): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w) w.measured = null;
  });
}

export function updateWallLabel(wallId: Id, patch: Partial<WallLabel>): void {
  store.edit(floor => {
    const w = floor.walls[wallId];
    if (w) w.label = { ...w.label, ...patch };
  });
}

/** Posun rohu (volá se během tažení uvnitř gesta). */
/** Výchozí polohy skupiny pro společný posun (výběr obdélníkem). */
export interface GroupOrigin {
  nodes: Record<Id, Pt>;
  rooms: Record<Id, Pt>;
  texts: Record<Id, Pt>;
  /** Hroty odkazových šipek textů. */
  leaders: Record<Id, Pt>;
}

export function groupOrigin(floor: Floor, items: readonly { kind: string; id: Id }[]): GroupOrigin {
  const o: GroupOrigin = { nodes: {}, rooms: {}, texts: {}, leaders: {} };
  for (const it of items) {
    if (it.kind === 'wall') {
      const w = floor.walls[it.id];
      for (const id of w ? [w.a, w.b] : []) {
        const n = floor.nodes[id];
        if (n) o.nodes[id] = { x: n.x, y: n.y };
      }
    } else if (it.kind === 'room' && floor.rooms[it.id]) o.rooms[it.id] = { x: floor.rooms[it.id]!.x, y: floor.rooms[it.id]!.y };
    else if (it.kind === 'text' && floor.texts[it.id]) {
      const t = floor.texts[it.id]!;
      o.texts[it.id] = { x: t.x, y: t.y };
      if (t.leader) o.leaders[it.id] = { x: t.leader.x, y: t.leader.y };
    }
  }
  return o;
}

/** Posune skupinu o (dx, dy) od výchozích poloh (po 10 mm). */
/** Posun skupiny o (dx, dy) zaokrouhlený na `step` mm (výchozí 10; při přichycení na pomocnou čáru 1). */
export function moveGroup(origin: GroupOrigin, dx: number, dy: number, step = 10): void {
  const mx = Math.round(dx / step) * step;
  const my = Math.round(dy / step) * step;
  store.edit(floor => {
    for (const [id, p] of Object.entries(origin.nodes)) if (floor.nodes[id]) Object.assign(floor.nodes[id]!, { x: p.x + mx, y: p.y + my });
    for (const [id, p] of Object.entries(origin.rooms)) if (floor.rooms[id]) Object.assign(floor.rooms[id]!, { x: p.x + mx, y: p.y + my });
    for (const [id, p] of Object.entries(origin.texts)) if (floor.texts[id]) Object.assign(floor.texts[id]!, { x: p.x + mx, y: p.y + my });
    for (const [id, p] of Object.entries(origin.leaders)) if (floor.texts[id]) floor.texts[id]!.leader = { x: p.x + mx, y: p.y + my };
  });
}

export function moveNode(nodeId: Id, p: Pt): void {
  store.edit(floor => {
    const n = floor.nodes[nodeId];
    if (n) {
      n.x = Math.round(p.x);
      n.y = Math.round(p.y);
    }
  });
}

/** Po přetažení rohu na jiný roh je sloučí do jednoho. */
export function mergeNodeIfCoincident(nodeId: Id): void {
  store.edit(floor => {
    const moved = floor.nodes[nodeId];
    if (!moved) return;
    // oddělené (nespojené) konce se samy nesloučí (C1.13) – ani pohybem tohoto rohu, ani cílem
    const movedFlagged = nodeHasNoJoin(floor, nodeId);
    const other = movedFlagged ? undefined : Object.values(floor.nodes).find(n => n.id !== nodeId && dist(n, moved) < MERGE_TOL && !nodeHasNoJoin(floor, n.id));
    if (!other) {
      // Roh přetažený na stěnu se na ni napojí (stěna se nedělí)
      attachAtNode(floor, nodeId);
      return;
    }
    for (const w of Object.values(floor.walls)) {
      if (w.a === nodeId) w.a = other.id;
      if (w.b === nodeId) w.b = other.id;
      if (w.a === w.b && w.radius === undefined) delete floor.walls[w.id];
    }
    // Odstranění zdvojených stěn mezi stejnými rohy
    const seen = new Set<string>();
    for (const w of Object.values(floor.walls)) {
      // klíč zahrnuje i vzepětí (vztažené k pořadí rohů), aby se dvě půlkružnice nepovažovaly za duplicitu
      const flip = w.a < w.b ? 1 : -1;
      const key = `${[w.a, w.b].sort().join('|')}|${Math.round((w.sagitta ?? 0) * flip)}`;
      if (seen.has(key)) delete floor.walls[w.id];
      else seen.add(key);
    }
    cleanup(floor);
  });
}
