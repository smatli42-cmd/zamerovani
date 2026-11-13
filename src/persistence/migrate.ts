/**
 * Převod starších uložených projektů na aktuální strukturu dat.
 * Při každé změně SCHEMA_VERSION sem přidat krok „z verze N na N+1“.
 */
import { createCircleWall, createWall, DEFAULT_WALL_THICKNESS, newId } from '../model/factory';
import { hasBody, orientLoopOutward } from '../core/wallBody';
import { mergeArcAt, mergeStraightAt } from '../core/topology';
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
  // 4 → 5: přibyly samostatné texty (floor.texts)
  // 5 → 6: stěny mají tloušťku a stranu těla (Wall.thickness, Wall.side), tloušťka zmizela z popisku
  // 6 → 7: zrušena spárovaná příčka a dvojčára (Wall.part) – jejich čáry zůstanou obyčejnými čarami
  // 7 → 8: T bez dělení – průběžné stěny rozdělené napojením se spojí zpět, roh se na ně napojí (Node.host)
  // 8 → 9: totéž i pro oblouky (verze 8 je ještě dělila) – joinSplitWalls je opakovatelná beze změny výsledku
  // 9 → 10: výstupky a vybrání stěn (floor.protrusions)
  const old = p.schema ?? 1;
  const floors = p.floors.map(f => {
    const j = joinSemicircles(convertShapesToWalls(f));
    const r = removePairing(addWallThickness({ ...j, texts: j.texts ?? {} }));
    const out = old < 9 ? joinSplitWalls(r) : r;
    return { ...out, protrusions: out.protrusions ?? {} };
  });
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

/**
 * Verze 6: tloušťka přešla z popisku stěny na stěnu. Tvary (kruhy, oblouky, čárkované/čerchované čáry)
 * a čáry příček zůstanou čárami (0), ostatní stěny dostanou tloušťku z popisku nebo 300 mm.
 * Strana těla: ven z uzavřených místností, jinak výchozí (stávající výkresy jsou jen zkušební).
 */
function addWallThickness(floor: Floor): Floor {
  const walls: Floor['walls'] = {};
  for (const w of Object.values(floor.walls)) {
    if (typeof (w as { thickness?: unknown }).thickness === 'number') {
      walls[w.id] = w;
      continue;
    }
    const { thickness: labelThickness, ...label } = w.label as typeof w.label & { thickness?: number | null };
    const line = w.radius !== undefined || !!w.sagitta || (w.style && w.style !== 'solid') || !!(w as { part?: unknown }).part;
    walls[w.id] = { ...w, label, thickness: line ? 0 : (labelThickness ?? DEFAULT_WALL_THICKNESS), side: 1 };
  }
  const out = { ...floor, walls };
  for (const w of Object.values(walls)) if (hasBody(w)) orientLoopOutward(out, w.id);
  return out;
}

/**
 * Verze 7: nástroje Příčka a Dvojčára jsou zrušené (příčka = stěna s malou tloušťkou). Značka spárování
 * `part` se odstraní; čáry zůstanou jako čáry bez tloušťky a otvory na své čáře (výkresy byly jen zkušební).
 */
function removePairing(floor: Floor): Floor {
  const walls: Floor['walls'] = {};
  for (const w of Object.values(floor.walls)) {
    const { part, ...rest } = w as typeof w & { part?: unknown };
    void part;
    walls[w.id] = rest;
  }
  return { ...floor, walls };
}

/**
 * 7 → 8 a 8 → 9: stěny (i oblouky) rozdělené napojením jiné stěny (dřívější T, i po odpojení) se spojí zpět do jedné:
 * dvě rovně navazující části se stejnou tloušťkou, stranou, osou, stylem a popiskem; roh, kde se napojují
 * další stěny, zůstane napojený na spojenou stěnu (Node.host). Změřené délky se sečtou.
 */
export function joinSplitWalls(floor: Floor): Floor {
  const f: Floor = structuredClone(floor);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(f.nodes)) {
      if (mergeArcAt(f, node.id)) {
        changed = true;
        break;
      }
      const at = Object.values(f.walls).filter(w => w.a === node.id || w.b === node.id);
      for (const w of at) {
        const same = at.find(o => o.id !== w.id && JSON.stringify(o.label) === JSON.stringify(w.label));
        if (!same) continue;
        const before = Object.keys(f.walls).length;
        mergeStraightAt(f, w.id, node.id, true);
        if (Object.keys(f.walls).length < before) {
          changed = true;
          break;
        }
      }
    }
  }
  // rohy, které po spojení nenese žádná stěna, zmizí
  const used = new Set(Object.values(f.walls).flatMap(w => [w.a, w.b]));
  for (const id of Object.keys(f.nodes)) if (!used.has(id)) delete f.nodes[id];
  return f;
}
