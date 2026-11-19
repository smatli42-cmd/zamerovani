/**
 * Akce: kresba (samostatná čára, obdélník, kruh, oblouk, dvojitá čára) – čistě grafické prvky v `Floor.drawings`.
 * Žádná akce kresby nesahá na stěny, rohy ani výstupky (pravidla: core/drawing.ts).
 */
import { newId } from '../../model/factory';
import type { DrawColor, Drawing, Floor, HatchKind, Id, LineStyle, Pt } from '../../model/types';
import { dist } from '../../core/geometry';
import { canHatch, doubleWidthTowards, moveDrawingVertex, openLineEnds, sagittaTowards, setRectSize } from '../../core/drawing';
import { applyTrim, extendPlan, remapTrimDims, trimPiece, type TrimFail } from '../../core/drawTrim';
import { store } from '../store';

/** Body blíž než toto (mm) jsou jeden bod (navázání a uzavření lomené čáry). */
const JOIN_TOL = 1;

const P = (p: Pt) => ({ x: p.x, y: p.y });

/** Styl a barva nové kresby podle voleb nástroje (plná a černá se neukládají). */
function look(style: LineStyle): Pick<Drawing, 'style' | 'color'> {
  const color = store.get().settings.drawColor;
  return { ...(style !== 'solid' ? { style } : {}), ...(color !== 'black' ? { color } : {}) };
}

function insert(d: Omit<Drawing, 'id'>, select = false): Id {
  const id = newId('dr');
  store.edit(floor => {
    (floor.drawings ??= {})[id] = { ...d, id };
  }, select ? { selection: { kind: 'drawing', id } } : {});
  return id;
}

/**
 * Úsek samostatné čáry a→b. Začíná-li na volném konci jiné lomené čáry, naváže na ni; dosedne-li pak na její
 * druhý konec, čára se uzavře. Jinak vznikne nová čára. Stěny ani výstupky to nikdy nevytvoří.
 */
export function addDrawLine(a: Pt, b: Pt): Id | null {
  if (dist(a, b) < 1) return null;
  const floor = store.floor();
  if (!floor) return null;
  const near = (p: Pt, q: Pt) => dist(p, q) <= JOIN_TOL;
  const all = Object.values(floor.drawings ?? {}).reverse(); // naposledy kreslená má přednost
  const host = all.find(d => {
    const e = openLineEnds(d);
    return !!e && (near(e[0], a) || near(e[1], a) || near(e[0], b) || near(e[1], b));
  });
  if (!host) return insert({ shape: 'line', pts: [P(a), P(b)], ...look(store.get().settings.shapeStyle) });
  store.edit(f => {
    const d = f.drawings![host.id]!;
    const first = d.pts[0]!;
    const last = d.pts[d.pts.length - 1]!;
    // úsek přiložený k lomené čáře z kterékoli strany: „from“ = bod na jejím konci, „to“ = nový bod
    const atLast = near(last, a) || near(last, b);
    const from = atLast ? last : first;
    const to = near(from, a) ? b : a;
    const other = atLast ? first : last;
    if (near(other, to)) {
      if (d.pts.length >= 3) d.closed = true;
      return d.pts.length >= 3 ? undefined : false;
    }
    // úsek končí na volném konci jiné lomené čáry → obě čáry se spojí do jedné
    const other2 = Object.values(f.drawings!).find(o => o.id !== d.id && (() => {
      const e = openLineEnds(o);
      return !!e && (near(e[0], to) || near(e[1], to));
    })());
    if (!atLast) {
      // přidávání na začátek = obrátit, přidat na konec (vzepětí se přenesou na správné úseky)
      reverseLine(d);
    }
    if (other2) {
      const tail = other2.pts.map(q => ({ ...q }));
      if (near(tail[tail.length - 1]!, to)) reverseLine({ ...other2, pts: tail });
      delete d.pts[d.pts.length - 1]!.s;
      d.pts.push(...tail);
      delete f.drawings![other2.id];
    } else d.pts.push(P(to));
  });
  return host.id;
}

