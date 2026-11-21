/**
 * Plocha místnosti (rozhodnutí uživatele 2026-11-21, core/roomArea.ts): světlá plocha mezi líci, výstupky se
 * odečtou, vybrání přičtou, otvory ne, příčka / sloup uvnitř se odečte; tabulka „pravidlo × druh prvku“.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, createWall } from '../model/factory';
import type { Id, Protrusion } from '../model/types';
import { formatArea, roomArea } from '../core/roomArea';
import type { Pt } from '../model/types';
import { cornerProtrusionsOf } from '../core/cornerProtrusion';
import { endProtrusionsOf } from '../core/endProtrusion';
import { addCircleWalls, addDrawCircle, addDrawLine, addDrawRect, addFreeDim, addLine, addMark, addOpening, addRoom, addStair, addStroke, addText, addWall, flipWallSide, setWallSagitta } from './actions';
import { store } from './store';

const f = () => store.floor()!;
const m2 = (p = { x: 2000, y: -1500 }) => {
  const a = roomArea(f(), p);
  return a === null ? null : Math.round(a / 1e4) / 100;
};

/** Obdélník 4000 × 3000 po lících (tloušťka 300, těla ven): dolní, pravá, horní, levá. */
function rect(t = 300) {
  const o = { thickness: t };
  const bottom = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, o)!;
  const right = addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -3000 }, null, false, o)!;
  const top = addWall({ x: 4000, y: -3000 }, null, { x: 0, y: -3000 }, null, false, o)!;
  const left = addWall({ x: 0, y: -3000 }, null, { x: 0, y: 0 }, null, false, o)!;
  return { bottom, right, top, left };
}

/** Líc stěny obrácený do místnosti (opačná strana než tělo). */
const roomSide = (wallId: Id): 1 | -1 => (f().walls[wallId]!.side === 1 ? -1 : 1);

/** Výstupek (v ven od líce) / vybrání (v do těla – záporné) na líci do místnosti. */
function addProt(wallId: Id, mode: 'add' | 'subtract', u0: number, u1: number, depth: number): void {
  const v = mode === 'add' ? depth : -depth;
  store.edit(fl => {
    const id = `pr${Object.keys(fl.protrusions ?? {}).length}`;
    const p: Protrusion = {
      id,
      wallId,
      side: roomSide(wallId),
      mode,
      pts: [
        { u: u0, v: 0 },
        { u: u0, v },
        { u: u1, v },
        { u: u1, v: 0 }
      ],
      name: '',
      material: '',
      note: ''
    };
    fl.protrusions = { ...(fl.protrusions ?? {}), [id]: p };
  });
}

beforeEach(() => store.openProject(createProject({ name: 't' })));

