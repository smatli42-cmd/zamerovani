import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall } from '../model/factory';
import { migrateProject } from '../persistence/migrate';
import { applyRevealPart, faceLineDashed } from './doorLayout';

describe('rám okna má pevnou šířku 50 mm', () => {
  it('šířku rámu okna ani francouzského okna nejde změnit, zárubeň dveří ano', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    f.walls[w.id] = w;
    for (const kind of ['window', 'french'] as const) {
      const op = createOpening(f, w.id, kind, { width: 900 });
      expect(applyRevealPart(f, op, 'frameWidth', 80)).toBe(false);
      expect(op.frame!.width).toBe(50);
    }
    const door = createOpening(f, w.id, 'door', { width: 800 });
    expect(applyRevealPart(f, door, 'frameWidth', 80)).toBe(true);
    expect(door.frame!.width).toBe(80);
  });

  it('migrace 12 → 13: stará šířka rámu okna se přepíše na 50, zárubeň dveří zůstane', () => {
    const base = { wallId: 'w', number: 'X', height: 1500, sill: 900, depth: 0, offset: 0, ref: 'a', hinge: 'a', swing: 1, note: '' };
    const p = migrateProject({
      schema: 12,
      id: 'p',
      floors: [
        {
          id: 'f', name: '1.NP', nodes: {}, walls: {}, rooms: {}, texts: {}, protrusions: {},
          openings: {
            o1: { ...base, id: 'o1', kind: 'window', width: 900, frame: { width: 80, depth: 60 } },
            o2: { ...base, id: 'o2', kind: 'french', width: 900, frame: { width: 70, depth: 50 } },
            d1: { ...base, id: 'd1', kind: 'door', width: 800, frame: { width: 70, depth: 100 } }
          }
        }
      ]
    });
    const o = p.floors[0]!.openings;
    expect(o.o1!.frame).toEqual({ width: 50, depth: 60 });
    expect(o.o2!.frame!.width).toBe(50);
    expect(o.d1!.frame!.width).toBe(70);
  });
});

describe('značka okna: čára v lících', () => {
  it('u okna a francouzského okna plná, u dveří a průchodu čerchovaná', () => {
    expect(faceLineDashed('window')).toBe(false);
    expect(faceLineDashed('french')).toBe(false);
    expect(faceLineDashed('door')).toBe(true);
    expect(faceLineDashed('opening')).toBe(true);
  });
});
