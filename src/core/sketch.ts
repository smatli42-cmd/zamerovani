/**
 * Skica značky (okno značky, ui/MarkWindow.tsx) – JEDINÉ místo geometrie skici: tvary (pero, čára, obdélník, kruh,
 * oblouk, dvojitá čára – jako kresba ve výkresu, přání uživatele 2026-11-20), zásah perem, posun prvku, guma,
 * výběr obdélníkem a práce s více vybranými prvky (`sketchInRect`, `moveSketchItems`, `removeSketchItems`,
 * `restyleStrokes`), velikost popisků a kót podle zoomu při vzniku (`sketchScale`), druh a tloušťka čáry (`sketchLineWidth`,
 * `restyleStroke`) a orientační kóty na fotce (`dimIsOrient`).
 * Souřadnice skici = px při zoomu 100 %. Kresba skici je jen obrázek – žádné vazby ani přichytávání ke stěnám.
 */
import type { LineStyle, MarkPage, Pt, SketchDim, SketchLabel, SketchStroke } from '../model/types';
import { normal, projectToSegment, scale, add, unit } from './geometry';
import { arcPoints } from './strokes';
import { polylinesInRect, type Rect } from './rect';

/** Výchozí vzdálenost čar dvojité čáry ve skice. */
export const SKETCH_DOUBLE_W = 12;

/** Odkaz na prvek skice. */
export type SketchRef = { kind: 'stroke' | 'label' | 'dim'; index: number };

/** Lomené čáry tvaru (kreslení, zásah, guma). */
export function sketchPolylines(st: SketchStroke): Pt[][] {
  const [a, b] = st.pts;
  if (!a) return [];
  switch (st.mode) {
    case 'free':
      return [st.pts];
    case 'line':
      return b ? [[a, b]] : [];
    case 'rect':
      return b ? [[a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]] : [];
    case 'circle': {
      if (!b) return [];
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      const n = 48;
      return [Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + r * Math.cos((i / n) * 2 * Math.PI), y: a.y + r * Math.sin((i / n) * 2 * Math.PI) }))];
    }
    case 'arc':
      return b ? [arcPoints(a, b, st.s ?? 0)] : [];
    case 'double': {
      if (!b || Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return [];
      const o = scale(normal(unit(a, b)), st.w ?? SKETCH_DOUBLE_W);
      return [
        [a, b],
        [add(a, o), add(b, o)]
      ];
    }
  }
}

/** Výchozí vzepětí oblouku = čtvrtina tětivy (jako Oblouk ve výkresu). */
export function defaultArcSagitta(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y) / 4;
}

const nearPolylines = (pls: Pt[][], at: Pt, tol: number): boolean =>
  pls.some(pl => pl.some((q, i) => (i === 0 ? Math.hypot(at.x - q.x, at.y - q.y) <= tol : projectToSegment(at, pl[i - 1]!, q).distance <= tol)));

/** Velikost písma popisků a kót skici při měřítku 1. */
export const SKETCH_FONT_PX = 13;

/**
 * Měřítko nového popisku / kóty podle zoomu okna (krok C): na obrazovce stejně velké při každém zoomu – nad zmenšenou
 * fotkou by jinak byly drobné. Stejné měřítko dostane i tloušťka nové čáry (ui/MarkWindow.tsx).
 */
export function sketchScale(viewS: number): number {
  return Math.max(0.01, Math.round(100 / viewS) / 100);
}

/** Volby tloušťky čáry skici (px na obrazovce; přání uživatele 2026-11-22). Výchozí střední. */
export const SKETCH_WIDTHS: readonly { v: number; label: string }[] = [
  { v: 1.5, label: 'Tenká' },
  { v: 2.5, label: 'Střední' },
  { v: 5, label: 'Silná' }
];
export const SKETCH_DEFAULT_WIDTH = 2.5;

/** Tloušťka čáry v jednotkách skici: volba × měřítko podle zoomu (stejně tlustá na obrazovce při každém zoomu). */
export function sketchLineWidth(base: number, viewS: number): number {
  return Math.round(base * sketchScale(viewS) * 100) / 100;
}

