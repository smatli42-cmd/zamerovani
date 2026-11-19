/**
 * Schodiště – 2D značka (core/stairs.ts): obrys ramen a podest, čáry nášlapů, šipka výstupu (tečka u prvního
 * stupně, hrot u výstupu), popisek „N × v/š“. Kóty (délka a šířka ramene, hloubka podesty) jen u vybraného
 * schodiště; ťuknutí na šipku vybraného schodiště přepne směr výstupu.
 */
import { add, dist, dot, normal, scale, sub } from '../core/geometry';
import { arrowPath, flightRect, stairLabel, stairOutlines, stairsOf, treadLines } from '../core/stairs';
import type { Floor, Pt, Stair } from '../model/types';
import { isSelected, type Camera, type Selection } from '../store/store';
import { drawDimLine, type DimStyle } from './dimLine';
import { addHitBox } from './hitTargets';
import { toScreen } from './view';

const INK = '#0f172a';
const SEL = '#2563eb';
const DIM: DimStyle = { color: '#2563eb', bg: '#eff6ff', bold: false };
/** Odsazení kót od obrysu (px). */
const DIM_OFF = 26;

export function drawStairs(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  for (const s of stairsOf(floor)) {
    const on = isSelected(selection, 'stair', s.id) || isSelected(hover, 'stair', s.id);
    const color = on ? SEL : INK;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    // obrys ramen a podest (bez výplně)
    ctx.lineWidth = on ? 2.5 : 1.8;
    for (const poly of stairOutlines(s)) {
      if (poly.length < 3) continue;
      ctx.beginPath();
      poly.forEach((p, i) => {
        const q = toScreen(p, cam);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [p, q] of treadLines(s)) {
      const a = toScreen(p, cam);
      const b = toScreen(q, cam);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    drawArrow(ctx, arrowPath(s).map(p => toScreen(p, cam)), s, isSelected(selection, 'stair', s.id));
    if (!s.noLabel) drawLabel(ctx, s, cam, color);
    ctx.restore();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, pts: Pt[], s: Stair, clickable: boolean): void {
  if (pts.length < 2) return;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  // tečka u prvního stupně
  ctx.beginPath();
  ctx.arc(pts[0]!.x, pts[0]!.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // hrot u výstupu
  const end = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const d = dist(prev, end);
  if (d > 1e-6) {
    const u = scale(sub(end, prev), 1 / d);
    const n = normal(u);
    const back = sub(end, scale(u, 12));
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(back.x + n.x * 5, back.y + n.y * 5);
    ctx.lineTo(back.x - n.x * 5, back.y - n.y * 5);
    ctx.closePath();
    ctx.fill();
  }
  // vybrané schodiště: ťuknutí na hrot šipky přepne směr výstupu (jen malá plocha – za zbytek jde schodiště táhnout)
  if (!clickable) return;
  addHitBox({ x: end.x, y: end.y, halfW: 14, halfH: 14, angle: 0, action: { type: 'flipStair', stairId: s.id } });
}

function drawLabel(ctx: CanvasRenderingContext2D, s: Stair, cam: Camera, color: string): void {
  const f = s.flights[0];
  if (!f) return;
  // popisek u středu 1. ramene, kousek vedle osy (šipky)
  const len = dist(f.a, f.b) || 1;
  const u = scale(sub(f.b, f.a), 1 / len);
  const side = f.width / 4;
  const at = toScreen(add(scale(add(f.a, f.b), 0.5), scale(normal(u), side)), cam);
  const text = stairLabel(s);
  ctx.font = '600 12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(at.x - w / 2, at.y - 9, w, 18);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x, at.y);
}

/** Kóta mezi dvěma body na straně odvrácené od bodu `from` (vnitřek prvku). */
function dimAway(ctx: CanvasRenderingContext2D, p: Pt, q: Pt, from: Pt, cam: Camera, dimScale: number, value: number, target: { stairId: string; flightId: string; dim: 'length' | 'width' | 'depth' }): void {
  const a = toScreen(p, cam);
  const b = toScreen(q, cam);
  const d = dist(a, b);
  if (d < 1e-6) return;
  let n = normal(scale(sub(b, a), 1 / d));
  if (dot(n, sub(toScreen(from, cam), a)) > 0) n = scale(n, -1);
  drawDimLine(ctx, a, b, n, DIM_OFF, String(Math.round(value)), undefined, DIM, dimScale, { type: 'numpad', target: { kind: 'stair-dim', ...target } });
}

/** Kóty vybraného schodiště: délka a šířka každého ramene, hloubka podesty (ruční obrys bez kót). */
export function drawStairDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection): void {
  for (const s of stairsOf(floor)) {
    if (!isSelected(selection, 'stair', s.id) || s.outline) continue;
    // délka ramene na boku dál od středu schodiště (u U by se kóty obou ramen kryly mezi rameny)
    const all = stairOutlines(s).flat();
    const mid = scale(all.reduce((v, p) => add(v, p), { x: 0, y: 0 }), 1 / (all.length || 1));
    s.flights.forEach((f, i) => {
      const [al, bl, br, ar] = flightRect(f);
      const c = scale(add(f.a, f.b), 0.5);
      const leftOut = dist(scale(add(al!, bl!), 0.5), mid) >= dist(scale(add(ar!, br!), 0.5), mid) - 1;
      const [l1, l2] = leftOut ? [al!, bl!] : [ar!, br!];
      dimAway(ctx, l1, l2, c, cam, dimScale, dist(f.a, f.b), { stairId: s.id, flightId: f.id, dim: 'length' });
      // šířka u prvního stupně; u dalších ramen u výstupu (začátek leží na podestě)
      const [w1, w2] = i > 0 ? [bl!, br!] : [al!, ar!];
      dimAway(ctx, w1, w2, c, cam, dimScale, f.width, { stairId: s.id, flightId: f.id, dim: 'width' });
      const land = i > 0 ? s.landings[i - 1] : undefined;
      if (land && land.pts.length === 4) {
        const lc = scale(land.pts.reduce((v, p) => add(v, p), { x: 0, y: 0 }), 1 / 4);
        dimAway(ctx, land.pts[0]!, land.pts[3]!, lc, cam, dimScale, f.depth ?? f.width, { stairId: s.id, flightId: f.id, dim: 'depth' });
      }
    });
  }
}
