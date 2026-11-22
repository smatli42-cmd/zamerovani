/** Nástroje skici poznámky (ui/MarkWindow.tsx) – seznam, ikony a názvy. */
import type { SketchStroke } from '../model/types';
import type { IconName } from './icons';

export type ShapeMode = Exclude<SketchStroke['mode'], 'free'>;
export type SketchTool = 'select' | 'pen' | ShapeMode | 'text' | 'dim' | 'eraser' | 'pan';
/** Nástroje skici – stejné ikony jako nástroje výkresu (ui/icons.tsx). */
export const SKETCH_TOOLS: { v: SketchTool; icon: IconName; label: string }[] = [
  { v: 'select', icon: 'select', label: 'Vybrat' },
  { v: 'pen', icon: 'pen', label: 'Pero' },
  { v: 'line', icon: 'line', label: 'Čára' },
  { v: 'rect', icon: 'rect', label: 'Obdélník' },
  { v: 'circle', icon: 'circle', label: 'Kruh' },
  { v: 'arc', icon: 'arc', label: 'Oblouk' },
  { v: 'double', icon: 'double', label: 'Dvojitá' },
  { v: 'text', icon: 'text', label: 'Text' },
  { v: 'dim', icon: 'dim', label: 'Kóta' },
  { v: 'eraser', icon: 'eraser', label: 'Guma' },
  { v: 'pan', icon: 'pan', label: 'Posun' }
];
export const SHAPES: readonly string[] = ['line', 'rect', 'circle', 'arc', 'double'];
