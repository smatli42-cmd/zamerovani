/**
 * Řetězová kóta otvorů a zámek kót (KOTY-ZAMEK-EXPORT.md, A; upřesněno uživatelem 2026-11-14).
 *
 * Řetěz podél stěny od rohu A: odstup od A → otvor → meziostění → … → otvor → odstup k rohu B.
 * Zamčené úseky spojují sousední otvory do celku. Pravidlo změny úseku:
 * - změna úseku posune všechno napravo (směrem k rohu B), co je s ním spojené zamčenými úseky;
 * - první nezamčený úsek napravo změnu „spolkne“ (přepíše se na novou délku);
 * - když nezamčený úsek napravo není (nebo se mění poslední úsek k rohu B), posune se roh B – stěna se
 *   prodlouží / zkrátí a otvory zůstanou ve výkresu na místě.
 *
 * ZÁVAZNÉ PRAVIDLO (uživatel 2026-11-14, CLAUDE.md): při změně délky stěny kótou / NumPadem zůstanou VŠECHNY
 * prvky nesené stěnou na místě (otvory všech druhů, výstupky, napojené příčky). Nový druh prvku na stěně
 * musí přibýt do `keepOpeningsAfterResize` i s testem.
 */
import type { Floor, Id, Opening } from '../model/types';
import { openingSpan, openingStartFromA, openingsOnWall, wallLength } from './floorQueries';
import { setWallLength } from './solver';
import { dot, sub, unit } from './geometry';
import { protrusionExtent } from './protrusion';
import { cornerOverhang } from './cornerProtrusion';
import { endOverhang } from './endProtrusion';
import { wallOverlap } from './wallSpans';
import { hostedChain, shiftHosted } from './hosting';

const locked = (floor: Floor, key: string) => !!floor.dimLocks?.[key];

function placeAt(op: Opening, start: number, len: number): void {
  const s = Math.round(start);
  op.offset = op.ref === 'a' ? s : Math.round(len - s - openingSpan(op));
}

/**
 * Posune otvory stěny od indexu `from` (pořadí od rohu A) o `delta` mm směrem k rohu B, pokud jsou spojené
 * zamčenými meziostěními; za posledním spojeným se změna spolkne, nebo se prodlouží stěna.
 * `forceExtend` = měněný úsek je poslední (k rohu B) – posouvá se rovnou roh B.
 * Vrací false, když to nejde (otvor by vyjel ze stěny, stěna by byla příliš krátká).
 */
export function pushChainRight(floor: Floor, wallId: Id, from: number, delta: number, forceExtend = false): boolean {
  const wall = floor.walls[wallId];
  if (!wall) return false;
  const len = wallLength(floor, wall);
  const placed = openingsOnWall(floor, wall);
  const n = placed.length;
  // které otvory se posunou a zda se posune i roh B
  let last = from - 1; // poslední posunutý otvor
  let extend = forceExtend;
  if (!forceExtend) {
    for (let j = from; j < n; j++) {
      last = j;
      const next = placed[j + 1];
      if (next) {
        if (!locked(floor, `opening-gap:${placed[j]!.op.id}:${next.op.id}`)) break;
      } else if (locked(floor, `opening-offset:${placed[j]!.op.id}:b`)) extend = true;
    }
  }
  const newLen = extend ? len + delta : len;
  // kontrola: posunuté otvory musí zůstat na stěně a nesmí se překrýt s nepohnutým sousedem
  for (let j = from; j <= last; j++) {
    const p = placed[j]!;
    if (p.start + delta < -0.5 || p.end + delta > newLen + 0.5) return false;
  }
  const before = placed[from - 1];
  if (from <= last && before && placed[from]!.start + delta < before.end - 0.5) return false;
  const after = placed[last + 1];
  if (after && last >= from && placed[last]!.end + delta > after.start + 0.5) return false;

  if (extend) {
    if (newLen < 10) return false;
    // zkrácení: nepohnutý poslední otvor musí zůstat na stěně
    const lastOp = placed[n - 1];
    if (lastOp && last < n - 1 && lastOp.end > newLen + 0.5) return false;
    // konec B napojený doprostřed jiné stěny (T) drží – prodloužením by se napojení zrušilo
    if (floor.nodes[wall.b]?.host) return false;
    const starts = placed.map(p => p.start);
    if (!setWallLength(floor, wallId, newLen, { nodeId: wall.b })) return false;
    if (Math.abs(wallLength(floor, floor.walls[wallId]!) - newLen) > 0.5) return false;
    // otvory drží polohu od rohu A (posunul se jen roh B)
    placed.forEach((p, i) => placeAt(floor.openings[p.op.id]!, starts[i]!, newLen));
  }
  for (let j = from; j <= last; j++) {
    const p = placed[j]!;
    placeAt(floor.openings[p.op.id]!, p.start + delta, newLen);
  }
  return true;
}

