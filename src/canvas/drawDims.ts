/**
 * Kóty stěn: celková délka + řetězová kóta otvorů (ostění – otvor – meziostění – ostění).
 * Každé číslo je klikací (otevře NumPad). Kóty se vynáší ven z místnosti.
 * Uvnitř podél stěny se zobrazuje popisek stěny (tloušťka, materiál…).
 */
import { arcGeometry } from '../core/arc';
import { arcChain } from '../core/arcChain';
import { openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { centroid, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import { OPENING_DEFAULTS } from '../model/factory';
import type { Floor, Id, Pt, Wall } from '../model/types';
import type { Camera, NumPadTarget, Selection } from '../store/store';
import { addHitBox, type HitAction } from './hitTargets';
import { toScreen } from './view';

const WALL_TYPE_TEXT: Record<string, string> = {
  obvodova: 'obvodová',
  nosna: 'nosná',
  pricka: 'příčka',
  sdk: 'SDK',
  neovereno: 'neověřeno'
};

export function wallLabelText(wall: Wall): string {
  const l = wall.label;
  const parts: string[] = [];
  if (l.thickness) parts.push(`tl. ${l.thickness}`);
  if (l.type) parts.push(WALL_TYPE_TEXT[l.type] ?? l.type);
  if (l.material) parts.push(l.material);
  if (l.note) parts.push(l.note);
  return parts.join(' · ');
}

/** Těžiště každé souvislé skupiny stěn (pro určení strany „ven“). */
function componentCentroids(floor: Floor): Map<Id, Pt> {
  const result = new Map<Id, Pt>();
  const adj = new Map<Id, Id[]>();
  for (const w of Object.values(floor.walls)) {
    (adj.get(w.a) ?? adj.set(w.a, []).get(w.a)!).push(w.b);
    (adj.get(w.b) ?? adj.set(w.b, []).get(w.b)!).push(w.a);
  }
  const seen = new Set<Id>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp: Id[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const nb of adj.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    const c = centroid(comp.map(id => floor.nodes[id]!).filter(Boolean));
    for (const id of comp) result.set(id, c);
  }
  return result;
}

export interface DimStyle {
  color: string;
  bg: string;
  bold: boolean;
}

export function drawDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection): void {
  const centroids = componentCentroids(floor);
  const s = dimScale;
  ctx.save();

  for (const wall of Object.values(floor.walls)) {
    const n = wallNodes(floor, wall);
    if (!n) continue;
    if (wall.radius !== undefined) {
      // Kruh: kóta průměru přes střed (klikací), popisek stěny se u kruhu nekreslí
      const c = toScreen(n[0], cam);
      const r = wall.radius * cam.zoom;
      const selectedCircle = selection?.kind === 'wall' && selection.id === wall.id;
      drawDimLine(ctx, { x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }, { x: 0, y: -1 }, 0, `Ø${Math.round(wall.radius * 2)}`, undefined, { color: '#0f172a', bg: selectedCircle ? '#dbeafe' : '#ffffff', bold: true }, s, {
        type: 'numpad',
        target: { kind: 'circle-diameter', wallId: wall.id },
        wallId: wall.id
      });
      continue;
    }
    const a = toScreen(n[0], cam);
    const b = toScreen(n[1], cam);
    const screenLen = dist(a, b);
    if (screenLen < 30) continue;

    const u = unit(a, b);
    let out = normal(u);
    const c = centroids.get(wall.a);
    if (c) {
      const cs = toScreen(c, cam);
      const mid = lerp(a, b, 0.5);
      if (dot(sub(mid, cs), out) < 0) out = scale(out, -1);
    }

    const len = wallLength(floor, wall);
    const geomLen = Math.round(len);
    const selected = selection?.kind === 'wall' && selection.id === wall.id;
    const placed = openingsOnWall(floor, wall);
    const rowGap = 30 * s;
    let offset = 26 * s;
    // Nika vystupuje do strany (swing); pokud míří ke kótám, kóty se posunou za ni
    const nicheSide = normal(u);
    // Oblouková stěna: kóta tětivy se odsune za vyklenutí, pokud míří ke kótám
    const sag = wall.sagitta ?? 0;
    if (Math.abs(sag) >= 0.5 && dot(scale(nicheSide, Math.sign(sag)), out) > 0) offset = Math.max(offset, Math.abs(sag) * cam.zoom + 22 * s);
    for (const po of placed) {
      if (po.op.kind !== 'niche') continue;
      if (dot(scale(nicheSide, po.op.swing), out) > 0) offset = Math.max(offset, Math.max(6, po.op.depth * cam.zoom) + 22 * s);
    }

    // 1. řada: řetězová kóta otvorů
    if (placed.length > 0) {
      const marks: { at: number; target: NumPadTarget | null; text: string; sub?: string }[] = [];
      let cursor = 0;
      placed.forEach((po, i) => {
        const prev = placed[i - 1];
        marks.push({
          at: cursor,
          text: String(Math.round(po.start - cursor)),
          target: prev
            ? { kind: 'opening-gap', firstId: prev.op.id, secondId: po.op.id }
            : { kind: 'opening-offset', openingId: po.op.id, ref: 'a' }
        });
        const kindInfo = OPENING_DEFAULTS[po.op.kind];
        const sub = po.op.kind === 'door' || po.op.kind === 'opening' ? `${po.op.number} v${po.op.height}` : `${po.op.number} v${po.op.height} p${po.op.sill}`;
        marks.push({ at: po.start, text: String(Math.round(po.op.width)), sub: sub || kindInfo.label, target: { kind: 'opening-width', openingId: po.op.id } });
        cursor = po.end;
      });
      const last = placed[placed.length - 1]!;
      marks.push({ at: cursor, text: String(Math.round(len - cursor)), target: { kind: 'opening-offset', openingId: last.op.id, ref: 'b' } });

      for (let i = 0; i < marks.length; i++) {
        const m = marks[i]!;
        const endAt = i + 1 < marks.length ? marks[i + 1]!.at : len;
        if (endAt - m.at < 1) continue;
        const p1 = lerp(a, b, m.at / len);
        const p2 = lerp(a, b, endAt / len);
        drawDimLine(ctx, p1, p2, out, offset, m.text, m.sub, { color: '#334155', bg: '#ffffff', bold: false }, s, m.target ? { type: 'numpad', target: m.target, wallId: wall.id } : null);
      }
      offset += rowGap + (placed.length ? 8 * s : 0);
    }

    // 2. řada: celková délka stěny
    const measured = wall.measured;
    const mismatch = measured !== null && Math.abs(geomLen - measured) > 2;
    const text = measured === null ? `~${geomLen}` : mismatch ? `${measured} ⚠` : String(measured);
    const style: DimStyle =
      measured === null
        ? { color: '#c2410c', bg: '#fff7ed', bold: false }
        : mismatch
          ? { color: '#b91c1c', bg: '#fef2f2', bold: true }
          : { color: '#0f172a', bg: '#ffffff', bold: true };
    if (selected) style.bg = '#dbeafe';
    drawDimLine(ctx, a, b, out, offset, text, mismatch ? `výkres ${geomLen}` : undefined, style, s, {
      type: 'numpad',
      target: { kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } },
      wallId: wall.id
    });

    // Vzepětí oblouku: od středu tětivy k vrcholu (klikací)
    // oblouk rozdělený na části se kótuje jako celek (jen u první části)
    const ch = Math.abs(sag) >= 0.5 ? arcChain(floor, wall.id) : null;
    const g = ch ? ch.geom : arcGeometry(n[0], n[1], sag);
    const chordMid = ch ? lerp(toScreen(ch.a, cam), toScreen(ch.b, cam), 0.5) : lerp(a, b, 0.5);
    const chordLen = ch ? dist(ch.a, ch.b) : len;
    const shownSag = ch ? ch.sagitta : sag;
    // u půlkruhu (kruh) se vzepětí nekótuje – je to poloměr
    if (g && (!ch || ch.pieces[0]!.wall.id === wall.id) && Math.abs(Math.abs(shownSag) - chordLen / 2) > 1) {
      drawDimLine(ctx, chordMid, toScreen(g.apex, cam), u, 0, String(Math.round(Math.abs(shownSag))), 'vzepětí', { color: '#334155', bg: '#ffffff', bold: false }, s, {
        type: 'numpad',
        target: { kind: 'wall-sagitta', wallId: wall.id },
        wallId: wall.id
      });
    }

    // Popisek stěny (uvnitř místnosti podél stěny)
    const label = wallLabelText(wall);
    if (label && screenLen > 60) {
      const mid = lerp(a, b, 0.5);
      const pos = { x: mid.x - out.x * 14 * s, y: mid.y - out.y * 14 * s };
      drawRotatedText(ctx, pos, u, label, `italic ${Math.round(11 * s)}px system-ui, sans-serif`, '#475569', screenLen - 20);
    }
  }
  ctx.restore();
}

