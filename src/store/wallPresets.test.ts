import { describe, expect, it } from 'vitest';
import { activeWallThickness, createProject, wallPresets } from '../model/factory';
import { addWallPreset, addWall, removeWallPreset, setActiveWallThickness } from './actions';
import { store } from './store';

describe('menu Stěny (tloušťka nových stěn)', () => {
  it('výchozí 300, předvolby 100–300; vlastní předvolba se přidá a vybere, jde odebrat', () => {
    store.openProject(createProject({ name: 't' }));
    expect(activeWallThickness(store.get().project)).toBe(300);
    expect(wallPresets(store.get().project)).toEqual([100, 150, 200, 300]);
    setActiveWallThickness(150);
    expect(activeWallThickness(store.get().project)).toBe(150);
    addWallPreset(450);
    expect(activeWallThickness(store.get().project)).toBe(450);
    expect(wallPresets(store.get().project)).toEqual([100, 150, 200, 300, 450]);
    removeWallPreset(450);
    removeWallPreset(300); // výchozí nejde odebrat
    expect(wallPresets(store.get().project)).toEqual([100, 150, 200, 300]);
  });

  it('výběr tloušťky není v historii a Zpět ho nevrátí', () => {
    store.openProject(createProject({ name: 't' }));
    setActiveWallThickness(200);
    expect(store.get().canUndo).toBe(false);
    addWall({ x: 0, y: 0 }, null, { x: 1000, y: 0 }, null, false, { thickness: 200 });
    setActiveWallThickness(100);
    store.undo();
    expect(Object.keys(store.floor()!.walls)).toHaveLength(0);
    expect(activeWallThickness(store.get().project)).toBe(100);
  });
});
