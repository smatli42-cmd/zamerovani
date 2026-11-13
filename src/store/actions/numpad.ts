/**
 * Akce: výchozí hodnota a zápis hodnoty z NumPadu.
 */
import { revealPartValue } from '../../core/doorLayout';
import type { Floor } from '../../model/types';
import { arcChain, setChainSagitta } from '../../core/arcChain';
import { openingSpan, openingStartFromA, wallLength } from '../../core/floorQueries';
import { componentGap, setComponentGap } from '../../core/components';
import { store, type NumPadTarget } from '../store';
import { setGap, setOpeningWidth, setReveal, setStartFromA } from './openings';
import { applyWallLength, resizeCircle } from './walls';
import { setWallLength } from '../../core/solver';
import { faceLength, hasBody } from '../../core/wallBody';
import { hostedChain, setHostedGap } from '../../core/hosting';
import { defaultArcSign, protrusionDims, setProtrusionSagitta } from '../../core/protrusion';
import { applyProtrusionDim } from './protrusions';

/**
 * Míra líce u stěny s osou uprostřed (2b): délka osy se upraví tak, aby měl líc zadanou délku
 * (posouvá se konec B jako u délky stěny). Napojení v rozích se po posunu mění, proto se dorovnává
 * v několika krocích. `measured` zůstane délka osy (výsledek), líc se neukládá – počítá se.
 */
function setFaceLength(floor: Floor, wallId: string, face: 0 | 1, value: number): boolean {
  const w = floor.walls[wallId];
  if (!w || !hasBody(w) || w.axis !== 'center' || w.sagitta || value < 10) return false;
  const start = faceLength(floor, wallId, face);
  if (start === null || start <= 0) return false; // líc „přetočený“ napojením – nejde kótovat
  // při neúspěchu (i v pozdějším kroku dorovnání) se výkres vrátí do původního stavu
  const snapshot = JSON.parse(JSON.stringify({ nodes: floor.nodes, walls: floor.walls, openings: floor.openings })) as Pick<Floor, 'nodes' | 'walls' | 'openings'>;
  const fail = () => {
    floor.nodes = snapshot.nodes;
    floor.walls = snapshot.walls;
    floor.openings = snapshot.openings;
    return false;
  };
  for (let i = 0; i < 8; i++) {
    const cur = faceLength(floor, wallId, face);
    const a = floor.nodes[w.a];
    const b = floor.nodes[w.b];
    if (cur === null || cur <= 0 || !a || !b) return fail();
    const diff = value - cur;
    if (Math.abs(diff) < 0.05) return true;
    if (!setWallLength(floor, wallId, Math.hypot(b.x - a.x, b.y - a.y) + diff, { nodeId: w.b })) return fail();
  }
  const end = faceLength(floor, wallId, face);
  return end !== null && Math.abs(end - value) < 0.5 ? true : fail();
}

