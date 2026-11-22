/**
 * Kreslení stěn a rohů (otvory: canvas/drawOpenings.ts).
 */
import { arcGeometry } from '../core/arc';
import { arcHandles } from '../core/arcChain';
import { wallNodes } from '../core/floorQueries';
import { add, normal, scale } from '../core/geometry';
import type { Floor, Pt, Wall } from '../model/types';
import { isSelected, type Camera, type Selection, type SingleSelection } from '../store/store';
import { toScreen } from './view';
import { LINE_DASH } from './lineDash';
import { facePointAt, hasBody } from '../core/wallFace';
import { wallBodies } from '../core/wallBody';
import { addHitBox } from './hitTargets';
import { protrusionArcHandles } from '../core/protrusionEdit';
import { protrusionPolygon, protrusionsOf } from '../core/protrusion';
import { cornerPolygon, cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endOutline, endProtrusionsOf } from '../core/endProtrusion';
import { wallShown } from './layerDraw';

export const COLORS = {
  wall: '#0f172a',
  /** Výplň těla stěny. */
  body: '#d4d4d8',
  selected: '#2563eb',
  hover: '#93c5fd',
  opening: '#0f172a',
  node: '#475569'
};

export const isSel = (s: Selection, kind: SingleSelection['kind'], id: string) => isSelected(s, kind, id);

export { LINE_DASH } from './lineDash';

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
    if (!wallShown(body.wallId)) continue;
    const sel = isSel(selection, 'wall', body.wallId);
    const hov = isSel(hover, 'wall', body.wallId);
    ctx.fillStyle = sel ? '#bfdbfe' : hov ? '#dbeafe' : COLORS.body;
    // vybrání (sekce I) se z těla vyřízne: kreslí se jen mimo výřezy (ořez sudý-lichý – výřez smí přesahovat tělo,
    // vybrání v rohu leží ve dvou stěnách); výstupky se vyplní stejně jako tělo
    if (body.holes.length) {
      ctx.save();
      // každý výřez zvlášť – překrývající se výřezy se tak sečtou (ne sudý-lichý mezi sebou)
      for (const h of body.holes) {
        ctx.beginPath();
        ctx.rect(-1e6, -1e6, 2e6, 2e6);
        path(h, true);
        ctx.clip('evenodd');
      }
    }
    path(body.poly);
    ctx.fill();
    // přesah výplně přes spoje (bez švů mezi sousedními těly), ne přes výřez
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (body.holes.length) ctx.restore();
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
  for (const ep of endProtrusionsOf(floor)) {
    const sel = isSel(selection, 'protrusion', ep.id);
    const hov = isSel(hover, 'protrusion', ep.id);
    const area = (sel || hov) && endOutline(floor, ep);
    if (!area) continue;
    ctx.fillStyle = sel ? 'rgba(37,99,235,0.35)' : 'rgba(147,197,253,0.4)';
    path(area);
    ctx.fill();
  }
  for (const cp of cornerProtrusionsOf(floor)) {
    const sel = isSel(selection, 'protrusion', cp.id);
    const hov = isSel(hover, 'protrusion', cp.id);
    const area = (sel || hov) && cornerPolygon(floor, cp);
    if (!area) continue;
    ctx.fillStyle = sel ? 'rgba(37,99,235,0.35)' : 'rgba(147,197,253,0.4)';
    path(area);
    ctx.fill();
  }
  for (const body of bodies.values()) {
    if (!wallShown(body.wallId)) continue;
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
    if (bodies.has(wall.id) || !wallShown(wall.id)) continue;
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
  // roh jen u kreslené stěny (stěny skrytých vrstev se nekreslí)
  const shown = new Set(Object.values(floor.walls).filter(w => wallShown(w.id)).flatMap(w => [w.a, w.b]));
  for (const node of Object.values(floor.nodes)) {
    if (!shown.has(node.id)) continue;
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
