/**
 * Akce: ruční dělení stěny (KATALOG-STEN.md D4; rozhodnutí uživatele 2026-11-15 – nástroj Rozdělit, ťuknutím
 * rozdělí stěnu na dvě, v režimu „S mezerou“ dvěma ťuknutími vyjme úsek mezi nimi).
 * Prvky nesené stěnou se řídí pravidlem F4 (core/carried.ts): zůstanou na své části, prvek přes dělicí bod
 * nebo v odebraném úseku zanikne. Zámky kót platí (store.edit): zamčená kóta, kterou by dělení změnilo, ho zastaví
 * (rozhodnutí uživatele 2026-11-15); vyjmout úsek ze stěny se zamčenou délkou nejde.
 * Příčka v místě dělení: napojená na čáru stěny → její roh se stane rohem obou částí (T); napojená na líc → dělicí
 * bod se posune na okraj jejího těla a příčka zůstane napojená na jednu část (rozhodnutí uživatele 2026-11-15).
 */
import { newId } from '../../model/factory';
import type { Floor, Id, Pt } from '../../model/types';
import { add, dist, dot, scale, sub, unit } from '../../core/geometry';
import { wallNodes } from '../../core/floorQueries';
import { wallFrame } from '../../core/protrusion';
import { splitWallAt } from '../../core/topology';
import { wallBodies } from '../../core/wallBody';
import { describeDim, dimKey } from '../../core/dimLock';
import type { DimTarget } from '../../core/dimLock';
import { store } from '../store';
import { cleanup } from './shared';

/** Nejkratší část stěny po rozdělení (mm) – jako v splitWallAt. */
const MIN_PART = 5;

export type SplitResult = 'ok' | 'circle' | 'end' | 'whole' | 'locked' | 'none';

/** Počet prvků nesených stěnami včetně napojených příček (pro hlášení, kolik jich dělení smazalo / odpojilo). */
const carriedCount = (f: Floor | null) =>
  f
    ? Object.keys(f.openings).length +
      Object.keys(f.protrusions ?? {}).length +
      Object.keys(f.cornerProtrusions ?? {}).length +
      Object.values(f.nodes).filter(n => n.host).length
    : 0;

/**
 * Bod dělení na stěně u místa `p`: na čáře stěny; u rovné stěny po 10 mm od rohu A a zarovnaný s jiným rohem
 * (svisle / vodorovně), je-li do `alignTol`; u oblouku na oblouku. `at` / `len` = poloha a délka po ose stěny
 * (u oblouku po oblouku).
 */
export function splitPoint(floor: Floor, wallId: Id, p: Pt, alignTol = 0): { pt: Pt; at: number; len: number } | null {
  const w = floor.walls[wallId];
  const n = w && wallNodes(floor, w);
  if (!w || !n || w.radius !== undefined) return null;
  const [A, B] = n;
  if (dist(A, B) < 1) return null;
  if (w.sagitta) {
    // oblouk: poloha po oblouku osy (tětiva od A u oblouku přes půlkruh neroste)
    const fr = wallFrame(floor, w);
    if (!fr) return null;
    const at = Math.max(0, Math.min(fr.len, fr.project(p).u));
    return { pt: fr.at(at).p, at, len: fr.len };
  }
  const len = dist(A, B);
  const d = unit(A, B);
  let at = Math.round(dot(sub(p, A), d) / 10) * 10;
  // zarovnání s jiným rohem: bod na stěně se stejným x nebo y jako roh (do alignTol od bodu po 10 mm)
  if (alignTol > 0) {
    let best: { at: number; dd: number } | null = null;
    for (const q of Object.values(floor.nodes)) {
      if (q.id === w.a || q.id === w.b) continue;
      for (const axis of ['x', 'y'] as const) {
        if (Math.abs(d[axis]) < 0.1) continue;
        const t = (q[axis] - A[axis]) / d[axis];
        const dd = Math.abs(t - at);
        if (dd <= alignTol && (!best || dd < best.dd)) best = { at: t, dd };
      }
    }
    if (best) at = best.at;
  }
  at = Math.max(0, Math.min(len, at));
  return { pt: add(A, scale(d, at)), at, len };
}

/**
 * Příčka napojená na líc rovné stěny v místě dělení: dělicí bod se posune na vzdálenější okraj jejího těla
 * (příčka i její roh zůstanou na jedné části, napojení se nezruší).
 */