/** Obrátí pořadí bodů lomené čáry (vzepětí úseků se přenesou a otočí znaménko). */
function reverseLine(d: Pick<Drawing, 'pts'>): void {
  const n = d.pts.length;
  const s = d.pts.map(p => p.s);
  d.pts.reverse();
  for (let i = 0; i < n; i++) {
    // úsek i nové čáry = úsek n-2-i původní, opačným směrem
    const v = i < n - 1 ? s[n - 2 - i] : undefined;
    if (v) d.pts[i]!.s = -v;
    else delete d.pts[i]!.s;
  }
}

/** Obdélník (strany rovnoběžné s osami) z rohu p do protějšího rohu q. */
export function addDrawRect(p: Pt, q: Pt): Id {
  const pts = [P(p), { x: q.x, y: p.y }, P(q), { x: p.x, y: q.y }];
  return insert({ shape: 'rect', pts, ...look(store.get().settings.shapeStyle) });
}

export function addDrawCircle(c: Pt, r: number): Id {
  return insert({ shape: 'circle', pts: [P(c)], r, ...look(store.get().settings.shapeStyle) });
}

/** Oblouk mezi a a b se vzepětím s (výběr nového oblouku, aby šel hned upravit úchytem). */
export function addDrawArc(a: Pt, b: Pt, s: number): Id {
  return insert({ shape: 'arc', pts: [{ ...P(a), s }, P(b)], ...look(store.get().settings.shapeStyle) }, true);
}

/** Dvojitá čára a→b (druhá čára o `width` na stranu `side`). */
export function addDrawDouble(a: Pt, b: Pt, width: number, side: 1 | -1): Id {
  const { doubleEnds, doubleStyle, drawColor } = store.get().settings;
  return insert({
    shape: 'double',
    pts: [P(a), P(b)],
    width,
    side,
    ...(doubleEnds === 'closed' ? { closedEnds: true as const } : {}),
    ...(doubleStyle !== 'solid' ? { style: doubleStyle } : {}),
    ...(drawColor !== 'black' ? { color: drawColor } : {})
  });
}

function change(id: Id, recipe: (d: Drawing, floor: Floor) => void | boolean): boolean {
  return store.edit(floor => {
    const d = floor.drawings?.[id];
    if (!d) return false;
    return recipe(d, floor);
  });
}

/** Vzhled kresby: styl, barva, šrafa (šrafa jen u uzavřeného tvaru), uzavření. */
export function updateDrawing(
  id: Id,
  patch: { style?: LineStyle; color?: DrawColor; hatch?: HatchKind | null; hatchColor?: DrawColor; closed?: boolean; closedEnds?: boolean }
): void {
  change(id, d => {
    if (patch.style !== undefined) {
      if (patch.style === 'solid') delete d.style;
      else d.style = patch.style;
    }
    if (patch.color !== undefined) {
      if (patch.color === 'black') delete d.color;
      else d.color = patch.color;
    }
    if (patch.hatchColor !== undefined) d.hatchColor = patch.hatchColor;
    if (patch.closed !== undefined && d.shape === 'line') {
      if (patch.closed && d.pts.length >= 3) d.closed = true;
      else if (d.closed) {
        delete d.closed;
        // vzepětí patřilo uzavíracímu úseku, který zmizel
        delete d.pts[d.pts.length - 1]!.s;
      }
    }
    if (patch.closedEnds !== undefined && d.shape === 'double') {
      if (patch.closedEnds) d.closedEnds = true;
      else delete d.closedEnds;
    }
    if (patch.hatch !== undefined) {
      if (patch.hatch === null) delete d.hatch;
      else if (canHatch(d)) d.hatch = patch.hatch;
    }
    // otevřený tvar šrafu nemá (např. po otevření čáry)
    if (!canHatch(d)) {
      delete d.hatch;
      delete d.hatchColor;
    }
  });
}

export function setDrawingVertex(id: Id, i: number, p: Pt): void {
  change(id, d => moveDrawingVertex(d, i, p));
}

/** Vzepětí úseku `seg` (0 = rovný); u oblouku nikdy 0. */
export function setDrawingBulge(id: Id, seg: number, s: number): void {
  change(id, d => {
    const p = d.pts[seg];
    if (!p) return false;
    const v = d.shape === 'arc' && Math.abs(s) < 10 ? (Math.sign(p.s ?? 1) || 1) * 10 : s;
    if (v) p.s = v;
    else delete p.s;
  });
}

