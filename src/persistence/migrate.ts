/**
 * Převod starších uložených projektů na aktuální strukturu dat.
 * Při každé změně SCHEMA_VERSION sem přidat krok „z verze N na N+1“.
 */
import { createCircleWall, createWall, DEFAULT_WALL_THICKNESS, isWindowKind, newId, WINDOW_FRAME } from '../model/factory';
import { hasBody } from '../core/wallFace';
import { orientLoopOutward } from '../core/wallSide';
import { shapesToDrawings } from './migrateDrawings';
import { mergeArcAt, mergeStraightAt } from '../core/topology';
import { defaultLayers, kindDefaultLayer, OWN_KINDS, ownCollection, setCollection } from '../core/layers';
import { DIR_DEFAULT_MM, dirTarget } from '../core/marks';
import { SCHEMA_VERSION, type Floor, type LineStyle, type MarkDir, type Project, type Pt, type Reveal } from '../model/types';

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
  // 9 → 10: výstupky a vybrání stěn (floor.protrusions); 10 → 11: oblouk v obrysu výstupku (ProfilePt.s) – bez převodu
  // 11 → 12: ostění vnitřní / vnější zvlášť (Reveal.inner / outer); dřívější „s ostěním“ = obě strany (stejná kresba)
  // 12 → 13: rám okna má pevnou šířku 50 mm (dřívější vlastní šířka rámu se přepíše)
  // 13 → 14: roh napojený na líc průběžné stěny (Node.hostFace) – nepovinné pole, bez převodu
  // 14 → 15: výstupky přes roh (floor.cornerProtrusions) – nepovinné pole, bez převodu
  // 15 → 16: výstupky přes volný konec stěny (floor.endProtrusions) – nepovinné pole, bez převodu
  // 16 → 17: kresba – grafické prvky (floor.drawings: dvojitá čára…) – nepovinné pole, bez převodu
  // 17 → 18: obdélníky, kruhy a volné oblouky tloušťky 0 se převedou na kresbu (persistence/migrateDrawings.ts)
  // 18 → 19: vybrání v rohu (CornerProtrusion.mode = 'subtract') – nepovinné pole, bez převodu
  // 19 → 20: volné kóty (floor.dims) – nepovinné pole, bez převodu
  // 20 → 21: konce volných kót i na hranách (líc stěny, čára kresby, okraj otvoru) – bez převodu
  // 21 → 22: konec volné kóty na hraně výstupku / vybrání (`prot`) – bez převodu
  // 22 → 23: poloha kót posunutá tažením za číslo (floor.dimPlace) – nepovinné pole, bez převodu
  // 23 → 24: konec volné kóty na oblouku (`arcWall`, `arcSeg`) a ve středu oblouku (`center`) – bez převodu
  // 24 → 25: schodiště (floor.stairs) – nepovinné pole, bez převodu
  // 25 → 26: schodiště – rameno po oblouku (center, sweep), ručně nakreslené rameno (turn 'free'), zabíhavé stupně (winders) – bez převodu
  // 26 → 27: schodiště – napojení ramene rovně (turn 'straight') a atypické T (turn 'tee') – bez převodu
  // 27 → 28: vrstvy projektu (Project.layers, activeLayer) a vrstva u každého prvku (layerId) – core/layers.ts
  // 28 → 29: ruční tahy perem (floor.strokes) – nepovinné pole, bez převodu
  // 29 → 30: značky v půdorysu (floor.marks, ZNACKY-POZNAMKY-DETAILY.md) – nepovinné pole, bez převodu; vrstva Popisky (withLayers)
  // 30 → 31: značka – délka směru (`dir.len`), tvary ve skice (obdélník, kruh, oblouk, dvojitá čára) – nepovinné, bez převodu
  // 31 → 32: směr značky = cíl ve výkresu `dir.to` (mm) místo úhlu a délky v px – převod `markDirTargets`
  const old = p.schema ?? 1;
  const floors = p.floors.map(f => {
    const j = joinSemicircles(convertShapesToWalls(f));
    const r = removePairing(addWallThickness({ ...j, texts: j.texts ?? {} }));
    const out = old < 9 ? joinSplitWalls(r) : r;
    const fixed = fixWindowFrames(revealSides({ ...out, protrusions: out.protrusions ?? {} }));
    const f2 = old < 18 ? shapesToDrawings(fixed) : fixed;
    return old < 32 ? markDirTargets(f2) : f2;
  });
  return withLayers({ ...p, floors, schema: SCHEMA_VERSION });
}

