/**
 * Akce: otočení výběru, kopírování a vkládání otvorů ze schránky.
 */
import { newId, nextOpeningNumber } from '../../model/factory';
import type { Id, Opening, Pt, Wall } from '../../model/types';
import { openingSpan, openingStartFromA, wallLength } from '../../core/floorQueries';
import { store } from '../store';
import { setStartFromA } from './openings';
import { groupOrigin } from './walls';

// ---------------------------------------------------------------- Otočení

/** Otočí vybrané prvky o úhel ve stupních (kladný = po směru hodin) kolem středu výběru. */
export function rotateSelection(deg: number): void {
  const sel = store.get().selection;
  if (!sel || !deg) return;
  const items = sel.kind === 'multi' ? sel.items : [sel];
  store.edit(floor => {
    const o = groupOrigin(floor, items);
    const pts = [...Object.values(o.nodes), ...Object.values(o.rooms), ...Object.values(o.texts)];
    if (!pts.length) return;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rot = (p: Pt): Pt => ({ x: Math.round(cx + (p.x - cx) * cos - (p.y - cy) * sin), y: Math.round(cy + (p.x - cx) * sin + (p.y - cy) * cos) });
    for (const [id, p] of Object.entries(o.nodes)) Object.assign(floor.nodes[id]!, rot(p));
    for (const [id, p] of Object.entries(o.rooms)) Object.assign(floor.rooms[id]!, rot(p));
    for (const [id, p] of Object.entries(o.texts)) {
      const t = floor.texts[id]!;
      Object.assign(t, rot(p));
      if (o.leaders[id]) t.leader = rot(o.leaders[id]!);
      t.angle = (((t.angle + deg) % 360) + 360) % 360;
    }
  });
}

// ---------------------------------------------------------------- Kopírování

/** Odsazení kopie od originálu (mm), aby byla vidět a šla uchopit. */
const COPY_OFFSET = 300;

/**
 * Zkopíruje vybrané prvky (stěny s otvory, místnosti, texty) s odsazením a kopii vybere,
 * takže ji jde hned táhnout na místo.
 */
export function duplicateSelection(): void {
  const sel = store.get().selection;
  if (!sel) return;
  const items = sel.kind === 'multi' ? sel.items : [sel];
  // Jen otvory (dveře, okna…) = do schránky; vloží se ťuknutím na jinou stěnu
  if (items.every(i => i.kind === 'opening')) {
    copyOpenings(items.map(i => i.id));
    return;
  }
  const created: { kind: 'wall' | 'opening' | 'room' | 'text'; id: Id }[] = [];
  store.edit(floor => {
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const nodeMap = new Map<Id, Id>();
    const nodeCopy = (id: Id): Id | null => {
      const old = floor.nodes[id];
      if (!old) return null;
      let nid = nodeMap.get(id);
      if (!nid) {
        nid = newId('n');
        nodeMap.set(id, nid);
        floor.nodes[nid] = { id: nid, x: old.x + COPY_OFFSET, y: old.y + COPY_OFFSET };
      }
      return nid;
    };
    const wallMap = new Map<Id, Id>();
    const wallIds = new Set(items.filter(i => i.kind === 'wall').map(i => i.id));
    for (const id of wallIds) {
      const it = { kind: 'wall' as const, id };
      const w = floor.walls[it.id];
      const a = w && nodeCopy(w.a);
      const b = w && nodeCopy(w.b);
      if (!w || !a || !b) continue;
      const nw: Wall = { ...clone(w), id: newId('w'), a, b };
      floor.walls[nw.id] = nw;
      wallMap.set(w.id, nw.id);
      created.push({ kind: 'wall', id: nw.id });
    }
    // napojení T se kopíruje, jen když se kopíruje i průběžná stěna (jinak je kopie samostatná)
    for (const [oldId, nid] of nodeMap) {
      const host = floor.nodes[oldId]?.host;
      const newHost = host && wallMap.get(host);
      if (newHost && floor.nodes[nid]) floor.nodes[nid]!.host = newHost;
    }
    // otvory se kopírují se svou stěnou (nebo samostatně vybrané otvory se stěnou, která se kopíruje)
    for (const op of Object.values(floor.openings)) {
      const target = wallMap.get(op.wallId);
      if (!target) continue;
      const no = { ...clone(op), id: newId('op'), wallId: target, number: nextOpeningNumber(floor, op.kind) };
      floor.openings[no.id] = no;
      created.push({ kind: 'opening', id: no.id });
    }
    // výstupky se kopírují se svou stěnou (souřadnice jsou vůči stěně)
    for (const pr of Object.values(floor.protrusions ?? {})) {
      const target = wallMap.get(pr.wallId);
      if (!target) continue;
      const np = { ...clone(pr), id: newId('pr'), wallId: target };
      floor.protrusions![np.id] = np;
    }
    for (const it of items) {
      if (it.kind === 'room' && floor.rooms[it.id]) {
        const r = { ...clone(floor.rooms[it.id]!), id: newId('rm') };
        r.x += COPY_OFFSET;
        r.y += COPY_OFFSET;
        floor.rooms[r.id] = r;
        created.push({ kind: 'room', id: r.id });
      } else if (it.kind === 'text' && floor.texts[it.id]) {
        const t = { ...clone(floor.texts[it.id]!), id: newId('tx') };
        t.x += COPY_OFFSET;
        t.y += COPY_OFFSET;
        if (t.leader) t.leader = { x: t.leader.x + COPY_OFFSET, y: t.leader.y + COPY_OFFSET };
        floor.texts[t.id] = t;
        created.push({ kind: 'text', id: t.id });
      }
    }
  });
  // Kopie je vždy skupina, aby šla uchopit a přenést celá najednou (i s otvory)
  if (created.length) store.set({ selection: { kind: 'multi', items: created }, numpad: null });
}

