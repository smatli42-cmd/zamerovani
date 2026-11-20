/**
 * Nástroj „Vybrat“: ťuknutí na prvek otevře jeho vlastnosti (panel vpravo, včetně Smazat),
 * ťuknutí na kótu otevře zadání rozměru. Tažením se posouvá roh / otvor / štítek místnosti.
 */
import { requestRender } from '../canvas/invalidate';
import { toScreen } from '../canvas/view';
import { arcChain, arcHandles } from '../core/arcChain';
import { findNodeNear, findWallNear, nextNodeAt, openingStartFromA, wallLength, wallNodes } from '../core/floorQueries';
import { dist, projectToSegment, roundTo } from '../core/geometry';
import type { Id, Pt } from '../model/types';
import { selectInRect, normRect } from '../core/rectSelect';
import { dragParams, linesNear, nodeDragLines, resolveDragPoint, wallMoveLines, type DragLine } from '../core/dragResolve';
import type { Camera } from '../store/store';
import { groupOrigin, type GroupOrigin, mergeNodeIfCoincident, moveGroup, moveNode, moveOpeningTo, moveRoom, moveText, updateText, setCircleRadius, setWallSagitta, setProtrusionArc } from '../store/actions';
import { store } from '../store/store';
import { protrusionArcHandles, sagittaFromPoint } from '../core/protrusionEdit';
import { openTarget } from '../store/numpadController';
import { pickAny } from './pick';
import { dragDrawingHandle, drawingHandleUnderPen, type DrawHandleDrag } from './drawingEdit';
import { HIT_PX, type PointerInput, type Tool } from './types';
import { moveSnapTargets, snapMove, stairGeom, type SnapGeom } from '../core/moveSnap';

/** Hrany / body, ke kterým se právě přichytilo posouvané schodiště (náhled). */
let snapHits: [Pt, Pt][] = [];

type DragKind = { kind: 'node'; id: Id; lines: DragLine[] } | { kind: 'wall'; id: Id; origin: GroupOrigin; grab: Pt; lines: DragLine[] } | { kind: 'opening'; id: Id; grabOffset: number } | { kind: 'room'; id: Id; dx: number; dy: number }
  | { kind: 'text'; id: Id; dx: number; dy: number }
  | { kind: 'handle'; id: Id }
  /** Úchyt vzepětí úseku obrysu vybraného výstupku (I1.10). */
  | { kind: 'protArc'; id: Id; seg: number }
  | { kind: 'leader'; id: Id }
  /** Úchyt vybrané kresby (tools/drawingEdit.ts). */
  | { kind: 'draw'; h: DrawHandleDrag }
  /** Posun celé skupiny; u schodiště s přichycením ke stěnám a prvkům (core/moveSnap.ts). */
  | { kind: 'group'; origin: GroupOrigin; start: Pt; snap?: { geom: SnapGeom; targets: SnapGeom } };

/** Rámeček výběru: zleva doprava okno (modře), zprava doleva křížení (zeleně, čárkovaně). */
let band: { start: Pt; end: Pt; startScreen: Pt; endScreen: Pt } | null = null;

let drag: DragKind | null = null;
let downScreen: Pt | null = null;
/** Místo ťuknutí na už vybraný roh – po zvednutí bez tažení se přepne na překrývající se roh (D14). */
let cycleAt: Pt | null = null;
let dragging = false;

// --- tažení s držením směru (D11, D12, D13; KRESLENI-EDITACE-KONCU.md) ---
/** Zachycená pomocná čára (hystereze mezi kroky tažení). */
let lock: string | null = null;
/** Co se kreslí během tažení: zachycená čára, původní směry, bod. */
let shown: { line: DragLine | null; point: Pt; lines: DragLine[] } | null = null;
/** Prodleva: pero drží na místě → zachycení se uvolní a platí přesná poloha pod perem. */
let holdAnchor: Pt | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdFreeAt: Pt | null = null;
let lastInput: PointerInput | null = null;
/** Poloměr zachycení (px) podle zařízení; kolmice se nabízí ke stěnám do NEAR_PX od pera. */
const capturePx = (p: PointerInput) => (p.device === 'touch' ? 16 : 10);
const NEAR_PX = 60;
const HOLD_MS = 700;

function resetGuides(): void {
  snapHits = [];
  lock = null;
  shown = null;
  holdAnchor = null;
  holdFreeAt = null;
  lastInput = null;
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
}

