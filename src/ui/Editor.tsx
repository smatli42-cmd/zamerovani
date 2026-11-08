/**
 * Obrazovka editoru: horní lišta, nástroje vlevo, plátno, panel vlastností vpravo.
 */
import { useEffect, useRef } from 'preact/hooks';
import { attachRenderer, detachRenderer } from '../canvas/renderer';
import { attachKeyboard } from '../input/keyboard';
import { attachPointer } from '../input/pointer';
import { NumPad } from './NumPad';
import { ToolOptions } from './ToolOptions';
import { SidePanel } from './panels/SidePanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { fitToDrawing } from './viewActions';

export function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    attachRenderer(canvas);
    const detachPointer = attachPointer(canvas);
    const detachKeys = attachKeyboard();
    fitToDrawing();
    return () => {
      detachPointer();
      detachKeys();
      detachRenderer();
    };
  }, []);

  return (
    <div class="editor">
      <TopBar />
      <div class="editor-body">
        <Toolbar />
        <div class="canvas-wrap">
          <canvas ref={canvasRef} class="plan-canvas" />
          <ToolOptions />
          <SidePanel />
          <NumPad />
        </div>
      </div>
    </div>
  );
}
