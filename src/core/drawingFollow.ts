/**
 * Konec čáry kresby na líci stěny jede se stěnou (rozhodnutí uživatele 2026-11-22; dřív kresba ke stěně jen
 * přichytávala bez vazby). Jediné místo pravidla – volá ho `store.edit` po každé úpravě.
 *
 * - Týká se jen **čáry** (otevřené lomené, první a poslední bod) a **dvojité čáry** (konce první čáry); obdélník,
 *   kruh, oblouk ne (rozhodnutí uživatele).
 * - Připojení se pozná podle polohy (data se nemění): konec leží do `ON_FACE` mm na líci rovné stěny (u stěny bez
 *   tloušťky na její čáře), v rozsahu stěny prodlouženém o tloušťky stěn v rozích. Odtažením konce z líce se odpojí.
 * - Posun konce: po přímce koncového úseku (čára se prodlouží / zkrátí, směr zůstane); konec v rohu dvou líců jde do
 *   průsečíku nových líců; konec úseku ležícího podél líce se posune kolmo s lícem (čára celá na líci jede s ním).
 *   Líce se párují podle strany: po otočení strany / změně osy stěny jede konec s lícem na téže straně.
 * - Při tažení (gesto) se připojení určuje podle stavu na začátku tažení – stěna, která přejede přes konec cizí
 *   čáry, ji „nesebere“.
 * - Konec, který by se posunul o víc než `MAX_GAIN` × posun líce (čára skoro rovnoběžná s lícem), nechá celou
 *   kresbu na místě.
 * - Platí pro každou změnu stěny (tažení stěny / rohu, kóta, NumPad, tloušťka, strana). Kresba, kterou úprava sama
 *   změnila (posun skupiny, úchyt), se nedorovnává. Oblouková a kruhová stěna zatím ne.
 * - Kdyby se čára obrátila nebo zkrátila na nulu, nechá se na místě.
 */
import type { Floor, Id, Pt, Wall } from '../model/types';
import { add, dist, dot, normal, scale, sub, unit } from './geometry';
import { wallFaceOffset } from './floorQueries';

/** Tolerance „konec leží na líci“ (mm). */
const ON_FACE = 1;
/** Největší posun konce vůči posunu líce v tom místě (jinak by se čára skoro rovnoběžná s lícem prodloužila o metry). */
const MAX_GAIN = 10;

interface FaceLine {
  wallId: Id;
  /** 1 / −1 = líc na kladné / záporné straně normal(a→b); u stěny bez tloušťky 1 (čára stěny). */
  side: 1 | -1;
  p: Pt;
  d: Pt;
  len: number;
  /** Přesah rozsahu za roh (tloušťky stěn v rozích). */
  margin: number;
}

const straight = (w: Wall): boolean => w.radius === undefined && !w.sagitta && w.a !== w.b;

/** Největší tloušťka stěn v každém rohu (přesah líce za roh). */
function cornerThickness(floor: Floor): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const w of Object.values(floor.walls)) for (const n of [w.a, w.b]) m.set(n, Math.max(m.get(n) ?? 0, w.thickness));
  return m;
}

/** Líce rovné stěny jako přímky (u stěny bez tloušťky jedna). */
function faceLines(floor: Floor, w: Wall, corners: Map<Id, number>): FaceLine[] {
  const a = floor.nodes[w.a];
  const b = floor.nodes[w.b];
  if (!a || !b || !straight(w) || dist(a, b) < 1e-6) return [];
  const d = unit(a, b);
  const n = normal(d);
  const margin = Math.max(corners.get(w.a) ?? 0, corners.get(w.b) ?? 0);
  const sides: (1 | -1)[] = w.thickness > 0 ? [1, -1] : [1];
  return sides.map(side => ({ wallId: w.id, side, p: add(a, scale(n, wallFaceOffset(w, side))), d, len: dist(a, b), margin }));
}

function onFace(f: FaceLine, q: Pt): boolean {
  const r = sub(q, f.p);
  const u = dot(r, f.d);
  return Math.abs(dot(r, normal(f.d))) <= ON_FACE && u >= -f.margin - ON_FACE && u <= f.len + f.margin + ON_FACE;
}

/** Průsečík přímek (p + t·d) a (q + s·e); null = rovnoběžné. */
function cross(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return add(p, scale(d, t));
}

/** Kresby, jejichž konce se dorovnávají, a indexy jejich koncových bodů. */
function followEnds(floor: Floor): { id: Id; ends: number[] }[] {
  const out: { id: Id; ends: number[] }[] = [];
  for (const dr of Object.values(floor.drawings ?? {})) {
    if (dr.shape === 'double' && dr.pts.length === 2) out.push({ id: dr.id, ends: [0, 1] });
    else if (dr.shape === 'line' && !dr.closed && dr.pts.length >= 2) out.push({ id: dr.id, ends: [0, dr.pts.length - 1] });
  }
  return out;
}

/** Změnila se poloha / tvar stěny? (levné porovnání bez výpočtu líců) */
function wallChanged(b: Floor, a: Floor, w0: Wall, w1: Wall): boolean {
  const pa0 = b.nodes[w0.a];
  const pb0 = b.nodes[w0.b];
  const pa1 = a.nodes[w1.a];
  const pb1 = a.nodes[w1.b];
  if (!pa0 || !pb0 || !pa1 || !pb1) return false;
  return pa0.x !== pa1.x || pa0.y !== pa1.y || pb0.x !== pb1.x || pb0.y !== pb1.y || w0.thickness !== w1.thickness || w0.side !== w1.side || w0.axis !== w1.axis;
}

