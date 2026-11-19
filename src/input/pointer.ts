/**
 * Vstup z pera (S-Pen), prstů a myši – sjednocený přes Pointer Events.
 *
 * - Pero / levé tlačítko myši  → aktivní nástroj
 * - 1 prst                     → posun plátna (nebo nástroj, když je vypnuto „Prst = posun“)
 * - 2 prsty                    → zoom + posun
 * - Pravé/prostřední tl., mezerník, tlačítko na peru → posun
 * - Dotyk dlaně během kreslení perem se ignoruje
 * - Ťuknutí na číslo kóty otevře NumPad, tažení za číslo kótu posune (core/dimPlace.ts)
 */
import { hitTest, type HitBox } from '../canvas/hitTargets';
import { toWorld, zoomAt } from '../canvas/view';
import { chooseNodeAt, findNodeNear } from '../core/floorQueries';
import type { Pt } from '../model/types';
import { openTarget, setMoveTarget } from '../store/numpadController';
import { beginDimDrag, dragDim, flipStairDirection, flipWallSide, toggleDimLock } from '../store/actions';
import type { DragStart } from '../core/dimPlace';
import { store } from '../store/store';
import { tools } from '../tools/registry';
import { anyHandleUnderPen } from '../tools/selectTool';
import { HIT_PX, type PointerInput } from '../tools/types';

interface Active {
  x: number;
  y: number;
  type: string;
}

const active = new Map<number, Active>();
let mode: 'none' | 'tool' | 'pan' | 'pinch' | 'dim' = 'none';
let toolPointerId: number | null = null;
let panStart: { screen: Pt; cam: { x: number; y: number } } | null = null;
let pinchLast: { dist: number; center: Pt } | null = null;
let penDown = false;
let spaceDown = false;
/** Stisk na čísle kóty: po ťuknutí NumPad, po tažení posun kóty. */
let dimPress: { pointerId: number; start: Pt; box: HitBox; begin: DragStart | null; moving: boolean } | null = null;
/** Od kolika px pohybu je stisk na čísle kóty tažení (prst víc). */
const DIM_DRAG_PX = { touch: 10, other: 5 };
/** Do kolika px od výchozí polohy se tažená kóta vrátí na výchozí. */
const DIM_SNAP_PX = 8;

/** Konec stisku na čísle kóty; `cancel` = tažení přerušené (druhý prst, zrušení) – posun se vrátí. */
function endDimPress(cancel = false): void {
  if (dimPress?.moving) {
    if (cancel) store.cancelGesture();
    else store.endGesture();
  }
  dimPress = null;
}