/** Přichycení podle pomocných čar; null = volně (bez přichycení, po prodlevě nebo mimo čáry). */
function guided(p: PointerInput, lines: readonly DragLine[], zoom: number): Pt | null {
  shown = null;
  if (!store.get().settings.snap) return null;
  const params = dragParams(capturePx(p), zoom);
  if (holdFreeAt && dist(holdFreeAt, p.world) <= params.release) {
    lock = null;
    return null;
  }
  holdFreeAt = null;
  const ls = linesNear(lines, p.world, NEAR_PX / zoom);
  const r = resolveDragPoint(p.world, ls, lock, params);
  lock = r.line?.id ?? null;
  shown = { line: r.line, point: r.point, lines: ls.filter(l => l.id.startsWith('orig:')) };
  return r.line ? r.point : null;
}

/** Hlídá prodlevu: když se pero 0,7 s nepohne (o víc než 3 px), zachycení se uvolní. */
function armHold(p: PointerInput): void {
  lastInput = p;
  if (holdAnchor && dist(holdAnchor, p.screen) <= 3) return;
  holdAnchor = p.screen;
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    // jen pro tažení rohu / stěny, které časovač spustilo (jiné gesto ho nesmí převzít)
    if (!drag || (drag.kind !== 'node' && drag.kind !== 'wall') || !dragging || !lock || !lastInput) return;
    holdFreeAt = lastInput.world;
    lock = null;
    selectTool.drag?.(lastInput);
  }, HOLD_MS);
}

/** Poloměr zásahu středového bodu oblouku (px). */
const HANDLE_PX = 18;

/**
 * Pokud je vybraná oblouková stěna a pero míří na její středový bod, začne tažení vzepětí.
 * Používají to i nástroje Stěna a Oblouk (vrací true = událost převzata, ostatní předat selectTool).
 */
/** Vybraná oblouková / kruhová stěna, pokud pero míří na její úchyt (střed oblouku, bod kruhu). */
export function arcUnderPen(p: PointerInput): Id | null {
  const floor = store.floor();
  const sel = store.get().selection;
  if (!floor) return null;
  // úchyty jsou uprostřed všech oblouků (ne jen vybraného); nejbližší pod perem
  let best: Id | null = null;
  let bestD = HANDLE_PX;
  for (const h of arcHandles(floor, sel?.kind === 'wall' ? sel.id : null)) {
    const d = dist(toScreen(h.at, store.get().camera), p.screen);
    if (d <= bestD) {
      best = h.wallId;
      bestD = d;
    }
  }
  return best;
}

/** Hrot odkazové šipky vybraného textu se dá táhnout. */
export function grabLeaderHandle(p: PointerInput): boolean {
  const floor = store.floor();
  const sel = store.get().selection;
  const t = floor && sel?.kind === 'text' ? floor.texts[sel.id] : null;
  if (!t?.leader) return false;
  if (dist(toScreen(t.leader, store.get().camera), p.screen) > HANDLE_PX) return false;
  drag = { kind: 'leader', id: t.id };
  downScreen = p.screen;
  dragging = false;
  return true;
}

/** Je pod perem úchyt oblouku stěny nebo výstupku? (má přednost před kótami) */
export const anyHandleUnderPen = (p: PointerInput): boolean => !!drawingHandleUnderPen(p) || !!protArcUnderPen(p) || !!arcUnderPen(p);

/** Úchyt oblouku v obrysu vybraného výstupku pod perem. */
export function protArcUnderPen(p: PointerInput): { id: Id; seg: number } | null {
  const floor = store.floor();
  const sel = store.get().selection;
  const pr = floor && sel?.kind === 'protrusion' ? floor.protrusions?.[sel.id] : null;
  if (!floor || !pr) return null;
  let best: { id: Id; seg: number } | null = null;
  let bestD = HANDLE_PX;
  for (const h of protrusionArcHandles(floor, pr)) {
    const d = dist(toScreen(h.at, store.get().camera), p.screen);
    if (d <= bestD) {
      best = { id: pr.id, seg: h.seg };
      bestD = d;
    }
  }
  return best;
}

/** `drawing` = i úchyty vybrané kresby (jen nástroj Vybrat – v nástrojích kreslení tah z konce čáry kreslí dál). */
export function grabArcHandle(p: PointerInput, drawing = false): boolean {
  const dh = drawing ? drawingHandleUnderPen(p) : null;
  if (dh) {
    drag = { kind: 'draw', h: dh };
    downScreen = p.screen;
    dragging = false;
    return true;
  }
  const ph = protArcUnderPen(p);
  if (ph) {
    drag = { kind: 'protArc', id: ph.id, seg: ph.seg };
    downScreen = p.screen;
    dragging = false;
    return true;
  }
  const id = arcUnderPen(p);
  if (!id) return false;
  drag = { kind: 'handle', id };
  downScreen = p.screen;
  dragging = false;
  return true;
}

