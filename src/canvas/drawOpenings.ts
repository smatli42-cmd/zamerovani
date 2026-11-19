/**
 * Kreslení otvorů: okna, dveře, průchody, niky – rám, zárubeň, křídlo, ostění a nika v těle stěny.
 */
import { doorLayout, faceLineDashed, jambOutline } from '../core/doorLayout';
import { openingSpan, openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { add, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import { hasLeaf, isWindowKind } from '../model/factory';
import type { Floor, Opening, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { toScreen } from './view';
import { bodyNormal, bodyStart, hasBody } from '../core/wallFace';
import { COLORS, isSel } from './drawPlan';
import { wallShown } from './layerDraw';

export function drawOpenings(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  ctx.save();
  for (const wall of Object.values(floor.walls)) {
    if (!wallShown(wall.id)) continue;
    const n = wallNodes(floor, wall);
    if (!n) continue;
    const len = wallLength(floor, wall);
    if (len < 1) continue;
    // stěna s tloušťkou: otvor skrz celé tělo (od líce A k líci B); u osy uprostřed začíná líc A půl tloušťky od osy
    const bn = hasBody(wall) ? bodyNormal(floor, wall) : null;
    const faceA = bn ? scale(bn, bodyStart(wall)) : { x: 0, y: 0 };
    for (const po of openingsOnWall(floor, wall)) {
      const p1 = toScreen(add(lerp(n[0], n[1], po.start / len), faceA), cam);
      const p2 = toScreen(add(lerp(n[0], n[1], po.end / len), faceA), cam);
      const color = isSel(selection, 'opening', po.op.id) ? COLORS.selected : isSel(hover, 'opening', po.op.id) ? '#3b82f6' : COLORS.opening;
      const off = bn ? scale(bn, wall.thickness * cam.zoom) : null;
      if (po.op.kind === 'niche') {
        if (off && bn) drawNicheInBody(ctx, p1, p2, po.op, cam, color, off, bn);
        else drawOpeningSymbol(ctx, p1, p2, po.op, cam, color);
        continue;
      }
      if (off || ((po.op.kind === 'door' || isWindowKind(po.op.kind)) && po.op.frame)) {
        // dveře se zárubní / okno s rámem / průchod (tenké čáry); ve stěně s tloušťkou přes celé tělo
        drawFramed(ctx, p1, p2, po.op, cam, color, off, off ? wall.thickness : null);
        continue;
      }
      drawOpeningSymbol(ctx, p1, p2, po.op, cam, color);
    }
  }
  ctx.restore();
}

/**
 * Dveře se zárubní a okno s rámem (značka jako v Revitu, tenké čáry). Okno má místo křídla čáru skla uprostřed rámu. Souřadnice x podél stěny od začátku otvoru, y od líce A.
 * Líce stěny se v otvoru přeruší; s ostěním je okraj stěny „vykousnutý“ (schod o hloubku ostění a délku ostění).
 * `off` = vektor (v px) od líce A k líci B u stěny s tloušťkou (krok 1), jinak se hloubka měří ve směru `swing`.
 */
function drawFramed(ctx: CanvasRenderingContext2D, s1: Pt, s2: Pt, op: Opening, cam: Camera, color: string, off: Pt | null, T: number | null): void {
  const k = cam.zoom;
  const u = unit(s1, s2);
  const nrm = scale(normal(u), op.swing);
  const dir = off && T ? scale(off, 1 / Math.hypot(off.x, off.y)) : nrm;
  const lay = doorLayout(op, off ? T : null);
  const { L, R, fw, F, fo } = lay;
  const span = openingSpan(op);
  const P = (x: number, y: number): Pt => add(add(s1, scale(u, x * k)), scale(dir, y * k));
  const thick = off && T ? T : null;

  ctx.save();
  // stěna s tloušťkou: vyčistit tělo v otvoru, zuby ostění (zdivo, o které se opírá zárubeň/rám) zůstanou šedé
  if (thick) {
    const quad = (x0: number, y0: number, x1: number, y1: number) => {
      const q = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
      ctx.beginPath();
      q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#f8fafc';
    quad(0, -2 / k, span, thick + 2 / k);
    if (lay.reveal) {
      // zdivo mezi okrajem otvoru a obrysem ostění (zuby u zárubně, u líce bez ostění až k líci)
      ctx.fillStyle = COLORS.body;
      for (const end of ['a', 'b'] as const) {
        const pts = jambOutline(lay, span, end);
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const p = P(x, y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // přerušení líců
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.lineTo(s2.x, s2.y);
  if (thick) {
    const b1 = P(0, thick);
    const b2 = P(span, thick);
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
  }
  ctx.stroke();

  // okraj stěny po stranách otvoru (stejně silný jako líc stěny)
  ctx.strokeStyle = color;
  ctx.lineWidth = thick ? 2 : 3;
  ctx.lineJoin = 'miter';
  // levá a pravá strana zvlášť – každé ostění má svou šířku (L / R)
  for (const end of ['a', 'b'] as const) {
    const pts = jambOutline(lay, span, end);
    if (!pts.length) continue;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const p = P(x, y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // čáry v rovině líců přes otvor (konstrukce nad řezem)
  // líc bez ostění: otvor v něm je užší o ostění vlevo a vpravo
  const faceLine = (y: number, dashed: boolean, narrow = false) => {
    const a = P(narrow ? L : 0, y);
    const b = P(narrow ? span - R : span, y);
    ctx.save();
    ctx.lineWidth = 1.2;
    if (dashed) ctx.setLineDash([10, 3, 2, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  // okno a francouzské okno: čára v rovině líců plná (navazuje na hrany stěny), dveře a průchod čerchovaně
  const dashedFace = faceLineDashed(op.kind);
  faceLine(0, dashedFace, lay.reveal && !lay.inner);
  if (thick) faceLine(thick, dashedFace, lay.reveal && !lay.outer);

  // průchod bez dveří: jen okraje stěny a čerchované čáry líců
  if (op.kind === 'opening') {
    ctx.restore();
    return;
  }

  // zárubně + tenké plné čáry mezi nimi (práh)
  ctx.lineWidth = 1.2;
  for (const y of F > 0 ? [fo, fo + F] : []) {
    const a = P(L + fw, y);
    const b = P(span - R - fw, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const x0 of fw > 0 && F > 0 ? [L, span - R - fw] : []) {
    const q = [P(x0, fo), P(x0 + fw, fo), P(x0 + fw, fo + F), P(x0, fo + F)];
    ctx.beginPath();
    q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }

  // okno: čára skla uprostřed hloubky rámu (dveře a francouzské okno mají místo ní křídlo)
  if (!hasLeaf(op.kind)) {
    const a = P(L + fw, fo + F / 2);
    const b = P(span - R - fw, fo + F / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // křídlo dveří / francouzského okna (otevírá se ve směru swing; u stěny s tloušťkou z té plochy zárubně, ke které směřuje)
  const towardB = thick !== null && dot(nrm, dir) > 0;
  const yLeaf = thick !== null ? (towardB ? fo + F : fo) : fo;
  const xHinge = op.hinge === 'a' ? L + fw : span - R - fw;
  const xFree = op.hinge === 'a' ? span - R - fw : L + fw;
  const hingePt = P(xHinge, yLeaf);
  const freePt = P(xFree, yLeaf);
  // délka křídla = světlost mezi zárubní / rámem (u okna je rám uvnitř šířky okna)
  const leafLen = Math.abs(xFree - xHinge);
  const leafEnd = add(hingePt, scale(nrm, leafLen * k));
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hingePt.x, hingePt.y);
  ctx.lineTo(leafEnd.x, leafEnd.y);
  ctx.stroke();
  const a0 = Math.atan2(leafEnd.y - hingePt.y, leafEnd.x - hingePt.x);
  const a1 = Math.atan2(freePt.y - hingePt.y, freePt.x - hingePt.x);
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hingePt.x, hingePt.y, leafLen * k, a0, a1, diff < 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * Nika ve stěně s tloušťkou: patří k líci, ze kterého je přístupná, a zahlubuje se do těla.
 * `swing` ve směru těla = nika na líci A (čára stěny, vnitřní líc), proti směru = na líci B (vnější).
 */
function drawNicheInBody(ctx: CanvasRenderingContext2D, s1: Pt, s2: Pt, op: Opening, cam: Camera, color: string, off: Pt, bn: Pt): void {
  const u = unit(s1, s2);
  const into = scale(normal(u), op.swing);
  const onA = dot(into, bn) > 0;
  const a = onA ? s1 : add(s1, off);
  const b = onA ? s2 : add(s2, off);
  const thickPx = Math.hypot(off.x, off.y);
  const d = scale(into, Math.min(thickPx, Math.max(6, op.depth * cam.zoom)));
  ctx.save();
  // vyčistit tělo v nice
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x + d.x, b.y + d.y);
  ctx.lineTo(a.x + d.x, a.y + d.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // obrys niky a čerchovaná čára v líci (konstrukce nad řezem)
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(a.x + d.x, a.y + d.y);
  ctx.lineTo(b.x + d.x, b.y + d.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.setLineDash([10, 3, 2, 3]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawOpeningSymbol(ctx: CanvasRenderingContext2D, s1: Pt, s2: Pt, op: Opening, cam: Camera, color: string): void {
  const u = unit(s1, s2);
  const nrm = scale(normal(u), op.swing);
  let p1 = s1;
  let p2 = s2;
  const rv = op.reveal && op.kind !== 'niche' ? op.reveal : null;

  // Přerušení stěny (celý otvor včetně ostění)
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.lineTo(s2.x, s2.y);
  ctx.stroke();

  // Ostění: boční plochy jdou o hloubku do stěny, okno/dveře jsou zasazené uvnitř
  if (rv) {
    const k = dist(s1, s2) / (op.width + rv.left + rv.right || 1);
    const d = scale(nrm, rv.depth * cam.zoom);
    p1 = add(add(s1, scale(u, rv.left * k)), d);
    p2 = add(sub(s2, scale(u, rv.right * k)), d);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3; // stejně silné jako stěna
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s1.x + d.x, s1.y + d.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(s2.x + d.x, s2.y + d.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  const w = dist(p1, p2);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  /** Čerchovaná čára v rovině stěny = konstrukce nad rovinou řezu (nadpraží). */
  const lintel = (a: Pt = s1, b: Pt = s2) => {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([10, 3, 2, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); // výchozí: v rovině stěny přes celý otvor (i s ostěním)
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  const jamb = (p: Pt) => {
    const t = scale(normal(u), 7);
    ctx.beginPath();
    ctx.moveTo(p.x - t.x, p.y - t.y);
    ctx.lineTo(p.x + t.x, p.y + t.y);
    ctx.stroke();
  };

  // Ostění: čerchovaná čára v rovině stěny = konstrukce nad rovinou řezu (jako u niky)
  if (rv && isWindowKind(op.kind)) lintel();

  switch (op.kind) {
    case 'window':
    case 'french': {
      const t = scale(normal(u), 5);
      ctx.beginPath();
      ctx.moveTo(p1.x + t.x, p1.y + t.y);
      ctx.lineTo(p2.x + t.x, p2.y + t.y);
      ctx.lineTo(p2.x - t.x, p2.y - t.y);
      ctx.lineTo(p1.x - t.x, p1.y - t.y);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }
    case 'door': {
      jamb(p1);
      jamb(p2);
      const hingePt = op.hinge === 'a' ? p1 : p2;
      const freePt = op.hinge === 'a' ? p2 : p1;
      const leafEnd = add(hingePt, scale(nrm, w));
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(hingePt.x, hingePt.y);
      ctx.lineTo(leafEnd.x, leafEnd.y);
      ctx.stroke();
      lintel();
      if (rv) lintel(p1, p2); // i v místě prahu (zasazení dveří o hloubku ostění)
      ctx.lineWidth = 1.2;
      const a0 = Math.atan2(leafEnd.y - hingePt.y, leafEnd.x - hingePt.x);
      const a1 = Math.atan2(freePt.y - hingePt.y, freePt.x - hingePt.x);
      let diff = a1 - a0;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ctx.beginPath();
      ctx.arc(hingePt.x, hingePt.y, w, a0, a1, diff < 0);
      ctx.stroke();
      break;
    }
    case 'opening': {
      jamb(p1);
      jamb(p2);
      lintel();
      if (rv) lintel(p1, p2); // i v místě prahu (zasazení dveří o hloubku ostění)
      break;
    }
    case 'niche': {
      lintel();
      if (rv) lintel(p1, p2); // i v místě prahu (zasazení dveří o hloubku ostění)
      const d = scale(nrm, Math.max(6, op.depth * cam.zoom));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x + d.x, p1.y + d.y);
      ctx.lineTo(p2.x + d.x, p2.y + d.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }
  }
}