function readableAngle(u: Pt): number {
  let ang = Math.atan2(u.y, u.x);
  if (ang > Math.PI / 2 + 0.01) ang -= Math.PI;
  if (ang < -Math.PI / 2 - 0.01) ang += Math.PI;
  return ang;
}

function drawRotatedText(ctx: CanvasRenderingContext2D, pos: Pt, u: Pt, text: string, font: string, color: string, maxW: number): void {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(readableAngle(u));
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let t = text;
  while (t.length > 3 && ctx.measureText(t).width > maxW) t = t.slice(0, -2);
  if (t !== text) t = `${t.slice(0, -1)}…`;
  ctx.fillText(t, 0, 0);
  ctx.restore();
}

export function drawDimLine(
  ctx: CanvasRenderingContext2D,
  p1: Pt,
  p2: Pt,
  out: Pt,
  offsetPx: number,
  text: string,
  subText: string | undefined,
  style: DimStyle,
  s: number,
  action: HitAction | null
): void {
  const o = scale(out, offsetPx);
  const q1 = { x: p1.x + o.x, y: p1.y + o.y };
  const q2 = { x: p2.x + o.x, y: p2.y + o.y };
  const u = unit(p1, p2);

  ctx.save();
  // Vynášecí čáry
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [p, q] of [
    [p1, q1],
    [p2, q2]
  ] as const) {
    ctx.moveTo(p.x + out.x * 4, p.y + out.y * 4);
    ctx.lineTo(q.x + out.x * 4, q.y + out.y * 4);
  }
  ctx.stroke();

  // Kótovací čára a šikmé značky
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(q1.x, q1.y);
  ctx.lineTo(q2.x, q2.y);
  const tick = { x: (u.x + out.x) * 4, y: (u.y + out.y) * 4 };
  for (const q of [q1, q2]) {
    ctx.moveTo(q.x - tick.x, q.y - tick.y);
    ctx.lineTo(q.x + tick.x, q.y + tick.y);
  }
  ctx.stroke();

  // Číslo
  const fontPx = Math.round(13 * s);
  const subPx = Math.round(10 * s);
  ctx.font = `${style.bold ? 700 : 500} ${fontPx}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  let sw = 0;
  if (subText) {
    ctx.font = `500 ${subPx}px system-ui, sans-serif`;
    sw = ctx.measureText(subText).width;
  }
  const boxW = Math.max(tw, sw) + 10;
  const boxH = fontPx + 6 + (subText ? subPx + 2 : 0);
  const mid = lerp(q1, q2, 0.5);
  const angle = readableAngle(u);

  ctx.translate(mid.x, mid.y);
  ctx.rotate(angle);
  ctx.fillStyle = style.bg;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 4);
  ctx.fill();
  if (action) ctx.stroke();
  ctx.fillStyle = style.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${style.bold ? 700 : 500} ${fontPx}px system-ui, sans-serif`;
  ctx.fillText(text, 0, subText ? -boxH / 2 + 3 + fontPx / 2 : 0);
  if (subText) {
    ctx.font = `500 ${subPx}px system-ui, sans-serif`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(subText, 0, boxH / 2 - 2 - subPx / 2);
  }
  ctx.restore();

  if (action) addHitBox({ x: mid.x, y: mid.y, halfW: boxW / 2, halfH: boxH / 2, angle, action });
}
