/**
 * Akce: výchozí hodnota a zápis hodnoty z NumPadu.
 */
import type { Floor } from '../../model/types';
import { arcChain, setChainSagitta } from '../../core/arcChain';
import { minOpeningWidth, openingStartFromA, openingsOnWall, wallLength } from '../../core/floorQueries';
import { chainEdge, chainIndex, keepOpeningsOnResizedWalls, pushChainRight } from '../../core/openingChain';
import { setComponentGap } from '../../core/components';
import { dimKey, dimValue } from '../../core/dimLock';
import { store, type NumPadTarget } from '../store';
import { setOpeningWidth, setReveal, setStartFromA } from './openings';
import { applyWallLength, resizeCircle } from './walls';
import { setWallLength } from '../../core/solver';
import { faceLength } from '../../core/wallBody';
import { hasBody } from '../../core/wallFace';
import { setHostedGap } from '../../core/hosting';
import { defaultArcSign, setProtrusionSagitta } from '../../core/protrusionEdit';
import { applyCornerDim, applyEndDim, applyProtrusionDim } from './protrusions';
import { freeDimValue, setFreeDimLength } from '../../core/freeDim';

/**
 * Míra líce u stěny s osou uprostřed (2b): délka osy se upraví tak, aby měl líc zadanou délku
 * (posouvá se konec B jako u délky stěny). Napojení v rozích se po posunu mění, proto se dorovnává
 * v několika krocích. Líc se neukládá – počítá se.
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

/** Výchozí hodnota zobrazená v NumPadu pro daný cíl = skutečná hodnota kóty z výkresu. */
export function numpadInitialValue(floor: Floor, t: NumPadTarget): number | null {
  if (t.kind === 'field') return null; // hodnotu předává openField
  const v = dimValue(floor, t);
  return v === null ? null : Math.round(v);
}

/**
 * Zapíše hodnotu z NumPadu do výkresu. `overrideLock` = uživatel potvrdil přepsání zamčené kóty
 * (její zámek zůstane, drží novou hodnotu). Ostatní zamčené kóty úpravu zastaví (store.edit).
 */
