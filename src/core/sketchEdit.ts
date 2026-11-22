/**
 * Úpravy tvarů skici tažením (přání uživatele 2026-11-22: „nakreslit cokoliv jako v jiném programu“, skica není
 * v měřítku – rozměry jen tažením). JEDINÉ místo pro úchyty, přichytávání a kopii prvků skici; geometrie tvarů
 * v core/sketch.ts.
 *
 * Úchyty vybraného prvku (`sketchHandles`, tažení `dragSketchHandle`):
 * - čára, kóta: oba konce;
 * - dvojitá čára: oba konce + vzdálenost čar (úchyt uprostřed druhé čáry, přes první čáru se druhá přeloží);
 * - oblouk: oba konce (vzepětí zůstane) + vrchol (velikost oblouku, přes tětivu se obrátí);
 * - obdélník: 4 rohy (protější roh stojí) + 4 strany (jen ta strana);
 * - kruh: 4 body na obvodu (poloměr, střed stojí);
 * - tah perem: 4 rohy ohraničení (zvětšení / zmenšení / natažení, protější roh stojí);
 * - text: pravý dolní roh rámečku (velikost písma).
 * Přichytávání (`sketchSnap`): koncové a význačné body ostatních prvků (konce, rohy, středy, vrchol oblouku),
 * jinak bod na čáře – při kreslení tvaru / kóty i při tažení úchytu.
 */
import type { MarkPage, Pt, SketchStroke } from '../model/types';
import { add, dot, normal, projectToSegment, scale, sub, unit } from './geometry';
import { labelBox, SKETCH_DOUBLE_W, sketchPolylines, type SketchRef } from './sketch';

export type SketchHandleKind = 'point' | 'size';
/** Úchyt: `point` = bod tvaru (čtverec), `size` = velikost (kroužek – vrchol oblouku, vzdálenost čar, písmo). */
export interface SketchHandle {
  id: string;
  at: Pt;
  kind: SketchHandleKind;
}

const R = (v: number): number => Math.round(v * 10) / 10;
const RP = (p: Pt): Pt => ({ x: R(p.x), y: R(p.y) });
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Normála tětivy a→b (stejná jako u vzepětí oblouku a odsazení dvojité čáry); null = nulová délka. */
const chordNormal = (a: Pt, b: Pt): Pt | null => (len(a, b) < 1e-6 ? null : normal(unit(a, b)));

/** Ohraničení bodů. */
function bbox(pts: readonly Pt[]): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: Math.min(...pts.map(p => p.x)),
    y1: Math.min(...pts.map(p => p.y)),
    x2: Math.max(...pts.map(p => p.x)),
    y2: Math.max(...pts.map(p => p.y))
  };
}

function strokeHandles(st: SketchStroke): SketchHandle[] {
  const [a, b] = st.pts;
  if (!a) return [];
  const P = (id: string, at: Pt): SketchHandle => ({ id, at, kind: 'point' });
  const S = (id: string, at: Pt): SketchHandle => ({ id, at, kind: 'size' });
  switch (st.mode) {
    case 'line':
      return b ? [P('a', a), P('b', b)] : [];
    case 'double': {
      const n = b && chordNormal(a, b);
      if (!b || !n) return [];
      return [P('a', a), P('b', b), S('w', add(mid(a, b), scale(n, st.w ?? SKETCH_DOUBLE_W)))];
    }
    case 'arc': {
      const n = b && chordNormal(a, b);
      if (!b || !n) return [];
      return [P('a', a), P('b', b), S('s', add(mid(a, b), scale(n, st.s ?? 0)))];
    }
    case 'rect': {
      if (!b) return [];
      const c = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      return [...c.map((q, i) => P(`c${i}`, q)), ...c.map((q, i) => P(`e${i}`, mid(q, c[(i + 1) % 4]!)))];
    }
    case 'circle': {
      if (!b) return [];
      const r = len(a, b);
      return [0, 1, 2, 3].map(i => P(`q${i}`, { x: a.x + r * Math.cos((i * Math.PI) / 2), y: a.y + r * Math.sin((i * Math.PI) / 2) }));
    }
    case 'free': {
      if (st.pts.length < 2) return [];
      const r = bbox(st.pts);
      if (r.x2 - r.x1 < 1 && r.y2 - r.y1 < 1) return [];
      return [
        { x: r.x1, y: r.y1 },
        { x: r.x2, y: r.y1 },
        { x: r.x2, y: r.y2 },
        { x: r.x1, y: r.y2 }
      ].map((q, i) => P(`f${i}`, q));
    }
  }
}

