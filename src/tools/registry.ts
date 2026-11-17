/**
 * Seznam nástrojů. Nový nástroj = nový soubor + řádek zde + tlačítko v ui/Toolbar.tsx.
 */
import type { ToolId } from '../store/store';
import { doorTool, nicheTool, openingTool, roomTool, windowTool } from './placeTools';
import { arcTool, circleTool, rectTool } from './shapeTools';
import { drawDoubleTool, drawLineTool } from './drawTools';
import { pasteTool } from './pasteTool';
import { leaderTool } from './leaderTool';
import { textTool } from './textTool';
import { trimTool } from './trimTool';
import { splitTool } from './splitTool';
import { selectTool } from './selectTool';
import type { Tool } from './types';
import { lineTool, wallTool } from './wallTool';

export const tools: Record<ToolId, Tool> = {
  select: selectTool,
  wall: wallTool,
  line: lineTool,
  trim: trimTool,
  split: splitTool,
  door: doorTool,
  window: windowTool,
  opening: openingTool,
  niche: nicheTool,
  room: roomTool,
  rect: rectTool,
  circle: circleTool,
  arc: arcTool,
  drawLine: drawLineTool,
  drawDouble: drawDoubleTool,
  text: textTool,
  leader: leaderTool,
  paste: pasteTool,
  pan: {}
};
