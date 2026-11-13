/**
 * Obrázek od uživatele 2026-11-13 (3): oblouková stěna – tětiva 4570 svisle, vzepětí 2210 doprava, osa (čára s rohy)
 * na vnitřním líci, tělo 300 ven. Tvary kreslené nástrojem Čára od vnitřní čáry stěny:
 * (1) přes celou tloušťku ven = výstupek na vnějším líci, (2) do těla = vybrání.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addWall } from '../store/actions';
import { store } from '../store/store';
import { faceOffset, profileToWorld, wallFrame } from '../core/protrusion';
import { bodyRange } from '../core/wallBody';
import { wallTool } from './wallTool';
import type { PointerInput } from './types';

const Z = 0.1;
const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
function draw(p: [number, number], q: [number, number]) {
  wallTool.down!(at(...p));
  wallTool.drag!(at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2));
  wallTool.drag!(at(...q));
  wallTool.up!(at(...q));
}
const f = () => store.floor()!;
const prots = () => Object.values(f().protrusions ?? {});

function setup() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'wall' });
  store.updateSettings({ snap: true, wallShape: 'straight', wallAxis: 'face' });
  // tělo ven od středu oblouku: zkusit obě strany, vybrat tu, kde je vnější líc dál od středu
  let W = '';
  for (const side of [1, -1] as const) {
    store.openProject(createProject({ name: 't' }));
    store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'wall' });
    W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 4570 }, null, false, { thickness: 300, side, sagitta: -2210 })!; // a→b dolů, záporné vzepětí = vyklenutí doprava
    const w = f().walls[W]!;
    const fr = wallFrame(f(), w)!;
    const mid = fr.at(fr.len / 2);
    const farSide = bodyRange(w)[1] > 0 ? 1 : -1;
    const far = profileToWorld(fr, w, farSide, { u: fr.len / 2, v: 0 });
    if (far.x > mid.p.x) break; // tělo míří ven (doprava)
  }
  store.set({ tool: 'line' });
  const w = f().walls[W]!;
  const fr = wallFrame(f(), w)!;
  const axisSide: 1 | -1 = faceOffset(w, 1) === 0 ? 1 : -1;
  const inner = (u: number) => profileToWorld(fr, w, axisSide, { u, v: 0 });
  return { W, inner, fr, axisSide };
}

describe('obrázek: tvary od vnitřní čáry obloukové stěny', () => {
  it('(1) čáry od osy přes celou tloušťku ven → výstupek na vnějším líci', () => {
    const { W, inner, axisSide } = setup();
    const p1 = inner(2400);
    const p2 = inner(3000);
    const a: [number, number] = [p1.x, p1.y];
    const b: [number, number] = [p1.x + 900, p1.y];
    const c: [number, number] = [p1.x + 900, p2.y];
    const d: [number, number] = [p2.x, p2.y];
    draw(a, b);
    draw(b, c);
    draw(c, d);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ wallId: W, mode: 'add' });
    expect(prots()[0]!.side).not.toBe(axisSide); // na vnějším líci
    expect(Object.values(f().walls)).toHaveLength(1);
  });

  it('(2) čáry od osy do těla → vybrání', () => {
    const { W, inner } = setup();
    const p1 = inner(3300);
    const p2 = inner(3900);
    draw([p1.x, p1.y], [p1.x + 180, p1.y]);
    draw([p1.x + 180, p1.y], [p1.x + 180, p2.y]);
    draw([p1.x + 180, p2.y], [p2.x, p2.y]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ wallId: W, mode: 'subtract' });
  });

  it('obrázek 4: vypouklý vnější líc, čáry po pomocných čarách (vodorovně, svisle, zpět) – konec na líci, ne vedle', () => {
    const z = 0.18;
    // jako na obrázku: čára stěny s rohy na vyduté straně, tělo ven, výstupek na vypouklém protějším líci
    let W = '';
    let outer: 1 | -1 = 1;
    for (const side of [1, -1] as const) {
      store.openProject(createProject({ name: 't' }));
      store.set({ camera: { x: 0, y: 0, zoom: z }, selection: null, tool: 'wall' });
      W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 4690 }, null, false, { thickness: 300, side, sagitta: -500 })!;
      const ww = f().walls[W]!;
      const ff = wallFrame(f(), ww)!;
      outer = profileToWorld(ff, ww, 1, { u: 2000, v: 0 }).x > profileToWorld(ff, ww, -1, { u: 2000, v: 0 }).x ? 1 : -1;
      if (faceOffset(ww, outer) !== 0) break; // vypouklý líc není čára stěny
    }
    const w = f().walls[W]!;
    const fr = wallFrame(f(), w)!;
    expect(faceOffset(w, outer)).not.toBe(0);
    store.set({ tool: 'line' });
    const p0 = profileToWorld(fr, w, outer, { u: 1100, v: 0 });
    const pen = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * z, y: y * z }, device: 'pen' });
    const stroke = (pts: [number, number][]) => {
      wallTool.down!(pen(...pts[0]!));
      for (const q of pts.slice(1)) wallTool.drag!(pen(...q));
      wallTool.up!(pen(...pts[pts.length - 1]!));
    };
    const x1 = p0.x + 860;
    stroke([[p0.x, p0.y], [p0.x + 400, p0.y + 3], [x1, p0.y + 5]]);
    stroke([[x1, p0.y], [x1 + 3, p0.y + 300], [x1, p0.y + 560]]);
    // zpět vodorovně – pero míří k líci (ten je tu o ~100 mm dál vpravo než počáteční bod, líc se zakřivuje);
    // zarovnání s počátečním rohem by konec odtáhlo do těla, líc má přednost
    stroke([[x1, p0.y + 560], [p0.x + 400, p0.y + 562], [p0.x + 50, p0.y + 563]]);
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ wallId: W, side: outer, mode: 'add' });
    expect(Object.keys(f().walls)).toEqual([W]);
  });

  it('šikmá rovná stěna: konec po vodorovné pomocné čáře se přichytí přesně na průsečík s lícem', () => {
    store.openProject(createProject({ name: 't' }));
    const z = 0.18;
    store.set({ camera: { x: 0, y: 0, zoom: z }, selection: null, tool: 'wall' });
    const W = addWall({ x: 0, y: 0 }, null, { x: 1500, y: 4500 }, null, false, { thickness: 300, side: 1 })!;
    store.set({ tool: 'line' });
    const pen = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * z, y: y * z }, device: 'pen' });
    const stroke = (pts: [number, number][]) => {
      wallTool.down!(pen(...pts[0]!));
      for (const q of pts.slice(1)) wallTool.drag!(pen(...q));
      wallTool.up!(pen(...pts[pts.length - 1]!));
    };
    // líc na čáře stěny (x = y / 3); výstupek doprava = od těla? tělo leží na straně normal(a→b) = vlevo dole
    stroke([[500, 1500], [1000, 1503], [1500, 1505]]);
    stroke([[1500, 1500], [1503, 2000], [1500, 2400]]);
    stroke([[1500, 2400], [1000, 2402], [810, 2404]]); // pero kousek vedle líce (líc je v x = 800)
    expect(prots()).toHaveLength(1);
    const last = Object.values(f().protrusions!)[0]!.pts;
    const end = profileToWorld(wallFrame(f(), f().walls[W]!)!, f().walls[W]!, prots()[0]!.side, last[last.length - 1]!);
    expect(end.x).toBeCloseTo(800, 0);
    expect(end.y).toBeCloseTo(2400, 0);
  });
});
