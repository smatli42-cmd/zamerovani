/**
 * Volné prvky výkresu = prvky bez vazby na graf stěn: štítek místnosti, text, kresba, volná kóta (a další).
 * JEDINÉ místo, kde se pro ně určuje mazání, kopie, posun a otočení skupiny a výběr obdélníkem.
 * Akce (store/actions) jen procházejí `LOOSE_KINDS`. **Nový volný prvek přidat jen sem** (+ výběr ťuknutím
 * v tools/pick.ts, kreslení v canvas/renderer.ts).
 *
 * Stěny, rohy, otvory a výstupky mají vlastní pravidla vázaná na stěnu (F4, keepOpenings…) a sem nepatří.
 */
import type { Floor, Id, Pt } from '../model/types';
import { newId } from '../model/factory';
import { drawingExtentPoints, drawingPolylines, placeDrawing, rotateDrawing } from './drawing';
import { copyDimEnd, type CopyMaps } from './dimRefs';
import { dimLine, dimPoints } from './freeDim';
import { inRect, polylinesInRect, segHitsRect, type Rect } from './rect';
import { stairOutlines, stairPoints } from './stairs';
import { dimKey } from './dimLock';

export type LooseKindId = 'room' | 'text' | 'drawing' | 'stair' | 'dim';

/**
 * Přemístění skupiny: `pt` = bod zaokrouhlený na mm (rohy, štítky), `exact` = přesně (kresba – obdélník
 * po otočení zůstane obdélníkem), `deg` = otočení ve stupních (posun = 0).
 */
export interface Transform {
  pt(p: Pt): Pt;
  exact(p: Pt): Pt;
  deg: number;
}

/** Kopie výběru: odsazení kopie a nová id kopírovaných prvků (kóty se přepojí na kopie). */
export interface CopyContext {
  /** Výkres před kopií (měřené body kót: kopie může dočasně zneplatnit roh originálu). */
  before: Floor;
  shift(p: Pt): Pt;
  maps: CopyMaps & { drawings: Map<Id, Id>; stairs: Map<Id, Id> };
}

