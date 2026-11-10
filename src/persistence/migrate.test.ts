import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../model/types';
import { migrateProject } from './migrate';

const floor = (shapes?: Record<string, unknown>) => ({ id: 'f', name: '1.NP', nodes: {}, walls: {}, openings: {}, rooms: {}, ...(shapes ? { shapes } : {}) });

describe('migrace', () => {
  it('projekt bez tvarů zůstane beze změny', () => {
    const p = migrateProject({ schema: 1, id: 'p', floors: [floor()] });
    expect(p.schema).toBe(SCHEMA_VERSION);
    expect(Object.keys(p.floors[0]!.walls)).toHaveLength(0);
    expect('shapes' in p.floors[0]!).toBe(false);
  });

  it('starší podlaží dostane prázdný seznam textů, existující texty zůstanou', () => {
    const p = migrateProject({ schema: 4, id: 'p', floors: [floor(), { ...floor(), texts: { t: { id: 't', x: 0, y: 0, text: 'a', size: 200, angle: 0 } } }] });
    expect(p.floors[0]!.texts).toEqual({});
    expect(Object.keys(p.floors[1]!.texts)).toEqual(['t']);
  });

  it('obdélník, kruh a oblouk z verze 2 se převedou na stěny', () => {
    const p = migrateProject({
      schema: 2,
      id: 'p',
      floors: [
        floor({
          r: { type: 'rect', id: 'r', x: 1000, y: 1000, w: 400, h: 200, angle: 0, style: 'dashed', name: 'Sloup', note: '' },
          c: { type: 'circle', id: 'c', x: 3000, y: 1000, r: 250, style: 'solid', name: '', note: '' },
          a: { type: 'arc', id: 'a', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, sagitta: -200, style: 'solid', name: '', note: '' },
          old: { type: 'dline', id: 'o', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }
        })
      ]
    });
    const f = p.floors[0]!;
    const walls = Object.values(f.walls);
    expect(walls).toHaveLength(4 + 1 + 1);
    expect(walls.filter(w => w.style === 'dashed')).toHaveLength(4);
    const circle = walls.find(w => w.radius === 250)!;
    expect(circle.a).toBe(circle.b);
    expect(f.nodes[circle.a]).toMatchObject({ x: 3000, y: 1000 });
    expect(walls.find(w => w.sagitta === -200)).toBeTruthy();
    expect(walls.find(w => w.label.note === 'Sloup')).toBeTruthy();
    expect('shapes' in f).toBe(false);
  });

  it('dvě půlkruhové stěny z verze 3 se sloučí na jeden kruh', () => {
    const f = {
      id: 'f',
      name: '1.NP',
      nodes: { L: { id: 'L', x: 0, y: 0 }, R: { id: 'R', x: 1000, y: 0 } },
      walls: {
        w1: { id: 'w1', a: 'L', b: 'R', measured: null, label: { thickness: null, type: null, material: '', note: '' }, sagitta: 500 },
        w2: { id: 'w2', a: 'R', b: 'L', measured: null, label: { thickness: null, type: null, material: '', note: '' }, sagitta: 500 }
      },
      openings: {},
      rooms: {}
    };
    const p = migrateProject({ schema: 3, id: 'p', floors: [f] });
    const walls = Object.values(p.floors[0]!.walls);
    expect(walls).toHaveLength(1);
    expect(walls[0]!.radius).toBe(500);
    expect(Object.values(p.floors[0]!.nodes)).toEqual([expect.objectContaining({ x: 500, y: 0 })]);
  });

  it('novější verzi odmítne', () => {
    expect(() => migrateProject({ schema: 99, id: 'p', floors: [] })).toThrow();
  });
});

describe('migrace 5 → 6 (tloušťka stěn)', () => {
  it('tloušťka z popisku přejde na stěnu, bez údaje 300 mm, tvary zůstanou čárou', () => {
    const lbl = (thickness: number | null) => ({ thickness, type: null, material: '', note: '' });
    const p = migrateProject({
      schema: 5,
      id: 'p',
      floors: [
        {
          ...floor(),
          texts: {},
          nodes: { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 1000, y: 0 }, c: { id: 'c', x: 2000, y: 0 } },
          walls: {
            w1: { id: 'w1', a: 'a', b: 'b', measured: null, label: lbl(450) },
            w2: { id: 'w2', a: 'b', b: 'c', measured: null, label: lbl(null) },
            w3: { id: 'w3', a: 'a', b: 'c', measured: null, label: lbl(null), style: 'dashed' }
          }
        }
      ]
    });
    const w = p.floors[0]!.walls;
    expect(w.w1!.thickness).toBe(450);
    expect(w.w2!.thickness).toBe(300);
    expect(w.w3!.thickness).toBe(0);
    expect('thickness' in w.w1!.label).toBe(false);
    expect([1, -1]).toContain(w.w1!.side);
  });
});

describe('migrace 6 → 7 (zrušená příčka)', () => {
  it('značka spárované příčky zmizí, čára i otvor zůstanou', () => {
    const lbl = { type: null, material: '', note: '' };
    const p = migrateProject({
      schema: 6,
      id: 'p',
      floors: [
        {
          ...floor(),
          texts: {},
          nodes: { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 1000, y: 0 } },
          walls: { w1: { id: 'w1', a: 'a', b: 'b', thickness: 0, side: 1, measured: null, label: lbl, part: { id: 'pt', line: 1 } } },
          openings: { o: { id: 'o', wallId: 'w1', kind: 'door', number: 'D1', width: 800, height: 1970, sill: 0, depth: 0, offset: 100, ref: 'a', hinge: 'a', swing: 1, note: '' } }
        }
      ]
    });
    const f = p.floors[0]!;
    expect('part' in f.walls.w1!).toBe(false);
    expect(f.walls.w1!.thickness).toBe(0);
    expect(f.openings.o!.wallId).toBe('w1');
  });
});
