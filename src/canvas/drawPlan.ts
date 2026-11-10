/**
 * Kreslení stěn, rohů a otvorů.
 */
import { arcGeometry } from '../core/arc';
import { arcChain } from '../core/arcChain';
import { doorLayout } from '../core/doorLayout';
import { partitionThickness, twinOffset } from '../core/pairing';
import { openingSpan, openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { add, dist, dot, lerp, normal, scale, sub, unit } from '../core/geometry';
import type { Floor, LineStyle, Opening, Pt, Wall } from '../model/types';
import { isSelected, type Camera, type Selection, type SingleSelection } from '../store/store';
import { toScreen } from './view';

export const COLORS = {
  wall: '#0f172a',
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
  // vybraná / pod perem ležící příčka se zvýrazní celá (obě čáry)
  const partOf = (s: Selection): string | undefined => (s?.kind === 'wall' ? floor.walls[s.id]?.part?.id : undefined);
  const selPart = partOf(selection);
  const hoverPart = partOf(hover);
  for (const wall of Object.values(floor.walls)) {
    const n = wallNodes(floor, wall);
    if (!n) continue;
    const a = toScreen(n[0], cam);
    const b = toScreen(n[1], cam);
    const selected = isSel(selection, 'wall', wall.id) || (!!selPart && wall.part?.id === selPart);
    const hovered = isSel(hover, 'wall', wall.id) || (!!hoverPart && wall.part?.id === hoverPart);

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

/** Středový bod vybrané obloukové stěny – jeho tažením se mění vzepětí. */
export function drawArcHandle(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  if (selection?.kind !== 'wall') return;
  const wall = floor.walls[selection.id];
  const n = wall && wallNodes(floor, wall);
  if (!wall || !n) return;
  // kruh: bod na obvodu vpravo od středu (tažením se mění poloměr); oblouk: jeho vrchol
  const at = wall.radius !== undefined ? { x: n[0].x + wall.radius, y: n[0].y } : arcChain(floor, wall.id)?.geom.apex;
  if (!at) return;
  const p = toScreen(at, cam);
  ctx.save();
  ctx.fillStyle = COLORS.selected;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
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
    for (const po of openingsOnWall(floor, wall)) {
      const p1 = toScreen(lerp(n[0], n[1], po.start / len), cam);
      const p2 = toScreen(lerp(n[0], n[1], po.end / len), cam);
      const color = isSel(selection, 'opening', po.op.id) ? COLORS.selected : isSel(hover, 'opening', po.op.id) ? '#3b82f6' : COLORS.opening;
      if (po.op.kind === 'door' && po.op.frame) {
        // dveře se zárubní: jedna značka přes celou tloušťku (příčka: obě čáry), tenké čáry
        const off = twinOffset(floor, wall);
        const offPx = off ? scale(toScreen(add(lerp(n[0], n[1], 0), off), cam), 1) : null;
        const origin = toScreen(lerp(n[0], n[1], 0), cam);
        drawFramedDoor(ctx, p1, p2, po.op, cam, color, offPx ? sub(offPx, origin) : null, partitionThickness(floor, wall));
        continue;
      }
      drawOpeningSymbol(ctx, p1, p2, po.op, cam, color);
      // spárovaná příčka: otvor se kreslí i na druhém líci (dveře bez křídla, nika jen na své čáře)
      const off = po.op.kind === 'niche' ? null : twinOffset(floor, wall);
      if (off) {
        const t1 = toScreen(add(lerp(n[0], n[1], po.start / len), off), cam);
        const t2 = toScreen(add(lerp(n[0], n[1], po.end / len), off), cam);
        const twin: Opening = { ...po.op, kind: po.op.kind === 'door' ? 'opening' : po.op.kind, swing: po.op.swing === 1 ? -1 : 1 };
        drawOpeningSymbol(ctx, t1, t2, twin, cam, color);
      }
    }
  }
  ctx.restore();
}

/**
 * Dveře se zárubní (značka jako v Revitu, tenké čáry). Souřadnice x podél stěny od začátku otvoru, y od líce A.
 * Líce stěny se v otvoru přeruší; s ostěním je okraj stěny „vykousnutý“ (schod o hloubku ostění a délku ostění).
 * `off` = vektor (v px) od líce A k líci B u příčky, jinak se hloubka měří ve směru `swing`.
 */
function drawFramedDoor(ctx: CanvasRenderingContext2D, s1: Pt, s2: Pt, op: Opening, cam: Camera, color: string, off: Pt | null, T: number | null): void {
  const k = cam.zoom;
  const u = unit(s1, s2);
  const nrm = scale(normal(u), op.swing);
  const dir = off && T ? scale(off, 1 / Math.hypot(off.x, off.y)) : nrm;
  const lay = doorLayout(op, off ? T : null);
  const { L, R, fw, F, dA, fo } = lay;
  const span = openingSpan(op);
  const P = (x: number, y: number): Pt => add(add(s1, scale(u, x * k)), scale(dir, y * k));
  const thick = off && T ? T : null;

  // přerušení líců
  ctx.save();
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

  // okraj stěny po stranách otvoru (stejně silný jako stěna)
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
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

  // zárubně + tenké plné čáry mezi nimi (práh)
  ctx.lineWidth = 1.2;
  for (const y of [fo, fo + F]) {
    const a = P(L + fw, y);
    const b = P(span - R - fw, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const x0 of [L, span - R - fw]) {
    const q = [P(x0, fo), P(x0 + fw, fo), P(x0 + fw, fo + F), P(x0, fo + F)];
    ctx.beginPath();
    q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }

  // křídlo (otevírá se ve směru swing; u příčky z té plochy zárubně, ke které směřuje)
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
  if (rv && op.kind === 'window') lintel();

  switch (op.kind) {
    case 'window': {
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
