/**
 * Kóty vybraného výstupku v rohu a výstupku na konci stěny (I1.11, rozhodnutí uživatele 2026-11-18 „jako u výstupku“):
 * klikací kóty na výkrese – ťuknutím se otevře NumPad, mění se jen výstupek, kóty jdou zamknout.
 * - v rohu: rozměr podél líce 1. a 2. stěny od rohu, vně výstupku (u vybrání v rohu vně těla, u líce),
 * - na konci stěny: řetěz po každém líci (podél líce od čela, přesah za čelo) vně výstupku a hloubka od každého líce.
 */
import { cornerDims, cornerFrame, cornerOutline } from '../core/cornerProtrusion';
import { endDims, endFrame, endOutline, type EndDim } from '../core/endProtrusion';
import { add, dot, normal, scale, sub, unit } from '../core/geometry';
import type { CornerPt, Floor, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { drawDimLine, type DimStyle } from './dimLine';
import { toScreen } from './view';

const STYLE: DimStyle = { color: '#334155', bg: '#ffffff', bold: false };

/** Jednotkový směr kolmý k `d` na straně bodu `towards` (vůči počátku `o`). */
function perpTowards(d: Pt, o: Pt, towards: Pt): Pt {
  const n = normal(d);
  return dot(sub(towards, o), n) >= 0 ? n : scale(n, -1);
}

export function drawCornerEndDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection): void {
  if (selection?.kind !== 'protrusion') return;
  const cp = floor.cornerProtrusions?.[selection.id];
  const ep = floor.endProtrusions?.[selection.id];
  ctx.save();
  if (cp) {
    const f = cornerFrame(floor, cp);
    const outline = cornerOutline(floor, cp);
    if (f && outline) {
      const d = cornerDims(cp);
      const n = cp.pts.length;
      // vybrání: kóta leží na straně líce mimo tělo, hned u líce (obrys vede tělem)
      const recess = cp.mode === 'subtract';
      const side = (x: number | undefined) => (recess ? -1 : 1) * (Math.sign(x ?? 1) || 1);
      const reach = (sg: number, v: (q: CornerPt) => number) => (recess ? 0 : Math.max(0, ...cp.pts.map(q => v(q) * sg)));
      const sa = side(cp.pts[1]?.t);
      const sb = side(cp.pts[n - 2]?.s);
      for (const [dim, dir, other, len, sgn, far] of [
        // strana obrysu od líce: první úsek obrysu opouští líc 1. stěny (znaménko t), poslední přichází na líc 2. stěny
        // (znaménko s); u vnějšího rohu záporné. Kóta leží za nejvzdálenějším bodem obrysu na té straně.
        ['a', f.e1, f.e2, d.a, sa, reach(sa, q => q.t)],
        ['b', f.e2, f.e1, d.b, sb, reach(sb, q => q.s)]
      ] as const) {
        if (len < 0.5) continue;
        const p1 = f.X;
        const p2 = add(f.X, scale(dir, len));
        const mid = scale(add(p1, p2), 0.5);
        const out = perpTowards(dir, mid, add(mid, scale(other, sgn)));
        const outS = unit({ x: 0, y: 0 }, sub(toScreen(add(mid, out), cam), toScreen(mid, cam)));
        drawDimLine(ctx, toScreen(p1, cam), toScreen(p2, cam), outS, far * Math.abs(dot(other, out)) * cam.zoom + 22 * dimScale, String(Math.round(len)), dim === 'a' ? 'podél 1. stěny' : 'podél 2. stěny', STYLE, dimScale, {
          type: 'numpad',
          target: { kind: 'corner-dim', protrusionId: cp.id, dim }
        });
      }
    }
  }
  if (ep) {
    const f = endFrame(floor, ep);
    const outline = endOutline(floor, ep);
    if (f && outline) {
      const d = endDims(ep);
      const act = (dim: EndDim) => ({ type: 'numpad' as const, target: { kind: 'end-dim' as const, protrusionId: ep.id, dim } });
      const scr = (p: Pt) => toScreen(p, cam);
      const dirS = (o: Pt, v: Pt) => unit({ x: 0, y: 0 }, sub(scr(add(o, v)), scr(o)));
      for (const fi of [0, 1] as const) {
        const O = f.O[fi];
        const n = f.n[fi];
        const along = fi === 0 ? d.along0 : d.along1;
        const depth = fi === 0 ? d.depth0 : d.depth1;
        const reach = depth * cam.zoom + 22 * dimScale;
        // řetěz po líci: přesah za čelo (jen u líce 0, aby se neopakoval) a podél líce od čela
        if (along >= 0.5) drawDimLine(ctx, scr(O), scr(add(O, scale(f.e1, along))), dirS(O, n), reach, String(Math.round(along)), 'podél líce', STYLE, dimScale, act(fi === 0 ? 'along0' : 'along1'));
        if (fi === 0 && d.over >= 0.5) drawDimLine(ctx, scr(add(O, scale(f.e1, -d.over))), scr(O), dirS(O, n), reach, String(Math.round(d.over)), 'přesah', STYLE, dimScale, act('over'));
        // hloubka od líce u začátku obrysu na líci
        if (depth >= 0.5) {
          const base = add(O, scale(f.e1, along));
          drawDimLine(ctx, scr(base), scr(add(base, scale(n, depth))), dirS(base, f.e1), 16 * dimScale, String(Math.round(depth)), 'hloubka', STYLE, dimScale, act(fi === 0 ? 'depth0' : 'depth1'));
        }
      }
    }
  }
  ctx.restore();
}
