/**
 * Body a hrany schodiště pro volnou kótu (odstup od stěny, core/dimRefs.ts) a přichytávání kresby
 * (tools/drawSnap.ts). Část schodiště: `f<k>` = rameno k (rohy u prvního stupně a u výstupu, u oblouku i střed),
 * `l<k>` = podesta k, `o` = ruční obrys. Hrana = rovný úsek obrysu části (u ramene po oblouku jen hrany napříč –
 * první stupeň a výstup). Bez DOM.
 */
import type { Floor, Id, Pt, Stair } from '../model/types';
import { dist } from './geometry';
import { flightRect, isArcFlight } from './stairFlight';
import { stairsOf } from './stairs';

/** Body části schodiště (rohy; u ramene po oblouku navíc střed jako bod 4). */
export function stairPartPts(s: Stair | undefined, part: string): Pt[] | null {
  if (!s) return null;
  if (part === 'o') return s.outline ?? null;
  const k = Number(part.slice(1));
  if (!Number.isInteger(k)) return null;
  if (part[0] === 'f') {
    const f = s.outline ? undefined : s.flights[k];
    if (!f) return null;
    return isArcFlight(f) ? [...flightRect(f), f.center!] : flightRect(f);
  }
  const l = part[0] === 'l' && !s.outline ? s.landings[k] : undefined;
  return l && l.pts.length >= 3 ? l.pts : null;
}

/** Rovná hrana `i` části (od bodu i k bodu i + 1, obrys uzavřený); null = oblouk, neexistuje. */
export function stairPartSeg(s: Stair | undefined, part: string, i: number): [Pt, Pt] | null {
  const pts = stairPartPts(s, part);
  if (!s || !pts) return null;
  const n = part[0] === 'f' ? 4 : pts.length; // střed oblouku není roh obrysu
  if (i < 0 || i >= n) return null;
  if (part[0] === 'f') {
    const f = s.flights[Number(part.slice(1))];
    if (f && isArcFlight(f) && (i === 0 || i === 2)) return null; // boky ramene po oblouku jsou oblouky
  }
  const p = pts[i]!;
  const q = pts[(i + 1) % n]!;
  return dist(p, q) >= 1 ? [p, q] : null;
}

/** Části schodiště (pro hledání pod perem). */
export function stairParts(s: Stair): string[] {
  if (s.outline) return ['o'];
  return [...s.flights.map((_, k) => `f${k}`), ...s.landings.map((_, k) => `l${k}`)];
}

/** Nejbližší bod schodiště do `tol` (roh ramene / podesty / obrysu, střed oblouku). */
export function stairPointNear(floor: Floor, p: Pt, tol: number): { stair: Id; part: string; i: number; pt: Pt; d: number } | null {
  let best: { stair: Id; part: string; i: number; pt: Pt; d: number } | null = null;
  for (const s of stairsOf(floor)) {
    for (const part of stairParts(s)) {
      (stairPartPts(s, part) ?? []).forEach((q, i) => {
        const d = dist(q, p);
        if (d <= tol && (!best || d < best.d)) best = { stair: s.id, part, i, pt: q, d };
      });
    }
  }
  return best;
}

/** Všechny rovné hrany schodišť (pro hledání pod perem). */
export function stairSegs(floor: Floor): { stair: Id; part: string; i: number; seg: [Pt, Pt] }[] {
  const out: { stair: Id; part: string; i: number; seg: [Pt, Pt] }[] = [];
  for (const s of stairsOf(floor)) {
    for (const part of stairParts(s)) {
      const n = part[0] === 'f' ? 4 : (stairPartPts(s, part)?.length ?? 0);
      for (let i = 0; i < n; i++) {
        const seg = stairPartSeg(s, part, i);
        if (seg) out.push({ stair: s.id, part, i, seg });
      }
    }
  }
  return out;
}