export const selectTool: Tool = {
  down(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    resetGuides(); // žádný časovač ani zámek z minulého gesta
    if (grabArcHandle(p, true) || grabLeaderHandle(p)) return;
    const cam = store.get().camera;
    const before = store.get().selection;
    const hit = pickAny(store.view('pick')!, p.world, cam, before);
    downScreen = p.screen;
    dragging = false;
    drag = null;
    // D14: ťuknutí znovu na vybraný roh, pod kterým leží další (oddělený roh) → po zvednutí bez tažení přepnout
    cycleAt = hit?.kind === 'node' && before?.kind === 'node' && before.id === hit.id ? p.world : null;

    if (!hit) {
      // Tažení z prázdného místa = výběr obdélníkem, ťuknutí = zrušení výběru
      store.set({ selection: null, numpad: null });
      band = { start: p.world, end: p.world, startScreen: p.screen, endScreen: p.screen };
      return;
    }
    const cur = store.get().selection;
    if (cur?.kind === 'multi') {
      const member = cur.items.some(i => (i.kind === hit.kind && i.id === (hit as { id: Id }).id) || (hit.kind === 'node' && i.kind === 'wall' && (floor.walls[i.id]?.a === (hit as { id: Id }).id || floor.walls[i.id]?.b === (hit as { id: Id }).id)));
      if (member) {
        drag = { kind: 'group', origin: groupOrigin(floor, cur.items), start: p.world };
        return;
      }
    }
    store.set({ selection: hit, numpad: null });
    resetGuides();
    // pomocné čáry se počítají při uchopení (původní směr = poloha před tažením)
    if (hit.kind === 'node') drag = { kind: 'node', id: hit.id, lines: nodeDragLines(store.view('snap')!, hit.id) };
    // D12: tažení už vybrané stěny ji posune celou (sousední stěny se protáhnou)
    // kruh a část rozděleného oblouku (řetěz se tvaruje jako celek) se takto neposouvají
    const chain = hit.kind === 'wall' ? arcChain(floor, hit.id) : null;
    if (hit.kind === 'wall' && before?.kind === 'wall' && before.id === hit.id && floor.walls[hit.id]?.radius === undefined && !(chain && chain.pieces.length > 1)) {
      drag = { kind: 'wall', id: hit.id, origin: groupOrigin(floor, [hit]), grab: p.world, lines: wallMoveLines(store.view('snap')!, hit.id, p.world) };
    }
    // tažení už vybrané kresby / schodiště ji posune celou
    if ((hit.kind === 'drawing' || hit.kind === 'stair' || hit.kind === 'stroke') && before?.kind === hit.kind && before.id === hit.id) {
      const geom = hit.kind === 'stair' ? stairGeom(floor, hit.id) : null;
      drag = { kind: 'group', origin: groupOrigin(floor, [hit]), start: p.world, ...(geom ? { snap: { geom, targets: moveSnapTargets(store.view('snap')!, hit.id) } } : {}) };
    }
    if (hit.kind === 'room') {
      const r = floor.rooms[hit.id]!;
      drag = { kind: 'room', id: hit.id, dx: p.world.x - r.x, dy: p.world.y - r.y };
    }
    if (hit.kind === 'text') {
      const t = floor.texts[hit.id]!;
      drag = { kind: 'text', id: hit.id, dx: p.world.x - t.x, dy: p.world.y - t.y };
    }
    if (hit.kind === 'opening') {
      const op = floor.openings[hit.id]!;
      const wall = floor.walls[op.wallId];
      const n = wall && wallNodes(floor, wall);
      if (wall && n) {
        const len = wallLength(floor, wall);
        const along = projectToSegment(p.world, n[0], n[1]).t * len;
        const start = openingStartFromA(op, len);
        drag = { kind: 'opening', id: hit.id, grabOffset: along - start };
      }
    }
  },

  drag(p: PointerInput) {
    if (band) {
      band.end = p.world;
      band.endScreen = p.screen;
      requestRender();
      return;
    }
    if (!drag || !downScreen) return;
    if (!dragging) {
      if (dist(downScreen, p.screen) < 6) return; // ochrana proti nechtěnému posunu při ťuknutí
      dragging = true;
      store.beginGesture();
    }
    const floor = store.floor();
    if (!floor) return;
    const cam = store.get().camera;

    if (drag.kind === 'draw') {
      dragDrawingHandle(drag.h, p);
    } else if (drag.kind === 'leader') {
      updateText(drag.id, { leader: { x: Math.round(p.world.x / 10) * 10, y: Math.round(p.world.y / 10) * 10 } });
    } else if (drag.kind === 'group') {
      const raw = { x: p.world.x - drag.start.x, y: p.world.y - drag.start.y };
      const r = drag.snap && store.get().settings.snap ? snapMove(drag.snap.geom, drag.snap.targets, raw, HIT_PX.snapNode / cam.zoom) : null;
      snapHits = r?.hits ?? [];
      // přichyceno = přesně (krok 1 mm), volně po 10 mm
      moveGroup(drag.origin, (r?.delta ?? raw).x, (r?.delta ?? raw).y, r?.snapped ? 1 : 10);
      requestRender();
    } else if (drag.kind === 'node') {
      const tol = HIT_PX.snapNode / cam.zoom;
      const other = findNodeNear(store.view('snap')!, p.world, tol, drag.id);
      let target: Pt;
      if (other) {
        target = other;
        lock = null;
        shown = null;
      } else {
        armHold(p);
        const g = guided(p, drag.lines, cam.zoom);
        if (g) {
          moveNode(drag.id, g);
          requestRender();
          return;
        }
        const w = findWallNear(store.view('snap')!, p.world, tol * 0.7);
        const own = w && (w.wall.a === drag.id || w.wall.b === drag.id);
        // po uvolnění prodlevou platí přesná poloha pod perem (bod 8 návrhu), jinak krok 10 mm
        target = holdFreeAt ? p.world : w && !own ? w.point : { x: roundTo(p.world.x, 10), y: roundTo(p.world.y, 10) };
      }
      moveNode(drag.id, target);
    } else if (drag.kind === 'wall') {
      armHold(p);
      const g = guided(p, drag.lines, cam.zoom);
      const to = g ?? p.world;
      // na pomocné čáře přesně (krok 1 mm), volně po 10 mm
      moveGroup(drag.origin, to.x - drag.grab.x, to.y - drag.grab.y, g ? 1 : 10);
      requestRender();
    } else if (drag.kind === 'opening') {
      const op = floor.openings[drag.id];
      const wall = op && floor.walls[op.wallId];
      const n = wall && wallNodes(floor, wall);
      if (op && wall && n) {
        const along = projectToSegment(p.world, n[0], n[1]).t * wallLength(floor, wall);
        moveOpeningTo(drag.id, roundTo(along - drag.grabOffset, 10));
      }
    } else if (drag.kind === 'room') {
      moveRoom(drag.id, { x: p.world.x - drag.dx, y: p.world.y - drag.dy });
    } else if (drag.kind === 'text') {
      moveText(drag.id, { x: p.world.x - drag.dx, y: p.world.y - drag.dy });
    } else if (drag.kind === 'protArc') {
      const pr = floor.protrusions?.[drag.id];
      const s = pr && sagittaFromPoint(floor, pr, drag.seg, p.world);
      if (s !== null && s !== undefined) setProtrusionArc(drag.id, drag.seg, s);
    } else if (drag.kind === 'handle') {
      const wall = floor.walls[drag.id];
      const n = wall && wallNodes(floor, wall);
      if (wall && n && wall.radius !== undefined) {
        // kruh: poloměr = vzdálenost pera od středu
        setCircleRadius(drag.id, Math.max(10, roundTo(dist(p.world, n[0]), 10)));
      } else if (wall && n) {
        // oblouk: vzepětí = vzdálenost pera od tětivy (se znaménkem podle strany)
        // oblouk rozdělený na části se táhne celý (podle vnějších konců)
        const ch = arcChain(floor, wall.id);
        const pa = ch?.a ?? n[0];
        const pb = ch?.b ?? n[1];
        const len = dist(pa, pb) || 1;
        const nx = -(pb.y - pa.y) / len;
        const ny = (pb.x - pa.x) / len;
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        let h = roundTo((p.world.x - mid.x) * nx + (p.world.y - mid.y) * ny, 10);
        if (h === 0) h = (Math.sign(ch?.sagitta ?? wall.sagitta ?? 1) || 1) * 10; // 0 by znamenalo rovnou stěnu – tu se zbavíme jen v panelu
        setWallSagitta(drag.id, h);
      }
    }
  },

  up() {
    if (band) {
      const b = band;
      band = null;
      const floor = store.floor();
      if (floor && Math.hypot(b.endScreen.x - b.startScreen.x, b.endScreen.y - b.startScreen.y) >= 8) {
        const items = selectInRect(store.view('pick')!, normRect(b.start, b.end), b.end.x < b.start.x);
        store.set({ selection: items.length === 0 ? null : items.length === 1 ? items[0]! : { kind: 'multi', items } });
      }
      requestRender();
      return;
    }
    if (drag && dragging) {
      if (drag.kind === 'node') mergeNodeIfCoincident(drag.id);
      if (drag.kind === 'wall') for (const id of Object.keys(drag.origin.nodes)) mergeNodeIfCoincident(id);
      store.endGesture();
    } else if (drag?.kind === 'protArc') {
      // ťuknutí na úchyt bez tažení = zadat vzepětí číslem
      openTarget({ kind: 'protrusion-sagitta', protrusionId: drag.id, seg: drag.seg });
    } else if (drag?.kind === 'handle') {
      // ťuknutí na úchyt oblouku bez tažení = výběr stěny
      store.set({ selection: { kind: 'wall', id: drag.id } });
    } else if (drag?.kind === 'node' && cycleAt) {
      // opakované ťuknutí na překrývající se konce přepíná mezi nimi (D14)
      const floor = store.floor();
      const next = floor && nextNodeAt(store.view('pick')!, cycleAt, HIT_PX.node / store.get().camera.zoom, drag.id);
      if (next) store.set({ selection: { kind: 'node', id: next.id } });
    }
    cycleAt = null;
    resetGuides();
    drag = null;
    dragging = false;
    downScreen = null;
  },

  hover(p: PointerInput) {
    const floor = store.floor();
    if (!floor) return;
    const hit = pickAny(store.view('pick')!, p.world, store.get().camera, store.get().selection);
    const cur = store.get().hover;
    if (hit?.kind !== cur?.kind || (hit as { id?: Id } | null)?.id !== (cur as { id?: Id } | null)?.id) {
      store.set({ hover: hit });
      requestRender();
    }
  },

  drawOverlay(ctx) {
    if (shown && drag && dragging) drawGuides(ctx, shown, store.get().camera);
    if (snapHits.length && drag && dragging) drawSnapHits(ctx, snapHits, store.get().camera);
    if (!band) return;
    const x = Math.min(band.startScreen.x, band.endScreen.x);
    const y = Math.min(band.startScreen.y, band.endScreen.y);
    const w = Math.abs(band.endScreen.x - band.startScreen.x);
    const h = Math.abs(band.endScreen.y - band.startScreen.y);
    const crossing = band.end.x < band.start.x;
    ctx.save();
    ctx.fillStyle = crossing ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.12)';
    ctx.strokeStyle = crossing ? '#16a34a' : '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(crossing ? [6, 4] : []);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  },

  cancel() {
    resetGuides();
    band = null;
    if (dragging) store.endGesture();
    drag = null;
    dragging = false;
  }
};

