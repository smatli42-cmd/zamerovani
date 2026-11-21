/**
 * Skupiny nástrojů levé lišty (ui/toolGroups.ts, návrh ovládání 2026-11-21): každý nástroj z registru je právě
 * v jedné skupině (kromě dočasného Vložit), má ikonu ze sady, lišta má nejvýš 9 tlačítek (bez rolování),
 * tlačítko skupiny ukazuje naposledy použitý nástroj, Vybrat vždy Vybrat.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { tools } from '../tools/registry';
import { createProject } from '../model/factory';
import { store, type ToolId } from '../store/store';
import { ICON_NAMES } from './icons';
import { activateTool, groupTool, TOOL_GROUPS, toolInfo } from './toolGroups';
import { fitCamera } from '../canvas/view';

beforeEach(() => {
  store.openProject(createProject({ name: 't' }));
  store.updateSettings({ lastTools: {} });
  store.set({ tool: 'select' });
});

describe('skupiny nástrojů', () => {
  it('každý nástroj je právě v jedné skupině a má ikonu ze sady', () => {
    const inGroups = TOOL_GROUPS.flatMap(g => g.tools.map(t => t.id));
    expect(new Set(inGroups).size).toBe(inGroups.length);
    for (const id of Object.keys(tools) as ToolId[]) {
      if (id === 'paste') continue;
      expect(inGroups, id).toContain(id);
    }
    for (const g of TOOL_GROUPS) for (const t of g.tools) expect(ICON_NAMES, t.id).toContain(t.icon);
    expect(ICON_NAMES).toContain(toolInfo('paste').def.icon);
  });

  it('lišta má nejvýš 9 tlačítek', () => {
    expect(TOOL_GROUPS.length).toBeLessThanOrEqual(9);
  });

  it('tlačítko skupiny zapne naposledy použitý nástroj; Vybrat vždy Vybrat', () => {
    const walls = TOOL_GROUPS.find(g => g.id === 'walls')!;
    const sel = TOOL_GROUPS.find(g => g.id === 'select')!;
    expect(groupTool(walls, store.get().settings.lastTools ?? {}).id).toBe('wall');
    activateTool('split');
    expect(store.get().tool).toBe('split');
    expect(groupTool(walls, store.get().settings.lastTools ?? {}).id).toBe('split');
    activateTool('pan');
    expect(groupTool(sel, store.get().settings.lastTools ?? {}).id).toBe('select');
    activateTool('select');
    expect(store.get().tool).toBe('select');
  });

  it('přepnutí nástroje: zpráva nástroje, zavře okno vrstev nástroje a řadu skupiny, vynuluje rozpracované, zruší předchozí', () => {
    let cancelled = 0;
    const orig = tools.wall.cancel;
    tools.wall.cancel = () => void cancelled++;
    try {
      activateTool('wall');
      store.set({ layersOpen: 'tool', toolGroupOpen: 'walls', chainNode: 'n1', hover: null, stairAppend: null });
      activateTool('trim');
      expect(cancelled).toBe(1);
      const s = store.get();
      expect(s.layersOpen).toBe(false);
      expect(s.toolGroupOpen).toBeNull();
      expect(s.chainNode).toBeNull();
      expect(s.toolMsg).toBeTruthy();
    } finally {
      tools.wall.cancel = orig;
    }
    for (const id of ['split', 'dim', 'stair', 'drawTrim'] as ToolId[]) {
      activateTool(id);
      expect(store.get().toolMsg, id).toBeTruthy();
    }
    activateTool('door');
    expect(store.get().toolMsg).toBeNull();
    // okno vrstev z horní lišty zůstane
    store.set({ layersOpen: 'top' });
    activateTool('window');
    expect(store.get().layersOpen).toBe('top');
  });
});

describe('Celý výkres nechá nahoře místo pro kartu nástroje', () => {
  it('výkres leží pod rezervou nahoře, prázdný výkres uprostřed zbytku', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4000, y: 3000 }
    ];
    const cam = fitCamera(pts, 1000, 700, 50, 0, 120);
    expect(cam.y + 0 * cam.zoom).toBeGreaterThanOrEqual(120 + 50 - 1e-6);
    expect(cam.y + 3000 * cam.zoom).toBeLessThanOrEqual(700 - 50 + 1e-6);
    const empty = fitCamera([], 1000, 700, 50, 0, 120);
    expect(empty.y).toBe(120 + (700 - 120) / 2);
  });
});