export function applyNumpadValue(t: NumPadTarget, value: number, overrideLock = false): boolean {
  if (!Number.isFinite(value) || value < 0 || t.kind === 'field') return false;
  const opts = overrideLock ? { allowKey: dimKey(t) } : {};
  if (t.kind === 'wall-length') return applyWallLength(t.wallId, value, t.move, opts);
  let ok = false;
  let chainFail = false; // řetěz otvorů: otvor by vyjel ze stěny / narazil na souseda
  let dimFail = false; // volná kóta: posun nedal zadanou délku
  const applied = store.edit(floor => {
    run(floor);
    // neúspěch = nic se nezmění (ani to, co recept stihl nastavit)
    return ok;
  }, {}, opts);
  // volná kóta: hodnota se ověří až po dorovnání napojených rohů (store.edit) – nesedí = vrátit
  if (applied && ok && t.kind === 'free-dim') {
    const v = freeDimValue(store.floor()!, t.dimId);
    if (v === null || Math.abs(v - value) > 0.5) {
      store.undo();
      ok = false;
      dimFail = true;
    }
  }
  if (dimFail) store.set({ lockBlock: { key: '', text: 'Nelze – kótu nejde nastavit na tuto délku (posunem se změní i druhý bod kóty nebo bod nejde posunout).' } });
  if (chainFail) store.set({ lockBlock: { key: '', text: 'Nelze – otvor, výstupek nebo napojená příčka by přesáhl souseda nebo konec stěny (nebo je konec stěny napojený na jinou stěnu).' } });
  return applied && ok;

  function run(floor: Floor): void {
    if (t.kind === 'field') return;
    if (t.kind === 'wall-face-length') {
      ok = setFaceLength(floor, t.wallId, t.face, value);
      // otvory zůstanou ve výkresu na místě (jako u celkové délky stěny)
      const before = store.floor();
      if (ok && before && keepOpeningsOnResizedWalls(before, floor) !== true) {
        ok = false;
        chainFail = true;
      }
    } else if (t.kind === 'opening-offset') {
      const op = floor.openings[t.openingId];
      const wall = op && floor.walls[op.wallId];
      if (!op || !wall) return;
      const i = chainIndex(floor, op);
      const n = Object.values(floor.openings).filter(o => o.wallId === wall.id).length;
      const cur = chainEdge(floor, op, t.ref)!;
      if (t.ref === 'a' && i === 0) {
        // odstup od rohu A: posune první otvor a vše, co je s ním spojené zamčenými kótami (ref otvoru se nemění)
        ok = pushChainRight(floor, wall.id, 0, value - cur);
        chainFail = !ok;
      } else if (t.ref === 'b' && i === n - 1 && !t.move) {
        // odstup k rohu B (poslední úsek řetězu): otvory zůstanou, stěna se prodlouží / zkrátí
        ok = pushChainRight(floor, wall.id, n, value - cur, true);
        chainFail = !ok;
      } else {
        const len = wallLength(floor, wall);
        op.ref = t.ref;
        op.offset = Math.round(value);
        setStartFromA(op, openingStartFromA(op, len), len);
        ok = true;
      }
    } else if (t.kind === 'opening-width') {
      const op = floor.openings[t.openingId];
      if (!op || value < minOpeningWidth(op)) return;
      const wall = floor.walls[op.wallId];
      const len = wall ? wallLength(floor, wall) : 0;
      const delta = Math.round(value) - op.width;
      if (op.ref === 'a' && wall && delta !== 0) {
        // levý okraj zůstane, pravý se posune; zamčené úseky napravo se posunou s ním (řetěz otvorů)
        const placed = openingsOnWall(floor, wall);
        const j = placed.findIndex(p => p.op.id === op.id);
        const next = placed[j + 1];
        const linked = next ? !!floor.dimLocks?.[`opening-gap:${op.id}:${next.op.id}`] : !!floor.dimLocks?.[`opening-offset:${op.id}:b`];
        const room = next ? next.start - placed[j]!.end : len - placed[j]!.end;
        if (!linked && delta > room + 0.5) {
          chainFail = true; // otvor by přesáhl souseda / konec stěny
          return;
        }
        op.width = Math.round(value);
        ok = !linked || pushChainRight(floor, wall.id, j + 1, delta, !next);
        chainFail = !ok;
      } else {
        setOpeningWidth(floor, op, value);
        ok = true;
      }
    } else if (t.kind === 'opening-reveal') {
      const op = floor.openings[t.openingId];
      if (!op) return;
      ok = setReveal(floor, op, t.part, value);
    } else if (t.kind === 'opening-gap') {
      // meziostění: posune druhý otvor a vše, co je s ním spojené zamčenými kótami (řetěz otvorů)
      const a = floor.openings[t.firstId];
      const b = floor.openings[t.secondId];
      const cur = numpadInitialValue(floor, t);
      if (!a || !b || cur === null || a.wallId !== b.wallId || chainIndex(floor, b) !== chainIndex(floor, a) + 1) return;
      ok = pushChainRight(floor, a.wallId, chainIndex(floor, b), Math.round(value) - cur);
      chainFail = !ok;
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
    } else if (t.kind === 'corner-dim') {
      ok = applyCornerDim(floor, t.protrusionId, t.dim, value);
    } else if (t.kind === 'end-dim') {
      ok = applyEndDim(floor, t.protrusionId, t.dim, value);
    } else if (t.kind === 'free-dim') {
      ok = setFreeDimLength(floor, t.dimId, value, t.move);
      if (!ok) dimFail = true;
      // prvky nesené stěnou zůstanou ve výkresu na místě (pravidlo jako u délky stěny, core/openingChain.ts)
      const before = store.floor();
      if (ok && before && keepOpeningsOnResizedWalls(before, floor) !== true) {
        ok = false;
        chainFail = true;
      }
    } else if (t.kind === 'comp-gap') {
      ok = setComponentGap(floor, t.wallId, t.side, value);
    }
  }
}