/** Zkopíruje otvory do schránky a přepne na nástroj Vložit. */
function copyOpenings(ids: Id[]): void {
  const floor = store.floor();
  if (!floor) return;
  const placed = ids.flatMap(id => {
    const op = floor.openings[id];
    const wall = op && floor.walls[op.wallId];
    return op && wall ? [{ op: JSON.parse(JSON.stringify(op)) as Opening, start: openingStartFromA(op, wallLength(floor, wall)) }] : [];
  });
  if (!placed.length) return;
  const first = Math.min(...placed.map(p => p.start));
  const clipboard = placed.sort((p, q) => p.start - q.start).map(p => ({ op: p.op, rel: p.start - first }));
  store.set({ clipboard, tool: 'paste', selection: null, numpad: null, hover: null });
}

/** Vloží zkopírované otvory na stěnu; `center` = kam (mm od rohu A) se umístí střed celé skupiny. */
export function pasteOpenings(wallId: Id, center: number): boolean {
  const clip = store.get().clipboard;
  if (!clip?.length) return false;
  const created: Id[] = [];
  store.edit(floor => {
    const wall = floor.walls[wallId];
    if (!wall) return;
    const len = wallLength(floor, wall);
    const span = Math.max(...clip.map(c => c.rel + openingSpan(c.op)));
    if (span > len) return;
    const s0 = Math.max(0, Math.min(len - span, Math.round((center - span / 2) / 10) * 10));
    for (const c of clip) {
      const op: Opening = { ...JSON.parse(JSON.stringify(c.op)), id: newId('op'), wallId, number: nextOpeningNumber(floor, c.op.kind), ref: 'a', offset: 0 };
      setStartFromA(op, s0 + c.rel, len);
      floor.openings[op.id] = op;
      created.push(op.id);
    }
  });
  if (!created.length) return false;
  store.set({ selection: created.length === 1 ? { kind: 'opening', id: created[0]! } : { kind: 'multi', items: created.map(id => ({ kind: 'opening' as const, id })) } });
  return true;
}

/** Ukončí režim vkládání. */
export function endPaste(): void {
  store.set({ clipboard: null, tool: 'select', selection: null });
}
