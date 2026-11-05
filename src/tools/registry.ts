/**
 * Seznam nástrojů. Nový nástroj = nový soubor + řádek zde + tlačítko v ui/Toolbar.tsx.
 */
import type { ToolId } from '../store/store';
import { doorTool, nicheTool, openingTool, roomTool, windowTool } from './placeTools';
import { selectTool } from './selectTool';
import type { Tool } from './types';
import { wallTool } from './wallTool';

export const tools: Record<ToolId, Tool> = {
  select: selectTool,
  wall: wallTool,
  door: doorTool,
  window: windowTool,
  opening: openingTool,
  niche: nicheTool,
  room: roomTool,
  pan: {}
};
