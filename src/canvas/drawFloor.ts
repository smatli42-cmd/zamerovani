/**
 * Kreslení podlaží po vrstvách – JEDNO místo pro plátno editoru (`renderer.ts`) i export do PDF
 * (`export/pdfPlan.ts`): stejné kreslicí funkce, jen jiný „papír“ (kontext 2D) a kamera.
 * Pravidla vrstev jsou v core/layers.ts (skryté se nekreslí, automatické kóty ve vrstvě Kóty jen u viditelné stěny).
 */
import type { Floor, Id, Project } from '../model/types';
import type { Camera, Selection } from '../store/store';
import { drawStairDims, drawStairs } from './drawStairs';
import { drawBodyDims, drawDims, drawProtrusionDims } from './drawDims';
import { setDimLockContext, setDimPlaceContext } from './dimLine';
import { drawCornerEndDims } from './drawCornerEndDims';
import { drawFreeDims } from './drawFreeDims';
import { drawWalls } from './drawPlan';
import { drawOpenings } from './drawOpenings';
import { drawDrawings } from './drawDrawings';
import { drawRooms } from './drawRooms';
import { drawTexts } from './drawTexts';
import { drawMarks } from './drawMarks';
import { drawStrokes } from './drawStrokes';
import { drawComponentDims } from './drawComponentDims';
import { setHitEnabled } from './hitTargets';
import { setWallFilter } from './layerDraw';
import { elementLayer, kindsInLayer, layerSlice, layersOf, SYS, viewFloor, wallVisible } from '../core/layers';

export interface FloorDrawOptions {
  selection: Selection;
  hover: Selection;
  dimScale: number;
  /** Zvýrazněný zámek kóty (hlášení), null = žádný. */
  lockBlock: string | null;
  /** Pomocné značky editoru (ikony zámků kót); export je nekreslí. */
  helpers: boolean;
  /** Export: které stěny (s otvory, výstupky a kótami) se kreslí; chybí = všechny viditelné. */
  walls?: (wallId: Id) => boolean;
  /**
   * Export: kóty, které aplikace ukazuje jen u vybraného prvku (tloušťka, výstupky, schodiště, odstupy),
   * se nakreslí u každého prvku zvlášť (pracovní kóty zapnuté). Seznam prvků, pro které se kreslí.
   */
  allDims?: Selection[];
  /** Export: stěny s mírami líců i bez výběru (délka po líci = hlavní kóta). */
  faceDims?: (wallId: Id) => boolean;
  /**
   * Export: celé podlaží pro geometrii (konce volných kót, plocha místnosti) – kreslené podlaží může mít
   * odebrané prvky, které do exportu nejdou (kóta k nim platí dál, pravidlo 8). Chybí = `floor`.
   */
  geo?: Floor;
  /** Klikací popisky (editor); export je nevytváří. Chybí = ano. */
  hits?: boolean;
}

/** Nakreslí podlaží po vrstvách v pořadí kreslení (bez rohů a úchytů – ty jsou jen v editoru). */
export function drawFloorLayers(ctx: CanvasRenderingContext2D, project: Pick<Project, 'layers'> | null, floor: Floor, cam: Camera, o: FloorDrawOptions): void {
  const s = o.dimScale;
  const extra = o.walls ?? (() => true);
  const geo = o.geo ?? floor;
  const hits = o.hits !== false;
  setDimLockContext(floor.dimLocks, o.lockBlock, o.helpers);
  setDimPlaceContext(floor.dimPlace, cam.zoom);
  for (const layer of layersOf(project)) {
    if (!layer.visible) continue;
    const kinds = kindsInLayer(floor, layer.id);
    setHitEnabled(hits && !layer.locked);
    if (kinds.has('wall')) {
      setWallFilter(id => elementLayer(floor, 'wall', id) === layer.id && extra(id));
      drawWalls(ctx, floor, cam, o.selection, o.hover);
      drawOpenings(ctx, floor, cam, o.selection, o.hover);
    }
    const slice = layerSlice(floor, layer.id);
    // kresba a její šrafy nad výplní stěn i otvory (překlad nad otvorem) – vrstva Kresba leží nad Stavbou
    if (kinds.has('drawing')) drawDrawings(ctx, slice, cam, o.selection, o.hover);
    if (kinds.has('stair')) drawStairs(ctx, slice, cam, o.selection, o.hover);
    if (kinds.has('room')) drawRooms(ctx, slice, cam, o.selection, geo);
    if (kinds.has('text')) drawTexts(ctx, slice, cam, o.selection);
    // značky (poznámka + skica) – stálá velikost na obrazovce (core/marks.ts)
    if (kinds.has('mark')) drawMarks(ctx, slice, cam, o.selection);
    // ruční tahy barvou vrstvy (core/strokes.ts)
    if (kinds.has('stroke')) drawStrokes(ctx, slice, cam, layer.color, o.selection, o.hover);
    // automatické kóty patří vrstvě Kóty a kreslí se jen u viditelné stěny (rozhodnutí uživatele 2026-11-19)
    if (layer.id === SYS.koty) {
      setWallFilter(id => wallVisible(project, floor, id) && extra(id));
      drawDims(ctx, floor, cam, s, o.selection, o.faceDims);
      for (const sel of o.allDims ?? [o.selection]) {
        // odstupy skupiny jen k viditelným stěnám (skryté se do kót mezi prvky nepočítají)
        drawComponentDims(ctx, viewFloor(project, floor, 'snap'), cam, s, sel);
        drawBodyDims(ctx, floor, cam, s, sel);
        drawProtrusionDims(ctx, floor, cam, s, sel);
        drawCornerEndDims(ctx, floor, cam, s, sel);
        // kóty schodiště jen u vybraného schodiště
        drawStairDims(ctx, floor, cam, s, sel);
      }
    }
    // volné kóty jsou samostatné prvky své vrstvy – viditelné i u skrytého měřeného prvku (pravidlo 8);
    // konce se hledají v celém podlaží (měřená čára bývá v jiné vrstvě), test canvas/drawFreeDims.test.ts
    if (kinds.has('dim')) drawFreeDims(ctx, slice, cam, s, o.selection, o.hover, geo);
  }
  setHitEnabled(true);
  setWallFilter(null);
}
