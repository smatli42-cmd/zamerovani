/**
 * Seznam nástrojů. Nový nástroj = nový soubor + řádek zde + tlačítko v ui/Toolbar.tsx.
 */
import type { ToolId } from '../store/store';
import { doorTool, nicheTool, openingTool, roomTool, windowTool } from './placeTools';
import { arcTool, circleTool, rectTool } from './shapeTools';
import { pasteTool } from './pasteTool';
import { leaderTool } from './leaderTool';
import { textTool } from './textTool';
import { selectTool } from './selectTool';
import type { Tool } from './types';
import { lineTool, wallTool } from './wallTool';

export const tools: Record<ToolId, Tool> = {
  select: selectTool,
  wall: wallTool,
  line: lineTool,
  door: doorTool,
  window: windowTool,
  opening: openingTool,
  niche: nicheTool,
  room: roomTool,
  rect: rectTool,
  circle: circleTool,
  arc: arcTool,
  text: textTool,
  leader: leaderTool,
  paste: pasteTool,
  pan: {}
};
