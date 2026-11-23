/**
 * Kóty stěn: celková délka + řetězová kóta otvorů (ostění – otvor – meziostění – ostění).
 * Každé číslo je klikací (otevře NumPad). Kóty se vynáší ven z místnosti.
 * Uvnitř podél stěny se zobrazuje popisek stěny (tloušťka, materiál…).
 */
import { profileToWorld, protrusionExtent, wallFrame } from '../core/protrusion';
import { protrusionArcHandles, protrusionDims, type ProtrusionDim } from '../core/protrusionEdit';
import { arcGeometry } from '../core/arc';
import { arcChain } from '../core/arcChain';
import { frameOutside, openingsOnWall, wallLength, wallNodes, wallSegments } from '../core/floorQueries';
import { add, centroid, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import { OPENING_DEFAULTS } from '../model/factory';
import type { Floor, Id, Pt } from '../model/types';
import type { Camera, NumPadTarget, Selection } from '../store/store';
import { drawDimLine, type DimStyle } from './dimLine';
import { protrusionRow, wallChainRow } from '../core/dimPlace';
import type { HitAction } from './hitTargets';
import { toScreen } from './view';
import { bodyNormal, bodyStart, facePointAt, faceSpan, hasBody } from '../core/wallFace';
import { wallBodies } from '../core/wallBody';
import { doorLayout } from '../core/doorLayout';
import { openingStartFromA } from '../core/floorQueries';
import { hostedChain } from '../core/hosting';
import { wallShown } from './layerDraw';

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


/** `faceDims` = stěny, u kterých se kreslí míry líců i bez výběru (export – délka po líci je hlavní kóta). */
export function drawDims(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, dimScale: number, selection: Selection, faceDims?: (wallId: Id) => boolean): void {
  const centroids = componentCentroids(floor);
  const s = dimScale;
  // těla stěn až když jsou potřeba (kóty líců vybrané stěny)
  let bodyCache: ReturnType<typeof wallBodies> | null = null;
  const bodies = () => (bodyCache ??= wallBodies(floor));
  ctx.save();

  for (const wall of Object.values(floor.walls)) {
    // automatické kóty jen u kreslené stěny (vrstvy: core/layers.ts)
    if (!wallShown(wall.id)) continue;
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
      const marks: { at: number; target: NumPadTarget | null; text: string; sub?: string; alongKey?: string }[] = [];
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
        // zárubeň dveří je klikací kóta; rám okna leží uvnitř šířky okna a kótu nemá
        const fw = frameOutside(po.op);
        const frameMark = (at: number, side: 'L' | 'R') =>
          marks.push({ at, text: String(Math.round(fw)), target: { kind: 'opening-reveal', openingId: po.op.id, part: 'frameWidth' }, alongKey: `opening-reveal:${po.op.id}:frameWidth:${side}` });
        if (fw) frameMark(po.start + (rv?.left ?? 0), 'L');
        marks.push({ at: po.start + (rv?.left ?? 0) + fw, text: String(Math.round(po.op.width)), sub: sub || kindInfo.label, target: { kind: 'opening-width', openingId: po.op.id } });
        if (fw) frameMark(po.end - (rv?.right ?? 0) - fw, 'R');
        if (rv) marks.push({ at: po.end - rv.right, text: String(Math.round(rv.right)), target: { kind: 'opening-reveal', openingId: po.op.id, part: 'right' } });
        cursor = po.end;
      });
      const last = placed[placed.length - 1]!;
      marks.push({ at: cursor, text: String(Math.round(len - cursor)), target: { kind: 'opening-offset', openingId: last.op.id, ref: 'b' } });

      const openRow = wallChainRow('openings', wall);
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i]!;
        const endAt = i + 1 < marks.length ? marks[i + 1]!.at : len;
        if (endAt - m.at < 1) continue;
        const p1 = lerp(a, b, m.at / len);
        const p2 = lerp(a, b, endAt / len);
        drawDimLine(ctx, p1, p2, out, offset, m.text, m.sub, { color: '#334155', bg: '#ffffff', bold: false }, s, m.target ? { type: 'numpad', target: m.target, wallId: wall.id } : null, { row: openRow, alongKey: m.alongKey });
      }
      offset += rowGap + (placed.length ? 8 * s : 0);
    }


    // řada polohy napojení (T bez dělení): A → napojení → … → B, klikací (posune napojenou stěnu)
    // napojení stěn skrytých vrstev se do řady nepočítají (vrstvy, pravidlo 1); řada bez nich ukazuje vzdálenosti,
    // ale není klikací (zadání by měnilo úsek ke skrytému napojení)
    const fullChain = hostedChain(floor, wall.id);
    const chain = fullChain.filter(c => Object.values(floor.walls).some(w => (w.a === c.nodeId || w.b === c.nodeId) && wallShown(w.id)));
    const whole = chain.length === fullChain.length;
    if (chain.length > 0) {
      const stops = [0, ...chain.map(c => c.at), len];
      for (let i = 0; i + 1 < stops.length; i++) {
        const from = stops[i]!;
        const to = stops[i + 1]!;
        if (to - from < 1) continue;
        const last = i === stops.length - 2;
        const target: NumPadTarget = last
          ? { kind: 'junction-gap', wallId: wall.id, nodeId: chain[chain.length - 1]!.nodeId, to: 'next' }
          : { kind: 'junction-gap', wallId: wall.id, nodeId: chain[i]!.nodeId, to: 'prev' };
        drawDimLine(ctx, lerp(a, b, from / len), lerp(a, b, to / len), out, offset, String(Math.round(to - from)), undefined, { color: '#334155', bg: '#ffffff', bold: false }, s, whole ? { type: 'numpad', target, wallId: wall.id } : null, { row: wallChainRow('junctions', wall) });
      }
      offset += rowGap;
    }

    // 2. řada: celková délka stěny – vždy skutečná délka z výkresu, černě (pojem „změřeno × náčrt“ zrušen 2026-11-14)
    const style: DimStyle = { color: '#0f172a', bg: selected ? '#dbeafe' : '#ffffff', bold: true };
    // 2a: u osy uprostřed se měří uzel–uzel po ose (příznak „osa“)
    const subText = wall.axis === 'center' && hasBody(wall) ? 'osa' : undefined;
    drawDimLine(ctx, a, b, out, offset, String(geomLen), subText, style, s, {
      type: 'numpad',
      target: { kind: 'wall-length', wallId: wall.id, move: { nodeId: wall.b } },
      wallId: wall.id
    });

    // 2b: vybraná rovná stěna s osou uprostřed – míry obou líců (klikací, délka osy se dopočítá);
    // vnější líc za celkovou délkou, vnitřní na druhé straně stěny
    const faces = (selected || !!faceDims?.(wall.id)) && wall.axis === 'center' && !sag && hasBody(wall) ? bodies().get(wall.id)?.faces : null;
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
  const out = scale(f.at((u0 + u1) / 2).n, p.side);
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
    drawDimLine(ctx, at(a, 0), at(b, 0), out, reach, String(Math.round(b - a)), dim === 'width' ? 'šířka' : undefined, style, dimScale, act(dim), { row: protrusionRow(p.id) });
  }
  const sign = p.mode === 'add' ? 1 : -1;
  drawDimLine(ctx, at(u1, 0), at(u1, sign * depth), f.at(u1).t, 16 * dimScale, String(Math.round(depth)), 'hloubka', style, dimScale, act('depth'));
  // vzepětí oblouků v obrysu (od středu tětivy k vrcholu)
  for (const h of protrusionArcHandles(floor, p)) {
    const s = p.pts[h.seg]?.s;
    if (!s) continue;
    const m = toScreen(h.chordMid, cam);
    const a = toScreen(h.at, cam);
    const along = unit(m, a);
    drawDimLine(ctx, m, a, normal(along), 0, String(Math.round(Math.abs(s))), 'vzepětí', style, dimScale, { type: 'numpad', target: { kind: 'protrusion-sagitta', protrusionId: p.id, seg: h.seg } });
  }
  ctx.restore();
}
