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
});
