/**
 * Kreslení jedné kóty (vynášecí čáry, kótovací čára, klikací číslo) a ikona zámku kóty.
 * Používají ji všechny druhy kót (stěny, otvory, výstupky, volné kóty…).
 */
import { add, dist, lerp, scale, unit } from '../core/geometry';
import type { Floor, Pt } from '../model/types';
import { addHitBox, type HitAction } from './hitTargets';
import { dimKey } from '../core/dimLock';
import { dimShift, rowOf, type DimDrag, type DimRow } from '../core/dimPlace';

export interface DimStyle {
  color: string;
  bg: string;
  bold: boolean;
}

function readableAngle(u: Pt): number {
  let ang = Math.atan2(u.y, u.x);
  if (ang > Math.PI / 2 + 0.01) ang -= Math.PI;
  if (ang < -Math.PI / 2 - 0.01) ang += Math.PI;
  return ang;
}

export function drawDimLine(
  ctx: CanvasRenderingContext2D,
  p1: Pt,
  p2: Pt,
  out: Pt,
  offsetPx: number,
  text: string,
  subText: string | undefined,
  style: DimStyle,
  s: number,
  action: HitAction | null,
  /**
   * Řada kót, která se tažením posouvá společně (chybí = kóta sama), a `alongKey` = rozlišení čísla, když se
   * stejná kóta kreslí víckrát (zárubeň vlevo / vpravo); core/dimPlace.ts.
   */
  place: { row?: DimRow; alongKey?: string } = {}
): void {
  // posun kóty tažením za číslo (core/dimPlace.ts): kolmo celá řada (i úsek bez čísla), číslo podél jen tato kóta
  const target = action?.type === 'numpad' && action.target.kind !== 'field' ? action.target : null;
  const dimRow = place.row ?? (target ? rowOf(target) : null);
  const shift = dimRow ? dimShift(placeCtx.place, dimRow, target, place.alongKey) : { off: 0, along: 0 };
  offsetPx += shift.off * placeCtx.zoom;
  // vynášecí čáry začínají kousek od měřeného bodu na straně, kde kóta leží
  const side = offsetPx < 0 ? -1 : 1;
  const o = scale(out, offsetPx);
  const q1 = { x: p1.x + o.x, y: p1.y + o.y };
  const q2 = { x: p2.x + o.x, y: p2.y + o.y };
  const u = unit(p1, p2);

  ctx.save();
  // Vynášecí čáry
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [p, q] of [
    [p1, q1],
    [p2, q2]
  ] as const) {
    if (Math.abs(offsetPx) <= 4) continue;
    ctx.moveTo(p.x + out.x * 4 * side, p.y + out.y * 4 * side);
    ctx.lineTo(q.x + out.x * 4 * side, q.y + out.y * 4 * side);
  }
  ctx.stroke();

  // Kótovací čára a šikmé značky
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(q1.x, q1.y);
  ctx.lineTo(q2.x, q2.y);
  const tick = { x: (u.x + out.x) * 4, y: (u.y + out.y) * 4 };
  for (const q of [q1, q2]) {
    ctx.moveTo(q.x - tick.x, q.y - tick.y);
    ctx.lineTo(q.x + tick.x, q.y + tick.y);
  }
  ctx.stroke();

  // úsek bez čísla (např. rám okna – pevných 50 mm se nekótuje)
  if (!text) {
    ctx.restore();
    return;
  }

  // Číslo
  const fontPx = Math.round(13 * s);
  const subPx = Math.round(10 * s);
  ctx.font = `${style.bold ? 700 : 500} ${fontPx}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  let sw = 0;
  if (subText) {
    ctx.font = `500 ${subPx}px system-ui, sans-serif`;
    sw = ctx.measureText(subText).width;
  }
  const boxW = Math.max(tw, sw) + 10;
  const boxH = fontPx + 6 + (subText ? subPx + 2 : 0);
  const along = shift.along * placeCtx.zoom;
  const mid = add(lerp(q1, q2, 0.5), scale(u, along));
  const angle = readableAngle(u);

  // číslo posunuté za konec kótovací čáry: čára se k němu prodlouží
  if (Math.abs(along) > dist(q1, q2) / 2) {
    const end = along > 0 ? q2 : q1;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(mid.x, mid.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // číslo se kreslí až po čarách všech kót (flushDimLabels) – žádná kótovací čára ho nepřeškrtne
  labels.push(() => {
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(angle);
    ctx.fillStyle = style.bg;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 4);
    ctx.fill();
    if (action) ctx.stroke();
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${style.bold ? 700 : 500} ${fontPx}px system-ui, sans-serif`;
    ctx.fillText(text, 0, subText ? -boxH / 2 + 3 + fontPx / 2 : 0);
    if (subText) {
      ctx.font = `500 ${subPx}px system-ui, sans-serif`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(subText, 0, boxH / 2 - 2 - subPx / 2);
    }
    ctx.restore();
  });

  const drag: DimDrag | undefined = target && dimRow ? { row: dimRow, target, out, u, alongKey: place.alongKey } : undefined;
  if (action) addHitBox({ x: mid.x, y: mid.y, halfW: boxW / 2, halfH: boxH / 2, angle, action, drag });

  // Zámek kóty: modrá ikona hned za číslem (pomocná – jen v editoru)
  if (action?.type === 'numpad' && action.target.kind !== 'field' && lockCtx.helpers) {
    const key = dimKey(action.target);
    if (lockCtx.locks?.[key]) {
      const r = 9 * s;
      const c = add(mid, scale({ x: Math.cos(angle), y: Math.sin(angle) }, boxW / 2 + r + 2));
      const highlight = key === lockCtx.blocked;
      labels.push(() => drawLockIcon(ctx, c, r, highlight));
      addHitBox({ x: c.x, y: c.y, halfW: r, halfH: r, angle, action: { type: 'lock', target: action.target } });
    }
  }
}

