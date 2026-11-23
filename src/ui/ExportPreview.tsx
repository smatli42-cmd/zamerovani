/**
 * Náhled listu půdorysu v okně Export (přání uživatele 2026-11-23): list papíru s razítkem a půdorysem
 * nakresleným stejně jako v PDF (export/planDraw.ts). Měřítko listu si uživatel zvolí, tažením posune, co má být
 * na listu vidět. Nastavení je pro každý list zvlášť (klíč = podlaží / místnost).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Project } from '../model/types';
import { drawPlanInto, planLayout, planSheets, type PlanSpec, type PlanView } from '../export/planDraw';
import { MARGIN, MM_PER_PX, paperSize, SCALES, STAMP_H, STAMP_W, type SheetFormat } from '../export/sheetFormat';

interface Props {
  project: Project;
  spec: PlanSpec & SheetFormat;
  views: Record<string, PlanView>;
  onView: (key: string, v: PlanView) => void;
}

export function ExportPreview({ project, spec, views, onView }: Props) {
  // výběr prvků se počítá jen při změně rozsahu / obsahu / vrstev, ne při posunu
  const sheets = useMemo(() => planSheets(project, { ...spec, views: undefined }), [project, JSON.stringify(spec.scope), JSON.stringify(spec.content), JSON.stringify(spec.layers)]);
  const [idx, setIdx] = useState(0);
  const sheet = sheets[Math.min(idx, sheets.length - 1)];
  const saved: PlanView = (sheet && views[sheet.key]) ?? { scale: spec.scale };
  // posun během tažení jen v náhledu (překreslí se jen náhled, jednou za snímek); do nastavení až po puštění
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const view: PlanView = live ? { ...saved, pan: live } : saved;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const [pw, ph] = paperSize(spec);
  const lay = sheet ? planLayout(sheet.fe, spec, view) : null;

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const cssW = box.current?.clientWidth || 440;
    const k = cssW / pw; // css px na mm papíru
    const dpr = globalThis.devicePixelRatio || 1;
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssW * (ph / pw)}px`;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssW * (ph / pw) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssW * (ph / pw));
    // razítko (pravý dolní roh)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect((pw - MARGIN - STAMP_W) * k, (ph - MARGIN - (STAMP_H - 4)) * k, STAMP_W * k, (STAMP_H - 4) * k);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('razítko', (pw - MARGIN - STAMP_W + 3) * k, (ph - MARGIN - (STAMP_H - 4)) * k + 13);
    if (!sheet || !lay) return;
    // plocha pro kresbu
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(lay.region.x1 * k, lay.region.y1 * k, (lay.region.x2 - lay.region.x1) * k, (lay.region.y2 - lay.region.y1) * k);
    ctx.setLineDash([]);
    // půdorys: 1 px kreslení = MM_PER_PX mm papíru
    const s = k * MM_PER_PX * dpr;
    ctx.setTransform(s, 0, 0, s, lay.region.x1 * k * dpr, lay.region.y1 * k * dpr);
    drawPlanInto(ctx, project, sheet.fe, lay, spec.layers, on => (ctx.globalAlpha = on ? 0.45 : 1));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  });

  if (!sheets.length) return <p class="muted small">Ve zvoleném rozsahu není půdorys k náhledu.</p>;

  const set = (v: Partial<PlanView>) => onView(sheet!.key, { ...view, ...v });
  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pan: view.pan ?? { x: 0, y: 0 } };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !lay) return;
    const k = (box.current?.clientWidth || 440) / pw;
    // css px → mm papíru → mm výkresu (měřítko); tažení výkresu doprava = střed listu doleva
    const f = lay.n / k;
    const pan = { x: Math.round(d.pan.x - (e.clientX - d.x) * f), y: Math.round(d.pan.y - (e.clientY - d.y) * f) };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLive(pan));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    if (!d || !lay) return setLive(null);
    const k = (box.current?.clientWidth || 440) / pw;
    const f = lay.n / k;
    const moved = Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 2;
    setLive(null);
    if (moved) set({ pan: { x: Math.round(d.pan.x - (e.clientX - d.x) * f), y: Math.round(d.pan.y - (e.clientY - d.y) * f) } });
  };

  return (
    <div class="export-preview">
      <div class="export-preview-bar">
        {sheets.length > 1 && (
          <select value={String(Math.min(idx, sheets.length - 1))} onChange={e => setIdx(Number((e.target as HTMLSelectElement).value))}>
            {sheets.map((sh, i) => (
              <option key={sh.key} value={i}>
                {sh.title}
              </option>
            ))}
          </select>
        )}
        <select value={String(view.scale)} onChange={e => set({ scale: (e.target as HTMLSelectElement).value === 'auto' ? 'auto' : Number((e.target as HTMLSelectElement).value) })}>
          <option value="auto">Automaticky{lay && view.scale === 'auto' ? ` (1 : ${lay.n})` : ''}</option>
          {SCALES.map(n => (
            <option key={n} value={n}>
              1 : {n}
            </option>
          ))}
        </select>
        <button class="btn btn-sm" disabled={!view.pan} onClick={() => set({ pan: undefined })}>
          Vycentrovat
        </button>
      </div>
      <div ref={box} class="export-preview-paper">
        <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => ((drag.current = null), setLive(null))} />
      </div>
      <p class="muted small">Tažením posunete výkres na listu.{lay?.cropped ? ' Kresba se v tomto měřítku celá nevejde – na listu bude jen to, co vidíte.' : ''}</p>
    </div>
  );
}
