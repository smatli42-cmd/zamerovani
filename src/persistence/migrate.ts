/**
 * Převod starších uložených projektů na aktuální strukturu dat.
 * Při každé změně SCHEMA_VERSION sem přidat krok „z verze N na N+1“.
 */
import { createCircleWall, createWall, newId } from '../model/factory';
import { SCHEMA_VERSION, type Floor, type LineStyle, type Project, type Pt } from '../model/types';

export function migrateProject(raw: unknown): Project {
  const p = raw as Project;
  if (typeof p !== 'object' || p === null || typeof p.id !== 'string' || !Array.isArray(p.floors)) {
    throw new Error('Soubor neobsahuje platný projekt.');
  }
  if ((p.schema ?? 1) > SCHEMA_VERSION) {
    throw new Error('Projekt byl uložen novější verzí aplikace. Aktualizujte aplikaci.');
  }
  // 2 → 3: tvary (obdélník, kruh, oblouk) se staly běžnými stěnami; 3 → 4: kruh je jedna stěna
  const floors = p.floors.map(f => joinSemicircles(convertShapesToWalls(f)));
  return { ...p, floors, schema: SCHEMA_VERSION };
}

interface OldShape {
  type: string;
  style?: LineStyle;
  name?: string;
  note?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  angle?: number;
  r?: number;
  a?: Pt;
  b?: Pt;
  sagitta?: number;
}

/** Starší verze 2 ukládala tvary zvlášť; teď jsou to stěny (sloup = 4 stěny, kruh = 2 půlkruhy). */
function convertShapesToWalls(raw: Floor): Floor {
  const { shapes, ...floor } = raw as Floor & { shapes?: Record<string, OldShape> };
  const out: Floor = { ...floor, nodes: { ...floor.nodes }, walls: { ...floor.walls } };
  const node = (x: number, y: number): string => {
    const n = { id: newId('n'), x: Math.round(x), y: Math.round(y) };
    out.nodes[n.id] = n;
    return n.id;
  };
  const wall = (a: string, b: string, sh: OldShape, sagitta = 0): void => {
    const w = createWall(a, b, sagitta);
    if (sh.style && sh.style !== 'solid') w.style = sh.style;
    w.label.note = [sh.name, sh.note].filter(Boolean).join(', ');
    out.walls[w.id] = w;
  };
  for (const sh of Object.values(shapes ?? {})) {
    if (sh.type === 'rect' && sh.x !== undefined && sh.y !== undefined && sh.w && sh.h) {
      const ang = ((sh.angle ?? 0) * Math.PI) / 180;
      const [c, s] = [Math.cos(ang), Math.sin(ang)];
      const ids = (
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ] as const
      ).map(([kx, ky]) => node(sh.x! + (kx * sh.w!) / 2 * c - (ky * sh.h!) / 2 * s, sh.y! + (kx * sh.w!) / 2 * s + (ky * sh.h!) / 2 * c));
      for (let i = 0; i < 4; i++) wall(ids[i]!, ids[(i + 1) % 4]!, sh);
    } else if (sh.type === 'circle' && sh.x !== undefined && sh.y !== undefined && sh.r) {
      const c = node(sh.x, sh.y);
      const w = createCircleWall(c, sh.r);
      if (sh.style && sh.style !== 'solid') w.style = sh.style;
      w.label.note = [sh.name, sh.note].filter(Boolean).join(', ');
      out.walls[w.id] = w;
    } else if (sh.type === 'arc' && sh.a && sh.b) {
      wall(node(sh.a.x, sh.a.y), node(sh.b.x, sh.b.y), sh, sh.sagitta ?? 0);
    }
  }
  return out;
}

/** Verze 3 kreslila kruh jako dvě půlkruhové stěny mezi týmiž dvěma rohy – sloučí se na jednu kruhovou stěnu. */
function joinSemicircles(floor: Floor): Floor {
  const walls = { ...floor.walls };
  const nodes = { ...floor.nodes };
  for (const w1 of Object.values(floor.walls)) {
    if (!walls[w1.id] || w1.radius !== undefined || !w1.sagitta) continue;
    const n1 = nodes[w1.a];
    const n2 = nodes[w1.b];
    if (!n1 || !n2) continue;
    const half = Math.hypot(n2.x - n1.x, n2.y - n1.y) / 2;
    if (Math.abs(Math.abs(w1.sagitta) - half) > 1) continue;
    const w2 = Object.values(walls).find(w => w.id !== w1.id && w.a === w1.b && w.b === w1.a && Math.abs((w.sagitta ?? 0) - w1.sagitta!) < 1);
    if (!w2) continue;
    const used = Object.values(walls).filter(w => [w.a, w.b].some(id => id === w1.a || id === w1.b));
    if (used.length !== 2) continue; // rohy sdílí i jiné stěny – nechat jako oblouky
    const center = { id: newId('n'), x: Math.round((n1.x + n2.x) / 2), y: Math.round((n1.y + n2.y) / 2) };
    nodes[center.id] = center;
    const circle = createCircleWall(center.id, Math.round(half));
    if (w1.style) circle.style = w1.style;
    circle.label = w1.label;
    delete walls[w1.id];
    delete walls[w2.id];
    delete nodes[w1.a];
    delete nodes[w1.b];
    walls[circle.id] = circle;
  }
  return { ...floor, walls, nodes };
}
