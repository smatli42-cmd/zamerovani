/**
 * Vykreslování plátna. Kreslí se jen po změně (requestRender), ne neustále.
 */
import { drawStairDims, drawStairs } from './drawStairs';
import { store } from '../store/store';
import { tools } from '../tools/registry';
import { drawBodyDims, drawDims, drawProtrusionDims } from './drawDims';
import { flushDimLabels, setDimLockContext, setDimPlaceContext } from './dimLine';
import { drawGrid, drawScaleBar } from './drawGrid';
import { drawCornerEndDims } from './drawCornerEndDims';
import { drawFreeDims } from './drawFreeDims';
import { drawArcHandle, drawFlipArrow, drawNodes, drawWalls } from './drawPlan';
import { drawOpenings } from './drawOpenings';
import { drawDrawingHandles, drawDrawings } from './drawDrawings';
import { drawRooms } from './drawRooms';
import { drawTexts } from './drawTexts';
import { drawMarks } from './drawMarks';
import { drawStrokes } from './drawStrokes';
import { drawComponentDims } from './drawComponentDims';
import { resetHitBoxes, setHitEnabled } from './hitTargets';
import { setWallFilter } from './layerDraw';
import { elementLayer, kindsInLayer, layerSlice, layersOf, SYS, viewFloor, wallVisible } from '../core/layers';
import { setRenderHandler } from './invalidate';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let scheduled = false;
let unsubscribe: (() => void) | null = null;
let observer: ResizeObserver | null = null;

export function canvasSize(): { width: number; height: number } {
  return { width, height };
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    render();
  });
}

function resize(): void {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

export function attachRenderer(el: HTMLCanvasElement): void {
  canvas = el;
  ctx = el.getContext('2d');
  setRenderHandler(schedule);
  observer = new ResizeObserver(resize);
  observer.observe(el);
  unsubscribe = store.subscribe(schedule);
  resize();
}

export function detachRenderer(): void {
  observer?.disconnect();
  unsubscribe?.();
  observer = null;
  unsubscribe = null;
  canvas = null;
  ctx = null;
}

function render(): void {
  if (!ctx) return;
  const state = store.get();
  const floor = store.floor();
  const cam = state.camera;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  if (state.settings.showGrid) drawGrid(ctx, cam, width, height);

  resetHitBoxes();
  if (floor) {
    const project = state.project;
    const s = state.settings.dimScale;
    // ikony zámků kót jsou pomocné (jen v editoru, export výkresu je kreslit nebude)
    setDimLockContext(floor.dimLocks, state.lockBlock?.key ?? null, true);
    setDimPlaceContext(floor.dimPlace, cam.zoom);
    // vrstvy v pořadí kreslení; skryté se nekreslí, zamčené nemají klikací popisky (core/layers.ts)
    for (const layer of layersOf(project)) {
      if (!layer.visible) continue;
      const kinds = kindsInLayer(floor, layer.id);
      setHitEnabled(!layer.locked);
      if (kinds.has('wall')) {
        setWallFilter(id => elementLayer(floor, 'wall', id) === layer.id);
        drawWalls(ctx, floor, cam, state.selection, state.hover);
        drawOpenings(ctx, floor, cam, state.selection, state.hover);
      }
      const slice = layerSlice(floor, layer.id);
      // kresba a její šrafy nad výplní stěn i otvory (překlad nad otvorem) – vrstva Kresba leží nad Stavbou
      if (kinds.has('drawing')) drawDrawings(ctx, slice, cam, state.selection, state.hover);
      if (kinds.has('stair')) drawStairs(ctx, slice, cam, state.selection, state.hover);
      if (kinds.has('room')) drawRooms(ctx, slice, cam, state.selection, floor);
      if (kinds.has('text')) drawTexts(ctx, slice, cam, state.selection);
      // značky (poznámka + skica) – stálá velikost na obrazovce (core/marks.ts)
      if (kinds.has('mark')) drawMarks(ctx, slice, cam, state.selection);
      // ruční tahy barvou vrstvy (core/strokes.ts)
      if (kinds.has('stroke')) drawStrokes(ctx, slice, cam, layer.color, state.selection, state.hover);
      // automatické kóty patří vrstvě Kóty a kreslí se jen u viditelné stěny (rozhodnutí uživatele 2026-11-19)
      if (layer.id === SYS.koty) {
        setWallFilter(id => wallVisible(project, floor, id));
        drawDims(ctx, floor, cam, s, state.selection);
        // odstupy skupiny jen k viditelným stěnám (skryté se do kót mezi prvky nepočítají)
        drawComponentDims(ctx, viewFloor(project, floor, 'snap'), cam, s, state.selection);
        drawBodyDims(ctx, floor, cam, s, state.selection);
        drawProtrusionDims(ctx, floor, cam, s, state.selection);
        drawCornerEndDims(ctx, floor, cam, s, state.selection);
        // kóty schodiště jen u vybraného schodiště
        drawStairDims(ctx, floor, cam, s, state.selection);
      }
      // volné kóty jsou samostatné prvky své vrstvy – viditelné i u skrytého měřeného prvku (pravidlo 8);
      // konce se hledají v celém podlaží (měřená čára bývá v jiné vrstvě), test canvas/drawFreeDims.test.ts
      if (kinds.has('dim')) drawFreeDims(ctx, slice, cam, s, state.selection, state.hover, floor);
    }
    setHitEnabled(true);
    // rohy (pomůcka úprav) nad vším, jen u viditelných stěn
    setWallFilter(id => wallVisible(project, floor, id));
    drawNodes(ctx, floor, cam, state.selection, state.hover);
    setWallFilter(null);
    // čísla kót až nad všemi čarami kót (posunuté číslo na čáře sousední kóty zůstane čitelné)
    flushDimLabels();
    drawArcHandle(ctx, floor, cam, state.selection);
    drawDrawingHandles(ctx, floor, cam, state.selection);
    drawFlipArrow(ctx, floor, cam, state.selection);
    drawMoveMarker(ctx);
  }
  tools[state.tool].drawOverlay?.(ctx, cam);
  drawScaleBar(ctx, cam, height);
}

/** Při zadávání délky stěny zvýrazní roh, který se posune. */
function drawMoveMarker(c: CanvasRenderingContext2D): void {
  const { numpad, camera } = store.get();
  const floor = store.floor();
  if (!numpad || numpad.target.kind !== 'wall-length' || !floor) return;
  const wall = floor.walls[numpad.target.wallId];
  if (!wall) return;
  const move = numpad.target.move;
  const ids = move === 'both' ? [wall.a, wall.b] : [move.nodeId];
  c.save();
  for (const id of ids) {
    const n = floor.nodes[id];
    if (!n) continue;
    const p = { x: n.x * camera.zoom + camera.x, y: n.y * camera.zoom + camera.y };
    c.strokeStyle = '#f59e0b';
    c.fillStyle = 'rgba(245,158,11,0.25)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(p.x, p.y, 13, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}
