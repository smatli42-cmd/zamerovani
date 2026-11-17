/**
 * Přichycení konce kreslené stěny / čáry na líc stěny s tloušťkou (nástroje Stěna a Čára, tools/wallTool.ts).
 */
import { add, dist, dot, scale, sub, unit } from '../core/geometry';
import type { DragLine } from '../core/dragResolve';
import { canHostOnFace, findWallNear } from '../core/floorQueries';
import type { SnapResult } from '../core/snapping';
import type { Floor, Pt } from '../model/types';
import { faceOffset, findFaceNear, wallFrame, worldToProfile, type FaceHit, type Frame } from '../core/protrusion';
import { store } from '../store/store';
import { HIT_PX } from './types';

/**
 * Nástroj Stěna: konec (i začátek) u líce stěny s tloušťkou (rovné i oblouku) – i protějšího, i u osy uprostřed – se přichytí
 * přesně na líc a nová stěna se na něj napojí (`Node.hostFace`): začne na líci, její délka je viditelná délka.
 * Roh a zvláštní bod mají přednost; napojení na čáru stěny jen, je-li pero blíž k ní než k líci.
 * Na pomocné čáře / ve směru kreslení se bere průsečík s lícem.
 */
export function snapToHostFace(floor: Floor, r: SnapResult, raw: Pt, line: DragLine | null, from: Pt | null): SnapResult {
  const { settings, camera } = store.get();
  if (!settings.snap || r.node || r.special) return r;
  const tol = HIT_PX.snapNode / camera.zoom;
  const ok = (h: FaceHit | null) => !!h && canHostOnFace(h.wall) && Math.abs(faceOffset(h.wall, h.side)) > 0.5;
  let hit = line ? findFaceNear(floor, r.pt, tol) : null;
  if (!ok(hit)) hit = findFaceNear(floor, raw, tol);
  if (!hit || !ok(hit)) return r;
  // napojení na čáru stěny, je-li pero blíž k ní
  if (r.wallHit && dist(raw, r.wallHit.point) <= hit.distance) return r;
  if (from) {
    // začátek na téže stěně (líc i čára) → konec se na její líc nepřichytí (stěna by ležela v těle / v líci)
    if (findFaceNear(floor, from, 1, hit.wall.id) || findWallNear(floor, from, 1)?.wall.id === hit.wall.id) return r;
    // líc jen pro stěnu přicházející zvenku (ne přes tělo a osu – to by bylo křížení)
    const fr = wallFrame(floor, hit.wall);
    const v = fr ? worldToProfile(fr, hit.wall, hit.side, from).v : 0;
    if (v <= 0) return r;
  }
  let pt = hit.point;
  const f = wallFrame(floor, hit.wall);
  const dirLine: DragLine | null = line ?? (from && dist(from, raw) > 1 ? { id: 'draw', origin: from, dir: unit(from, raw), weight: 1 } : null);
  if (f && dirLine) {
    const x = lineFaceCrossing(f, hit, dirLine, line ? r.pt : raw, tol) ?? lineFaceCrossing(f, hit, dirLine, raw, tol);
    if (x) pt = x;
  }
  return { pt, node: null, wallHit: null, guides: [], special: true };
}

/**
 * Nástroj Čára: konec u líce stěny (i protějšího, i u osy uprostřed) se přichytí přesně na líc;
 * je-li zachycená pomocná čára, na její průsečík s lícem. Roh a zvláštní bod mají přednost.
 */
export function snapToFace(floor: Floor, r: SnapResult, raw: Pt, line: DragLine | null, from: Pt | null): SnapResult {
  const { settings, camera } = store.get();
  if (!settings.snap || r.node) return r;
  const tol = HIT_PX.snapNode / camera.zoom;
  // u pomocné čáry poloha na ní; když ji zarovnání s rohem odtáhlo od líce, rozhoduje poloha pera
  const hit = (line ? findFaceNear(floor, r.pt, tol) : null) ?? findFaceNear(floor, raw, tol);
  if (!hit) return r;
  // konec čáry se na líc přichytí, jen když se k němu čára vrací (začátek je od líce dál) – jinak by se
  // mělký výstupek „přilepil“ zpět na líc (chyba od uživatele 2026-11-13)
  if (from) {
    // úsek začínající na líci stěny nekončí na protějším líci téže stěny (hluboké vybrání by prošlo celou tloušťkou)
    const fromFace = findFaceNear(floor, from, 1, hit.wall.id);
    if (fromFace && fromFace.side !== hit.side) return r;
    const f = wallFrame(floor, hit.wall);
    const startDist = f ? Math.abs(worldToProfile(f, hit.wall, hit.side, from).v) : 0;
    if (hit.distance >= startDist * 0.5) return r;
  }
  let pt = hit.point;
  if (line) {
    // průsečík pomocné čáry s lícem (rovným i obloukovým – u oblouku líc není přímka, chyba od uživatele
    // 2026-11-13: konec na vypouklém líci skončil vedle něj): hledá se na čáře poblíž pera změnou znaménka
    const f = wallFrame(floor, hit.wall);
    const x = f ? (lineFaceCrossing(f, hit, line, r.pt, tol) ?? lineFaceCrossing(f, hit, line, raw, tol)) : null;
    if (x) pt = x;
  }
  return { pt, node: null, wallHit: null, guides: [], special: true };
}

/** Bod na pomocné čáře nejblíž `near` (do 2× tol), kde čára protíná líc `hit` (posun v = 0); null = neprotíná. */
function lineFaceCrossing(f: Frame, hit: FaceHit, line: DragLine, near: Pt, tol: number): Pt | null {
  const P = (t: number) => add(line.origin, scale(line.dir, t));
  const v = (t: number) => worldToProfile(f, hit.wall, hit.side, P(t)).v;
  const t0 = dot(sub(near, line.origin), line.dir);
  const N = 40;
  let best: number | null = null;
  for (let i = -N; i < N; i++) {
    let lo = t0 + (i * 2 * tol) / N;
    let hi = t0 + ((i + 1) * 2 * tol) / N;
    let vlo = v(lo);
    if (vlo === 0) {
      best = best === null || Math.abs(lo - t0) < Math.abs(best - t0) ? lo : best;
      continue;
    }
    if (Math.sign(vlo) === Math.sign(v(hi))) continue;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      const vm = v(m);
      if (Math.sign(vm) === Math.sign(vlo)) {
        lo = m;
        vlo = vm;
      } else hi = m;
    }
    const t = (lo + hi) / 2;
    if (best === null || Math.abs(t - t0) < Math.abs(best - t0)) best = t;
  }
  return best === null ? null : P(best);
}