/** Nejbližší volba tloušťky k čáře tloušťky `width` při zoomu `viewS` (tlačítka ukážou vybraný prvek). */
export function nearestSketchWidth(width: number, viewS: number): number {
  const px = width / sketchScale(viewS);
  return SKETCH_WIDTHS.reduce((b, o) => (Math.abs(o.v - px) < Math.abs(b - px) ? o.v : b), SKETCH_DEFAULT_WIDTH);
}

/** Změna druhu / tloušťky čáry prvku skici (jen kresba – ne text, ne kóta); nová strana, nebo null = nic ke změně. */
export function restyleStroke(page: MarkPage, ref: SketchRef, patch: { style?: LineStyle; width?: number }): MarkPage | null {
  const st = ref.kind === 'stroke' ? page.strokes[ref.index] : undefined;
  if (!st) return null;
  const next: SketchStroke = { ...st };
  if (patch.width !== undefined) next.width = patch.width;
  if (patch.style !== undefined) {
    if (patch.style === 'solid') delete next.style;
    else next.style = patch.style;
  }
  if (next.width === st.width && next.style === st.style) return null;
  return { ...page, strokes: page.strokes.map((x, i) => (i === ref.index ? next : x)) };
}

/**
 * Rámeček popisku a textu kóty (bez plátna – stejný pro kreslení i zásah): písmo 13 px × `k`, ~8,5 px na znak
 * s rezervou.
 */
export function labelBox(text: string, cx: number, cy: number, k = 1): { x: number; y: number; w: number; h: number } {
  const w = (Math.max(1, text.length) * 8.5 + 12) * k;
  return { x: cx - w / 2, y: cy - 11 * k, w, h: 22 * k };
}

/** Kóty na straně s fotkou jsou jen orientační (perspektiva, ne měřítko) – kreslí se odlišeně a se znakem ≈. */
export function dimIsOrient(p: MarkPage): boolean {
  return !!p.photo;
}

/** Zobrazený text kóty (orientační se znakem ≈). */
export function dimText(p: MarkPage, d: SketchDim): string {
  if (!d.text) return '';
  return dimIsOrient(p) ? `≈ ${d.text}` : d.text;
}

const inBox = (b: { x: number; y: number; w: number; h: number }, at: Pt, tol: number): boolean =>
  at.x >= b.x - tol && at.x <= b.x + b.w + tol && at.y >= b.y - tol && at.y <= b.y + b.h + tol;

const labelHit = (l: SketchLabel, at: Pt, tol: number): boolean => inBox(labelBox(l.text, l.x, l.y, l.k), at, tol);

