/**
 * Zámek kót (KOTY-ZAMEK-EXPORT.md, část A).
 *
 * Kóty nejsou v datech samostatné prvky – počítají se ze stěn, otvorů a výstupků. Zámek proto patří
 * ke konkrétní kótě, kterou popisuje `DimTarget` (stejný popis, jaký používá NumPad), a ukládá se v podlaží:
 * `Floor.dimLocks[dimKey(kóta)] = kóta`. Chybí = odemčeno (bez změny SCHEMA_VERSION).
 *
 * Zámek je jediný mechanismus držení: řešič délek drží jen zamčené délky stěn a každá úprava výkresu
 * (store.edit) se zkontroluje funkcí `lockViolation` – když by změnila hodnotu zamčené kóty, neprovede se.
 */
import { stairDimValue, type StairDim } from './stairs';
import type { Floor, Id, Pt } from '../model/types';
import type { MoveTarget } from './solver';
import type { RevealPart } from './doorLayout';
import type { Side } from './components';
import type { ProtrusionDim } from './protrusionEdit';
import { revealPartValue } from './doorLayout';
import { arcChain } from './arcChain';
import { openingSpan, openingStartFromA, openingsOnWall, wallLength, wallSegments } from './floorQueries';
import { componentGap } from './components';
import { faceLength } from './wallBody';
import { hasBody } from './wallFace';
import { hostedChain } from './hosting';
import { protrusionDims, protrusionNeighbors } from './protrusionEdit';
import { cornerDims } from './cornerProtrusion';
import { endDims, type EndDim } from './endProtrusion';
import { freeDimValue } from './freeDim';

/** Názvy kót výstupku na konci stěny (NumPad, hlášení zámku). */
export const END_DIM_LABEL: Record<EndDim, string> = {
  along0: 'podél líce',
  along1: 'podél protějšího líce',
  over: 'přesah za čelo',
  depth0: 'hloubka od líce',
  depth1: 'hloubka od protějšího líce'
};

/** Kóta (to, co se zadává v NumPadu). */
export type DimTarget =
  | { kind: 'wall-length'; wallId: Id; move: MoveTarget }
  /** `move` = z panelu otvoru: posunout jen otvor (z řetězové kóty posune poslední úsek k B otvory k rohu A, stěnu prodlouží jen při zámcích až k rohu A – core/openingChain.ts). */
  | { kind: 'opening-offset'; openingId: Id; ref: 'a' | 'b'; move?: true }
  | { kind: 'opening-width'; openingId: Id }
  | { kind: 'opening-gap'; firstId: Id; secondId: Id }
  /** Rozměr ostění: hloubka, šířka vlevo/vpravo, výška nahoře. */
  | { kind: 'opening-reveal'; openingId: Id; part: RevealPart }
  /** Vzepětí obloukové stěny. */
  | { kind: 'wall-sagitta'; wallId: Id }
  /** Průměr kruhové stěny. */
  | { kind: 'circle-diameter'; wallId: Id }
  /** Tloušťka stěny (čára líce zůstane na místě). */
  | { kind: 'wall-thickness'; wallId: Id }
  /** Míra líce stěny s osou uprostřed (face 0/1 = `WallBody.faces`); délka osy se dopočítá (2b). */
  | { kind: 'wall-face-length'; wallId: Id; face: 0 | 1 }
  /** Odstup skupiny stěn (např. sloupu) od nejbližší stěny mimo skupinu; zadáním se skupina posune. */
  | { kind: 'comp-gap'; wallId: Id; side: Side }
  /** Kóta výstupku: šířka, hloubka, odstup před / za (od souseda nebo konce stěny). */
  | { kind: 'protrusion-dim'; protrusionId: Id; dim: ProtrusionDim }
  /** Poloha napojení na průběžné stěně: od předchozího napojení / rohu A ('prev') nebo k rohu B ('next'). */
  | { kind: 'junction-gap'; wallId: Id; nodeId: Id; to: 'prev' | 'next' }
  /** Vzepětí oblouku v obrysu výstupku (úsek `seg`). */
  | { kind: 'protrusion-sagitta'; protrusionId: Id; seg: number }
  /** Kóta výstupku v rohu: podél líce 1. stěny ('a') / 2. stěny ('b') od rohu. */
  | { kind: 'corner-dim'; protrusionId: Id; dim: 'a' | 'b' }
  /** Kóta výstupku na konci stěny: podél líců, přesah za čelo, hloubka od líců. */
  | { kind: 'end-dim'; protrusionId: Id; dim: EndDim }
  /** Volná kóta (core/freeDim.ts); `move` = konec, který se zadáním posune (pro zámek nezáleží). */
  | { kind: 'free-dim'; dimId: Id; move: 'a' | 'b' }
  /** Kóta schodiště: délka / šířka ramene, hloubka podesty před ramenem (core/stairs.ts; mění jen schodiště). */
  | { kind: 'stair-dim'; stairId: Id; flightId: Id; dim: StairDim };