export interface LooseKind {
  kind: LooseKindId;
  /** Smazání prvku. */
  remove(floor: Floor, id: Id): void;
  /** Výchozí poloha pro posun / otočení skupiny (null = prvek neexistuje nebo nemá co posunout). */
  capture(floor: Floor, id: Id): unknown;
  /** Přemístí prvek z výchozí polohy `snap` (z `capture`). */
  place(floor: Floor, id: Id, snap: unknown, t: Transform): void;
  /** Body pro střed otočení skupiny. */
  extent(floor: Floor, id: Id): Pt[];
  /** Id prvků, které leží v obdélníku (okno / křížení). */
  inRect(floor: Floor, r: Rect, crossing: boolean): Id[];
  /** Kopie prvku (vrací id kopie). Kopíruje se v pořadí `LOOSE_KINDS` (kóty až po kresbě). */
  copy(floor: Floor, id: Id, ctx: CopyContext): Id | null;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const xy = (p: Pt): Pt => ({ x: p.x, y: p.y });

const room: LooseKind = {
  kind: 'room',
  remove: (f, id) => void delete f.rooms[id],
  capture: (f, id) => (f.rooms[id] ? xy(f.rooms[id]!) : null),
  place: (f, id, snap, t) => void (f.rooms[id] && Object.assign(f.rooms[id]!, t.pt(snap as Pt))),
  extent: (f, id) => (f.rooms[id] ? [xy(f.rooms[id]!)] : []),
  inRect: (f, r) => Object.values(f.rooms).filter(x => inRect(r, x)).map(x => x.id),
  copy: (f, id, ctx) => {
    const src = f.rooms[id];
    if (!src) return null;
    const r = { ...clone(src), id: newId('rm'), ...ctx.shift(src) };
    f.rooms[r.id] = r;
    return r.id;
  },
};

const text: LooseKind = {
  kind: 'text',
  remove: (f, id) => void delete f.texts[id],
  capture: (f, id) => {
    const t = f.texts[id];
    return t ? { at: xy(t), leader: t.leader ? xy(t.leader) : undefined, angle: t.angle } : null;
  },
  place: (f, id, snap, tr) => {
    const t = f.texts[id];
    const s = snap as { at: Pt; leader?: Pt; angle: number };
    if (!t) return;
    Object.assign(t, tr.pt(s.at));
    if (s.leader) t.leader = tr.pt(s.leader);
    if (tr.deg) t.angle = (((s.angle + tr.deg) % 360) + 360) % 360;
  },
  extent: (f, id) => (f.texts[id] ? [xy(f.texts[id]!)] : []),
  inRect: (f, r) => Object.values(f.texts).filter(x => inRect(r, x)).map(x => x.id),
  copy: (f, id, ctx) => {
    const src = f.texts[id];
    if (!src) return null;
    const t = { ...clone(src), id: newId('tx'), ...ctx.shift(src) };
    if (t.leader) t.leader = ctx.shift(t.leader);
    f.texts[t.id] = t;
    return t.id;
  },
};

const drawing: LooseKind = {
  kind: 'drawing',
  remove: (f, id) => void (f.drawings && delete f.drawings[id]),
  capture: (f, id) => f.drawings?.[id]?.pts.map(xy) ?? null,
  place: (f, id, snap, t) => {
    const d = f.drawings?.[id];
    if (!d) return;
    const from = snap as Pt[];
    if (t.deg) {
      placeDrawing(d, from, 0, 0);
      rotateDrawing(d, t.exact);
    } else {
      const o = t.exact({ x: 0, y: 0 });
      placeDrawing(d, from, o.x, o.y);
    }
  },
  extent: (f, id) => (f.drawings?.[id] ? drawingExtentPoints(f.drawings[id]!) : []),
  inRect: (f, r, crossing) => Object.values(f.drawings ?? {}).filter(d => polylinesInRect(r, drawingPolylines(d), crossing)).map(d => d.id),
  copy: (f, id, ctx) => {
    const src = f.drawings?.[id];
    if (!src) return null;
    const d = { ...clone(src), id: newId('dr') };
    for (const p of d.pts) Object.assign(p, ctx.shift(p));
    f.drawings![d.id] = d;
    ctx.maps.drawings.set(id, d.id);
    return d.id;
  },
};

/** Schodiště: posouvají / otáčejí se všechny jeho body (rozměry ramen zůstanou). */
const stair: LooseKind = {
  kind: 'stair',
  remove: (f, id) => void (f.stairs && delete f.stairs[id]),
  capture: (f, id) => (f.stairs?.[id] ? stairPoints(f.stairs[id]!).map(xy) : null),
  place: (f, id, snap, t) => {
    const s = f.stairs?.[id];
    if (!s) return;
    const from = snap as Pt[];
    stairPoints(s).forEach((p, i) => from[i] && Object.assign(p, t.exact(from[i]!)));
  },
  extent: (f, id) => (f.stairs?.[id] ? stairPoints(f.stairs[id]!).map(xy) : []),
  inRect: (f, r, crossing) => Object.values(f.stairs ?? {}).filter(s => polylinesInRect(r, stairOutlines(s).map(pl => [...pl, pl[0]!]), crossing)).map(s => s.id),
  copy: (f, id, ctx) => {
    const src = f.stairs?.[id];
    if (!src) return null;
    const s = { ...clone(src), id: newId('st') };
    ctx.maps.stairs.set(id, s.id); // kóty k rohům / hranám schodiště se přepojí na kopii
    for (const p of stairPoints(s)) Object.assign(p, ctx.shift(p));
    const fmap = new Map<Id, Id>();
    for (const fl of s.flights) {
      const nid = newId('sf');
      fmap.set(fl.id, nid);
      fl.id = nid;
    }
    for (const l of s.landings) l.id = newId('sl');
    (f.stairs ??= {})[s.id] = s;
    // posunutá čísla kót schodiště jedou s kopií (core/dimPlace.ts); zámky se nekopírují
    for (const pl of Object.values(f.dimPlace ?? {})) {
      const o = pl.owner;
      if (o.kind !== 'stair-dim' || o.stairId !== id || !fmap.has(o.flightId)) continue;
      const owner = { ...o, stairId: s.id, flightId: fmap.get(o.flightId)! };
      f.dimPlace![dimKey(owner)] = { ...clone(pl), owner };
    }
    return s.id;
  },
};

/** Volná kóta: posouvají se jen pevné body; konce na prvcích jedou s prvkem samy. */
const dim: LooseKind = {
  kind: 'dim',
  remove: (f, id) => void (f.dims && delete f.dims[id]),
  capture: (f, id) => {
    const d = f.dims?.[id];
    if (!d) return null;
    const fixed: { a?: Pt; b?: Pt } = {};
    for (const k of ['a', 'b'] as const) {
      const e = d[k];
      if ('x' in e) fixed[k] = xy(e);
    }
    return fixed.a || fixed.b ? fixed : null;
  },
  place: (f, id, snap, t) => {
    const d = f.dims?.[id];
    const fixed = snap as { a?: Pt; b?: Pt };
    for (const k of ['a', 'b'] as const) if (d && fixed[k] && 'x' in d[k]) d[k] = t.pt(fixed[k]!);
  },
  extent: (f, id) => {
    const d = f.dims?.[id];
    if (!d) return [];
    return (['a', 'b'] as const).flatMap(k => ('x' in d[k] ? [xy(d[k] as Pt)] : []));
  },
  // okno = měřené body i kótovací čára uvnitř; křížení = obdélník se dotkne kótovací nebo vynášecí čáry
  inRect: (f, r, crossing) =>
    Object.values(f.dims ?? {})
      .filter(d => {
        const pts = dimPoints(f, d);
        const line = dimLine(f, d);
        if (!pts || !line) return false;
        const segs: [Pt, Pt][] = [line, [pts[0], line[0]], [pts[1], line[1]]];
        return crossing ? segs.some(([p, q]) => segHitsRect(r, p, q)) : [...pts, ...line].every(p => inRect(r, p));
      })
      .map(d => d.id),
  // konec na kopírovaném prvku jede s kopií, jinak se z něj stane pevný bod (core/dimRefs.ts)
  copy: (f, id, ctx) => {
    const d = f.dims?.[id];
    const orig = ctx.before.dims?.[id];
    const pts = orig && dimPoints(ctx.before, orig);
    if (!d || !pts) return null;
    const nd = { id: newId('dim'), a: copyDimEnd(d.a, ctx.maps, ctx.shift(pts[0])), b: copyDimEnd(d.b, ctx.maps, ctx.shift(pts[1])), offset: d.offset };
    f.dims![nd.id] = nd;
    // posun čísla podél (core/dimPlace.ts) jede s kopií; zámek se nekopíruje (jako u ostatních kót)
    const place = f.dimPlace?.[`free-dim:${d.id}`];
    if (place) f.dimPlace![`free-dim:${nd.id}`] = { ...clone(place), owner: { ...place.owner, dimId: nd.id } as typeof place.owner };
    return nd.id;
  },
};

/** Všechny volné prvky; pořadí = pořadí kopírování (kóta až po prvcích, ke kterým může vést). */
export const LOOSE_KINDS: readonly LooseKind[] = [room, text, drawing, stair, dim];

export const looseKind = (kind: string): LooseKind | undefined => LOOSE_KINDS.find(k => k.kind === kind);
