/**
 * D14: výběr jednoho z překrývajících se koncových bodů (oddělený roh C1.13 – dva uzly na stejném místě).
 * (1) konec vybrané stěny má přednost; (2) opakované ťuknutí přepíná mezi překrývajícími se konci.
 * Chyba nahlášená uživatelem 2026-11-12: u rozpojeného rohu šel vybrat jen konec té stěny, u které se
 * rozpojení zapnulo – ťuknutí na konec druhé (i vybrané) stěny vybralo zase první.
 */
import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '../model/factory';
import type { Floor } from '../model/types';
import { chooseNodeAt, nextNodeAt } from './floorQueries';

/** L-roh z C2/10 po rozpojení: A má roh c, B má vlastní roh c2 na stejných souřadnicích. */
function split(): { f: Floor; A: string; B: string } {
  const f = createFloor('t');
  for (const [id, x, y] of [['c', 0, 0], ['ax', 3000, 0], ['c2', 0, 0], ['by', 0, -3000]] as const) f.nodes[id] = { id, x, y };
  const A = createWall('c', 'ax', 0, 300, 1);
  const B = createWall('c2', 'by', 0, 300, -1);
  B.noJoinA = true;
  f.walls[A.id] = A;
  f.walls[B.id] = B;
  return { f, A: A.id, B: B.id };
}

const tap = { x: 3, y: -2 };

describe('D14: překrývající se koncové body', () => {
  it('bez výběru se vybere jeden z nich (jako dřív)', () => {
    const { f } = split();
    expect(['c', 'c2']).toContain(chooseNodeAt(f, tap, 20, {})?.id);
  });

  it('(1) konec vybrané stěny má přednost – pro obě stěny', () => {
    const { f, A, B } = split();
    expect(chooseNodeAt(f, tap, 20, { wallIds: [A] })?.id).toBe('c');
    expect(chooseNodeAt(f, tap, 20, { wallIds: [B] })?.id).toBe('c2');
  });

  it('vybraný uzel zůstane vybraný při dalším dotyku (aby šel táhnout)', () => {
    const { f } = split();
    expect(chooseNodeAt(f, tap, 20, { nodeIds: ['c'] })?.id).toBe('c');
    expect(chooseNodeAt(f, tap, 20, { nodeIds: ['c2'] })?.id).toBe('c2');
  });

  it('(2) opakované ťuknutí přepíná mezi překrývajícími se konci', () => {
    const { f } = split();
    const n1 = nextNodeAt(f, tap, 20, 'c');
    expect(n1?.id).toBe('c2');
    expect(nextNodeAt(f, tap, 20, n1!.id)?.id).toBe('c');
  });

  it('jediný uzel na místě: nic se nepřepíná', () => {
    const { f } = split();
    expect(nextNodeAt(f, { x: 3000, y: 0 }, 20, 'ax')).toBeNull();
  });
});