describe('plocha místnosti × druh prvku', () => {
  it('rovné stěny, těla ven: plocha mezi líci 4 × 3 m = 12,00 m²', () => {
    rect();
    expect(m2()).toBe(12);
    expect(formatArea(roomArea(f(), { x: 2000, y: -1500 })!)).toBe('12,00 m²');
  });

  it('stěna kreslená vnějším lícem (tělo dovnitř) – tloušťka se nezapočítá', () => {
    const w = rect();
    flipWallSide(w.bottom);
    expect(m2()).toBe(4 * 2.7);
  });

  it('všechny stěny tělem dovnitř: 3,4 × 2,4 m', () => {
    const w = rect();
    for (const id of Object.values(w)) flipWallSide(id);
    expect(m2()).toBe(8.16);
  });

  it('výstupek do místnosti se odečte, vybrání přičte', () => {
    const w = rect();
    const top = w.bottom;
    addProt(top, 'add', 1000, 1500, 200);
    expect(m2()).toBe(12 - 0.1);
    addProt(top, 'subtract', 2500, 3500, 100);
    expect(m2()).toBe(12 - 0.1 + 0.1);
  });

  it('vybrání na odvrácené straně stěny (jiná místnost) plochu nemění', () => {
    const w = rect();
    store.edit(fl => {
      fl.protrusions = {
        r: { id: 'r', wallId: w.bottom, side: fl.walls[w.bottom]!.side, mode: 'subtract', pts: [{ u: 1000, v: 0 }, { u: 1000, v: -100 }, { u: 2000, v: -100 }, { u: 2000, v: 0 }], name: '', material: '', note: '' }
      };
    });
    expect(m2()).toBe(12);
  });

  it('dveře, okno, nika ani průchod plochu nemění', () => {
    const w = rect();
    for (const [k, t] of [['door', 0.15], ['window', 0.4], ['niche', 0.8]] as const) addOpening(w.bottom, k, t);
    addOpening(w.left, 'french', 0.5);
    addOpening(w.top, 'opening', 0.5);
    expect(m2()).toBe(12);
  });

  it('napojená příčka (T) dělí místnost; plocha části se štítkem', () => {
    rect();
    // tělo příčky na straně +x (1500–1600)
    addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -3000 }, null, false, { thickness: 100, side: 1 });
    expect(m2({ x: 700, y: -1500 })).toBe(4.5);
    expect(m2({ x: 3000, y: -1500 })).toBe(7.2);
  });

  it('příčka s volným koncem uvnitř se odečte (tělo 1000 × 100)', () => {
    rect();
    addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -1000 }, null, false, { thickness: 100 });
    expect(m2()).toBe(12 - 0.1);
  });

  it('sloup uvnitř (uzavřený obrys stěn) se odečte', () => {
    rect();
    // těla ven od čtverce 400 × 400 → sloup 600 × 600
    const o = { thickness: 100, side: 1 as const };
    addWall({ x: 1800, y: -1300 }, null, { x: 2200, y: -1300 }, null, false, o);
    addWall({ x: 2200, y: -1300 }, null, { x: 2200, y: -1700 }, null, false, o);
    addWall({ x: 2200, y: -1700 }, null, { x: 1800, y: -1700 }, null, false, o);
    addWall({ x: 1800, y: -1700 }, null, { x: 1800, y: -1300 }, null, false, o);
    expect(m2({ x: 500, y: -500 })).toBe(12 - 0.36);
    // štítek uvnitř sloupu (prostor obklopený tělem) má vlastní plochu 0,16 m²
    expect(m2({ x: 2000, y: -1500 })).toBe(0.16);
  });

  it('stěna bez tloušťky (čára) uzavře místnost', () => {
    rect(0);
    expect(m2()).toBe(12);
  });

  it('oblouková stěna: plocha i s výsečí oblouku', () => {
    const w = rect();
    // úseč nad tětivou 4000 se vzepětím 500 = 1,351 m² (ven přičte, dovnitř odečte)
    setWallSagitta(w.top, 500);
    expect(m2()).toBe(13.35);
    setWallSagitta(w.top, -500);
    expect(m2()).toBe(10.65);
  });

  it('kruhová stěna (starší data): π r² = 12,57 m² pro r = 2 m', () => {
    addCircleWalls({ x: 0, y: 0 }, 2000, 'solid');
    expect(m2({ x: 0, y: 0 })).toBe(12.57);
  });

  it('jedna stěna bez tloušťky (čára) mezi stěnami s tloušťkou', () => {
    const o = { thickness: 300 };
    addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, o);
    addWall({ x: 4000, y: 0 }, null, { x: 4000, y: -3000 }, null, false, o);
    addWall({ x: 4000, y: -3000 }, null, { x: 0, y: -3000 }, null, false, { thickness: 0 });
    addWall({ x: 0, y: -3000 }, null, { x: 0, y: 0 }, null, false, o);
    expect(m2()).toBe(12);
  });

  it('čára bez tloušťky s volným koncem uvnitř místnost nerozdělí', () => {
    rect();
    addWall({ x: 1500, y: 0 }, null, { x: 1500, y: -2000 }, null, false, { thickness: 0 });
    expect(m2({ x: 700, y: -1500 })).toBe(12);
  });

  it('kresba, schodiště, ruční tah, text, kóta a značka plochu nemění', () => {
    rect();
    addDrawRect({ x: 500, y: -500 }, { x: 3500, y: -2500 });
    addDrawCircle({ x: 2000, y: -1500 }, 800);
    addDrawLine({ x: 2000, y: 0 }, { x: 2000, y: -3000 });
    addStair({ x: 300, y: -300 }, { x: 300, y: -2500 });
    addStroke([{ x: 100, y: -100 }, { x: 3900, y: -2900 }], 25);
    addText({ x: 1000, y: -1000 });
    addMark({ x: 3000, y: -1000 });
    addFreeDim({ x: 100, y: -100 }, { x: 3900, y: -100 });
    expect(m2({ x: 1000, y: -2800 })).toBe(12);
  });

  it('neuzavřený obrys (chybí stěna) → plocha není', () => {
    const w = rect();
    store.edit(fl => void delete fl.walls[w.top]);
    expect(m2()).toBeNull();
  });

  it('štítek v těle stěny → plocha není', () => {
    rect();
    expect(m2({ x: 2000, y: 150 })).toBeNull();
  });

  it('štítek místnosti: plocha podle polohy štítku', () => {
    rect();
    const id = addRoom({ x: 2000, y: -1500 })!;
    const r = f().rooms[id]!;
    expect(Math.round(roomArea(f(), r)! / 1e4) / 100).toBe(12);
  });

  describe('výstupky v rohu a na konci (místnost x 0–4000, y 0–3000, roh S × L jako v cornerRecess.test.ts)', () => {
    const polyline = (pts: Pt[]) => {
      for (let i = 0; i + 1 < pts.length; i++) addLine(pts[i]!, null, pts[i + 1]!, null);
    };
    function lroom() {
      store.set({ camera: { x: 0, y: 0, zoom: 0.1 } });
      addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300, side: -1 });
      addWall({ x: 0, y: 0 }, null, { x: 0, y: 3000 }, null, false, { thickness: 300, side: 1 });
      addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 300 });
      addWall({ x: 0, y: 3000 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 300 });
    }
    const at = { x: 2500, y: 2000 };

    it('bez výstupků 12,00 m²', () => {
      lroom();
      expect(m2(at)).toBe(12);
    });

    it('výstupek v rohu 600 × 400 se odečte', () => {
      lroom();
      polyline([{ x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }]);
      expect(cornerProtrusionsOf(f())).toHaveLength(1);
      expect(m2(at)).toBe(12 - 0.24);
    });

    it('vybrání v rohu (zářez 100 do obou stěn) se přičte', () => {
      lroom();
      polyline([{ x: 600, y: 0 }, { x: 600, y: -100 }, { x: -100, y: -100 }, { x: -100, y: 400 }, { x: 0, y: 400 }]);
      expect(cornerProtrusionsOf(f())[0]?.mode).toBe('subtract');
      expect(m2(at)).toBe(12 + 0.11);
    });

    it('výstupek na volném konci příčky uvnitř se odečte i s příčkou', () => {
      lroom();
      addWall({ x: 1500, y: 0 }, null, { x: 1500, y: 1500 }, null, false, { thickness: 100, side: 1 });
      expect(m2(at)).toBe(12 - 0.15);
      polyline([{ x: 1500, y: 1300 }, { x: 1600, y: 1300 }, { x: 1600, y: 1700 }, { x: 1300, y: 1700 }, { x: 1300, y: 1300 }, { x: 1400, y: 1300 }]);
      expect(endProtrusionsOf(f())).toHaveLength(1);
      expect(m2(at)).toBe(12 - 0.15 - 0.1);
    });
  });

  it('výkon: 480 stěn (i oblouky) do 2 s, druhý dotaz z cache', () => {
    // výkres jedním krokem (480 stěn po jedné přes akce by test zdržely)
    store.edit(fl => {
      let n = 0;
      const node = (x: number, y: number) => {
        const id = `pn${n++}`;
        fl.nodes[id] = { id, x, y };
        return id;
      };
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 10; j++) {
          const x = i * 6000;
          const y = j * 5000;
          const c = [node(x, y), node(x + 4000, y), node(x + 4000, y - 3000), node(x, y - 3000)];
          for (let k = 0; k < 4; k++) {
            const w = createWall(c[k]!, c[(k + 1) % 4]!, k === 2 && (i + j) % 3 === 0 ? 500 : 0, 300, 1);
            fl.walls[w.id] = w;
          }
        }
    });
    const t0 = performance.now();
    expect(m2()).toBe(13.35);
    const t1 = performance.now();
    addRoom({ x: 8000, y: -1500 });
    expect(m2({ x: 8000, y: -1500 })).toBe(12);
    const t2 = performance.now();
    expect(t1 - t0).toBeLessThan(2000);
    // posun štítku / nový štítek stěny nemění → bez přepočtu
    expect(t2 - t1).toBeLessThan(50);
  }, 20000);
});
