/**
 * Úhlopříčka místnosti (rozhodnutí uživatele 2026-11-19): volná kóta mezi dvěma nesousedními rohy téže uzavřené
 * místnosti z rovných stěn. Zadaná délka zachová délky všech stěn místnosti – místnost se zkosí. Stojí pevný roh
 * (konec kóty, který se neposouvá) a delší z jeho dvou stěn (základna); ostatní rohy se dopočítají postupným
 * dorovnáním od výchozího tvaru (u čtyřúhelníku je řešení jediné, u víc rohů nejbližší nalezené). Ostatní stěny
 * napojené na posunuté rohy se protáhnou, napojené příčky (T) dorovná `syncHosted`.
 *
 * Místnost = nejmenší obrys grafu úseků stěn (`wallSegments` – i napojené rohy T), který obsahuje oba rohy; příčky
 * s volným koncem se vynechají. Rohy obrysu na přímce (rozdělená stěna, napojení T) se nehýbou samostatně – úsek
 * mezi skutečnými rohy zůstane rovný. Výsledek se ověří (obrys se nesmí překřížit ani převrátit roh), jinak se úprava
 * neprovede; stejně u místnosti, jejíž roh je napojený doprostřed jiné stěny (T – zatím neumí). Jediné místo pravidla; volá ho `setFreeDimLength` (core/freeDim.ts). Mimo místnost platí posun rohu.
 */
import type { Floor, Id, Pt } from '../model/types';
import { dist } from './geometry';
import { wallSegments } from './floorQueries';

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Obrysy (stěny grafu úseků) obsahující oba body – cykly ID bodů; nejmenší plocha první. */
function faceThrough(floor: Floor, n1: Id, n2: Id): { ids: Id[]; pts: Pt[] } | null {
  const pos = new Map<Id, Pt>();
  const adj = new Map<Id, Set<Id>>();
  for (const s of wallSegments(floor)) {
    if (s.from === s.to || s.wall.sagitta || s.wall.radius !== undefined) {
      // oblouk v místnosti: úhlopříčka s obloukem neplatí – oblouk se do grafu nepřidá (obrys se neuzavře)
      continue;
    }
    pos.set(s.from, s.fromPt);
    pos.set(s.to, s.toPt);
    (adj.get(s.from) ?? adj.set(s.from, new Set()).get(s.from)!).add(s.to);
    (adj.get(s.to) ?? adj.set(s.to, new Set()).get(s.to)!).add(s.from);
  }
  // příčky s volným koncem do obrysu nepatří
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, nb] of adj) {
      if (nb.size > 1) continue;
      for (const o of nb) adj.get(o)?.delete(id);
      adj.delete(id);
      changed = true;
    }
  }
  if (!adj.has(n1) || !adj.has(n2)) return null;
  // sousedé podle úhlu; obrys = vždy další soused po směru od příchozí hrany
  const sorted = new Map<Id, Id[]>();
  for (const [id, nb] of adj) {
    const p = pos.get(id)!;
    sorted.set(
      id,
      [...nb].sort((a, b) => Math.atan2(pos.get(a)!.y - p.y, pos.get(a)!.x - p.x) - Math.atan2(pos.get(b)!.y - p.y, pos.get(b)!.x - p.x))
    );
  }
  const used = new Set<string>();
  let best: { ids: Id[]; pts: Pt[]; area: number } | null = null;
  for (const [u, nb] of sorted) {
    for (const v of nb) {
      if (used.has(`${u}>${v}`)) continue;
      const ids: Id[] = [];
      let a = u;
      let b = v;
      for (let guard = 0; guard <= adj.size * 2 && !used.has(`${a}>${b}`); guard++) {
        used.add(`${a}>${b}`);
        ids.push(a);
        const around = sorted.get(b)!;
        const k = around.indexOf(a);
        const c = around[(k + 1) % around.length]!;
        a = b;
        b = c;
      }
      if (!ids.includes(n1) || !ids.includes(n2) || new Set(ids).size !== ids.length) continue;
      const pts = ids.map(id => pos.get(id)!);
      let area = 0;
      for (let i = 0; i < pts.length; i++) area += cross({ x: 0, y: 0 }, pts[i]!, pts[(i + 1) % pts.length]!);
      area = Math.abs(area) / 2;
      if (area > 1 && (!best || area < best.area)) best = { ids, pts, area };
    }
  }
  return best;
}

/** Leží bod i obrysu na přímce mezi sousedy (rozdělená stěna, napojení)? */
function straightAt(pts: Pt[], i: number): boolean {
  const n = pts.length;
  const p = pts[(i - 1 + n) % n]!;
  const q = pts[i]!;
  const r = pts[(i + 1) % n]!;
  const l = dist(p, q) * dist(q, r);
  return l > 0 && Math.abs(cross(p, q, r)) / l < 1e-3 && (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y) > 0;
}

