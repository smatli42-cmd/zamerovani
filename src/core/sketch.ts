/**
 * Skica značky (okno značky, ui/MarkWindow.tsx) – JEDINÉ místo geometrie skici: tvary (pero, čára, obdélník, kruh,
 * oblouk, dvojitá čára – jako kresba ve výkresu, přání uživatele 2026-11-20), zásah perem, posun prvku, guma,
 * velikost popisků a kót podle zoomu při vzniku (`sketchScale`) a orientační kóty na fotce (`dimIsOrient`).
 * Souřadnice skici = px při zoomu 100 %. Kresba skici je jen obrázek – žádné vazby ani přichytávání ke stěnám.
 */
import type { MarkPage, Pt, SketchDim, SketchLabel, SketchStroke } from '../model/types';
import { normal, projectToSegment, scale, add, unit } from './geometry';
import { arcPoints } from './strokes';

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