/**
 * Dorovná konce čar kresby na lících stěn, které úprava `before` → `f` posunula. Vrací true, když něco posunula.
 * `f` může být rozpracovaný stav (immer draft). `start` = stav na začátku tažení (připojení se určuje podle něj).
 */
export function followWallDrawings(before: Floor | undefined, f: Floor, start?: Floor): boolean {
  if (!before || !f.drawings) return false;
  const cands = followEnds(before);
  if (!cands.length) return false;
  // stěny, které se změnily – teprve u nich se počítají staré a nové líce
  const changedIds: Id[] = [];
  for (const w0 of Object.values(before.walls)) {
    const w1 = f.walls[w0.id];
    if (w1 && straight(w0) && straight(w1) && wallChanged(before, f, w0, w1)) changedIds.push(w0.id);
  }
  if (!changedIds.length) return false;
  const c0 = cornerThickness(before);
  const c1 = cornerThickness(f);
  const cs = start && cornerThickness(start);
  const moved = new Map<Id, { old: FaceLine[]; now: FaceLine[]; start: FaceLine[] | null }>();
  for (const id of changedIds) {
    const old = faceLines(before, before.walls[id]!, c0);
    const now = faceLines(f, f.walls[id]!, c1);
    const sw = start?.walls[id];
    if (old.length !== now.length || !old.length) continue;
    moved.set(id, { old, now, start: sw && cs && straight(sw) ? faceLines(start, sw, cs) : null });
  }
  if (!moved.size) return false;
  const all = [...moved.values()];
  let changed = false;
  for (const { id, ends } of cands) {
    const d0 = before.drawings![id]!;
    const d1 = f.drawings[id];
    // kresbu, kterou úprava sama změnila (nebo smazala), nechat být
    if (!d1 || d1.pts.length !== d0.pts.length || d1.pts.some((p, i) => p.x !== d0.pts[i]!.x || p.y !== d0.pts[i]!.y)) continue;
    const next = d0.pts.map(p => ({ x: p.x, y: p.y }));
    for (const i of ends) {
      const q = d0.pts[i]!;
      // líce (posunutých stěn), na kterých konec leží
      const hits: { old: FaceLine; now: FaceLine }[] = [];
      // při tažení: konec musel na líci (téže strany) ležet už na začátku tažení
      const q0 = start ? start.drawings?.[id]?.pts[i] : q;
      for (const m of all) {
        m.old.forEach((fl, k) => {
          if (!onFace(fl, q)) return;
          if (start && !(q0 && m.start?.[k] && onFace(m.start[k]!, q0))) return;
          hits.push({ old: fl, now: m.now[k]! });
        });
      }
      if (!hits.length) continue;
      // líc nepohnuté stěny drží konec také (roh s pevnou stěnou)
      const fixed = staticFaces(before, moved, q, c0);
      const lines = [...hits.map(h => h.now), ...fixed];
      let p: Pt | null = null;
      // konec v rohu dvou líců → průsečík
      for (let x = 0; x < lines.length && !p; x++) for (let y = x + 1; y < lines.length && !p; y++) if (lines[x]!.wallId !== lines[y]!.wallId) p = cross(lines[x]!.p, lines[x]!.d, lines[y]!.p, lines[y]!.d);
      if (!p) {
        // jeden líc: po přímce koncového úseku, úsek podél líce kolmo
        const nb = d0.pts[i === 0 ? 1 : i - 1]!;
        const fl = hits[0]!.now;
        p = dist(nb, q) > 1e-6 ? cross(q, unit(nb, q), fl.p, fl.d) : null;
        p ??= add(fl.p, scale(fl.d, dot(sub(q, fl.p), fl.d)));
      }
      // posun konce nejvýš MAX_GAIN × posun líce v tom místě
      const shift = Math.max(...hits.map(h => Math.abs(dot(sub(q, h.now.p), normal(h.now.d)))));
      if (dist(p, q) > MAX_GAIN * shift + ON_FACE) {
        next.length = 0;
        break;
      }
      next[i] = { x: p.x, y: p.y };
    }
    if (!next.length) continue;
    // čára se nesmí obrátit ani zkrátit na nulu (u lomené čáry hlídá koncové úseky)
    const ok = ends.every(i => {
      const j = i === 0 ? 1 : i - 1;
      const v0 = sub(d0.pts[i]!, d0.pts[j]!);
      const v1 = sub(next[i]!, next[j]!);
      return dot(v0, v1) > 0 && Math.hypot(v1.x, v1.y) > 1;
    });
    if (!ok) continue;
    ends.forEach(i => {
      if (next[i]!.x === d1.pts[i]!.x && next[i]!.y === d1.pts[i]!.y) return;
      d1.pts[i]!.x = next[i]!.x;
      d1.pts[i]!.y = next[i]!.y;
      changed = true;
    });
  }
  return changed;
}

/** Líce stěn, které se nepohnuly a na kterých bod leží (konec v rohu s pevnou stěnou zůstane na ní). */
function staticFaces(before: Floor, moved: Map<Id, unknown>, q: Pt, corners: Map<Id, number>): FaceLine[] {
  const out: FaceLine[] = [];
  for (const w of Object.values(before.walls)) if (!moved.has(w.id)) for (const fl of faceLines(before, w, corners)) if (onFace(fl, q)) out.push(fl);
  return out;
}
