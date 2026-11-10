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

describe('okna s rámem', () => {
  it('okno i francouzské okno mají rám 50 + 50, hloubku 50; otvor = okno + 2 × rám + ostění', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    const win = createOpening(f, w.id, 'window', { width: 1200 });
    expect(win.frame).toEqual({ width: 50, depth: 50 });
    expect(openingSpan(win)).toBe(1300);
    win.reveal = { depth: 150, left: 100, right: 80, top: 0 };
    expect(openingSpan(win)).toBe(1480);
    const fr = createOpening(f, w.id, 'french');
    expect(fr.frame).toEqual({ width: 50, depth: 50 });
    expect(fr.sill).toBe(50);
  });

  it('okno v příčce: tloušťka = ostění A + rám + ostění B', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    const win = createOpening(f, w.id, 'window', { reveal: { depth: 100, left: 0, right: 0, top: 0 } });
    expect(doorLayout(win, 300).dB).toBe(150);
    // bez ostění je rám v příčce uprostřed
    delete win.reveal;
    expect(doorLayout(win, 300).fo).toBe(125);
  });

  it('okno a francouzské okno sdílí číslování O1, O2…', () => {
    const f = createFloor('t');
    const w = createWall('a', 'b');
    const a = createOpening(f, w.id, 'window');
    f.openings[a.id] = a;
    const b = createOpening(f, w.id, 'french');
    expect(a.number).toBe('O1');
    expect(b.number).toBe('O2');
  });
});

describe('strana rámu okna', () => {
  it('výchozí strana míří od středu výkresu ven', async () => {
    const { outwardSwing } = await import('./doorLayout');
    const { normal, unit } = await import('./geometry');
    const f = createFloor('t');
    const pts = [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 4000, y: 0 },
      { id: 'n3', x: 4000, y: 3000 },
      { id: 'n4', x: 0, y: 3000 }
    ];
    for (const p of pts) f.nodes[p.id] = p;
    for (const [a, b] of [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n1']] as const) {
      const w = createWall(a, b);
      f.walls[w.id] = w;
      const s = outwardSwing(f, w);
      const A = f.nodes[a]!;
      const B = f.nodes[b]!;
      const nrm = normal(unit(A, B));
      const mid = { x: (A.x + B.x) / 2 + nrm.x * s, y: (A.y + B.y) / 2 + nrm.y * s };
      // bod posunutý na stranu rámu je dál od středu (2000, 1500) než střed stěny
      expect(Math.hypot(mid.x - 2000, mid.y - 1500)).toBeGreaterThan(Math.hypot((A.x + B.x) / 2 - 2000, (A.y + B.y) / 2 - 1500));
    }
  });
});
