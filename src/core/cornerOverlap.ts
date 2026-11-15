/**
 * F7 (KATALOG-STEN.md): prvek nesený stěnou blízko rohu – upozornění, ne zákaz. JEDINÉ místo této kontroly
 * pro všechny druhy prvků (CLAUDE.md, pravidlo pro průřezové funkce; rozhodnutí uživatele 2026-11-15:
 * otvory i výstupky / vybrání, i na obloukové stěně; nika a výstupek jen svůj líc, vybrání přes celou tloušťku oba).
 *
 * Prvek má ležet tam, kde je vidět líc stěny, na kterém leží: otvor jde skrz celé tělo → oba líce,
 * výstupek / vybrání → jen svůj líc (`Protrusion.side`). U rohu (L, T na konci) začíná / končí líc až za tělem
 * napojené stěny; část prvku mimo tento rozsah „zasahuje do rohu“. Stejně se hlídá příčka napojená doprostřed
 * stěny (T bez dělení), jejíž tělo se dotýká hlídaného líce.
 *
 * **Nový druh prvku na stěně musí přibýt jako další obal `…CornerOverlap` i s testem** (`cornerOverlap.test.ts`).
 */
import type { Floor, Id, Wall } from '../model/types';
import { openingsOnWall } from './floorQueries';
import { bodyRange, hasBody } from './wallFace';
import { wallBodies } from './wallBody';
import { faceOffset, protrusionExtent, wallFrame } from './protrusion';

/** Menší přesah se nehlásí (zaokrouhlení; obrys výstupku smí při kreslení přečnívat konec stěny o 1,5 mm). */
const TOL = 1.5;

const mm = (x: number) => (x > TOL ? Math.round(x) : 0);

/** Přesah prvku: do rohu u konce A, u konce B a do příček napojených doprostřed stěny (součet), mm; 0 = v pořádku. */
export interface CornerOverlap {
  a: number;
  b: number;
  mid: number;
}

/**
 * Přesah rozsahu [start, end] podél stěny (mm od rohu A po ose, u oblouku po oblouku osy) přes líce `faces`
 * ('both' = oba líce, 1 / −1 = líc na straně normal(tečny) / opačné). null = stěna bez těla.
 */
function spanOverlap(floor: Floor, wall: Wall, start: number, end: number, faces: 'both' | 1 | -1): CornerOverlap | null {
  if (!hasBody(wall)) return null;
  const frame = wallFrame(floor, wall);
  const bodies = wallBodies(floor);
  const body = bodies.get(wall.id);
  if (!frame || !body) return null;
  // souřadnice stěny jako u výstupků: u podél osy od rohu A (u oblouku po oblouku), across podél normal(tečny)
  const u = (p: { x: number; y: number }) => frame.project(p).u;
  const across = (p: { x: number; y: number }) => frame.project(p).across;
  // WallBody.faces: [0] = líc na záporné straně normal(a→b), [1] = na kladné; oba ve směru a→b
  const used = faces === 'both' ? body.faces : [body.faces[faces === 1 ? 1 : 0]];
  const a = Math.max(0, Math.max(...used.map(f => u(f[0]!))) - start);
  const b = Math.max(0, end - Math.min(...used.map(f => u(f[f.length - 1]!))));
  // pás kolmo ke stěně, ve kterém se hledá tělo napojené příčky: celé tělo (otvor) nebo jen hlídaný líc
  const [r0, r1] = faces === 'both' ? bodyRange(wall) : [faceOffset(wall, faces), faceOffset(wall, faces)];
  let mid = 0;
  for (const node of Object.values(floor.nodes)) {
    if (node.host !== wall.id) continue;
    for (const w of Object.values(floor.walls)) {
      if (w.id === wall.id || (w.a !== node.id && w.b !== node.id)) continue;
      const pts = (bodies.get(w.id)?.poly ?? []).filter(p => across(p) >= r0 - 1 && across(p) <= r1 + 1);
      if (pts.length < 2) continue;
      const us = pts.map(u);
      mid += Math.max(0, Math.min(end, Math.max(...us)) - Math.max(start, Math.min(...us)));
    }
  }
  return { a: mm(a), b: mm(b), mid: mm(mid) };
}

/**
 * Otvor (okno, francouzské okno, dveře, průchod – i s rámem / zárubní a ostěním): skrz celé tělo, oba líce.
 * Nika jen ze svého líce: `swing` ve směru těla = líc A (čára stěny), proti = líc B (canvas/drawOpenings.ts),
 * tj. líc na straně −swing vůči normal(a→b).
 */
export function openingCornerOverlap(floor: Floor, openingId: Id): CornerOverlap | null {
  const op = floor.openings[openingId];
  const wall = op && floor.walls[op.wallId];
  const placed = wall && openingsOnWall(floor, wall).find(p => p.op.id === openingId);
  // otvor na oblouku (stěna s otvorem přepnutá na oblouk) se nehlídá: otvory na oblouku zatím nejsou (F6)
  // a jejich poloha se měří po tětivě, ne po oblouku osy
  if (!op || !wall || !placed || wall.sagitta) return null;
  return spanOverlap(floor, wall, placed.start, placed.end, op.kind === 'niche' ? (op.swing === 1 ? -1 : 1) : 'both');
}

/**
 * Výstupek / vybrání (i na obloukové stěně): jen líc, na kterém leží; vybrání přes celou tloušťku (průraz)
 * oba líce jako otvor (rozhodnutí uživatele 2026-11-15).
 */
export function protrusionCornerOverlap(floor: Floor, protrusionId: Id): CornerOverlap | null {
  const p = floor.protrusions?.[protrusionId];
  const wall = p && floor.walls[p.wallId];
  if (!p || !wall) return null;
  const { u0, u1, depth } = protrusionExtent(p);
  const through = p.mode === 'subtract' && depth >= wall.thickness - TOL;
  return spanOverlap(floor, wall, u0, u1, through ? 'both' : p.side);
}

/** Text upozornění pro panel prvku (`what` = „Otvor“, „Výstupek“ …); null = bez upozornění. */
export function cornerWarning(what: string, o: CornerOverlap | null): string | null {
  if (!o || (!o.a && !o.b && !o.mid)) return null;
  const parts: string[] = [];
  const corner = [o.a ? `A o ${o.a} mm` : '', o.b ? `B o ${o.b} mm` : ''].filter(Boolean).join(' a ');
  if (corner) parts.push(`do rohu ${corner}`);
  if (o.mid) parts.push(`do napojené příčky o ${o.mid} mm`);
  return `${what} zasahuje ${parts.join(' a ')} – překrývá se se sousední stěnou nebo vede za konec stěny.`;
}

/** Text upozornění pro panel otvoru (null = bez upozornění). */
export const openingCornerWarning = (floor: Floor, openingId: Id): string | null =>
  cornerWarning(floor.openings[openingId]?.kind === 'niche' ? 'Nika' : 'Otvor', openingCornerOverlap(floor, openingId));

/** Text upozornění pro panel výstupku / vybrání (null = bez upozornění). */
export function protrusionCornerWarning(floor: Floor, protrusionId: Id): string | null {
  const p = floor.protrusions?.[protrusionId];
  return p ? cornerWarning(p.mode === 'subtract' ? 'Vybrání' : 'Výstupek', protrusionCornerOverlap(floor, protrusionId)) : null;
}
