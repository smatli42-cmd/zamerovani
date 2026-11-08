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