/** Úchyty prvku skici (prázdné = jen posun celku). */
export function sketchHandles(page: MarkPage, ref: SketchRef): SketchHandle[] {
  if (ref.kind === 'stroke') {
    const st = page.strokes[ref.index];
    return st ? strokeHandles(st) : [];
  }
  if (ref.kind === 'dim') {
    const d = page.dims[ref.index];
    return d ? [{ id: 'a', at: d.a, kind: 'point' }, { id: 'b', at: d.b, kind: 'point' }] : [];
  }
  const l = page.labels[ref.index];
  if (!l) return [];
  const box = labelBox(l.text, l.x, l.y, l.k);
  return [{ id: 'k', at: { x: box.x + box.w, y: box.y + box.h }, kind: 'size' }];
}

/** Úchyty se ukazují (a dají chytit) jen u výběru do tolika prvků – u velkého výběru jen posun celku. */
export const SKETCH_HANDLES_MAX = 30;

/** Úchyty všech vybraných prvků (prázdné u velkého výběru). */
export function selectionHandles(page: MarkPage, refs: readonly SketchRef[]): SketchHandle[] {
  return refs.length <= SKETCH_HANDLES_MAX ? refs.flatMap(r => sketchHandles(page, r)) : [];
}

/** Úchyt pod bodem u vybraných prvků (poslední vybraný má přednost); `at` = poloha úchytu. */
export function hitSketchHandle(page: MarkPage, refs: readonly SketchRef[], at: Pt, tol: number): { ref: SketchRef; id: string; at: Pt } | null {
  if (refs.length > SKETCH_HANDLES_MAX) return null;
  for (let k = refs.length - 1; k >= 0; k--) {
    const ref = refs[k]!;
    let best: { id: string; at: Pt; d: number } | null = null;
    for (const h of sketchHandles(page, ref)) {
      const d = len(h.at, at);
      if (d <= tol && (!best || d < best.d)) best = { id: h.id, at: h.at, d };
    }
    if (best) return { ref, id: best.id, at: best.at };
  }
  return null;
}

/** Poloha taženého úchytu: úchyt + posun pera od místa chycení (úchyt neskočí pod hrot). */
export const handleTarget = (handleAt: Pt, grab: Pt, p: Pt): Pt => ({ x: handleAt.x + p.x - grab.x, y: handleAt.y + p.y - grab.y });