/** Index otvoru v řetězu stěny (od rohu A); −1 = není. */
export function chainIndex(floor: Floor, op: Opening): number {
  const wall = floor.walls[op.wallId];
  return wall ? openingsOnWall(floor, wall).findIndex(p => p.op.id === op.id) : -1;
}

/** Současná délka úseku „odstup od A“ (u prvního otvoru) / „odstup k B“ (u posledního). */
export function chainEdge(floor: Floor, op: Opening, ref: 'a' | 'b'): number | null {
  const wall = floor.walls[op.wallId];
  if (!wall) return null;
  const len = wallLength(floor, wall);
  const start = openingStartFromA(op, len);
  return ref === 'a' ? start : len - start - openingSpan(op);
}

/**
 * Po změně délky stěny (posun rohu A a / nebo B podél stěny): otvory a výstupky zůstanou ve výkresu na místě, jen ty,
 * které jsou k posunutému rohu přivázané zamčenými kótami (odstup od rohu + zamčená meziostění), jedou s ním.
 * Volá se, když by výchozí chování (otvor drží odstup od svého referenčního rohu) porušilo zamčenou kótu.
 * `before` = podlaží před úpravou. Vrací true, 'tied' (prvky přivázané zámky k oběma koncům – nejde splnit)
 * nebo 'misfit' (prvek by nově vyjel ze stěny / narazil na jiný prvek).
 */
