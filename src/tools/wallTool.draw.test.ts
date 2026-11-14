/**
 * Připomínka uživatele 2026-11-12: nová stěna se musí dát kreslit libovolným směrem, vodorovně / svisle
 * pomáhá fialová pomocná čára (jako při úpravě stěny, D11/D13).
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addWall } from '../store/actions';
import { store } from '../store/store';
import { wallTool } from './wallTool';
import type { PointerInput } from './types';

const Z = 0.1;
const at = (x: number, y: number): PointerInput => ({ world: { x, y }, screen: { x: x * Z, y: y * Z }, device: 'pen' });
function draw(pts: [number, number][]) {
  wallTool.down!(at(...pts[0]!));
  for (const p of pts.slice(1)) wallTool.drag!(at(...p));
  wallTool.up!(at(...pts[pts.length - 1]!));
}
function open() {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: Z }, selection: null, tool: 'wall' });
  store.updateSettings({ snap: true, wallShape: 'straight' });
}
const lastWall = () => {
  const f = store.floor()!;
  const ws = Object.values(f.walls);
  const w = ws[ws.length - 1]!;
  return { a: f.nodes[w.a]!, b: f.nodes[w.b]!, w };
};

describe('kreslení nové stěny libovolným směrem', () => {
  it('šikmo (30°) se nakreslí šikmo, ne vodorovně', () => {
    open();
    draw([[0, 0], [1000, 577], [2000, 1155]]);
    const { a, b } = lastWall();
    expect(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)).toBeCloseTo(30, 0);
  });

  it('skoro vodorovně se přichytí na vodorovnou pomocnou čáru (délka po 10 mm)', () => {
    open();
    draw([[0, 0], [1000, 60], [2003, 90]]);
    const { b } = lastWall();
    expect(b).toMatchObject({ x: 2000, y: 0 });
  });

  it('konec u oblouku se přichytí na oblouk a napojí se (oblouk se nerozdělí)', () => {
    open();
    const R = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1, sagitta: 800 })!;
    // svisle dolů z (2000, −2000) k vrcholu oblouku (2000, 800), konec kousek za obloukem
    draw([[2000, -2000], [2010, 0], [2020, 860]]);
    const f = store.floor()!;
    const { w } = lastWall();
    const end = f.nodes[w.b]!;
    expect(end.host).toBe(R);
    expect(end.x).toBeCloseTo(2000, 6);
    expect(end.y).toBeCloseTo(800, 3);
    expect(Object.values(f.walls).filter(x => x.sagitta)).toHaveLength(1);
  });
});

describe('kreslení – nálezy revieweru', () => {
  it('3° od vodorovné daleko od počátku: stěna zůstane šikmá (žádné tiché srovnání)', () => {
    open();
    const a = (3 * Math.PI) / 180;
    draw([[0, 0], [3000 * Math.cos(a), 3000 * Math.sin(a)], [6000 * Math.cos(a), 6000 * Math.sin(a)]]);
    const { a: p, b: q } = lastWall();
    expect(Math.atan2(q.y - p.y, q.x - p.x) * (180 / Math.PI)).toBeCloseTo(3, 0);
  });

  it('vodorovně k šikmé stěně (30°): konec se napojí na stěnu, i když je zachycená vodorovná čára', () => {
    open();
    const S = addWall({ x: 2000, y: -1000 }, null, { x: 2000 + 4000 * Math.cos(Math.PI / 3), y: -1000 + 4000 * Math.sin(Math.PI / 3) }, null, false, { thickness: 0 })!;
    // šikmá stěna protíná y = 0 v x = 2000 + 1000 / tan 60° ≈ 2577,35
    draw([[0, 0], [1500, 30], [2560, 40]]);
    const f = store.floor()!;
    const { w } = lastWall();
    expect(f.nodes[w.b]!.host).toBe(S);
  });
});

describe('přichytávání k oběma lícům stěny (nástroj Stěna)', () => {
  // průběžná stěna A: osa y = 0, tělo y ∈ [0, 300] → vnější líc y = 300
  const hostWall = () => addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: 1 })!;

  it('začátek u vnějšího líce se přichytí na líc a napojí (roh mimo osu)', () => {
    open();
    const A = hostWall();
    draw([[2000, 330], [2000, 1300], [2000, 2300]]);
    const { a, b, w } = lastWall();
    expect(a).toMatchObject({ x: 2000, y: 300, host: A, hostFace: 1 });
    expect(b).toMatchObject({ x: 2000, y: 2300 });
    expect(Object.keys(store.floor()!.walls)).toHaveLength(2);
    expect(w.id).not.toBe(A);
  });

  it('konec u vnějšího líce se přichytí přesně na líc ve směru kreslení', () => {
    open();
    const A = hostWall();
    draw([[1000, 2300], [1000, 1000], [1000, 340]]);
    const { b } = lastWall();
    expect(b).toMatchObject({ x: 1000, y: 300, host: A, hostFace: 1 });
  });

  it('u čáry stěny (osy) se dál napojí na ni', () => {
    open();
    const A = hostWall();
    draw([[1000, -2000], [1000, -1000], [1000, -20]]);
    const { b } = lastWall();
    expect(b).toMatchObject({ x: 1000, y: 0, host: A });
    expect(b.hostFace).toBeUndefined();
  });

  it('stěna začatá na čáře stěny nekončí na jejím protějším líci (neleží v těle)', () => {
    open();
    hostWall();
    draw([[1000, 0], [1000, 150], [1000, 320]]);
    const { b } = lastWall();
    expect(b.hostFace).toBeUndefined();
  });

  it('konec přicházející přes tělo (z druhé strany) se na vnější líc nepřichytí', () => {
    open();
    hostWall();
    draw([[3000, -1000], [3000, 0], [3000, 320]]);
    const { b } = lastWall();
    expect(b.hostFace).toBeUndefined();
  });
});