/** Nový tah po tažení úchytu `id` do bodu `p` (vychází z původního tahu, ne z rozpracovaného). */
function dragStroke(st: SketchStroke, id: string, p: Pt): SketchStroke {
  const [a, b] = st.pts as [Pt, Pt];
  const q = RP(p);
  switch (st.mode) {
    case 'line':
    case 'double':
    case 'arc': {
      if (id === 'a') return { ...st, pts: [q, b] };
      if (id === 'b') return { ...st, pts: [a, q] };
      const n = chordNormal(a, b);
      if (!n) return st;
      const v = R(dot(sub(p, mid(a, b)), n));
      // dvojitá čára: vzdálenost aspoň 1 (přes první čáru se druhá přeloží na druhou stranu)
      if (id === 'w') return { ...st, w: Math.abs(v) < 1 ? (v < 0 ? -1 : 1) : v };
      if (id === 's') return { ...st, s: Math.abs(v) < 1 ? 0 : v };
      return st;
    }
    case 'rect': {
      const na = { ...a };
      const nb = { ...b };
      // rohy: c0 = (a.x, a.y), c1 = (b.x, a.y), c2 = (b.x, b.y), c3 = (a.x, b.y); strany e0 horní … e3 levá (po obvodu)
      const setX = id === 'c0' || id === 'c3' || id === 'e3' ? 'a' : id === 'c1' || id === 'c2' || id === 'e1' ? 'b' : null;
      const setY = id === 'c0' || id === 'c1' || id === 'e0' ? 'a' : id === 'c2' || id === 'c3' || id === 'e2' ? 'b' : null;
      if (setX) (setX === 'a' ? na : nb).x = q.x;
      if (setY) (setY === 'a' ? na : nb).y = q.y;
      return { ...st, pts: [na, nb] };
    }
    case 'circle':
      return len(a, q) < 1 ? st : { ...st, pts: [a, q] };
    case 'free': {
      const r = bbox(st.pts);
      const i = Number(id.slice(1));
      // protější roh stojí; osa s nulovým rozměrem se nemění
      const fx = i === 0 || i === 3 ? r.x2 : r.x1;
      const fy = i === 0 || i === 1 ? r.y2 : r.y1;
      const ox = i === 0 || i === 3 ? r.x1 : r.x2;
      const oy = i === 0 || i === 1 ? r.y1 : r.y2;
      const kx = Math.abs(ox - fx) < 1 ? 1 : (q.x - fx) / (ox - fx);
      const ky = Math.abs(oy - fy) < 1 ? 1 : (q.y - fy) / (oy - fy);
      // stažení do čáry (rozměr pod 1) se neprovede – jinak by v té ose už nešlo zvětšit
      const nw = (r.x2 - r.x1) * Math.abs(kx);
      const nh = (r.y2 - r.y1) * Math.abs(ky);
      if ((r.x2 - r.x1 >= 1 && nw < 1) || (r.y2 - r.y1 >= 1 && nh < 1)) return st;
      return { ...st, pts: st.pts.map(t => RP({ x: fx + (t.x - fx) * kx, y: fy + (t.y - fy) * ky })) };
    }
  }
}

/** Tažení úchytu: nová strana (z původní strany `page`). */
export function dragSketchHandle(page: MarkPage, ref: SketchRef, id: string, p: Pt): MarkPage {
  if (ref.kind === 'stroke') {
    const st = page.strokes[ref.index];
    if (!st || st.pts.length < 2) return page;
    return { ...page, strokes: page.strokes.map((s, i) => (i === ref.index ? dragStroke(st, id, p) : s)) };
  }
  if (ref.kind === 'dim') {
    const q = RP(p);
    return { ...page, dims: page.dims.map((d, i) => (i === ref.index ? (id === 'a' ? { ...d, a: q } : { ...d, b: q }) : d)) };
  }
  const l = page.labels[ref.index];
  if (!l) return page;
  // pravý dolní roh rámečku: šířka rámečku = (znaky · 8,5 + 12) · k, roh = střed + polovina šířky
  const base = Math.max(1, l.text.length) * 8.5 + 12;
  const k = Math.max(0.2, Math.round(((2 * Math.max(p.x - l.x, 1)) / base) * 100) / 100);
  return { ...page, labels: page.labels.map((x, i) => (i === ref.index ? { ...x, k } : x)) };
}

/** Význačné body prvku pro přichytávání (konce, rohy, středy stran, střed kruhu, vrchol oblouku). */
function keyPoints(page: MarkPage, ref: SketchRef): Pt[] {
  if (ref.kind === 'dim') {
    const d = page.dims[ref.index];
    return d ? [d.a, d.b] : [];
  }
  if (ref.kind === 'label') return [];
  const st = page.strokes[ref.index];
  if (!st) return [];
  const [a, b] = st.pts;
  if (st.mode === 'free') return st.pts.length ? [st.pts[0]!, st.pts[st.pts.length - 1]!] : [];
  if (!a || !b) return [];
  if (st.mode === 'circle') return [a, ...strokeHandles(st).map(h => h.at)];
  if (st.mode === 'line') return [a, b, mid(a, b)];
  const pls = sketchPolylines(st);
  if (st.mode === 'double') return [a, b, mid(a, b), ...(pls[1] ? [pls[1][0]!, pls[1][1]!, mid(pls[1][0]!, pls[1][1]!)] : [])];
  return strokeHandles(st).map(h => h.at).concat(st.mode === 'rect' ? [mid(a, b)] : []);
}