/**
 * 27 → 28: výchozí sada vrstev a vrstva u každého prvku podle druhu (stěna a schodiště Stavba, volná kóta Kóty,
 * text a štítek místnosti Popisky, kresba Kresba). Systémová aktivní vrstva se zahodí (2026-11-20). Opakovatelné – existující vrstvy a `layerId` zůstanou.
 */
function withLayers(p: Project): Project {
  const layers = p.layers?.length ? p.layers : defaultLayers();
  // aktivní vrstva jen platná vlastní; jinak nezvolená (core/layers.ts `activeDrawLayer` vezme nejnižší vlastní)
  const { activeLayer, ...rest } = p;
  const keep = layers.some(l => l.id === activeLayer && !l.system);
  const q: Project = { ...rest, layers, ...(keep ? { activeLayer } : {}) };
  const floors = p.floors.map(f => {
    const out: Floor = { ...f };
    for (const kind of OWN_KINDS) {
      const rec = ownCollection(f, kind);
      const fixed: typeof rec = {};
      for (const [id, el] of Object.entries(rec)) fixed[id] = el.layerId && layers.some(l => l.id === el.layerId) ? el : { ...el, layerId: kindDefaultLayer(kind) };
      setCollection(out, kind, fixed);
    }
    return out;
  });
  return { ...q, floors };
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

/** 11 → 12: ostění bez údaje o straně = ostění z obou líců (tak se kreslilo dřív). */
export function revealSides(floor: Floor): Floor {
  let changed = false;
  const openings = { ...floor.openings };
  for (const [id, op] of Object.entries(openings)) {
    const rv = op.reveal as (Partial<Reveal> & Omit<Reveal, 'inner' | 'outer'>) | undefined;
    if (!rv || (typeof rv.inner === 'boolean' && typeof rv.outer === 'boolean')) continue;
    openings[id] = { ...op, reveal: { ...rv, inner: rv.inner ?? true, outer: rv.outer ?? true } };
    changed = true;
  }
  return changed ? { ...floor, openings } : floor;
}

/** 12 → 13: rám okna a francouzského okna má vždy šířku WINDOW_FRAME.width (50 mm). */
export function fixWindowFrames(floor: Floor): Floor {
  let changed = false;
  const openings = { ...floor.openings };
  for (const [id, op] of Object.entries(openings)) {
    if (!isWindowKind(op.kind) || !op.frame || op.frame.width === WINDOW_FRAME.width) continue;
    // (v době schématu 13 se rám přičítal k šířce okna; od 2026-11-14 leží rám uvnitř šířky okna – viz openingSpan)
    const extra = 2 * (op.frame.width - WINDOW_FRAME.width);
    openings[id] = { ...op, width: Math.max(100, op.width + extra), frame: { ...op.frame, width: WINDOW_FRAME.width } };
    changed = true;
  }
  return changed ? { ...floor, openings } : floor;
}

/**
 * 31 → 32: směr značky ze starého úhlu (`angle`, °) a délky v px (`len`) na cíl ve výkresu `to` (mm) – ve stejném
 * úhlu, 1,5 m od značky (délka v px nemá v mm obdobu). Opakovatelné – značka s `to` zůstane.
 */
function markDirTargets(f: Floor): Floor {
  if (!f.marks) return f;
  const marks: NonNullable<Floor['marks']> = {};
  for (const [id, m] of Object.entries(f.marks)) {
    const d = m.dir as (Partial<MarkDir> & { angle?: number; len?: number }) | undefined;
    if (!d || d.to) {
      marks[id] = m;
      continue;
    }
    const angle = d.angle ?? -90;
    marks[id] = { ...m, dir: { on: !!d.on, style: d.style ?? 'cone', to: dirTarget(m, angle, DIR_DEFAULT_MM) } };
  }
  return { ...f, marks };
}