export function keepOpeningsAfterResize(before: Floor, floor: Floor, wallId: Id): true | 'tied' | 'misfit' {
  const w0 = before.walls[wallId];
  const w1 = floor.walls[wallId];
  const a0 = w0 && before.nodes[w0.a];
  const b0 = w0 && before.nodes[w0.b];
  const a1 = w1 && floor.nodes[w1.a];
  const b1 = w1 && floor.nodes[w1.b];
  if (!w0 || !w1 || !a0 || !b0 || !a1 || !b1) return 'misfit';
  const dir = unit(a0, b0);
  const shiftA = dot(sub(a1, a0), dir); // posun rohu A podél stěny (kladně k B)
  const shiftB = dot(sub(b1, b0), dir);
  const placed = openingsOnWall(before, w0);
  const n = placed.length;
  const lk = (key: string) => !!before.dimLocks?.[key];
  const tiedA = new Set<number>();
  if (n && lk(`opening-offset:${placed[0]!.op.id}:a`)) {
    tiedA.add(0);
    for (let i = 1; i < n && lk(`opening-gap:${placed[i - 1]!.op.id}:${placed[i]!.op.id}`); i++) tiedA.add(i);
  }
  const tiedB = new Set<number>();
  if (n && lk(`opening-offset:${placed[n - 1]!.op.id}:b`)) {
    tiedB.add(n - 1);
    for (let i = n - 2; i >= 0 && lk(`opening-gap:${placed[i]!.op.id}:${placed[i + 1]!.op.id}`); i--) tiedB.add(i);
  }
  if ([...tiedA].some(i => tiedB.has(i)) && Math.abs(shiftA - shiftB) > 0.5) return 'tied';
  const newLen = wallLength(floor, w1);
  placed.forEach((p, i) => {
    // na místě ve výkresu = začátek od nového rohu A se zmenší o posun A; přivázané jedou se svým rohem
    const start = p.start - shiftA + (tiedA.has(i) ? shiftA : 0) + (tiedB.has(i) ? shiftB : 0);
    placeAt(floor.openings[p.op.id]!, start, newLen);
  });
  // výstupky stejně (rozhodnutí uživatele 2026-11-14): na místě; s rohem jedou ty, které jsou k němu přivázané
  // zamčeným odstupem od konce a dál zamčenými odstupy mezi sousedy na stejném líci (řetěz jako u otvorů)
  const prots = Object.values(before.protrusions ?? {}).filter(p => p.wallId === wallId);
  const pTiedA = new Set<Id>();
  const pTiedB = new Set<Id>();
  for (const side of [1, -1] as const) {
    const row = prots.filter(p => p.side === side).sort((x, y) => protrusionExtent(x).u0 - protrusionExtent(y).u0);
    const m = row.length;
    for (let i = 0; i < m; i++) {
      const link = i === 0 ? lk(`protrusion-dim:${row[0]!.id}:before`) : pTiedA.has(row[i - 1]!.id) && (lk(`protrusion-dim:${row[i]!.id}:before`) || lk(`protrusion-dim:${row[i - 1]!.id}:after`));
      if (!link) break;
      pTiedA.add(row[i]!.id);
    }
    for (let i = m - 1; i >= 0; i--) {
      const link = i === m - 1 ? lk(`protrusion-dim:${row[m - 1]!.id}:after`) : pTiedB.has(row[i + 1]!.id) && (lk(`protrusion-dim:${row[i]!.id}:after`) || lk(`protrusion-dim:${row[i + 1]!.id}:before`));
      if (!link) break;
      pTiedB.add(row[i]!.id);
    }
  }
  for (const p0 of prots) {
    const p = floor.protrusions?.[p0.id];
    if (!p) continue;
    const toA = pTiedA.has(p.id);
    const toB = pTiedB.has(p.id);
    if (toA && toB && Math.abs(shiftA - shiftB) > 0.5) return 'tied';
    const du = -shiftA + (toA ? shiftA : 0) + (toB ? shiftB : 0);
    p.pts = p0.pts.map(q => ({ ...q, u: Math.round((q.u + du) * 10) / 10 }));
  }
  // napojené rohy příček (T) stejně: na místě, s koncem jedou ty přivázané zamčenými polohami napojení
  const chain0 = hostedChain(before, wallId);
  const m = chain0.length;
  const jTiedA = new Set<number>();
  for (let i = 0; i < m && lk(`junction-gap:${wallId}:${chain0[i]!.nodeId}:prev`); i++) jTiedA.add(i);
  const jTiedB = new Set<number>();
  if (m && lk(`junction-gap:${wallId}:${chain0[m - 1]!.nodeId}:next`)) {
    jTiedB.add(m - 1);
    for (let i = m - 2; i >= 0 && lk(`junction-gap:${wallId}:${chain0[i + 1]!.nodeId}:prev`); i--) jTiedB.add(i);
  }
  if ([...jTiedA].some(i => jTiedB.has(i)) && Math.abs(shiftA - shiftB) > 0.5) return 'tied';
  for (let i = 0; i < m; i++) {
    if (!jTiedA.has(i) && !jTiedB.has(i)) continue; // nepřivázaný roh zůstal ve výkresu na místě
    const want = chain0[i]!.at - shiftA + (jTiedA.has(i) ? shiftA : 0) + (jTiedB.has(i) ? shiftB : 0);
    const cur = hostedChain(floor, wallId).find(c => c.nodeId === chain0[i]!.nodeId);
    if (!cur) return 'misfit';
    shiftHosted(floor, chain0[i]!.nodeId, want - cur.at);
  }
  // napojení zůstanou na stěně a příčka nedosedne do otvoru (jako setHostedGap)
  // Kontroly: vadí jen NOVÝ střet – stav, který už ve výkresu byl (např. dva otvory těsně u sebe nebo
  // s malým překryvem), změnu délky nezastaví (chyba nahlášená uživatelem 2026-11-14).
  const len0 = wallLength(before, w0);
  const outside = (s0: number, e0: number, L: number) => Math.max(0, -s0, e0 - L);
  const halfOf = (fl: Floor, nodeId: Id) => Math.max(0, ...Object.values(fl.walls).filter(x => x.id !== wallId && (x.a === nodeId || x.b === nodeId)).map(x => x.thickness / 2));
  const inOpening = (fl: Floor, L: number) => {
    const ops = openingsOnWall(fl, fl.walls[wallId]!);
    const set = new Set<string>();
    for (const c of hostedChain(fl, wallId)) {
      const half = halfOf(fl, c.nodeId);
      for (const po of ops) if (c.at + half > po.start + 0.5 && c.at - half < po.end - 0.5) set.add(`${c.nodeId}|${po.op.id}`);
      if (c.at < 1 || c.at > L - 1) set.add(`${c.nodeId}|out`);
    }
    return set;
  };
  const clash0 = inOpening(before, len0);
  for (const k of inOpening(floor, newLen)) if (!clash0.has(k)) return 'misfit';
  // výstupky musí zůstat na stěně a nesmí se překrýt se sousedem na stejném líci (nové střety)
  const protClash = (fl: Floor, L: number) => {
    const list = Object.values(fl.protrusions ?? {}).filter(p => p.wallId === wallId);
    const set = new Map<string, number>();
    for (const p of list) {
      const e = protrusionExtent(p);
      const out = Math.max(0, -e.u0, e.u1 - L);
      if (out > 0.5) set.set(`${p.id}|out`, out);
      for (const o of list) {
        if (o.id <= p.id || o.side !== p.side) continue;
        const f2 = protrusionExtent(o);
        const ov = Math.min(e.u1, f2.u1) - Math.max(e.u0, f2.u0);
        if (ov > 0.5) set.set(`${p.id}|${o.id}`, ov);
      }
    }
    return set;
  };
  const pc0 = protClash(before, len0);
  for (const [k, v1] of protClash(floor, newLen)) if (v1 > (pc0.get(k) ?? 0) + 0.5) return 'misfit';
  // otvory musí zůstat na stěně a nesmí se překrýt (víc než předtím)
  const spanOf = (fl: Floor, L: number, id: Id) => {
    const op = fl.openings[id]!;
    const st = openingStartFromA(op, L);
    return { id, s: st, e: st + openingSpan(op) };
  };
  const now = placed.map(p => spanOf(floor, newLen, p.op.id));
  const was = new Map(placed.map(p => [p.op.id, spanOf(before, len0, p.op.id)]));
  const overlap = (x: { s: number; e: number }, y: { s: number; e: number }) => Math.max(0, Math.min(x.e, y.e) - Math.max(x.s, y.s));
  for (let i = 0; i < now.length; i++) {
    const x = now[i]!;
    const x0 = was.get(x.id)!;
    if (outside(x.s, x.e, newLen) > outside(x0.s, x0.e, len0) + 0.5) return 'misfit';
    // všechny dvojice (i otvor uvnitř jiného otvoru): překryv nesmí vzrůst
    for (let j = 0; j < i; j++) {
      const y = now[j]!;
      if (overlap(x, y) > overlap(x0, was.get(y.id)!) + 0.5) return 'misfit';
    }
  }
  return true;
}