/** Jednoznačný klíč kóty (u délky stěny nezáleží na tom, který roh se posouvá). */
export function dimKey(t: DimTarget): string {
  switch (t.kind) {
    case 'wall-length':
    case 'wall-sagitta':
    case 'circle-diameter':
    case 'wall-thickness':
      return `${t.kind}:${t.wallId}`;
    case 'wall-face-length':
      return `${t.kind}:${t.wallId}:${t.face}`;
    case 'comp-gap':
      return `${t.kind}:${t.wallId}:${t.side}`;
    case 'opening-offset':
      return `${t.kind}:${t.openingId}:${t.ref}`;
    case 'opening-width':
      return `${t.kind}:${t.openingId}`;
    case 'opening-gap':
      return `${t.kind}:${t.firstId}:${t.secondId}`;
    case 'opening-reveal':
      return `${t.kind}:${t.openingId}:${t.part}`;
    case 'protrusion-dim':
    case 'corner-dim':
    case 'end-dim':
      return `${t.kind}:${t.protrusionId}:${t.dim}`;
    case 'protrusion-sagitta':
      return `${t.kind}:${t.protrusionId}:${t.seg}`;
    case 'junction-gap':
      return `${t.kind}:${t.wallId}:${t.nodeId}:${t.to}`;
    case 'free-dim':
      return `${t.kind}:${t.dimId}`;
    case 'stair-dim':
      return `${t.kind}:${t.stairId}:${t.flightId}:${t.dim}`;
  }
}

/** Existují ještě prvky, ke kterým kóta patří? (Smazaný prvek bere zámek s sebou.) */
export function ownersExist(floor: Floor, t: DimTarget): boolean {
  switch (t.kind) {
    case 'opening-offset':
    case 'opening-width':
    case 'opening-reveal':
      return !!floor.openings[t.openingId];
    case 'opening-gap':
      return !!floor.openings[t.firstId] && !!floor.openings[t.secondId];
    case 'protrusion-dim':
    case 'protrusion-sagitta':
      return !!floor.protrusions?.[t.protrusionId];
    case 'corner-dim':
      return !!floor.cornerProtrusions?.[t.protrusionId];
    case 'end-dim':
      return !!floor.endProtrusions?.[t.protrusionId];
    case 'junction-gap':
      return !!floor.walls[t.wallId] && !!floor.nodes[t.nodeId];
    case 'free-dim':
      return !!floor.dims?.[t.dimId];
    case 'stair-dim':
      return !!floor.stairs?.[t.stairId]?.flights.some(f => f.id === t.flightId);
    default:
      return !!floor.walls[t.wallId];
  }
}

