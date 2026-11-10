import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall } from '../model/factory';
import { applyRevealPart, doorLayout, revealPartValue } from './doorLayout';
import { openingSpan } from './floorQueries';

describe('dveře se zárubní', () => {
  it('výchozí dveře mají zárubeň 50 + 50 a hloubku 100; otvor = dveře + 2 × zárubeň', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    const op = createOpening(f, w.id, 'door', { width: 800 });
    expect(op.frame).toEqual({ width: 50, depth: 100 });
    expect(openingSpan(op)).toBe(900);
    op.reveal = { depth: 0, left: 125, right: 250, top: 0 };
    expect(openingSpan(op)).toBe(1275);
  });

  it('tloušťka = ostění A + zárubeň + ostění B; změna jednoho ostění posune druhé', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    const op = createOpening(f, w.id, 'door', { width: 800, reveal: { depth: 100, left: 125, right: 125, top: 0 } });
    // bez příčky (T neznámé) se druhé ostění nepočítá
    expect(doorLayout(op, null).dB).toBe(0);
    // příčka tloušťky 450: A 100 + zárubeň 100 + B 250
    expect(doorLayout(op, 450).dB).toBe(250);
    // změna hloubky zárubně přerozdělí obě ostění (součet 350 → 250, poměr 100:250 zůstane)
    const floor = createFloor('t2');
    floor.walls[w.id] = w;
    w.part = { id: 'p', line: 1 };
    expect(applyRevealPart(floor, op, 'frameWidth', 70)).toBe(true);
    expect(op.frame!.width).toBe(70);
    expect(revealPartValue(floor, op, 'frameDepth')).toBe(100);
  });
});