/** Úsečky se kříží (mimo společné konce)? */
function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6));
}

/**
 * Nastaví úhlopříčku `fixed`–`moving` na `value` se zachováním délek stěn místnosti (mění `floor`).
 * null = nejde o úhlopříčku místnosti (platí obecný posun rohu); false = takový tvar nejde (nic se nemění).
 */
export function setRoomDiagonal(floor: Floor, fixed: Id, moving: Id, value: number): boolean | null {
  const face = faceThrough(floor, fixed, moving);
  if (!face) return null;
  // skutečné rohy (ne body na přímce); body na přímce se dopočítají poměrem po úseku mezi rohy
  const all = face.pts;
  const cornerIdx = all.map((_, i) => i).filter(i => !straightAt(all, i) || face.ids[i] === fixed || face.ids[i] === moving);
  const n = cornerIdx.length;
  if (n < 4) return null;
  const fi = cornerIdx.findIndex(i => face.ids[i] === fixed);
  const mi = cornerIdx.findIndex(i => face.ids[i] === moving);
  if (fi < 0 || mi < 0) return null;
  // sousední rohy (kóta podél stěny) – délka stěny, ne úhlopříčka
  if (Math.abs(fi - mi) === 1 || Math.abs(fi - mi) === n - 1) return null;
  // konce kóty nesmí ležet na přímce uprostřed stěny (pak by kóta nebyla úhlopříčkou rohů)
  if (straightAt(all, cornerIdx[fi]!) || straightAt(all, cornerIdx[mi]!)) return null;
  // reálné rohy musí být v plánu (křížení „x:…“ jen jako bod na přímce)
  if (cornerIdx.some(i => !floor.nodes[face.ids[i]!])) return null;
  // roh napojený doprostřed jiné stěny (T) musí zůstat na ní – to řešič zatím neumí: úprava se neprovede
  if (cornerIdx.some(i => floor.nodes[face.ids[i]!]?.host)) return false;

  const pts: Pt[] = cornerIdx.map(i => ({ ...all[i]! }));
  const orig = pts.map(p => ({ ...p }));
  const len = pts.map((p, i) => dist(p, pts[(i + 1) % n]!));
  const prevI = (fi - 1 + n) % n;
  const base = len[prevI]! > len[fi]! ? prevI : (fi + 1) % n;
  const pinned = new Set([fi, base]);
  const cons: [number, number, number][] = pts.map((_, i) => [i, (i + 1) % n, len[i]!]);
  cons.push([fi, mi, value]);
  let worst = Infinity;
  for (let it = 0; it < 20000 && worst > 0.005; it++) {
    worst = 0;
    for (const [i, j, l] of cons) {
      const p = pts[i]!;
      const q = pts[j]!;
      const d = dist(p, q);
      if (d < 1e-9) continue;
      const err = d - l;
      worst = Math.max(worst, Math.abs(err));
      const wi = pinned.has(i) ? 0 : 1;
      const wj = pinned.has(j) ? 0 : 1;
      if (wi + wj === 0) continue;
      const k = err / d / (wi + wj);
      const dx = (q.x - p.x) * k;
      const dy = (q.y - p.y) * k;
      p.x += dx * wi;
      p.y += dy * wi;
      q.x -= dx * wj;
      q.y -= dy * wj;
    }
  }
  if (worst > 0.05) return false;
  // kontrola: žádný roh se nepřevrátil (znaménko zatočení) a obrys se nepřekřížil
  for (let i = 0; i < n; i++) {
    const s0 = cross(orig[(i - 1 + n) % n]!, orig[i]!, orig[(i + 1) % n]!);
    const s1 = cross(pts[(i - 1 + n) % n]!, pts[i]!, pts[(i + 1) % n]!);
    if (Math.sign(s0) !== Math.sign(s1) && Math.abs(s0) > 1 && Math.abs(s1) > 1) return false;
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  // zápis: rohy, pak body na přímce poměrem po svém úseku
  const corner = new Map<number, Pt>(cornerIdx.map((ai, k) => [ai, pts[k]!]));
  const m = all.length;
  for (let k = 0; k < n; k++) {
    const i0 = cornerIdx[k]!;
    const i1 = cornerIdx[(k + 1) % n]!;
    const a0 = all[i0]!;
    const a1 = all[i1]!;
    const p0 = corner.get(i0)!;
    const p1 = corner.get(i1)!;
    const total = dist(a0, a1);
    for (let i = (i0 + 1) % m; i !== i1; i = (i + 1) % m) {
      const t = total > 0 ? dist(a0, all[i]!) / total : 0;
      corner.set(i, { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
    }
  }
  face.ids.forEach((id, i) => {
    const node = floor.nodes[id];
    const p = corner.get(i);
    if (node && p) {
      node.x = p.x;
      node.y = p.y;
    }
  });
  return true;
}