const allRefs = (page: MarkPage): SketchRef[] => [
  ...page.strokes.map((_, index) => ({ kind: 'stroke' as const, index })),
  ...page.dims.map((_, index) => ({ kind: 'dim' as const, index }))
];

export interface SketchSnap {
  pt: Pt;
  /** `point` = význačný bod, `on` = bod na čáře. */
  kind: 'point' | 'on';
}

/**
 * Přichycení bodu `p` k ostatním prvkům skici (mimo `skip`): nejbližší význačný bod do `tol`, jinak nejbližší bod
 * na čáře do `tol`; null = nic poblíž.
 */
export function sketchSnap(page: MarkPage, p: Pt, tol: number, skip?: SketchRef): SketchSnap | null {
  const refs = allRefs(page).filter(r => !skip || r.kind !== skip.kind || r.index !== skip.index);
  let best: { pt: Pt; d: number } | null = null;
  for (const r of refs) for (const q of keyPoints(page, r)) {
    const d = len(p, q);
    if (d <= tol && (!best || d < best.d)) best = { pt: q, d };
  }
  if (best) return { pt: RP(best.pt), kind: 'point' };
  for (const r of refs) {
    const pls = r.kind === 'dim' ? [[page.dims[r.index]!.a, page.dims[r.index]!.b]] : sketchPolylines(page.strokes[r.index]!);
    for (const pl of pls) for (let i = 1; i < pl.length; i++) {
      const pr = projectToSegment(p, pl[i - 1]!, pl[i]!);
      if (pr.distance <= tol && (!best || pr.distance < best.d)) best = { pt: pr.point, d: pr.distance };
    }
  }
  return best ? { pt: RP(best.pt), kind: 'on' } : null;
}

/** Přímka / kóta: do 6° od vodorovné / svislé se srovná (krátký tah do 15 ne). */
export function sketchOrtho(a: Pt, p: Pt): Pt {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  if (Math.hypot(dx, dy) <= 15) return p;
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (ang < 6 || Math.abs(ang - 180) < 6) return { x: p.x, y: a.y };
  if (Math.abs(ang - 90) < 6) return { x: a.x, y: p.y };
  return p;
}

/** Kopie vybraných prvků posunutá o (dx, dy) – přidá se na konec; vrací stranu a odkazy na kopie. */
export function copySketchItems(page: MarkPage, refs: readonly SketchRef[], dx: number, dy: number): { page: MarkPage; refs: SketchRef[] } {
  const mv = (q: Pt): Pt => RP({ x: q.x + dx, y: q.y + dy });
  const strokes = refs.filter(r => r.kind === 'stroke' && page.strokes[r.index]).map(r => ({ ...page.strokes[r.index]!, pts: page.strokes[r.index]!.pts.map(mv) }));
  const dims = refs.filter(r => r.kind === 'dim' && page.dims[r.index]).map(r => ({ ...page.dims[r.index]!, a: mv(page.dims[r.index]!.a), b: mv(page.dims[r.index]!.b) }));
  const labels = refs.filter(r => r.kind === 'label' && page.labels[r.index]).map(r => ({ ...page.labels[r.index]!, ...mv(page.labels[r.index]!) }));
  const out: SketchRef[] = [
    ...strokes.map((_, i) => ({ kind: 'stroke' as const, index: page.strokes.length + i })),
    ...dims.map((_, i) => ({ kind: 'dim' as const, index: page.dims.length + i })),
    ...labels.map((_, i) => ({ kind: 'label' as const, index: page.labels.length + i }))
  ];
  return { page: { ...page, strokes: [...page.strokes, ...strokes], dims: [...page.dims, ...dims], labels: [...page.labels, ...labels] }, refs: out };
}
