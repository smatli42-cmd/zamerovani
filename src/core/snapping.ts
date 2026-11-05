/**
 * Přichytávání při kreslení stěn: na rohy, do pravých úhlů, zarovnání s jinými rohy.
 */
import type { Floor, Node, Pt } from '../model/types';
import { dist, roundTo } from './geometry';
import { findNodeNear, findWallNear, type WallHit } from './floorQueries';

export interface SnapOptions {
  ortho: boolean;
  snap: boolean;
  /** Tolerance přichycení na roh (mm). */
  nodeTol: number;
  /** Tolerance zarovnání s jiným rohem (mm). */
  alignTol: number;
  /** Roh, ze kterého se kreslí (nepřichytávat sám na sebe). */
  startNodeId?: string;
}

export interface Guide {
  from: Pt;
  to: Pt;
}

export interface SnapResult {
  pt: Pt;
  node: Node | null;
  wallHit: WallHit | null;
  guides: Guide[];
}

/** Přichycení samostatného bodu (začátek stěny). */
export function snapPoint(floor: Floor, raw: Pt, o: SnapOptions): SnapResult {
  if (o.snap) {
    const node = findNodeNear(floor, raw, o.nodeTol, o.startNodeId);
    if (node) return { pt: { x: node.x, y: node.y }, node, wallHit: null, guides: [] };
    const wallHit = findWallNear(floor, raw, o.nodeTol * 0.8);
    if (wallHit) return { pt: { x: Math.round(wallHit.point.x), y: Math.round(wallHit.point.y) }, node: null, wallHit, guides: [] };
  }
  return { pt: { x: roundTo(raw.x, 10), y: roundTo(raw.y, 10) }, node: null, wallHit: null, guides: [] };
}

/** Přichycení konce kreslené stěny vzhledem k začátku. */
export function snapEnd(floor: Floor, start: Pt, raw: Pt, o: SnapOptions): SnapResult {
  // 1) Roh má přednost (uzavření místnosti), i když stěna nebude pravoúhlá.
  if (o.snap) {
    const node = findNodeNear(floor, raw, o.nodeTol, o.startNodeId);
    if (node) return { pt: { x: node.x, y: node.y }, node, wallHit: null, guides: [] };
  }

  // 2) Směr: v režimu 90° vodorovně/svisle, jinak volně (s přichycením blízko os).
  const dx = raw.x - start.x;
  const dy = raw.y - start.y;
  let pt: Pt;
  const angle = Math.atan2(dy, dx);
  const toAxis = Math.abs(((angle + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4);
  if (o.ortho || toAxis < (4 * Math.PI) / 180) {
    pt = Math.abs(dx) >= Math.abs(dy) ? { x: start.x + roundTo(dx, 10), y: start.y } : { x: start.x, y: start.y + roundTo(dy, 10) };
  } else {
    const len = roundTo(Math.hypot(dx, dy), 10);
    pt = { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }

  // 3) Zarovnání s jinými rohy (vodítka) – jen ve volném směru stěny.
  const guides: Guide[] = [];
  if (o.snap) {
    const horizontal = pt.y === start.y;
    const vertical = pt.x === start.x;
    let bestX: Node | null = null;
    let bestY: Node | null = null;
    for (const n of Object.values(floor.nodes)) {
      if (n.id === o.startNodeId) continue;
      if (!vertical && Math.abs(n.x - pt.x) <= o.alignTol && (!bestX || Math.abs(n.x - pt.x) < Math.abs(bestX.x - pt.x))) bestX = n;
      if (!horizontal && Math.abs(n.y - pt.y) <= o.alignTol && (!bestY || Math.abs(n.y - pt.y) < Math.abs(bestY.y - pt.y))) bestY = n;
    }
    if (bestX && (horizontal || !o.ortho)) {
      pt = { ...pt, x: bestX.x };
      guides.push({ from: bestX, to: pt });
    }
    if (bestY && (vertical || !o.ortho)) {
      pt = { ...pt, y: bestY.y };
      guides.push({ from: bestY, to: pt });
    }
  }

  // 4) Konec na hraně jiné stěny (napojení příčky).
  const wallHit = o.snap ? findWallNear(floor, pt, o.nodeTol * 0.5) : null;

  return { pt: { x: Math.round(pt.x), y: Math.round(pt.y) }, node: null, wallHit, guides: guides.filter(g => dist(g.from, g.to) > 1) };
}