/** Vzepětí úseku podle bodu, kam uživatel táhne úchyt. */
export function dragDrawingBulge(id: Id, seg: number, at: Pt): void {
  const d = store.floor()?.drawings?.[id];
  const n = d?.pts.length ?? 0;
  const a = d?.pts[seg];
  const b = d?.pts[(seg + 1) % n];
  if (a && b) setDrawingBulge(id, seg, sagittaTowards(a, b, at));
}

export function setDrawingRadius(id: Id, r: number): void {
  if (r < 1) return;
  change(id, d => {
    if (d.shape !== 'circle') return false;
    d.r = r;
  });
}

export function setDrawingWidth(id: Id, width: number, side?: 1 | -1): void {
  if (width < 1) return;
  change(id, d => {
    if (d.shape !== 'double') return false;
    d.width = width;
    if (side) d.side = side;
  });
}

/** Vzdálenost čar dvojité čáry podle bodu, kam uživatel táhne úchyt druhé čáry. */
export function dragDrawingWidth(id: Id, at: Pt): void {
  const d = store.floor()?.drawings?.[id];
  const w = d && doubleWidthTowards(d, at);
  if (w) setDrawingWidth(id, w.width, w.side);
}

export function flipDrawingSide(id: Id): void {
  change(id, d => {
    if (d.shape !== 'double') return false;
    d.side = d.side === -1 ? 1 : -1;
  });
}

export function setDrawingRect(id: Id, w: number, h: number): void {
  change(id, d => setRectSize(d, w, h));
}

/**
 * Oříznout čáru kresby v místě ťuknutí (core/drawTrim.ts): kus mezi nejbližšími průsečíky zmizí; čára se může
 * rozpadnout na dvě (kusy dostanou nová id a stejný vzhled), uzavřená se otevře (šrafa zmizí). Volné kóty na ní
 * přepojí `remapTrimDims`.
 */
export function trimDrawingAt(id: Id, p: Pt): TrimFail | 'ok' {
  const floor = store.floor();
  const d = floor?.drawings?.[id];
  if (!floor || !d) return 'notLine';
  const piece = trimPiece(floor, d, p);
  if (typeof piece === 'string') return piece;
  const parts = applyTrim(d, piece);
  let lockedDim = false;
  const done = store.edit(
    f => {
      const cur = f.drawings?.[id];
      if (!cur) return false;
      // všechny kusy dostanou nová id – kóty na kresbu přepojí jen remapTrimDims (obecné znovunapojení je nechá být)
      const old: Drawing = JSON.parse(JSON.stringify(cur));
      delete f.drawings![id];
      const look: Partial<Drawing> = { ...(cur.style ? { style: cur.style } : {}), ...(cur.color ? { color: cur.color } : {}) };
      const made = parts.map(pts => {
        const nid = newId('dr');
        return (f.drawings![nid] = { id: nid, shape: 'line', pts, ...look });
      });
      if (!remapTrimDims(f, old, made)) {
        lockedDim = true;
        return false;
      }
      return true;
    },
    { selection: null }
  );
  if (lockedDim) store.set({ lockBlock: { key: '', text: 'Nelze – oříznutím by zanikla zamčená kóta k ořezané části čáry.' } });
  return done ? 'ok' : 'blocked'; // zastaveno zámkem kóty (hlášení lockBlock)
}

/** Prodloužit koncový úsek otevřené čáry kresby k nejbližší čáře v jeho směru (core/drawTrim.ts). */
export function extendDrawingAt(id: Id, p: Pt): TrimFail | 'ok' {
  const floor = store.floor();
  const d = floor?.drawings?.[id];
  if (!floor || !d) return 'notLine';
  const plan = extendPlan(floor, d, p);
  if (typeof plan === 'string') return plan;
  const done = change(id, cur => {
    const q = plan.end ? cur.pts[cur.pts.length - 1] : cur.pts[0];
    if (!q) return false;
    q.x = plan.to.x;
    q.y = plan.to.y;
  });
  return done ? 'ok' : 'blocked';
}