/** Čísla kót a ikony zámků čekající na vykreslení nad všemi čarami kót. */
let labels: (() => void)[] = [];

/** Vykreslí čísla všech kót nakreslených od posledního volání (nad všemi kótovacími a vynášecími čarami). */
export function flushDimLabels(): void {
  const list = labels;
  labels = [];
  for (const draw of list) draw();
}

/** Posunuté kóty a měřítko pro aktuální vykreslení (nastaví renderer před kreslením kót). */
let placeCtx: { place: Floor['dimPlace']; zoom: number } = {
  place: undefined,
  zoom: 1
};

export function setDimPlaceContext(place: Floor['dimPlace'], zoom: number): void {
  placeCtx = { place, zoom };
}

/** Zámky kót pro aktuální vykreslení (nastaví renderer před kreslením kót). */
let lockCtx: {
  locks: Floor['dimLocks'];
  blocked: string | null;
  helpers: boolean;
} = { locks: undefined, blocked: null, helpers: true };

/**
 * `locks` = zamčené kóty podlaží, `blocked` = kóta, která právě zastavila úpravu (zvýrazní se),
 * `helpers` = kreslit pomocné ikony (editor ano, export výkresu ne).
 */
export function setDimLockContext(locks: Floor['dimLocks'], blocked: string | null, helpers: boolean): void {
  lockCtx = { locks, blocked, helpers };
}

/** Ikona zámku: bílý kroužek s modrým okrajem a modrým zámkem (čitelné i na slunci); zvýrazněná žlutě. */
function drawLockIcon(ctx: CanvasRenderingContext2D, c: Pt, r: number, highlight: boolean): void {
  const blue = '#1d4ed8';
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? '#fde047' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = blue;
  ctx.stroke();
  // oblouk (třmen) a tělo zámku
  const w = r * 0.95;
  const h = r * 0.7;
  ctx.beginPath();
  ctx.arc(0, -h * 0.15, w * 0.32, Math.PI, 0);
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  ctx.stroke();
  ctx.fillStyle = blue;
  ctx.fillRect(-w / 2, -h * 0.15, w, h * 0.75);
  ctx.restore();
}