/** Zásah kóty: čára, nebo rámeček jejího textu. */
function dimHit(p: MarkPage, d: SketchDim, at: Pt, tol: number): boolean {
  if (projectToSegment(at, d.a, d.b).distance <= tol) return true;
  const t = dimText(p, d);
  return !!t && inBox(labelBox(t, (d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2, d.k), at, tol);
}

/** Prvek skici pod bodem (popisky nahoře, pak kóty, pak tahy od posledního). */
export function hitSketch(p: MarkPage, at: Pt, tol: number): SketchRef | null {
  for (let i = p.labels.length - 1; i >= 0; i--) if (labelHit(p.labels[i]!, at, tol)) return { kind: 'label', index: i };
  for (let i = p.dims.length - 1; i >= 0; i--) if (dimHit(p, p.dims[i]!, at, tol)) return { kind: 'dim', index: i };
  for (let i = p.strokes.length - 1; i >= 0; i--) if (nearPolylines(sketchPolylines(p.strokes[i]!), at, tol)) return { kind: 'stroke', index: i };
  return null;
}

/** Posun prvku skici o (dx, dy) – vrací novou stranu. */
export function moveSketchItem(p: MarkPage, ref: SketchRef, dx: number, dy: number): MarkPage {
  const mv = (q: Pt): Pt => ({ x: Math.round(q.x + dx), y: Math.round(q.y + dy) });
  if (ref.kind === 'stroke') return { ...p, strokes: p.strokes.map((s, i) => (i === ref.index ? { ...s, pts: s.pts.map(mv) } : s)) };
  if (ref.kind === 'dim') return { ...p, dims: p.dims.map((d, i) => (i === ref.index ? { ...d, a: mv(d.a), b: mv(d.b) } : d)) };
  return { ...p, labels: p.labels.map((l, i) => (i === ref.index ? { ...l, ...mv(l) } : l)) };
}

/** Smazání prvku skici. */
export function removeSketchItem(p: MarkPage, ref: SketchRef): MarkPage {
  const drop = <T,>(arr: T[], k: SketchRef['kind']) => (ref.kind === k ? arr.filter((_, i) => i !== ref.index) : arr);
  return { ...p, strokes: drop(p.strokes, 'stroke'), dims: drop(p.dims, 'dim'), labels: drop(p.labels, 'label') };
}

/** Guma: smaže tahy / tvary, kóty a popisky pod bodem. Vrací novou stranu, nebo null = nic. */
export function eraseInPage(p: MarkPage, at: Pt, tol: number): MarkPage | null {
  const strokes = p.strokes.filter(s => !nearPolylines(sketchPolylines(s), at, tol));
  const dims = p.dims.filter(d => !dimHit(p, d, at, tol));
  const labels = p.labels.filter(l => !labelHit(l, at, tol));
  if (strokes.length === p.strokes.length && dims.length === p.dims.length && labels.length === p.labels.length) return null;
  return { ...p, strokes, dims, labels };
}

/** Stejný prvek skici? */
export const sameRef = (a: SketchRef, b: SketchRef): boolean => a.kind === b.kind && a.index === b.index;

/**
 * Výběr obdélníkem (přání uživatele 2026-11-22, jako ve výkresu – core/rectSelect.ts): zleva doprava „okno“ (prvek
 * celý uvnitř), zprava doleva „křížení“ (prvek, kterého se obdélník dotkne). Tahy a tvary po své čáře, kóta po své
 * čáře, popisek podle rámečku.
 */
export function sketchInRect(p: MarkPage, r: Rect, crossing: boolean): SketchRef[] {
  const out: SketchRef[] = [];
  p.strokes.forEach((st, i) => polylinesInRect(r, sketchPolylines(st), crossing) && out.push({ kind: 'stroke', index: i }));
  p.dims.forEach((d, i) => polylinesInRect(r, [[d.a, d.b]], crossing) && out.push({ kind: 'dim', index: i }));
  p.labels.forEach((l, i) => {
    const b = labelBox(l.text, l.x, l.y, l.k);
    const box = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }];
    // křížení u popisku = obdélníky se překrývají (i obdélník celý uvnitř rámečku)
    const overlap = r.x1 <= b.x + b.w && r.x2 >= b.x && r.y1 <= b.y + b.h && r.y2 >= b.y;
    if (crossing ? overlap : polylinesInRect(r, [box], false)) out.push({ kind: 'label', index: i });
  });
  return out;
}

/** Posun více prvků skici o (dx, dy). */
export function moveSketchItems(p: MarkPage, refs: readonly SketchRef[], dx: number, dy: number): MarkPage {
  return refs.reduce((q, ref) => moveSketchItem(q, ref, dx, dy), p);
}

/** Smazání více prvků skici. */
export function removeSketchItems(p: MarkPage, refs: readonly SketchRef[]): MarkPage {
  const gone = (k: SketchRef['kind'], i: number) => refs.some(r => r.kind === k && r.index === i);
  return { ...p, strokes: p.strokes.filter((_, i) => !gone('stroke', i)), dims: p.dims.filter((_, i) => !gone('dim', i)), labels: p.labels.filter((_, i) => !gone('label', i)) };
}

/** Druh / tloušťka čáry u všech vybraných prvků kresby (text a kóta beze změny); null = nic ke změně. */
export function restyleStrokes(p: MarkPage, refs: readonly SketchRef[], patch: { style?: LineStyle; width?: number }): MarkPage | null {
  let out: MarkPage | null = null;
  for (const ref of refs) out = restyleStroke(out ?? p, ref, patch) ?? out;
  return out;
}