/** Pomocné čáry tažení: původní směry tence čárkovaně, zachycená čára tučně; ikona ⊥ u kolmice (D13). */
export function drawGuides(ctx: CanvasRenderingContext2D, g: { line: DragLine | null; point: Pt; lines: DragLine[] }, cam: Camera): void {
  const L = 100000; // mm – čára přes celé plátno
  const seg = (l: DragLine) => [toScreen({ x: l.origin.x - l.dir.x * L, y: l.origin.y - l.dir.y * L }, cam), toScreen({ x: l.origin.x + l.dir.x * L, y: l.origin.y + l.dir.y * L }, cam)] as const;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#a855f7';
  for (const l of g.lines) {
    if (l.id === g.line?.id) continue;
    const [a, b] = seg(l);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (g.line) {
    const [a, b] = seg(g.line);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (g.line.perpTo) {
      // ikona kolmice ⊥ vedle bodu
      const p = toScreen(g.point, cam);
      const x = p.x + 14;
      const y = p.y - 14;
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 16, 20, 18, 3);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 2);
      ctx.lineTo(x + 14, y - 2);
      ctx.moveTo(x + 8, y - 2);
      ctx.lineTo(x + 8, y - 13);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Hrany (a body), ke kterým se přichytilo posouvané schodiště – zvýrazněné fialově. */
function drawSnapHits(ctx: CanvasRenderingContext2D, hits: [Pt, Pt][], cam: Camera): void {
  ctx.save();
  ctx.strokeStyle = '#a855f7';
  ctx.fillStyle = '#a855f7';
  ctx.lineWidth = 3;
  for (const [a0, b0] of hits) {
    const a = toScreen(a0, cam);
    const b = toScreen(b0, cam);
    ctx.beginPath();
    if (dist(a0, b0) < 1) ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
    else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (dist(a0, b0) < 1) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}
