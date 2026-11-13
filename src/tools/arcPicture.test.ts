/**
 * Obrázek od uživatele 2026-11-13 (3): oblouková stěna – tětiva 4570 svisle, vzepětí 2210 doprava, osa (čára s rohy)
 * na vnitřním líci, tělo 300 ven. Tvary kreslené nástrojem Čára od vnitřní čáry stěny:
 * (1) přes celou tloušťku ven = výstupek na vnějším líci, (2) do těla = vybrání.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addRectWalls, addWall } from '../store/actions';
import { store } from '../store/store';
import { faceOffset, profileToWorld, protrusionDims, wallFrame } from '../core/protrusion';
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

  for (const order of ['zakladna-prvni', 'zakladna-posledni'] as const) {
    for (const face of ['vypoukly', 'vyduty'] as const) {
      it(`obrázek 5: uzavřený tvar ze 4 čar na oblouku (${face} líc, ${order})`, () => {
        const z = 0.6; // přiblížení, při kterém šikmé čáry nechytí vodorovné / svislé pomocné čáry
        store.openProject(createProject({ name: 't' }));
        store.set({ camera: { x: 0, y: 0, zoom: z }, selection: null, tool: 'wall' });
        const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 5610 }, null, false, { thickness: 300, side: 1, sagitta: -700 })!;
        const w = f().walls[W]!;
        const fr = wallFrame(f(), w)!;
        const conv: 1 | -1 = profileToWorld(fr, w, 1, { u: 2800, v: 0 }).x > profileToWorld(fr, w, -1, { u: 2800, v: 0 }).x ? 1 : -1;
        const side: 1 | -1 = face === 'vypoukly' ? conv : conv === 1 ? -1 : 1;
        store.set({ tool: 'line' });
        const P = (u: number, v: number): [number, number] => {
          const q = profileToWorld(fr, w, side, { u, v });
          return [q.x, q.y];
        };
        const pen = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * z, y: y * z }, device: 'pen' });
        const stroke = (p: [number, number], q: [number, number]) => {
          wallTool.down!(pen(...p));
          wallTool.drag!(pen((p[0] * 2 + q[0]) / 3, (p[1] * 2 + q[1]) / 3));
          wallTool.drag!(pen(...q));
          wallTool.up!(pen(...q));
        };
        const A = P(1500, 0);
        const B = P(1500, 700);
        const C = P(2300, 700);
        const D = P(2300, 0);
        if (order === 'zakladna-prvni') {
          stroke(D, A);
          stroke(A, B);
          stroke(B, C);
          stroke(C, D);
        } else {
          stroke(A, B);
          stroke(B, C);
          stroke(C, D);
          stroke(D, A);
        }
        expect(prots()).toHaveLength(1);
        expect(prots()[0]).toMatchObject({ wallId: W, side, mode: 'add' });
        expect(Object.keys(f().walls)).toEqual([W]);
      });
    }
  }

  for (const face of ['vypoukly', 'vyduty'] as const) {
    it(`obrázek 5: uzavřený tvar přes líc (část zasahuje do těla) – venkovní část je výstupek (${face})`, () => {
      const z = 0.6;
      store.openProject(createProject({ name: 't' }));
      store.set({ camera: { x: 0, y: 0, zoom: z }, selection: null, tool: 'wall' });
      const W = addWall({ x: 0, y: 0 }, null, { x: 0, y: 5610 }, null, false, { thickness: 300, side: 1, sagitta: -700 })!;
      const w = f().walls[W]!;
      const fr = wallFrame(f(), w)!;
      const conv: 1 | -1 = profileToWorld(fr, w, 1, { u: 2800, v: 0 }).x > profileToWorld(fr, w, -1, { u: 2800, v: 0 }).x ? 1 : -1;
      const side: 1 | -1 = face === 'vypoukly' ? conv : conv === 1 ? -1 : 1;
      store.set({ tool: 'line' });
      const P = (u: number, v: number): [number, number] => {
        const q = profileToWorld(fr, w, side, { u, v });
        return [q.x, q.y];
      };
      const pen = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * z, y: y * z }, device: 'pen' });
      const stroke = (p: [number, number], q: [number, number]) => {
        wallTool.down!(pen(...p));
        wallTool.drag!(pen((p[0] * 2 + q[0]) / 3, (p[1] * 2 + q[1]) / 3));
        wallTool.drag!(pen(...q));
        wallTool.up!(pen(...q));
      };
      // základna 120 mm uvnitř těla (ne na líci), tvar ven
      const A = P(1500, -120);
      const B = P(1500, 700);
      const C = P(2300, 700);
      const D = P(2300, -120);
      stroke(A, B);
      stroke(B, C);
      stroke(C, D);
      stroke(D, A);
      expect(prots()).toHaveLength(1);
      expect(prots()[0]).toMatchObject({ wallId: W, side, mode: 'add' });
      expect(Object.keys(f().walls)).toEqual([W]);
      const d = protrusionDims(f(), prots()[0]!)!;
      expect(d.depth).toBeGreaterThan(690);
      expect(d.depth).toBeLessThan(705); // oříznuto v líci (bez části v těle)
      const pts = prots()[0]!.pts;
      expect(pts[0]!.v).toBe(0);
      expect(pts[pts.length - 1]!.v).toBe(0);
    });
  }

  it('obdélník přes rovnou stěnu (překrývá líc) = výstupek z venkovní části', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 })!; // tělo y 0–300
    addRectWalls({ x: 2000, y: -400 }, { x: 2500, y: 100 }, 'solid'); // přesahuje líc y = 0 o 100 do těla
    expect(prots()).toHaveLength(1);
    expect(prots()[0]).toMatchObject({ wallId: W, mode: 'add' });
    expect(protrusionDims(f(), prots()[0]!)).toMatchObject({ width: 500, depth: 400 });
  });

  it('obdélník ve vnitřním rohu dvou stěn zůstane čarami (nezapadne do sousední stěny); tvar skoro celý v těle není výstupek', () => {
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 }); // tělo y 0–300
    addWall({ x: 0, y: 0 }, null, { x: 0, y: 5000 }, null, false, { thickness: 300, side: -1 }); // tělo x 0–300
    addRectWalls({ x: 100, y: 100 }, { x: 600, y: 700 }, 'solid');
    expect(prots()).toHaveLength(0);
    store.openProject(createProject({ name: 't' }));
    addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 });
    addRectWalls({ x: 2000, y: -10 }, { x: 2500, y: 290 }, 'solid'); // 10 mm venku, 290 v těle
    expect(prots()).toHaveLength(0);
  });

  it('obdélník přes líc: jeden krok Zpět vrátí čáry i stěnu', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 5000, y: 0 }, null, false, { thickness: 300, side: 1 })!;
    const before = JSON.stringify(f());
    addRectWalls({ x: 2000, y: -400 }, { x: 2500, y: 100 }, 'solid');
    expect(prots()).toHaveLength(1);
    store.undo();
    expect(JSON.stringify(f())).toBe(before);
    expect(Object.keys(f().walls)).toEqual([W]);
  });
});