/** Skutečná hodnota kóty z výkresu (mm, nezaokrouhlená); null = kóta teď neexistuje. */
export function dimValue(floor: Floor, t: DimTarget): number | null {
  switch (t.kind) {
    case 'wall-length': {
      const w = floor.walls[t.wallId];
      return w ? wallLength(floor, w) : null;
    }
    case 'opening-offset': {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return null;
      const len = wallLength(floor, wall);
      const start = openingStartFromA(op, len);
      return t.ref === 'a' ? start : len - start - openingSpan(op);
    }
    case 'opening-width':
      return floor.openings[t.openingId]?.width ?? null;
    case 'opening-reveal': {
      const op = floor.openings[t.openingId];
      return op ? revealPartValue(floor, op, t.part) : null;
    }
    case 'opening-gap': {
      const a = floor.openings[t.firstId];
      const b = floor.openings[t.secondId];
      const wall = a && floor.walls[a.wallId];
      if (!a || !b || !wall || b.wallId !== a.wallId) return null;
      const len = wallLength(floor, wall);
      return openingStartFromA(b, len) - (openingStartFromA(a, len) + openingSpan(a));
    }
    case 'wall-sagitta': {
      const w = floor.walls[t.wallId];
      return w ? Math.abs(arcChain(floor, w.id)?.sagitta ?? w.sagitta ?? 0) : null;
    }
    case 'circle-diameter': {
      const w = floor.walls[t.wallId];
      return w?.radius !== undefined ? w.radius * 2 : null;
    }
    case 'wall-thickness':
      return floor.walls[t.wallId]?.thickness ?? null;
    case 'wall-face-length':
      return faceLength(floor, t.wallId, t.face);
    case 'comp-gap':
      return componentGap(floor, t.wallId, t.side)?.value ?? null;
    case 'protrusion-dim': {
      const p = floor.protrusions?.[t.protrusionId];
      const d = p && protrusionDims(floor, p);
      return d ? d[t.dim] : null;
    }
    case 'protrusion-sagitta': {
      const pt = floor.protrusions?.[t.protrusionId]?.pts[t.seg];
      return pt ? Math.abs(pt.s ?? 0) : null;
    }
    case 'corner-dim': {
      const cp = floor.cornerProtrusions?.[t.protrusionId];
      return cp ? cornerDims(cp)[t.dim] : null;
    }
    case 'end-dim': {
      const ep = floor.endProtrusions?.[t.protrusionId];
      return ep ? endDims(ep)[t.dim] : null;
    }
    case 'free-dim':
      return freeDimValue(floor, t.dimId);
    case 'stair-dim': {
      const st = floor.stairs?.[t.stairId];
      return st ? stairDimValue(st, t.flightId, t.dim) : null;
    }
    case 'junction-gap': {
      const w = floor.walls[t.wallId];
      const a = w && floor.nodes[w.a];
      const b = w && floor.nodes[w.b];
      const chain = hostedChain(floor, t.wallId);
      const i = chain.findIndex(c => c.nodeId === t.nodeId);
      if (!a || !b || i < 0) return null;
      const at = chain[i]!.at;
      return t.to === 'prev' ? at - (chain[i - 1]?.at ?? 0) : (chain[i + 1]?.at ?? Math.hypot(b.x - a.x, b.y - a.y)) - at;
    }
  }
}

export function isDimLocked(floor: Floor, t: DimTarget): boolean {
  return !!floor.dimLocks?.[dimKey(t)];
}

/** Je zamčená délka stěny? (řešič délek – zamčená stěna drží roh) */
export function isWallLengthLocked(floor: Floor, wallId: Id): boolean {
  return !!floor.dimLocks?.[`wall-length:${wallId}`];
}

/** Zamkne / odemkne kótu (mění `floor`). */
export function setLock(floor: Floor, t: DimTarget, on: boolean): void {
  const key = dimKey(t);
  if (on) {
    const stored: DimTarget = t.kind === 'wall-length' ? { ...t, move: 'both' } : { ...t };
    floor.dimLocks = { ...(floor.dimLocks ?? {}), [key]: stored };
  } else if (floor.dimLocks?.[key]) {
    delete floor.dimLocks[key];
    if (Object.keys(floor.dimLocks).length === 0) delete floor.dimLocks;
  }
}

/**
 * Od čeho se kóta měří, pokud to není pevný roh stěny: poloha napojení od sousedního napojení, odstup výstupku
 * od sousedního výstupku. Když se soused změní (přibude / zmizí jiné napojení či výstupek), je to jiná kóta –
 * původní zámek zaniká (`reboundLocks`), úpravu nezastaví.
 */
function dimAnchor(floor: Floor, t: DimTarget): string {
  if (t.kind === 'junction-gap') {
    const chain = hostedChain(floor, t.wallId);
    const i = chain.findIndex(c => c.nodeId === t.nodeId);
    if (i < 0) return '';
    return t.to === 'prev' ? (chain[i - 1]?.nodeId ?? 'A') : (chain[i + 1]?.nodeId ?? 'B');
  }
  if (t.kind === 'protrusion-dim' && (t.dim === 'before' || t.dim === 'after')) {
    const p = floor.protrusions?.[t.protrusionId];
    if (!p) return '';
    const nb = protrusionNeighbors(floor, p);
    return t.dim === 'before' ? (nb.before?.id ?? 'A') : (nb.after?.id ?? 'B');
  }
  return '';
}

/** Zámky kót, které úprava `before` → `after` „přepojila“ na jiného souseda (původní kóta už neexistuje). */
export function reboundLocks(before: Floor | undefined, after: Floor): string[] {
  if (!before?.dimLocks || !after.dimLocks) return [];
  return Object.entries(after.dimLocks)
    .filter(([key, t]) => before.dimLocks?.[key] && ownersExist(after, t) && dimAnchor(before, t) !== dimAnchor(after, t))
    .map(([key]) => key);
}

/** Tolerance porušení zámku (mm). */
const LOCK_TOL = 0.5;

