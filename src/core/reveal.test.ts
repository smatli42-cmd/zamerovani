import { describe, expect, it } from 'vitest';
import { createFloor, createOpening, createWall } from '../model/factory';
import { openingsOnWall, openingSpan, openingStartFromA } from './floorQueries';

describe('ostění', () => {
  it('celkový otvor = okno + ostění vlevo a vpravo', () => {
    const f = createFloor('t');
    f.nodes.a = { id: 'a', x: 0, y: 0 };
    f.nodes.b = { id: 'b', x: 4000, y: 0 };
    const w = createWall('a', 'b');
    f.walls[w.id] = w;
    const op = createOpening(f, w.id, 'window', { width: 1000, offset: 500, reveal: { depth: 150, left: 100, right: 200, top: 0 } });
    f.openings[op.id] = op;
    expect(openingSpan(op)).toBe(1300);
    const [placed] = openingsOnWall(f, w);
    expect(placed!.start).toBe(500);
    expect(placed!.end).toBe(1800);
    // měřeno od rohu B se začátek počítá z celé šířky otvoru
    op.ref = 'b';
    op.offset = 500;
    expect(openingStartFromA(op, 4000)).toBe(4000 - 500 - 1300);
  });
});
