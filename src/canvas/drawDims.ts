/**
 * Kóty stěn: celková délka + řetězová kóta otvorů (ostění – otvor – meziostění – ostění).
 * Každé číslo je klikací (otevře NumPad). Kóty se vynáší ven z místnosti.
 * Uvnitř podél stěny se zobrazuje popisek stěny (tloušťka, materiál…).
 */
import { profileToWorld, protrusionDims, protrusionExtent, wallFrame, type ProtrusionDim } from '../core/protrusion';
import { arcGeometry } from '../core/arc';
import { arcChain } from '../core/arcChain';
import { openingsOnWall, wallLength, wallNodes, wallSegments } from '../core/floorQueries';
import { add, centroid, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import { OPENING_DEFAULTS } from '../model/factory';
import type { Floor, Id, Pt } from '../model/types';
import type { Camera, NumPadTarget, Selection } from '../store/store';
import { addHitBox, type HitAction } from './hitTargets';
import { toScreen } from './view';
import { bodyNormal, bodyStart, facePointAt, faceSpan, hasBody, wallBodies } from '../core/wallBody';
import { doorLayout } from '../core/doorLayout';
import { openingStartFromA } from '../core/floorQueries';

/** Těžiště každé souvislé skupiny stěn (pro určení strany „ven“). */
function componentCentroids(floor: Floor): Map<Id, Pt> {
  const result = new Map<Id, Pt>();
  const adj = new Map<Id, Id[]>();
  // úseky stěn: napojený roh (T bez dělení) patří do skupiny průběžné stěny
  for (const { from, to } of wallSegments(floor)) {
    (adj.get(from) ?? adj.set(from, []).get(from)!).push(to);
    (adj.get(to) ?? adj.set(to, []).get(to)!).push(from);
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
  // těla stěn až když jsou potřeba (kóty líců vybrané stěny)
  let bodyCache: ReturnType<typeof wallBodies> | null = null;
  const bodies = () => (bodyCache ??= wallBodies(floor));
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
    // tělo stěny na straně kót → kóty se vynesou až za vnější líc
    const bn = hasBody(wall) ? bodyNormal(floor, wall) : null;
    // (u osy uprostřed přečnívá tělo na obě strany o polovinu)
    if (bn) offset += (dot(bn, out) > 0 ? bodyStart(wall) + wall.thickness : -bodyStart(wall)) * cam.zoom;
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
        const rv = po.op.reveal && po.op.kind !== 'niche' ? po.op.reveal : null;
        if (rv) marks.push({ at: po.start, text: String(Math.round(rv.left)), target: { kind: 'opening-reveal', openingId: po.op.id, part: 'left' } });
        const fw = po.op.frame?.width ?? 0;
        const frameMark = (at: number) => marks.push({ at, text: String(Math.round(fw)), target: { kind: 'opening-reveal', openingId: po.op.id, part: 'frameWidth' } });
        if (fw) frameMark(po.start + (rv?.left ?? 0));
        marks.push({ at: po.start + (rv?.left ?? 0) + fw, text: String(Math.round(po.op.width)), sub: sub || kindInfo.label, target: { kind: 'opening-width', openingId: po.op.id } });
        if (fw) frameMark(po.end - (rv?.right ?? 0) - fw);
        if (rv) marks.push({ at: po.end - rv.right, text: String(Math.round(rv.right)), target: { kind: 'opening-reveal', openingId: po.op.id, part: 'right' } });
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
    // 2a: u osy uprostřed se měří uzel–uzel po ose (příznak „osa“)
    const axisNote = wall.axis === 'center' && hasBody(wall) ? 'osa' : null;
    const subText = mismatch ? (axisNote ? `osa · výkres ${geomLen}` : `výkres ${geomLen}`) : (axisNote ?? undefined);
    drawDimLine(ctx, a, b, out, offset, text, subText, style, s, {
      type: 'numpad',
      target: { kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } },
      wallId: wall.id
    });

    // 2b: vybraná rovná stěna s osou uprostřed – míry obou líců (klikací, délka osy se dopočítá);
    // vnější líc za celkovou délkou, vnitřní na druhé straně stěny
    const faces = selected && wall.axis === 'center' && !sag && hasBody(wall) ? bodies().get(wall.id)?.faces : null;
    if (faces) {
      const outFace: 0 | 1 = dot(normal(u), out) > 0 ? 1 : 0;
      const half = (wall.thickness / 2) * cam.zoom;
      for (const face of [0, 1] as const) {
        const pts = faces[face];
        const span = pts.length < 2 ? 0 : faceSpan(wall, n[0], n[1], pts);
        if (span < 1) continue; // líc přetočený napojením se nekótuje
        const isOut = face === outFace;
        drawDimLine(
          ctx,
          toScreen(pts[0]!, cam),
          toScreen(pts[pts.length - 1]!, cam),
          isOut ? out : scale(out, -1),
          isOut ? offset + rowGap - half : 26 * s,
          String(Math.round(span)),
          'líc',
          { color: '#334155', bg: '#dbeafe', bold: false },
          s,
          { type: 'numpad', target: { kind: 'wall-face-length', wallId: wall.id, face }, wallId: wall.id }
        );
      }
    }

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

  }
  ctx.restore();
}