/** Výchozí hodnota zobrazená v NumPadu pro daný cíl. */
export function numpadInitialValue(floor: Floor, t: NumPadTarget): number | null {
  switch (t.kind) {
    case 'wall-length': {
      const w = floor.walls[t.wallId];
      return w ? (w.measured ?? Math.round(wallLength(floor, w))) : null;
    }
    case 'opening-offset': {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return null;
      const len = wallLength(floor, wall);
      const start = openingStartFromA(op, len);
      return Math.round(t.ref === 'a' ? start : len - start - openingSpan(op));
    }
    case 'opening-width':
      return floor.openings[t.openingId]?.width ?? null;
    case 'opening-reveal':
      {
        const op = floor.openings[t.openingId];
        return op ? revealPartValue(floor, op, t.part) : null;
      }
    case 'wall-sagitta': {
      const w = floor.walls[t.wallId];
      return w ? Math.round(Math.abs(arcChain(floor, w.id)?.sagitta ?? w.sagitta ?? 0)) : null;
    }
    case 'wall-thickness':
      return floor.walls[t.wallId]?.thickness ?? null;
    case 'wall-face-length': {
      const l = faceLength(floor, t.wallId, t.face);
      return l === null ? null : Math.round(l);
    }
    case 'circle-diameter': {
      const w = floor.walls[t.wallId];
      return w?.radius !== undefined ? w.radius * 2 : null;
    }
    case 'comp-gap': {
      const g = componentGap(floor, t.wallId, t.side);
      return g ? Math.round(g.value) : null;
    }
    case 'protrusion-dim': {
      const p = floor.protrusions?.[t.protrusionId];
      const d = p && protrusionDims(floor, p);
      return d ? Math.round(d[t.dim]) : null;
    }
    case 'junction-gap': {
      const w = floor.walls[t.wallId];
      const a = w && floor.nodes[w.a];
      const b = w && floor.nodes[w.b];
      const chain = hostedChain(floor, t.wallId);
      const i = chain.findIndex(c => c.nodeId === t.nodeId);
      if (!a || !b || i < 0) return null;
      const at = chain[i]!.at;
      return Math.round(t.to === 'prev' ? at - (chain[i - 1]?.at ?? 0) : (chain[i + 1]?.at ?? Math.hypot(b.x - a.x, b.y - a.y)) - at);
    }
    case 'protrusion-sagitta': {
      const s = floor.protrusions?.[t.protrusionId]?.pts[t.seg]?.s;
      return s === undefined ? 0 : Math.round(Math.abs(s));
    }
    case 'opening-gap': {
      const a = floor.openings[t.firstId];
      const b = floor.openings[t.secondId];
      const wall = a && floor.walls[a.wallId];
      if (!a || !b || !wall) return null;
      const len = wallLength(floor, wall);
      return Math.round(openingStartFromA(b, len) - (openingStartFromA(a, len) + openingSpan(a)));
    }
  }
}

/** Zapíše hodnotu z NumPadu do výkresu. */
export function applyNumpadValue(t: NumPadTarget, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (t.kind === 'wall-length') return applyWallLength(t.wallId, value, t.move);
  let ok = false;
  store.edit(floor => {
    if (t.kind === 'wall-face-length') {
      ok = setFaceLength(floor, t.wallId, t.face, value);
    } else if (t.kind === 'opening-offset') {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return;
      const len = wallLength(floor, wall);
      op.ref = t.ref;
      op.offset = Math.round(value);
      setStartFromA(op, openingStartFromA(op, len), len);
      ok = true;
    } else if (t.kind === 'opening-width') {
      const op = floor.openings[t.openingId];
      if (!op || value < 100) return;
      setOpeningWidth(floor, op, value);
      ok = true;
    } else if (t.kind === 'opening-reveal') {
      const op = floor.openings[t.openingId];
      if (!op) return;
      ok = setReveal(floor, op, t.part, value);
    } else if (t.kind === 'opening-gap') {
      setGap(floor, t.firstId, t.secondId, value);
      ok = true;
    } else if (t.kind === 'wall-sagitta') {
      const w = floor.walls[t.wallId];
      if (!w || value < 1) return;
      const sign = Math.sign(arcChain(floor, w.id)?.sagitta ?? w.sagitta ?? 0) || 1;
      if (!setChainSagitta(floor, w.id, sign * value)) w.sagitta = sign * value;
      ok = true;
    } else if (t.kind === 'wall-thickness') {
      const w = floor.walls[t.wallId];
      if (!w || value < 10) return;
      w.thickness = Math.round(value);
      ok = true;
    } else if (t.kind === 'circle-diameter') {
      if (value < 10) return;
      ok = resizeCircle(floor, t.wallId, value / 2);
    } else if (t.kind === 'junction-gap') {
      ok = setHostedGap(floor, t.wallId, t.nodeId, t.to, value);
    } else if (t.kind === 'protrusion-sagitta') {
      // znaménko (strana vyklenutí) zůstává; u rovného úseku ven od výstupku (+ = vlevo od směru obrysu)
      const cur = floor.protrusions?.[t.protrusionId]?.pts[t.seg]?.s ?? 0;
      ok = setProtrusionSagitta(floor, t.protrusionId, t.seg, (Math.sign(cur) || defaultArcSign(floor, t.protrusionId, t.seg)) * value);
    } else if (t.kind === 'protrusion-dim') {
      ok = applyProtrusionDim(floor, t.protrusionId, t.dim, value);
    } else if (t.kind === 'comp-gap') {
      ok = setComponentGap(floor, t.wallId, t.side, value);
    }
  });
  return ok;
}
