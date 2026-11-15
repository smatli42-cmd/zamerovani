/**
 * F7 (KATALOG-STEN.md): otvor blízko rohu – upozornění, ne zákaz. Otvor jde skrz celé tělo stěny, takže
 * musí ležet v rozsahu, kde jsou vidět OBA líce stěny; u rohu (L, T na konci) začíná / končí líc až za tělem
 * napojené stěny. Část otvoru mimo tento rozsah „zasahuje do rohu“. Stejně se hlídá příčka napojená
 * doprostřed stěny (T bez dělení): otvor přes ni se překrývá s jejím tělem.
 */
import type { Floor, Id } from '../model/types';
import { dot, normal, sub, unit } from './geometry';
import { openingsOnWall, wallNodes } from './floorQueries';
import { bodyRange, hasBody } from './wallFace';
import { wallBodies } from './wallBody';

/** Menší přesah se nehlásí (zaokrouhlení). */
const TOL = 0.5;

const mm = (x: number) => (x > TOL ? Math.round(x) : 0);

/**
 * O kolik mm zasahuje otvor do rohu u konce A a B stěny a do příček napojených doprostřed stěny (`mid`, součet);
 * 0 = v pořádku. null = otvor nebo stěna neexistuje, stěna bez těla nebo oblouk (tam se nehlídá).
 */
export function openingCornerOverlap(floor: Floor, openingId: Id): { a: number; b: number; mid: number } | null {
  const op = floor.openings[openingId];
  const wall = op && floor.walls[op.wallId];
  if (!op || !wall || !hasBody(wall) || wall.sagitta) return null;
  const n = wallNodes(floor, wall);
  const bodies = wallBodies(floor);
  const body = bodies.get(wall.id);
  const placed = openingsOnWall(floor, wall).find(p => p.op.id === op.id);
  if (!n || !body || !placed) return null;
  const [A, B] = n;
  const dir = unit(A, B);
  const u = (p: { x: number; y: number }) => dot(sub(p, A), dir);
  // líce ve směru a→b: první bod u konce A, poslední u konce B
  const starts = body.faces.map(f => u(f[0]!));
  const ends = body.faces.map(f => u(f[f.length - 1]!));
  const a = Math.max(0, Math.max(...starts) - placed.start);
  const b = Math.max(0, placed.end - Math.min(...ends));
  // příčky napojené doprostřed stěny: část jejich těla v pásu těla této stěny, promítnutá na osu
  const [r0, r1] = bodyRange(wall);
  const across = (p: { x: number; y: number }) => dot(sub(p, A), normal(dir));
  let mid = 0;
  for (const node of Object.values(floor.nodes)) {
    if (node.host !== wall.id) continue;
    for (const w of Object.values(floor.walls)) {
      if (w.id === wall.id || (w.a !== node.id && w.b !== node.id)) continue;
      const pts = (bodies.get(w.id)?.poly ?? []).filter(p => across(p) >= r0 - 1 && across(p) <= r1 + 1);
      if (pts.length < 2) continue;
      const us = pts.map(u);
      mid += Math.max(0, Math.min(placed.end, Math.max(...us)) - Math.max(placed.start, Math.min(...us)));
    }
  }
  return { a: mm(a), b: mm(b), mid: mm(mid) };
}

/** Text upozornění pro panel otvoru (null = bez upozornění). */
export function openingCornerWarning(floor: Floor, openingId: Id): string | null {
  const o = openingCornerOverlap(floor, openingId);
  if (!o || (!o.a && !o.b && !o.mid)) return null;
  const parts: string[] = [];
  const corner = [o.a ? `A o ${o.a} mm` : '', o.b ? `B o ${o.b} mm` : ''].filter(Boolean).join(' a ');
  if (corner) parts.push(`do rohu ${corner}`);
  if (o.mid) parts.push(`do napojené příčky o ${o.mid} mm`);
  return `Otvor zasahuje ${parts.join(' a ')} – překrývá se s tělem sousední stěny.`;
}