function avoidFaceTees(floor: Floor, wallId: Id, sp: { pt: Pt; at: number; len: number }): { pt: Pt; at: number; len: number } {
  const w = floor.walls[wallId];
  const n = w && !w.sagitta ? wallNodes(floor, w) : null;
  if (!w || !n) return sp;
  const [A, B] = n;
  const d = unit(A, B);
  const u = (p: Pt) => dot(sub(p, A), d);
  const bodies = wallBodies(floor);
  for (const node of Object.values(floor.nodes)) {
    if (node.host !== wallId || !node.hostFace) continue;
    const tee = Object.values(floor.walls).find(x => x.id !== wallId && (x.a === node.id || x.b === node.id));
    const poly = tee && bodies.get(tee.id)?.poly;
    if (!poly) continue;
    // část těla příčky u líce (do 1 mm od roviny líce kolmo ke stěně) promítnutá na osu
    const nu = u(node);
    const near = poly.filter(p => Math.abs(dot(sub(p, node), { x: -d.y, y: d.x })) <= 1).map(u);
    if (near.length < 2) continue;
    const lo = Math.min(...near);
    const hi = Math.max(...near);
    if (sp.at < lo - MIN_PART || sp.at > hi + MIN_PART) continue;
    const at = Math.abs(hi - nu) >= Math.abs(lo - nu) ? hi : lo;
    return { pt: add(A, scale(d, at)), at, len: sp.len };
  }
  return sp;
}

/**
 * Rozdělí stěnu v bodě `pt` (leží na stěně) uvnitř `store.edit`; vrací nové stěny nebo null. Roh příčky napojené
 * na čáru stěny v místě dělení se použije jako dělicí bod (vznikne T).
 */
function splitIn(floor: Floor, wallId: Id, pt: Pt): [Id, Id] | null {
  const tee = Object.values(floor.nodes).find(n => n.host === wallId && !n.hostFace && dist(n, pt) <= 2 * MIN_PART);
  if (tee) return splitWallAt(floor, wallId, tee.id);
  const id = newId('n');
  floor.nodes[id] = { id, x: pt.x, y: pt.y };
  const r = splitWallAt(floor, wallId, id);
  if (!r) delete floor.nodes[id];
  return r;
}

/** Nástroj Rozdělit: rozdělí stěnu ve dvě u místa `p`. `removed` = kolik nesených prvků zaniklo / odpojilo se (F4). */
export function splitWall(wallId: Id, p: Pt, alignTol = 0): { result: SplitResult; removed: number } {
  const floor = store.floor();
  const w = floor?.walls[wallId];
  if (!floor || !w) return { result: 'none', removed: 0 };
  if (w.radius !== undefined) return { result: 'circle', removed: 0 };
  const raw = splitPoint(floor, wallId, p, alignTol);
  if (!raw) return { result: 'none', removed: 0 };
  const sp = avoidFaceTees(floor, wallId, raw);
  if (sp.at < MIN_PART || sp.len - sp.at < MIN_PART) return { result: 'end', removed: 0 };
  const before = carriedCount(floor);
  const ok = store.edit(fl => (splitIn(fl, wallId, sp.pt) ? undefined : false));
  if (!ok) return { result: store.get().lockBlock ? 'locked' : 'end', removed: 0 };
  return { result: 'ok', removed: before - carriedCount(store.floor()) };
}

/**
 * Nástroj Rozdělit, režim S mezerou: vyjme ze stěny úsek mezi místy `p1` a `p2` (u konce stěny ji jen zkrátí).
 * Jeden krok Zpět. Stěna se zamčenou délkou se nezmění (hlášení jako u jiných zamčených kót).
 */
export function cutWallSegment(wallId: Id, p1: Pt, p2: Pt, alignTol = 0): { result: SplitResult; removed: number } {
  const floor = store.floor();
  const w = floor?.walls[wallId];
  if (!floor || !w) return { result: 'none', removed: 0 };
  if (w.radius !== undefined) return { result: 'circle', removed: 0 };
  const s1 = splitPoint(floor, wallId, p1, alignTol);
  const s2 = splitPoint(floor, wallId, p2, alignTol);
  if (!s1 || !s2) return { result: 'none', removed: 0 };
  const lockKey = `wall-length:${wallId}`;
  const lock = floor.dimLocks?.[lockKey] as DimTarget | undefined;
  if (lock) {
    store.set({ lockBlock: { key: dimKey(lock), text: `Nelze – brání zamčená kóta: ${describeDim(floor, lock)}`, target: lock } });
    return { result: 'locked', removed: 0 };
  }
  const [lo, hi] = s1.at <= s2.at ? [s1, s2] : [s2, s1];
  if (hi.at - lo.at < MIN_PART) return { result: 'end', removed: 0 };
  const atStart = lo.at < MIN_PART;
  const atEnd = s1.len - hi.at < MIN_PART;
  if (atStart && atEnd) return { result: 'whole', removed: 0 };
  const before = carriedCount(floor);
  const ok = store.edit(fl => {
    let middle: Id | null = wallId;
    if (!atStart) {
      const r = splitIn(fl, wallId, lo.pt);
      if (!r) return false;
      middle = r[1];
    }
    if (!atEnd) {
      const r = splitIn(fl, middle, hi.pt);
      if (!r) return false;
      middle = r[0];
    }
    delete fl.walls[middle];
    cleanup(fl);
  });
  if (!ok) return { result: store.get().lockBlock ? 'locked' : 'end', removed: 0 };
  return { result: 'ok', removed: before - carriedCount(store.floor()) };
}

/** Lze stěnu nástrojem Rozdělit dělit? (kruh ne) */
export const canSplit = (floor: Floor | null, wallId: Id): boolean => !!floor?.walls[wallId] && floor.walls[wallId]!.radius === undefined;