/**
 * Pravidlo „otvory zůstanou na místě“ pro všechny rovné stěny, kterým úprava změnila délku posunem konce
 * podél stěny (upravovaná stěna, protější stěna místnosti posunutá řešičem, navazující stěna). Stěny jen
 * posunuté (stejná délka) nebo natočené se nechají – otvory jedou s nimi. Vrací true nebo důvod, proč to nejde.
 */
export function keepOpeningsOnResizedWalls(before: Floor, floor: Floor): true | 'tied' | 'misfit' {
  for (const w1 of Object.values(floor.walls)) {
    const w0 = before.walls[w1.id];
    if (!w0 || w0.sagitta || w1.sagitta || w0.radius !== undefined) continue;
    // výstupek přes roh: konec jeho obrysu na líci se musí vejít na stěnu (s rohem jede, jinak zůstane na místě)
    if (cornerOverhang(floor, w1.id) > cornerOverhang(before, w0.id) + 0.5) return 'misfit';
    // výstupek na konci stěny jede s koncem; nesmí sahat za druhý konec
    if (endOverhang(floor, w1.id) > endOverhang(before, w0.id) + 0.5) return 'misfit';
    // výstupky na stěně, na konci a v rohu se nesmí překrýt víc než předtím (core/wallSpans.ts)
    if (wallOverlap(floor, w1.id) > wallOverlap(before, w0.id) + 0.5) return 'misfit';
    // stěna nese otvory, výstupky nebo napojené příčky (prvky „hostované“ stěnou)
    const hosts = Object.values(before.openings).some(o => o.wallId === w0.id) || Object.values(before.protrusions ?? {}).some(p => p.wallId === w0.id) || hostedChain(before, w0.id).length > 0;
    if (!hosts) continue;
    const a0 = before.nodes[w0.a];
    const b0 = before.nodes[w0.b];
    const a1 = floor.nodes[w1.a];
    const b1 = floor.nodes[w1.b];
    if (!a0 || !b0 || !a1 || !b1 || w0.a !== w1.a || w0.b !== w1.b) continue;
    const len0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    const len1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    if (Math.abs(len1 - len0) < 0.5) continue;
    // konce se posunuly jen podél stěny (bez natočení)
    const d = unit(a0, b0);
    const perp = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.abs((q.x - p.x) * d.y - (q.y - p.y) * d.x);
    if (perp(a0, a1) > 0.5 || perp(b0, b1) > 0.5) continue;
    const r = keepOpeningsAfterResize(before, floor, w1.id);
    if (r !== true) return r;
  }
  return true;
}
