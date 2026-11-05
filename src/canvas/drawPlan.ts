/**
 * Kreslení stěn, rohů a otvorů.
 */
import { openingsOnWall, wallLength, wallNodes } from '../core/floorQueries';
import { add, dist, lerp, normal, scale, unit } from '../core/geometry';
import type { Floor, Opening, Pt } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { toScreen } from './view';

export const COLORS = {
  wall: '#0f172a',
  selected: '#2563eb',
  hover: '#93c5fd',
  opening: '#0f172a',
  node: '#475569'
};

const isSel = (s: Selection, kind: string, id: string) => s?.kind === kind && s.id === id;

export function drawWalls(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection, hover: Selection): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const wall of Object.values(floor.walls)) {
    const n = wallNodes(floor, wall);
    if (!n) continue;
    const a = toScreen(n[0], cam);
    const b = toScreen(n[1], cam);
    const selected = isSel(selection, 'wall', wall.id);
    const hovered = isSel(hover, 'wall', wall.id);

    if (selected || hovered) {
      ctx.strokeStyle = selected ? 'rgba(37,99,235,0.25)' : 'rgba(147,197,253,0.35)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Stěna je vždy plná černá – nezměřený rozměr se pozná jen podle barvy kóty
    ctx.strokeStyle = selected ? COLORS.selected : COLORS.wall;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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
    for (const po of openingsOnWall(floor, wall)) {
      const p1 = toScreen(lerp(n[0], n[1], po.start / len), cam);
      const p2 = toScreen(lerp(n[0], n[1], po.end / len), cam);
      const color = isSel(selection, 'opening', po.op.id) ? COLORS.selected : isSel(hover, 'opening', po.op.id) ? '#3b82f6' : COLORS.opening;
      drawOpeningSymbol(ctx, p1, p2, po.op, cam, color);
    }
  }
  ctx.restore();
}

function drawOpeningSymbol(ctx: CanvasRenderingContext2D, p1: Pt, p2: Pt, op: Opening, cam: Camera, color: string): void {
  const u = unit(p1, p2);
  const nrm = scale(normal(u), op.swing);
  const w = dist(p1, p2);

  // Přerušení stěny
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  /** Čerchovaná čára v rovině stěny = konstrukce nad rovinou řezu (nadpraží). */
  const lintel = () => {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([10, 3, 2, 3]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
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
      break;
    }
    case 'niche': {
      lintel();
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
