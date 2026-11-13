/**
 * Kreslení stěn, rohů a otvorů.
 */
import { arcGeometry } from '../core/arc';
import { arcHandles } from '../core/arcChain';
import { doorLayout } from '../core/doorLayout';
import { openingSpan, openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { add, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import { isWindowKind } from '../model/factory';
import type { Floor, LineStyle, Opening, Pt, Wall } from '../model/types';
import { isSelected, type Camera, type Selection, type SingleSelection } from '../store/store';
import { toScreen } from './view';
import { bodyNormal, bodyStart, facePointAt, hasBody, wallBodies } from '../core/wallBody';
import { addHitBox } from './hitTargets';
import { protrusionArcHandles, protrusionPolygon, protrusionsOf } from '../core/protrusion';

export const COLORS = {
  wall: '#0f172a',
  /** Výplň těla stěny. */
  body: '#d4d4d8',
  selected: '#2563eb',
  hover: '#93c5fd',
  opening: '#0f172a',
  node: '#475569'
};

const isSel = (s: Selection, kind: SingleSelection['kind'], id: string) => isSelected(s, kind, id);

/** Vzory čar pro stěnu tloušťky 3 px (s kulatými konci by se mezery slily, proto se čárkované kreslí s ostrými konci). */
export const LINE_DASH: Record<LineStyle, number[]> = {
  solid: [],
  dashed: [14, 8],
  dashdot: [18, 7, 4, 7]
};

/** Cesta stěny (úsečka nebo oblouk) v souřadnicích obrazovky. */
function pathWall(ctx: CanvasRenderingContext2D, wall: Wall, a: Pt, b: Pt, nodes: [Pt, Pt], cam: Camera): void {
  ctx.beginPath();
  if (wall.radius !== undefined) {
    const c = toScreen(nodes[0], cam);
    ctx.arc(c.x, c.y, wall.radius * cam.zoom, 0, Math.PI * 2);
    return;
  }
  const g = arcGeometry(nodes[0], nodes[1], wall.sagitta ?? 0);
  if (g) {
    const c = toScreen(g.center, cam);
    ctx.arc(c.x, c.y, g.r * cam.zoom, g.start, g.end, g.anticlockwise);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  ctx.save();
  ctx.lineCap = 'round';

  // Stěny s tloušťkou: nejdřív výplně všech těl (světle šedé), pak líce a čela volných konců – spoje bez čar
  const bodies = wallBodies(floor);
  const path = (pts: Pt[], keep = false) => {
    if (!keep) ctx.beginPath();
    pts.forEach((p, i) => {
      const s = toScreen(p, cam);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  };
  for (const body of bodies.values()) {
    const sel = isSel(selection, 'wall', body.wallId);
    const hov = isSel(hover, 'wall', body.wallId);
    ctx.fillStyle = sel ? '#bfdbfe' : hov ? '#dbeafe' : COLORS.body;
    // vybrání (sekce I) se z těla vyřízne (sudý-lichý), výstupky se vyplní stejně jako tělo
    path(body.poly);
    for (const h of body.holes) path(h, true);
    ctx.fill('evenodd');
    // přesah výplně přes spoje (bez švů mezi sousedními těly); u vybrání jen obrys těla, ne přes výřez
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    if (!body.holes.length) ctx.stroke();
    for (const a of body.adds) {
      path(a);
      ctx.fill();
      ctx.stroke();
    }
  }
  // vybraný výstupek / vybrání: modře zvýrazněná plocha
  for (const p of protrusionsOf(floor)) {
    const sel = isSel(selection, 'protrusion', p.id);
    const hov = isSel(hover, 'protrusion', p.id);
    const outline = (sel || hov) && protrusionPolygon(floor, p);
    if (!outline) continue;
    ctx.fillStyle = sel ? 'rgba(37,99,235,0.35)' : 'rgba(147,197,253,0.4)';
    path(outline);
    ctx.fill();
  }
  for (const body of bodies.values()) {
    const wall = floor.walls[body.wallId]!;
    const sel = isSel(selection, 'wall', body.wallId);
    ctx.strokeStyle = sel ? COLORS.selected : COLORS.wall;
    ctx.lineWidth = 2;
    const dash = LINE_DASH[wall.style ?? 'solid'];
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'butt' : 'round';
    ctx.beginPath();
    for (const [p, q] of body.edges) {
      const a = toScreen(p, cam);
      const b = toScreen(q, cam);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // osa uprostřed se kreslí jen u vybrané stěny (čerchovaně modře); osa na líci splývá s čárou líce
  for (const body of bodies.values()) {
    const wall = floor.walls[body.wallId]!;
    const n = wall.axis === 'center' && isSel(selection, 'wall', wall.id) ? wallNodes(floor, wall) : null;
    if (!n) continue;
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(LINE_DASH.dashdot);
    ctx.lineCap = 'butt';
    pathWall(ctx, wall, toScreen(n[0], cam), toScreen(n[1], cam), n, cam);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'round';

  for (const wall of Object.values(floor.walls)) {
    if (bodies.has(wall.id)) continue;
    const n = wallNodes(floor, wall);
    if (!n) continue;
    const a = toScreen(n[0], cam);
    const b = toScreen(n[1], cam);
    const selected = isSel(selection, 'wall', wall.id);
    const hovered = isSel(hover, 'wall', wall.id);

    if (selected || hovered) {
      ctx.strokeStyle = selected ? 'rgba(37,99,235,0.25)' : 'rgba(147,197,253,0.35)';
      ctx.lineWidth = 14;
      pathWall(ctx, wall, a, b, n, cam);
      ctx.stroke();
    }

    // Stěna je černá (styl čáry podle vlastnosti) – nezměřený rozměr se pozná jen podle barvy kóty
    ctx.strokeStyle = selected ? COLORS.selected : COLORS.wall;
    ctx.lineWidth = 3;
    const dash = LINE_DASH[wall.style ?? 'solid'];
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'butt' : 'round';
    pathWall(ctx, wall, a, b, n, cam);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }
  ctx.restore();
}

/** Dvojitá šipka přes tělo vybrané stěny – ťuknutím se přehodí strana, na kterou roste tělo. */
export function drawFlipArrow(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  if (selection?.kind !== 'wall') return;
  const wall = floor.walls[selection.id];
  // u obloukové stěny mimo vrchol (tam je úchyt pro tažení vzepětí)
  // u osy uprostřed strana těla nemá viditelný účinek (jen se pamatuje pro návrat na líc) → bez šipky
  const fp = wall && hasBody(wall) && wall.axis !== 'center' ? facePointAt(floor, wall, wall.sagitta ? 0.7 : 0.5) : null;
  if (!wall || !fp) return;
  const bn = fp.into;
  const mid = toScreen(add(fp.pt, scale(bn, wall.thickness / 2)), cam);
  const half = Math.max(18, (wall.thickness * cam.zoom) / 2 + 10);
  const p1 = add(mid, scale(bn, half));
  const p2 = add(mid, scale(bn, -half));
  const head = (tip: Pt, dir: Pt) => {
    const back = scale(dir, -9);
    const side = scale(normal(dir), 6);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x + back.x + side.x, tip.y + back.y + side.y);
    ctx.lineTo(tip.x + back.x - side.x, tip.y + back.y - side.y);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.strokeStyle = COLORS.selected;
  ctx.fillStyle = COLORS.selected;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  head(p1, bn);
  head(p2, scale(bn, -1));
  ctx.restore();
  addHitBox({ x: mid.x, y: mid.y, halfW: 16, halfH: half, angle: Math.atan2(bn.y, bn.x) - Math.PI / 2, action: { type: 'flipWall', wallId: wall.id } });
}

/** Středový bod vybrané obloukové stěny – jeho tažením se mění vzepětí. */
export function drawArcHandle(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  // úchyt uprostřed každého oblouku (tažením se mění vzepětí), u vybraného kruhu bod na obvodu (poloměr)
  ctx.save();
  for (const h of arcHandles(floor, selection?.kind === 'wall' ? selection.id : null)) {
    const p = toScreen(h.at, cam);
    ctx.fillStyle = h.selected ? COLORS.selected : '#60a5fa';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, h.selected ? 10 : 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  // vybraný výstupek: úchyty vzepětí na úsecích obrysu (tažením se úsek vyklene do oblouku, I1.10)
  const pr = selection?.kind === 'protrusion' ? floor.protrusions?.[selection.id] : null;
  for (const h of pr ? protrusionArcHandles(floor, pr) : []) {
    const p = toScreen(h.at, cam);
    ctx.fillStyle = pr!.pts[h.seg]?.s ? COLORS.selected : '#60a5fa';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}

export function drawNodes(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  ctx.save();
  for (const node of Object.values(floor.nodes)) {
    const p = toScreen(node, cam);
    const selected = isSel(selection, 'node', node.id);
    const hovered = isSel(hover, 'node', node.id);
    const r = selected ? 7 : hovered ? 6 : 4;
    ctx.fillStyle = selected ? COLORS.selected : '#fff';
    ctx.strokeStyle = selected || hovered ? COLORS.selected : COLORS.node;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawOpenings(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  ctx.save();
  for (const wall of Object.values(floor.walls)) {
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
  const { L, R, fw, F, dA, fo } = lay;
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
      ctx.fillStyle = COLORS.body;
      quad(0, dA, L, dA + F);
      quad(span - R, dA, span, dA + F);
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
  const side = (mirror: boolean) => {
    const X = (x: number) => (mirror ? span - x : x);
    const pts: [number, number][] = [[0, 0]];
    if (lay.reveal) {
      pts.push([0, dA], [L, dA], [L, dA + F], [0, dA + F]);
      if (thick) pts.push([0, thick]);
    } else if (thick) pts.push([0, thick]);
    else return;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const p = P(X(x), y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  };
  side(false);
  side(true);

  // čáry v rovině líců přes otvor: s ostěním čerchovaně (konstrukce nad řezem), bez ostění tenká plná (práh)
  const faceLine = (y: number, dashed: boolean) => {
    const a = P(0, y);
    const b = P(span, y);
    ctx.save();
    ctx.lineWidth = 1.2;
    if (dashed) ctx.setLineDash([10, 3, 2, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  faceLine(0, true);
  if (thick) faceLine(thick, true);

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

  // okno: čára skla uprostřed hloubky rámu
  if (op.kind !== 'door') {
    const a = P(L + fw, fo + F / 2);
    const b = P(span - R - fw, fo + F / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // křídlo (otevírá se ve směru swing; u stěny s tloušťkou z té plochy zárubně, ke které směřuje)
  const towardB = thick !== null && dot(nrm, dir) > 0;
  const yLeaf = thick !== null ? (towardB ? fo + F : fo) : fo;
  const xHinge = op.hinge === 'a' ? L + fw : span - R - fw;
  const xFree = op.hinge === 'a' ? span - R - fw : L + fw;
  const hingePt = P(xHinge, yLeaf);
  const freePt = P(xFree, yLeaf);
  const leafEnd = add(hingePt, scale(nrm, op.width * k));
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
  ctx.arc(hingePt.x, hingePt.y, op.width * k, a0, a1, diff < 0);
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
