/**
 * Chyba nahlášená uživatelem 2026-11-12: při změně rozměru v jedné místnosti se posunula jiná, samostatná
 * místnost (a upravovaná zůstala na místě). Řešič smí hýbat jen tím, co je napojené na posouvaný roh.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addRectWalls, addWall, applyWallLength } from '../store/actions';
import { store } from '../store/store';

function twoRooms() {
  store.openProject(createProject({ name: 't' }));
  // místnost 1: 4000 × 3000 ze stěn s tloušťkou; místnost 2 samostatně vpravo (obdélník)
  addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 200 });
  addWall({ x: 4000, y: 0 }, null, { x: 4000, y: 3000 }, null, false, { thickness: 200 });
  addWall({ x: 4000, y: 3000 }, null, { x: 0, y: 3000 }, null, false, { thickness: 200 });
  addWall({ x: 0, y: 3000 }, null, { x: 0, y: 0 }, null, false, { thickness: 200 });
  addRectWalls({ x: 8000, y: 0 }, { x: 11000, y: 3000 }, 'solid');
  const f = store.floor()!;
  const room2 = Object.values(f.nodes).filter(n => n.x >= 8000).map(n => ({ ...n }));
  const top = Object.values(f.walls).find(w => f.nodes[w.a]!.y === 0 && f.nodes[w.b]!.y === 0 && f.nodes[w.a]!.x < 5000)!;
  return { top, room2 };
}

describe('řešič délek nehýbe jinými skupinami stěn', () => {
  it('změna délky stěny místnosti 1 změní místnost 1, místnost 2 zůstane na místě', () => {
    const { top, room2 } = twoRooms();
    const f0 = store.floor()!;
    const moving = f0.nodes[top.b]!.x > f0.nodes[top.a]!.x ? top.b : top.a;
    expect(applyWallLength(top.id, 5000, { nodeId: moving })).toBe(true);
    const f = store.floor()!;
    for (const n of room2) expect(f.nodes[n.id]).toMatchObject({ x: n.x, y: n.y });
    // upravovaná místnost se změnila: posouvaný roh je o 1000 dál
    expect(f.nodes[moving]!.x).toBe(5000);
  });

  it('samostatná stěna: posune se jen její konec, ostatní výkres stojí', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 5000 }, null, { x: 2000, y: 5000 }, null, false, { thickness: 200 })!;
    addRectWalls({ x: 8000, y: 0 }, { x: 11000, y: 3000 }, 'solid');
    const before = JSON.stringify(Object.values(store.floor()!.nodes).filter(n => n.x >= 8000));
    applyWallLength(W, 3000, { nodeId: store.floor()!.walls[W]!.b });
    expect(JSON.stringify(Object.values(store.floor()!.nodes).filter(n => n.x >= 8000))).toBe(before);
    expect(store.floor()!.nodes[store.floor()!.walls[W]!.b]).toMatchObject({ x: 3000, y: 5000 });
  });

  it('volná větev napojená na posouvaný roh se dál posune s ním', () => {
    store.openProject(createProject({ name: 't' }));
    const W = addWall({ x: 0, y: 0 }, null, { x: 2000, y: 0 }, null, false, { thickness: 200 })!;
    const T = addWall({ x: 2000, y: 0 }, null, { x: 2000, y: 1500 }, null, false, { thickness: 200 })!;
    applyWallLength(W, 2500, { nodeId: store.floor()!.walls[W]!.b });
    const f = store.floor()!;
    expect(f.nodes[f.walls[T]!.b]).toMatchObject({ x: 2500, y: 1500 });
  });
});