/**
 * První zamčená kóta, kterou úprava `before` → `after` změnila (hodnota jiná o víc než 0,5 mm, nebo kóta zmizela,
 * i když její prvky zůstaly). Kóty smazaných prvků a kóty v `after` odemčené se nekontrolují. `allowKey` = kóta,
 * kterou uživatel právě vědomě přepisuje (NumPad po potvrzení).
 */
export function lockViolation(before: Floor | undefined, after: Floor, allowKey?: string, skip?: (key: string) => boolean): DimTarget | null {
  const locks = before?.dimLocks;
  if (!before || !locks) return null;
  for (const [key, t] of Object.entries(locks)) {
    if (key === allowKey || skip?.(key) || !after.dimLocks?.[key] || !ownersExist(after, t)) continue;
    if (dimAnchor(before, t) !== dimAnchor(after, t)) continue; // jiný soused = jiná kóta (reboundLocks)
    const v0 = dimValue(before, t);
    if (v0 === null) continue;
    const v1 = dimValue(after, t);
    if (v1 === null || Math.abs(v1 - v0) > LOCK_TOL) return t;
  }
  return null;
}

/** Zámky kót, jejichž prvky už neexistují (úklid po smazání / rozdělení). */
export function pruneLocks(floor: Floor): void {
  if (!floor.dimLocks) return;
  for (const [key, t] of Object.entries(floor.dimLocks)) if (!ownersExist(floor, t)) delete floor.dimLocks[key];
  if (Object.keys(floor.dimLocks).length === 0) delete floor.dimLocks;
}

/** Popis kóty pro hlášení („délka stěny 4500 mm“). */
export function describeDim(floor: Floor, t: DimTarget): string {
  const v = dimValue(floor, t);
  const num = v === null ? '' : ` ${Math.round(v)} mm`;
  const opNo = (id: Id) => floor.openings[id]?.number || 'otvoru';
  const name = ((): string => {
    switch (t.kind) {
      case 'wall-length':
        return 'délka stěny';
      case 'wall-thickness':
        return 'tloušťka stěny';
      case 'wall-sagitta':
        return 'vzepětí oblouku';
      case 'circle-diameter':
        return 'průměr kruhu';
      case 'wall-face-length':
        return 'délka líce stěny';
      case 'comp-gap':
        return 'odstup skupiny stěn';
      case 'opening-offset':
        return `odstup ${opNo(t.openingId)}`;
      case 'opening-width':
        return `šířka ${opNo(t.openingId)}`;
      case 'opening-gap':
        return `mezera ${opNo(t.firstId)}–${opNo(t.secondId)}`;
      case 'opening-reveal':
        return `ostění ${opNo(t.openingId)}`;
      case 'protrusion-dim':
        return t.dim === 'width' ? 'šířka výstupku' : t.dim === 'depth' ? 'hloubka výstupku' : 'odstup výstupku';
      case 'protrusion-sagitta':
        return 'vzepětí výstupku';
      case 'corner-dim':
        return `výstupek v rohu podél ${t.dim === 'a' ? '1.' : '2.'} stěny`;
      case 'end-dim':
        return `výstupek na konci – ${END_DIM_LABEL[t.dim]}`;
      case 'junction-gap':
        return 'poloha napojení';
      case 'free-dim':
        return 'kóta';
      case 'stair-dim':
        return t.dim === 'length' ? 'délka ramene' : t.dim === 'width' ? 'šířka ramene' : 'hloubka podesty';
    }
  })();
  return name + num;
}

/**
 * Kóty stěny pro hromadné zamknutí – ty, které jsou u vybrané stěny vidět na výkresu (aby každý zámek měl ikonu):
 * délka (průměr kruhu), vzepětí, tloušťka, řetěz otvorů včetně ostění vlevo / vpravo a zárubně dveří, polohy napojení.
 * Kóty viditelné jen u jiného vybraného prvku (hloubky ostění, výstupky, líce u osy uprostřed) se zamykají jednotlivě.
 */