function local(canvas: HTMLCanvasElement, e: PointerEvent | WheelEvent): Pt {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function input(canvas: HTMLCanvasElement, e: PointerEvent): PointerInput {
  const screen = local(canvas, e);
  return { screen, world: toWorld(screen, store.get().camera), device: e.pointerType as PointerInput['device'] };
}

function touches(): Active[] {
  return [...active.values()].filter(a => a.type === 'touch');
}

function startPinch(): void {
  const t = touches();
  if (t.length < 2) return;
  const [a, b] = t as [Active, Active];
  pinchLast = { dist: Math.hypot(b.x - a.x, b.y - a.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

function cancelTool(): void {
  if (mode === 'tool') tools[store.get().tool].cancel?.();
  toolPointerId = null;
}

/** Ťuknutí na klikací kótu nebo na roh při otevřeném NumPadu. Vrací true, pokud bylo obslouženo; 'dim' = stisk na čísle kóty. */
function handleOverlayTap(p: PointerInput): boolean | 'dim' {
  const state = store.get();
  const floor = store.floor();
  if (!floor) return false;

  // Při zadávání délky stěny: ťuknutí na její roh přepne, který roh se posune
  const np = state.numpad;
  if (np?.target.kind === 'wall-length') {
    const wall = floor.walls[np.target.wallId];
    const node = chooseNodeAt(floor, p.world, HIT_PX.node / state.camera.zoom, { wallIds: [np.target.wallId] }); // D14: konec této stěny má přednost
    if (wall && node && (node.id === wall.a || node.id === wall.b)) {
      setMoveTarget({ nodeId: node.id });
      return true;
    }
  }

  // Středový bod vybraného oblouku má přednost před kótami, které ho mohou překrývat
  if (anyHandleUnderPen(p)) return false;

  // Úchyt rohu / koncového bodu má při ťuknutí přednost před klikacími kótami (ty ho mohou překrývat)
  if (findNodeNear(store.view('snap') ?? floor, p.world, HIT_PX.node / state.camera.zoom)) return false;

  const box = hitTest(p.screen, p.device === 'touch' ? 8 : 4);
  if (box?.action.type === 'numpad') {
    cancelTool();
    // NumPad se otevře až po puštění bez tažení; tažení kótu posune
    dimPress = { pointerId: -1, start: p.screen, box, begin: null, moving: false };
    return 'dim';
  }
  if (box?.action.type === 'lock') {
    cancelTool();
    toggleDimLock(box.action.target);
    return true;
  }
  if (box?.action.type === 'flipWall') {
    cancelTool();
    flipWallSide(box.action.wallId);
    return true;
  }
  if (box?.action.type === 'flipStair') {
    cancelTool();
    flipStairDirection(box.action.stairId);
    return true;
  }
  return false;
}

export function attachPointer(canvas: HTMLCanvasElement): () => void {
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const pos = local(canvas, e);
    active.set(e.pointerId, { ...pos, type: e.pointerType });
    const state = store.get();

    if (e.pointerType === 'pen') penDown = true;
    if (e.pointerType === 'touch' && penDown) return; // dlaň při kreslení perem

    // Dva prsty = zoom (zruší rozdělanou akci)
    if (touches().length >= 2) {
      if (mode === 'tool') cancelTool();
      if (mode === 'dim') endDimPress(true);
      mode = 'pinch';
      startPinch();
      return;
    }

    const wantsPan =
      state.tool === 'pan' ||
      spaceDown ||
      (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) ||
      (e.pointerType === 'pen' && (e.button === 2 || e.button === 5)) ||
      // Pero a Guma: prst vždy posouvá a zoomuje, kreslí jen pero (zadání ruční kresby)
      (e.pointerType === 'touch' && (state.settings.fingerPan || state.tool === 'pen' || state.tool === 'eraser'));

    if (wantsPan) {
      mode = 'pan';
      panStart = { screen: pos, cam: { x: state.camera.x, y: state.camera.y } };
      return;
    }

    if (mode === 'tool' || mode === 'dim') return; // už kreslíme / táhneme kótu jiným ukazatelem
    const p = input(canvas, e);
    const overlay = handleOverlayTap(p);
    if (overlay === 'dim' && dimPress) {
      dimPress.pointerId = e.pointerId;
      mode = 'dim';
      return;
    }
    if (overlay) {
      mode = 'none';
      return;
    }
    mode = 'tool';
    toolPointerId = e.pointerId;
    tools[state.tool].down?.(p);
  };

  const onMove = (e: PointerEvent) => {
    const pos = local(canvas, e);
    if (active.has(e.pointerId)) active.set(e.pointerId, { ...pos, type: e.pointerType });
    if (e.pointerType === 'touch' && penDown) return;

    if (mode === 'pinch') {
      const t = touches();
      if (t.length < 2 || !pinchLast) return;
      const [a, b] = t as [Active, Active];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let cam = store.get().camera;
      if (pinchLast.dist > 10) cam = zoomAt(cam, center, dist / pinchLast.dist);
      cam = { ...cam, x: cam.x + center.x - pinchLast.center.x, y: cam.y + center.y - pinchLast.center.y };
      pinchLast = { dist, center };
      store.set({ camera: cam });
      return;
    }

    if (mode === 'pan' && panStart) {
      const cam = store.get().camera;
      store.set({ camera: { ...cam, x: panStart.cam.x + pos.x - panStart.screen.x, y: panStart.cam.y + pos.y - panStart.screen.y } });
      return;
    }

    if (mode === 'dim' && dimPress && e.pointerId === dimPress.pointerId) {
      const d = { x: pos.x - dimPress.start.x, y: pos.y - dimPress.start.y };
      const drag = dimPress.box.drag;
      if (!dimPress.moving) {
        if (!drag || Math.hypot(d.x, d.y) < DIM_DRAG_PX[e.pointerType === 'touch' ? 'touch' : 'other']) return;
        dimPress.begin = beginDimDrag(drag);
        if (!dimPress.begin) return;
        dimPress.moving = true;
        store.beginGesture();
      }
      if (!drag || !dimPress.begin) return;
      const zoom = store.get().camera.zoom;
      dragDim(drag, dimPress.begin, (d.x * drag.out.x + d.y * drag.out.y) / zoom, (d.x * drag.u.x + d.y * drag.u.y) / zoom, DIM_SNAP_PX / zoom);
      return;
    }

    const tool = tools[store.get().tool];
    if (mode === 'tool' && e.pointerId === toolPointerId) {
      tool.drag?.(input(canvas, e));
    } else if (mode === 'none' && e.pointerType !== 'touch') {
      tool.hover?.(input(canvas, e));
    }
  };

  const onUp = (e: PointerEvent) => {
    active.delete(e.pointerId);
    if (e.pointerType === 'pen') penDown = false;

    if (mode === 'dim' && dimPress && e.pointerId === dimPress.pointerId) {
      const { box, moving } = dimPress;
      endDimPress(e.type === 'pointercancel');
      mode = 'none';
      if (!moving && e.type !== 'pointercancel' && box.action.type === 'numpad') openTarget(box.action.target);
      return;
    }
    if (mode === 'tool' && e.pointerId === toolPointerId) {
      if (e.type === 'pointercancel') cancelTool();
      else tools[store.get().tool].up?.(input(canvas, e));
      toolPointerId = null;
      mode = 'none';
    } else if (mode === 'pinch') {
      if (touches().length < 2) {
        pinchLast = null;
        mode = 'none';
      }
    } else if (mode === 'pan' && active.size === 0) {
      panStart = null;
      mode = 'none';
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    store.set({ camera: zoomAt(store.get().camera, local(canvas, e), factor) });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceDown = false;
  };
  const noMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', noMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    active.clear();
    endDimPress(true);
    mode = 'none';
  };
}
