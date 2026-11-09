/**
 * Řetěz oblouků na téže kružnici. Když se oblouk rozdělí (napojení příčky, přichycení), zůstanou
 * jeho části napojené na stejné kružnici. Pro uživatele je to pořád jeden oblouk, proto se vzepětí
 * mění pro celý řetěz najednou (části i uzly mezi nimi se přepočtou).
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { arcGeometry, type ArcGeometry } from './arc';

const TWO_PI = Math.PI * 2;
const mod = (v: number) => ((v % TWO_PI) + TWO_PI) % TWO_PI;
const TOL = 2;

export interface ArcChain {
  /** Části od začátku A ke konci B (po směru rostoucího úhlu). */
  pieces: { wall: Wall; from: number; to: number }[];
  /** Vnější konce řetězu. */
  a: Pt;
  b: Pt;
  /** Vnitřní uzly (ID) s polohou 0–1 podél celého oblouku. */
  inner: { id: Id; f: number }[];
  /** Vzepětí celého oblouku (se znaménkem vůči směru A→B). */
  sagitta: number;
  /** Celkový úhel oblouku (rad). */
  total: number;
  geom: ArcGeometry;
}

const sagittaOf = (r: number, sweepAbs: number) => r * (1 - Math.cos(sweepAbs / 2));

export function arcChain(floor: Floor, wallId: Id): ArcChain | null {
  const w0 = floor.walls[wallId];
  if (!w0 || w0.radius !== undefined) return null;
  const a0 = floor.nodes[w0.a];
  const b0 = floor.nodes[w0.b];
  if (!a0 || !b0) return null;
  const g0 = arcGeometry(a0, b0, w0.sagitta ?? 0);
  if (!g0) return null;

  // stěny na téže kružnici napojené přes uzly
  const same = (w: Wall): boolean => {
    if (w.radius !== undefined) return false;
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    const g = a && b ? arcGeometry(a, b, w.sagitta ?? 0) : null;
    return !!g && Math.hypot(g.center.x - g0.center.x, g.center.y - g0.center.y) < TOL && Math.abs(g.r - g0.r) < TOL;
  };
  const set = new Map<Id, Wall>([[w0.id, w0]]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of Object.values(floor.walls)) {
      if (set.has(w.id) || !same(w)) continue;
      for (const s of set.values()) {
        if (s.a === w.a || s.a === w.b || s.b === w.a || s.b === w.b) {
          set.set(w.id, w);
          grew = true;
          break;
        }
      }
    }
  }

  const uses = new Map<Id, number>();
  for (const w of set.values()) for (const id of [w.a, w.b]) uses.set(id, (uses.get(id) ?? 0) + 1);
  const ends = [...uses].filter(([, c]) => c === 1).map(([id]) => id);
  const single = () => build(floor, g0, [w0], [w0.a, w0.b]);
  if (set.size === 1 || ends.length !== 2) return single();
  return build(floor, g0, [...set.values()], ends) ?? single();
}

function build(floor: Floor, g0: ArcGeometry, walls: Wall[], ends: Id[]): ArcChain | null {
  const ang = (id: Id) => {
    const n = floor.nodes[id]!;
    return Math.atan2(n.y - g0.center.y, n.x - g0.center.x);
  };
  for (const e0 of ends) {
    const e1 = ends.find(e => e !== e0)!;
    const rel = (id: Id) => mod(ang(id) - ang(e0));
    const pieces = walls.map(wall => {
      const ra = rel(wall.a);
      const rb = rel(wall.b);
      const g = arcGeometry(floor.nodes[wall.a]!, floor.nodes[wall.b]!, wall.sagitta ?? 0)!;
      return { wall, from: Math.min(ra, rb), to: Math.max(ra, rb), span: Math.abs(g.sweep) };
    });
    if (!pieces.every(p => Math.abs(p.to - p.from - p.span) < 1e-3)) continue;
    const total = Math.max(...pieces.map(p => p.to));
    if (total <= 0) continue;
    pieces.sort((x, y) => x.from - y.from);
    const a = floor.nodes[e0]!;
    const b = floor.nodes[e1]!;
    const h = sagittaOf(g0.r, total);
    let sagitta = h;
    const test = arcGeometry(a, b, h);
    if (!test || Math.hypot(test.center.x - g0.center.x, test.center.y - g0.center.y) > TOL) sagitta = -h;
    const geom = arcGeometry(a, b, sagitta);
    if (!geom) continue;
    const inner = [...new Set(walls.flatMap(w => [w.a, w.b]))].filter(id => id !== e0 && id !== e1).map(id => ({ id, f: rel(id) / total }));
    return { pieces: pieces.map(p => ({ wall: p.wall, from: p.from, to: p.to })), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, inner, sagitta, total, geom };
  }
  return null;
}

/** Nastaví vzepětí celého oblouku; části a uzly mezi nimi se přepočtou. Vrací false, když to nejde. */
export function setChainSagitta(floor: Floor, wallId: Id, sagitta: number): boolean {
  const chain = arcChain(floor, wallId);
  if (!chain || Math.abs(sagitta) < 0.5) return false;
  const g = arcGeometry(chain.a, chain.b, sagitta);
  if (!g) return false;
  const flip = Math.sign(sagitta) * Math.sign(chain.sagitta);
  if (chain.pieces.length === 1) {
    chain.pieces[0]!.wall.sagitta = sagitta;
    return true;
  }
  for (const { id, f } of chain.inner) {
    const ang = g.start + g.sweep * f;
    const n = floor.nodes[id]!;
    n.x = g.center.x + g.r * Math.cos(ang);
    n.y = g.center.y + g.r * Math.sin(ang);
  }
  for (const p of chain.pieces) {
    const share = (p.to - p.from) / chain.total;
    const sign = (Math.sign(p.wall.sagitta ?? 1) || 1) * flip;
    p.wall.sagitta = sign * sagittaOf(g.r, Math.abs(g.sweep) * share);
  }
  return true;
}