export function wallDimTargets(floor: Floor, wallId: Id): DimTarget[] {
  const w = floor.walls[wallId];
  if (!w) return [];
  const out: DimTarget[] = [];
  if (w.radius !== undefined) out.push({ kind: 'circle-diameter', wallId });
  else {
    out.push({ kind: 'wall-length', wallId, move: 'both' });
    if (w.sagitta) out.push({ kind: 'wall-sagitta', wallId });
  }
  if (hasBody(w)) out.push({ kind: 'wall-thickness', wallId });
  const placed = openingsOnWall(floor, w);
  placed.forEach((po, i) => {
    const prev = placed[i - 1];
    out.push(prev ? { kind: 'opening-gap', firstId: prev.op.id, secondId: po.op.id } : { kind: 'opening-offset', openingId: po.op.id, ref: 'a' });
    out.push({ kind: 'opening-width', openingId: po.op.id });
    for (const part of ['left', 'right'] as const) if (po.op.reveal && po.op.kind !== 'niche') out.push({ kind: 'opening-reveal', openingId: po.op.id, part });
    if (po.op.kind === 'door' && po.op.frame?.width) out.push({ kind: 'opening-reveal', openingId: po.op.id, part: 'frameWidth' });
  });
  if (placed.length) out.push({ kind: 'opening-offset', openingId: placed[placed.length - 1]!.op.id, ref: 'b' });
  const chain = hostedChain(floor, wallId);
  chain.forEach(c => out.push({ kind: 'junction-gap', wallId, nodeId: c.nodeId, to: 'prev' }));
  if (chain.length) out.push({ kind: 'junction-gap', wallId, nodeId: chain[chain.length - 1]!.nodeId, to: 'next' });
  return out.filter(t => dimValue(floor, t) !== null);
}

/**
 * Stěny obrysu místnosti: nejmenší uzavřený obrys stěn kolem bodu (štítku místnosti).
 * Paprsek z bodu doprava protne úseky stěn; od nejbližšího se obchází obrys (vždy co nejostřeji ke straně bodu,
 * na volném konci příčky zpět) a přijme se první obrys, který bod opravdu obsahuje (sloup napravo se přeskočí).
 * Kruhová místnost = nejmenší kruh kolem bodu. Oblouky se berou jako tětivy. Prázdné pole = žádný uzavřený obrys.
 */
export function roomWallIds(floor: Floor, p: Pt): Id[] {
  const segs = wallSegments(floor).filter(s => s.from !== s.to);
  type Dir = { from: Id; to: Id; fromPt: Pt; toPt: Pt; wallId: Id };
  const fwd = (s: (typeof segs)[number]): Dir => ({ from: s.from, to: s.to, fromPt: s.fromPt, toPt: s.toPt, wallId: s.wall.id });
  const rev = (d: Dir): Dir => ({ from: d.to, to: d.from, fromPt: d.toPt, toPt: d.fromPt, wallId: d.wallId });
  const cross = (a: Pt, b: Pt, q: Pt) => (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
  const hits = segs
    .map(s => {
      const { fromPt: a, toPt: b } = s;
      if ((a.y > p.y) === (b.y > p.y)) return null;
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      return x > p.x ? { s, x } : null;
    })
    .filter((h): h is { s: (typeof segs)[number]; x: number } => h !== null)
    .sort((h, k) => h.x - k.x);

  for (const { s: s0 } of hits) {
    const start = cross(s0.fromPt, s0.toPt, p) < 0 ? fwd(s0) : rev(fwd(s0));
    const walls = new Set<Id>();
    const poly: Pt[] = [];
    let cur = start;
    let closed = false;
    for (let guard = 0; guard < segs.length * 2 + 2; guard++) {
      walls.add(cur.wallId);
      poly.push(cur.fromPt);
      const din = { x: cur.toPt.x - cur.fromPt.x, y: cur.toPt.y - cur.fromPt.y };
      let next: Dir | null = null;
      let best = Infinity;
      for (const s of segs) {
        const d = s.from === cur.to ? fwd(s) : s.to === cur.to ? rev(fwd(s)) : null;
        if (!d || (d.to === cur.from && d.wallId === cur.wallId)) continue; // zpět po stejném úseku jen na volném konci
        const dout = { x: d.toPt.x - d.fromPt.x, y: d.toPt.y - d.fromPt.y };
        // bod leží vlevo od směru (záporný vektorový součin, y dolů) → co nejostřeji doleva = nejmenší úhel
        const turn = Math.atan2(din.x * dout.y - din.y * dout.x, din.x * dout.x + din.y * dout.y);
        if (turn < best) {
          best = turn;
          next = d;
        }
      }
      next ??= rev(cur); // volný konec příčky – obejít ji zpět
      if (next.from === start.from && next.to === start.to && next.wallId === start.wallId) {
        closed = true;
        break;
      }
      cur = next;
    }
    if (closed && pointInPolygon(p, poly)) return [...walls];
  }
  // kruhová místnost
  const circles = Object.values(floor.walls)
    .filter(w => w.radius !== undefined && floor.nodes[w.a] && Math.hypot(p.x - floor.nodes[w.a]!.x, p.y - floor.nodes[w.a]!.y) < w.radius)
    .sort((a, b) => a.radius! - b.radius!);
  return circles[0] ? [circles[0].id] : [];
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}
