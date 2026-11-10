/**
 * Spárovaná příčka: dvě čáry (líce) jedné příčky mají společné `Wall.part.id`
 * (line 1 = první čára, line 2 = druhá čára, line 0 = krátká uzavírací stěna volného konce).
 * Otvory (dveře, okna, průchody) se ukládají jen na první čáru a kreslí se na obou lících.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { wallNodes } from './floorQueries';

/** Všechny stěny téže příčky (nebo jen daná stěna, když příčkou není). */
export function partitionWalls(floor: Floor, wall: Wall): Wall[] {
  const id = wall.part?.id;
  if (!id) return [wall];
  return Object.values(floor.walls).filter(w => w.part?.id === id);
}

const linesOf = (floor: Floor, partId: Id, line: 1 | 2): Wall[] => Object.values(floor.walls).filter(w => w.part?.id === partId && w.part.line === line);

/** Vektor od první čáry k druhé (v místě stěny `wall` z první čáry); null, když stěna není první čárou příčky. */
export function twinOffset(floor: Floor, wall: Wall): Pt | null {
  if (wall.part?.line !== 1) return null;
  const n = wallNodes(floor, wall);
  const other = linesOf(floor, wall.part.id, 2)[0];
  const n2 = other && wallNodes(floor, other);
  if (!n || !n2) return null;
  const dx = n2[1].x - n2[0].x;
  const dy = n2[1].y - n2[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mid = { x: (n[0].x + n[1].x) / 2, y: (n[0].y + n[1].y) / 2 };
  const vx = n2[0].x - mid.x;
  const vy = n2[0].y - mid.y;
  const along = vx * ux + vy * uy;
  // složka vektoru k druhé čáře kolmá na čáru
  return { x: vx - ux * along, y: vy - uy * along };
}

/**
 * Ťuknutí na druhou čáru příčky → odpovídající místo na první čáře (kde se otvory ukládají).
 * Pro jiné stěny vrací null (otvor se vkládá přímo na ně).
 */
export function toPrimary(floor: Floor, wall: Wall, pt: Pt): { wall: Wall; t: number } | null {
  if (wall.part?.line !== 2) return null;
  for (const w1 of linesOf(floor, wall.part.id, 1)) {
    const n = wallNodes(floor, w1);
    if (!n) continue;
    const dx = n[1].x - n[0].x;
    const dy = n[1].y - n[0].y;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((pt.x - n[0].x) * dx + (pt.y - n[0].y) * dy) / len2;
    if (t >= 0 && t <= 1) return { wall: w1, t };
  }
  return null;
}

/** Tloušťka příčky = vzdálenost čar. */
export function partitionThickness(floor: Floor, wall: Wall): number | null {
  const first = linesOf(floor, wall.part?.id ?? '', 1)[0];
  const off = first && twinOffset(floor, first);
  return off ? Math.round(Math.hypot(off.x, off.y)) : null;
}

/**
 * Stěna, jejíž délka je tloušťkou příčky (úsek stěny mezi čarami nebo uzavírací stěna konce),
 * a roh druhé čáry, který se jejím prodloužením posune (posune se celá druhá čára).
 */
export function thicknessTarget(floor: Floor, wall: Wall): { wallId: Id; nodeId: Id } | null {
  const partId = wall.part?.id;
  if (!partId) return null;
  const ends = (line: 1 | 2): Id[] => {
    const count = new Map<Id, number>();
    for (const w of linesOf(floor, partId, line)) for (const id of [w.a, w.b]) count.set(id, (count.get(id) ?? 0) + 1);
    return [...count].filter(([, c]) => c === 1).map(([id]) => id);
  };
  const e1 = ends(1);
  const e2 = ends(2);
  let free: { wallId: Id; nodeId: Id } | null = null;
  for (const a of e1) {
    for (const b of e2) {
      const w = Object.values(floor.walls).find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      if (!w) continue;
      // úsek rozdělené stěny (host) má přednost – příčka se posune celá; krátká uzavírací stěna jen jako záloha
      if (!w.part) return { wallId: w.id, nodeId: b };
      free = free ?? { wallId: w.id, nodeId: b };
    }
  }
  return free;
}
