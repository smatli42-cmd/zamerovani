/**
 * Přichytávání kresby (tools/drawSnap.ts) – připomínka uživatele 2026-11-19: čtverec čarami se nedal nakreslit
 * (u třetí čáry chybělo zarovnání se začátkem první), odpojená čára neměla pomocný směr ani kolmici.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import type { Pt } from '../model/types';
import { store } from '../store/store';
import { drawSnap } from './drawSnap';

const near = (p: Pt, q: Pt) => {
  expect(p.x).toBeCloseTo(q.x, 3);
  expect(p.y).toBeCloseTo(q.y, 3);
};

function line(id: string, pts: Pt[]) {
  store.edit(fl => void ((fl.drawings ??= {})[id] = { id, shape: 'line', pts: pts.map(p => ({ ...p })) }));
}

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.set({ camera: { x: 0, y: 0, zoom: 0.2 }, selection: null });
});

describe('zarovnání s body kresby', () => {
  it('třetí strana čtverce: vodorovně z C se konec přichytí pod začátek první čáry (a ukáže se odkud)', () => {
    line('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    const r = drawSnap(store.floor()!, { x: 23, y: 1006 }, { x: 1000, y: 1000 }, undefined, { align: true });
    near(r.pt, { x: 0, y: 1000 });
    expect(r.guide?.id).toBe('axis:x');
    expect(r.guides).toHaveLength(1);
    near(r.guides[0]!.from, { x: 0, y: 0 });
  });

  it('volný bod (bez pomocné čáry) se zarovná x i y s body kresby', () => {
    line('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    const r = drawSnap(store.floor()!, { x: 27, y: 1530 }, null, undefined, { align: true });
    expect(r.pt.x).toBe(0);
    expect(r.guides.map(g => g.from)).toContainEqual({ x: 0, y: 0 });
  });

  it('konec čáry dosedne na průsečík pomocné čáry s jinou čárou kresby', () => {
    line('V', [{ x: 2000, y: -500 }, { x: 2000, y: 1500 }]);
    const r = drawSnap(store.floor()!, { x: 1975, y: 8 }, { x: 0, y: 0 });
    near(r.pt, { x: 2000, y: 0 });
  });
});

describe('pomocné čáry od čáry kresby', () => {
  it('nová čára z konce šikmé čáry drží její směr (pokračování) a kolmici', () => {
    line('D', [{ x: 0, y: 0 }, { x: 1000, y: 1000 }]);
    const f = store.floor()!;
    const cont = drawSnap(f, { x: 1520, y: 1490 }, { x: 1000, y: 1000 });
    expect(cont.guide?.id).toMatch(/^dcont:/);
    // na prodloužení čáry (x = y), délka od počátku po 10 mm
    expect(cont.pt.x).toBeCloseTo(cont.pt.y, 6);
    const len = (p: Pt) => Math.hypot(p.x - 1000, p.y - 1000) / 10;
    expect(len(cont.pt)).toBeCloseTo(Math.round(len(cont.pt)), 6);
    const perp = drawSnap(f, { x: 1520, y: 485 }, { x: 1000, y: 1000 }, undefined, { align: true });
    expect(perp.guide?.id).toMatch(/^dperp:/);
    expect(perp.guide?.perpTo).toBeDefined();
    // na kolmici (x + y = 2000); tady navíc zarovnáno se středem čáry (500, 500) → y = 500
    near(perp.pt, { x: 1500, y: 500 });
    near(perp.guides[0]!.from, { x: 500, y: 500 });
  });

  it('kolmice k jiné čáře kresby: konec se přichytí na patu kolmice', () => {
    line('D', [{ x: 0, y: 0 }, { x: 2000, y: 2000 }]);
    const r = drawSnap(store.floor()!, { x: 512, y: 505 }, { x: 0, y: 1000 });
    expect(r.guide?.id).toMatch(/^dfoot:/);
    near(r.pt, { x: 500, y: 500 });
  });
});

describe('zarovnání jen kde je vidět a v okolí', () => {
  it('bez volby align (tvary, schodiště, úchyty) se nezarovnává; vzdálený bod se nebere', () => {
    line('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    const f = store.floor()!;
    expect(drawSnap(f, { x: 27, y: 1530 }, null).pt.x).toBe(30);
    // 500 px při zoomu 0,2 = 2500 mm: bod (0, 0) je od pera dál → nezarovná
    expect(drawSnap(f, { x: 27, y: 4000 }, null, undefined, { align: true }).pt.x).toBe(30);
  });
});