function readableAngle(u: Pt): number {
  let ang = Math.atan2(u.y, u.x);
  if (ang > Math.PI / 2 + 0.01) ang -= Math.PI;
  if (ang < -Math.PI / 2 - 0.01) ang += Math.PI;
  return ang;
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

/**
 * Kóty v tloušťce stěny (jen u vybraného prvku): tloušťka vybrané stěny a hloubky ostění vybraného otvoru
 * (od vnitřního a od vnějšího líce). Obě jsou klikací (NumPad).
 */
export function drawBodyDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection): void {
  if (selection?.kind !== 'wall' && selection?.kind !== 'opening') return;
  const style: DimStyle = { color: '#334155', bg: '#ffffff', bold: false };
  const op = selection.kind === 'opening' ? floor.openings[selection.id] : null;
  const wall = selection.kind === 'wall' ? floor.walls[selection.id] : op ? floor.walls[op.wallId] : null;
  if (!wall || !hasBody(wall)) return;
  const n = wallNodes(floor, wall);
  const bn = bodyNormal(floor, wall);
  if (!n || !bn) return;
  const len = wallLength(floor, wall);
  const u = unit(n[0], n[1]);
  ctx.save();
  if (!op) {
    // tloušťka ve čtvrtině stěny (uprostřed je dvojitá šipka); u oblouku kolmo k oblouku
    const fp = facePointAt(floor, wall, 0.25);
    if (!fp) return ctx.restore();
    const m = add(fp.pt, scale(fp.into, bodyStart(wall)));
    const q = { x: m.x + fp.into.x * wall.thickness, y: m.y + fp.into.y * wall.thickness };
    drawDimLine(ctx, toScreen(m, cam), toScreen(q, cam), normal(fp.into), 0, String(wall.thickness), 'tloušťka', style, dimScale, {
      type: 'numpad',
      target: { kind: 'wall-thickness', wallId: wall.id },
      wallId: wall.id
    });
  } else if (op.reveal && op.kind !== 'niche') {
    const lay = doorLayout(op, wall.thickness);
    const start = openingStartFromA(op, len);
    const base = lerp(n[0], n[1], start / len);
    const y0 = bodyStart(wall);
    const at = (y: number) => toScreen({ x: base.x + bn.x * (y0 + y), y: base.y + bn.y * (y0 + y) }, cam);
    const back = scale(u, -1);
    if (lay.dA > 0)
      drawDimLine(ctx, at(0), at(lay.dA), back, 16 * dimScale, String(Math.round(lay.dA)), undefined, style, dimScale, {
        type: 'numpad',
        target: { kind: 'opening-reveal', openingId: op.id, part: 'depth' },
        wallId: wall.id
      });
    if (lay.dB > 0)
      drawDimLine(ctx, at(lay.dA + lay.F), at(wall.thickness), back, 16 * dimScale, String(Math.round(lay.dB)), undefined, style, dimScale, {
        type: 'numpad',
        target: { kind: 'opening-reveal', openingId: op.id, part: 'depthBack' },
        wallId: wall.id
      });
  }
  ctx.restore();
}

/**
 * Kóty vybraného výstupku / vybrání (I1.8): řetěz po líci (odstup před, šířka, odstup za – od souseda nebo konce
 * stěny) vně výstupku a hloubka kolmo na líc. Ťuknutím se otevře NumPad; mění se jen výstupek.
 */
export function drawProtrusionDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection): void {
  if (selection?.kind !== 'protrusion') return;
  const p = floor.protrusions?.[selection.id];
  const w = p && floor.walls[p.wallId];
  const f = w && wallFrame(floor, w);
  const dims = p && protrusionDims(floor, p);
  if (!p || !w || !f || !dims) return;
  const style: DimStyle = { color: '#334155', bg: '#ffffff', bold: false };
  const { u0, u1, depth } = protrusionExtent(p);
  const at = (u: number, v: number) => toScreen(profileToWorld(f, w, p.side, { u, v }), cam);
  const out = scale(f.n, p.side);
  const reach = (p.mode === 'add' ? depth * cam.zoom : 0) + 22 * dimScale;
  const act = (dim: ProtrusionDim): HitAction => ({ type: 'numpad', target: { kind: 'protrusion-dim', protrusionId: p.id, dim } });
  ctx.save();
  const chain: [number, number, ProtrusionDim][] = [
    [u0 - dims.before, u0, 'before'],
    [u0, u1, 'width'],
    [u1, u1 + dims.after, 'after']
  ];
  for (const [a, b, dim] of chain) {
    if (b - a < 0.5) continue;
    drawDimLine(ctx, at(a, 0), at(b, 0), out, reach, String(Math.round(b - a)), dim === 'width' ? 'šířka' : undefined, style, dimScale, act(dim));
  }
  const sign = p.mode === 'add' ? 1 : -1;
  drawDimLine(ctx, at(u1, 0), at(u1, sign * depth), f.d, 16 * dimScale, String(Math.round(depth)), 'hloubka', style, dimScale, act('depth'));
  ctx.restore();
}
