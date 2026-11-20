/**
 * Okno značky (ZNACKY-POZNAMKY-DETAILY.md, krok A): textová poznámka a skica – převzato z prototypu
 * (prototyp/src/input/detailsUI.js) a doplněno o stejné prvky jako kresba ve výkresu (přání uživatele 2026-11-20):
 * Vybrat (posun a smazání prvku), pero, čára, obdélník, kruh, oblouk, dvojitá čára, text, kóta, guma, posun, zoom,
 * barvy, zpět. Geometrie skici jen v core/sketch.ts.
 * Kreslení má vlastní Zpět (jen v okně); do výkresu se obsah zapíše při zavření jako jeden krok Zpět.
 * Pero / myš kreslí, prst posouvá (jako v půdorysu).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MarkPage, Pt, SketchDim, SketchStroke } from '../model/types';
import { emptyPage, markCode, pageIsEmpty } from '../core/marks';
import { defaultArcSagitta, eraseInPage, hitSketch, moveSketchItem, removeSketchItem, SKETCH_DOUBLE_W, type SketchRef } from '../core/sketch';
import { drawSketch, type SketchPhoto, type SketchView } from '../canvas/drawSketch';
import { addPhoto, getPhoto } from '../persistence/photos';
import { setMarkContent, updateMark } from '../store/actions';
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { TextPrompt } from './Dialog';

type ShapeMode = Exclude<SketchStroke['mode'], 'free'>;
type SketchTool = 'select' | 'pen' | ShapeMode | 'text' | 'dim' | 'eraser' | 'pan';
const TOOLS: { v: SketchTool; label: string }[] = [
  { v: 'select', label: '👆 Vybrat' },
  { v: 'pen', label: '🖊️ Pero' },
  { v: 'line', label: '╱ Čára' },
  { v: 'rect', label: '▭ Obdélník' },
  { v: 'circle', label: '◯ Kruh' },
  { v: 'arc', label: '◠ Oblouk' },
  { v: 'double', label: '═ Dvojitá' },
  { v: 'text', label: '🏷️ Text' },
  { v: 'dim', label: '📐 Kóta' },
  { v: 'eraser', label: '🧹 Guma' },
  { v: 'pan', label: '✋ Posun' }
];
const SHAPES: readonly string[] = ['line', 'rect', 'circle', 'arc', 'double'];
const COLORS = ['#0f172a', '#dc2626', '#2563eb', '#059669'];
const clone = (p: MarkPage): MarkPage => JSON.parse(JSON.stringify(p)) as MarkPage;

/** Přímka / kóta: do 6° od vodorovné / svislé se srovná. */
function orthoSnap(a: Pt, p: Pt): Pt {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  if (Math.hypot(dx, dy) <= 15) return p;
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (ang < 6 || Math.abs(ang - 180) < 6) return { x: p.x, y: a.y };
  if (Math.abs(ang - 90) < 6) return { x: a.x, y: p.y };
  return p;
}

export function MarkWindow() {
  const id = useStore(s => s.markOpen);
  const mark = useStore(s => (s.markOpen ? s.project?.floors.find(f => f.id === s.floorId)?.marks?.[s.markOpen] : undefined));
  // značka zmizela (jiný projekt / podlaží) – okno se zavře, ať se později samo neotevře
  useEffect(() => {
    if (id && !mark) store.set({ markOpen: null });
  }, [id, mark]);
  if (!id || !mark) return null;
  return (
    <div class="mark-backdrop">
      <MarkWindowBody key={id} id={id} />
    </div>
  );
}

function MarkWindowBody({ id }: { id: string }) {
  const mark = store.floor()!.marks![id]!;
  const name = useStore(s => s.project?.floors.find(f => f.id === s.floorId)?.marks?.[id]?.name ?? '');
  // název se píše do pole a zapíše při opuštění pole nebo zavření okna (Esc při psaní ho neztratí)
  const [nameDraft, setNameDraft] = useState(name);
  useEffect(() => setNameDraft(name), [name]);
  const [note, setNote] = useState(mark.note);
  const [page, setPage] = useState<MarkPage>(() => clone(mark.pages[0] ?? emptyPage()));
  const [saveError, setSaveError] = useState<string | null>(null);
  // fotka jako podklad (krok B): načtená z úložiště fotek podle odkazu na straně
  const [photo, setPhoto] = useState<SketchPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<MarkPage[]>([]);
  const [tool, setToolRaw] = useState<SketchTool>('pen');
  // vybraný prvek skici (nástroj Vybrat)
  const [sel, setSel] = useState<SketchRef | null>(null);
  const setTool = (t: SketchTool) => {
    setToolRaw(t);
    if (t !== 'select') setSel(null);
  };
  const [color, setColor] = useState(COLORS[0]!);
  const [view, setView] = useState<SketchView>({ s: 1, ox: 0, oy: 0 });
  const [prompt, setPrompt] = useState<{ title: string; initial: string; done: (t: string) => void } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{
    stroke?: SketchStroke | null;
    dim?: SketchDim | null;
    pan?: { sx: number; sy: number; ox: number; oy: number };
    erased?: boolean;
    start?: MarkPage;
    pushed?: boolean;
    /** Posun vybraného prvku: odkud se táhne a stav před posunem. */
    moving?: { ref: SketchRef; from: Pt; orig: MarkPage };
  }>({});
  const eraseAt = (pt: Pt) => {
    const L = live.current;
    setPage(p => {
      const next = eraseInPage(p, pt, 14 / view.s);
      if (next && !L.pushed) {
        L.pushed = true;
        const start = L.start ?? p;
        setHistory(h => [...h, start]);
      }
      return next ?? p;
    });
  };
  const [, redraw] = useState(0);

  const commit = (next: MarkPage) => {
    setHistory(h => [...h, page]);
    setPage(next);
  };
  const removeSelected = () => {
    if (!sel) return;
    commit(removeSketchItem(page, sel));
    setSel(null);
  };
  const close = () => {
    if (nameDraft.trim() !== name) updateMark(id, { name: nameDraft });
    const rest = store.floor()?.marks?.[id]?.pages.slice(1) ?? [];
    // zápis se neprovedl (např. zamčená vrstva Popisky) → okno zůstane otevřené, skica se neztratí
    if (!setMarkContent(id, note, [page, ...rest])) {
      setSaveError(store.get().lockBlock?.text ?? 'Obsah značky se nepodařilo uložit.');
      return;
    }
    store.set({ markOpen: null });
  };

  // kreslení (plátno v px zařízení, skica v css px)
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    drawSketch(c.getContext('2d')!, w, h, { s: view.s * dpr, ox: view.ox * dpr, oy: view.oy * dpr }, page, { ...live.current, selected: sel, photo });
  });
  // načtení fotky strany (při otevření a po vložení / odebrání)
  const photoId = page.photo?.id;
  useEffect(() => {
    let alive = true;
    if (!photoId) {
      setPhoto(null);
      return;
    }
    void getPhoto(photoId)
      .then(async stored => {
        if (!alive || !stored) return;
        const img = await createImageBitmap(stored.blob);
        if (!alive) return img.close();
        bitmap = img;
        setPhoto({ img, w: stored.w, h: stored.h });
        fitTo(stored.w, stored.h);
      })
      .catch(() => alive && setSaveError('Fotku se nepodařilo načíst.'));
    // uvolnit dekódovanou fotku (≈ 12 MB) při výměně / odebrání fotky a zavření okna
    let bitmap: ImageBitmap | null = null;
    return () => {
      alive = false;
      bitmap?.close();
    };
  }, [photoId]);
  useEffect(() => {
    const onResize = () => redraw(n => n + 1);
    const onKey = (e: KeyboardEvent) => {
      if (prompt || store.get().deleteConfirm) return;
      if (e.key === 'Escape' && !photoBusy) close();
      const t = e.target;
      if (e.key === 'Delete' && sel && !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });

  const local = (e: PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (px: Pt): Pt => ({ x: Math.round((px.x - view.ox) / view.s), y: Math.round((px.y - view.oy) / view.s) });
  const zoomAt = (k: number, px?: Pt) => {
    const c = canvas.current!;
    const p = px ?? { x: c.clientWidth / 2, y: c.clientHeight / 2 };
    // nejmenší zoom: 30 %, nebo celá fotka, je-li menší
    const minS = Math.min(0.3, photo ? Math.min(c.clientWidth / photo.w, c.clientHeight / photo.h) * 0.95 : 0.3);
    const s = Math.max(minS, Math.min(8, view.s * k));
    const f = s / view.s;
    setView({ s, ox: p.x - (p.x - view.ox) * f, oy: p.y - (p.y - view.oy) * f });
  };
  const tol = () => 10 / view.s;
  /** Zobrazí celý obdélník w × h (fotku) v okně. */
  const fitTo = (w: number, h: number) => {
    const c = canvas.current;
    if (!c || !c.clientWidth || !c.clientHeight) return;
    const s = Math.min(c.clientWidth / w, c.clientHeight / h) * 0.95;
    setView({ s, ox: (c.clientWidth - w * s) / 2, oy: (c.clientHeight - h * s) / 2 });
  };
  const onPhotoFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const projectId = store.get().project?.id;
    if (!file || !projectId) return;
    setPhotoBusy('Zmenšuji a ukládám fotku…');
    try {
      const ph = await addPhoto(projectId, file);
      // fotka je podklad strany – skica nad ní zůstane (vlastní vrstva)
      commit({ ...page, photo: ph });
      setSaveError(null);
    } catch {
      setSaveError('Fotku se nepodařilo vložit.');
    } finally {
      setPhotoBusy(null);
    }
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const px = local(e);
    const pt = toWorld(px);
    if (tool === 'pan' || e.pointerType === 'touch' || e.button === 1 || e.button === 2) {
      live.current = { pan: { sx: px.x, sy: px.y, ox: view.ox, oy: view.oy } };
      return;
    }
    if (tool === 'select') {
      const hit = hitSketch(page, pt, tol());
      setSel(hit);
      if (hit) live.current = { moving: { ref: hit, from: pt, orig: page } };
      return;
    }
    if (tool === 'text') {
      const h = hitSketch(page, pt, 0);
      const i = h?.kind === 'label' ? h.index : -1;
      if (i >= 0) {
        setPrompt({ title: 'Upravit text', initial: page.labels[i]!.text, done: t => commit({ ...page, labels: page.labels.map((l, k) => (k === i ? { ...l, text: t } : l)) }) });
      } else {
        setPrompt({ title: 'Text do skici', initial: '', done: t => commit({ ...page, labels: [...page.labels, { x: pt.x, y: pt.y, text: t, color }] }) });
      }
      return;
    }
    if (tool === 'dim') live.current = { dim: { a: pt, b: pt, text: '' } };
    else if (tool === 'eraser') {
      // guma: jeden krok Zpět za celé gesto (i tažením), jen když něco smazala
      live.current = { erased: true, start: page, pushed: false };
      eraseAt(pt);
    } else {
      const mode: SketchStroke['mode'] = SHAPES.includes(tool) ? (tool as ShapeMode) : 'free';
      // tloušťka čáry stejná na obrazovce při každém zoomu (nad zmenšenou fotkou by byla tenká)
      const k = 1 / view.s;
      live.current = { stroke: { mode, color, width: Math.round(2.5 * k * 10) / 10, pts: [pt, { ...pt }], ...(mode === 'double' ? { w: Math.round(SKETCH_DOUBLE_W * k) } : {}) } };
    }
    redraw(n => n + 1);
  };
  const move = (e: PointerEvent) => {
    const L = live.current;
    const px = local(e);
    if (L.pan) {
      setView({ ...view, ox: L.pan.ox + px.x - L.pan.sx, oy: L.pan.oy + px.y - L.pan.sy });
      return;
    }
    const pt = toWorld(px);
    if (L.moving) {
      const { ref, from, orig } = L.moving;
      // jeden krok Zpět za celý posun
      if (!L.pushed && (pt.x !== from.x || pt.y !== from.y)) {
        L.pushed = true;
        setHistory(h => [...h, orig]);
      }
      setPage(moveSketchItem(orig, ref, pt.x - from.x, pt.y - from.y));
      return;
    }
    if (L.dim) L.dim = { ...L.dim, b: orthoSnap(L.dim.a, pt) };
    else if (L.stroke && L.stroke.mode !== 'free') {
      const a = L.stroke.pts[0]!;
      const m = L.stroke.mode;
      L.stroke.pts[1] = m === 'line' || m === 'double' ? orthoSnap(a, pt) : pt;
      if (m === 'arc') L.stroke.s = defaultArcSagitta(a, pt);
    } else if (L.stroke) {
      const last = L.stroke.pts[L.stroke.pts.length - 1]!;
      if (Math.hypot(pt.x - last.x, pt.y - last.y) * view.s >= 2) L.stroke.pts.push(pt);
    } else if (L.erased) {
      eraseAt(pt);
      return;
    } else return;
    redraw(n => n + 1);
  };
  const up = () => {
    const L = live.current;
    live.current = {};
    if (L.dim) {
      const d = L.dim;
      if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) >= 8) setPrompt({ title: 'Text kóty (číslo nebo text, např. „120 mm“)', initial: '', done: t => commit({ ...page, dims: [...page.dims, { ...d, text: t }] }) });
    } else if (L.stroke) {
      const pts = L.stroke.pts;
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      const shape = L.stroke.mode !== 'free';
      if (shape ? Math.hypot(b.x - a.x, b.y - a.y) >= 3 : pts.length >= 2 && (Math.hypot(b.x - a.x, b.y - a.y) >= 3 || pts.length > 3)) commit({ ...page, strokes: [...page.strokes, L.stroke] });
    }
    redraw(n => n + 1);
  };

  return (
    <div class="mark-window" role="dialog" aria-label="Značka">
      <div class="mark-head">
        <b class="mark-code" style={{ background: mark.color }}>{markCode(mark)}</b>
        <input type="text" value={nameDraft} placeholder="Název značky (např. Sokl u terasy)" onInput={e => setNameDraft((e.target as HTMLInputElement).value)} onChange={e => updateMark(id, { name: (e.target as HTMLInputElement).value })} />
        <button class="btn btn-primary" onClick={close} disabled={!!photoBusy} title={photoBusy ? 'Počkejte, fotka se ukládá' : undefined}>
          ✔ Hotovo
        </button>
      </div>
      <div class="mark-toolbar">
        {TOOLS.map(t => (
          <button key={t.v} class={`btn btn-sm ${tool === t.v ? 'active' : ''}`} onClick={() => setTool(t.v)}>
            {t.label}
          </button>
        ))}
        <button class="btn btn-sm" onClick={() => zoomAt(1 / 1.25)} title="Oddálit">−</button>
        <button class="btn btn-sm" onClick={() => setView({ s: 1, ox: 0, oy: 0 })} title="Zpět na 100 %">
          {Math.round(view.s * 100)} %
        </button>
        <button class="btn btn-sm" onClick={() => zoomAt(1.25)} title="Přiblížit">+</button>
        <span class="mark-colors">
          {COLORS.map(c => (
            <button key={c} type="button" class={`color-dot ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </span>
        <button class="btn btn-sm" disabled={!history.length} onClick={() => {
          setPage(history[history.length - 1]!);
          setHistory(history.slice(0, -1));
          setSel(null);
        }}>
          ↩ Zpět
        </button>
        {sel && (
          <button class="btn btn-sm btn-danger" onClick={removeSelected}>
            🗑️ Smazat vybrané
          </button>
        )}
        <button class="btn btn-sm" onClick={() => camInput.current?.click()} disabled={!!photoBusy} title="Vyfotit fotoaparátem tabletu">
          📷 Vyfotit
        </button>
        <button class="btn btn-sm" onClick={() => galleryInput.current?.click()} disabled={!!photoBusy} title="Vybrat fotku z galerie">
          🖼️ Z galerie
        </button>
        {page.photo && (
          <button class="btn btn-sm" title="Odebrat fotku (kresba zůstane)" onClick={() => commit({ ...page, photo: undefined })}>
            ✖ Odebrat fotku
          </button>
        )}
        {page.photo && (
          <button class="btn btn-sm" title="Celá fotka" onClick={() => fitTo(page.photo!.w, page.photo!.h)}>
            ⤢ Celá fotka
          </button>
        )}
        <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhotoFile} />
        <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onPhotoFile} />
        <button class="btn btn-sm btn-danger" disabled={pageIsEmpty(page)} title="Smazat kresbu (fotka zůstane)" onClick={() => {
          commit({ ...page, strokes: [], labels: [], dims: [] });
          setSel(null);
        }}>
          ✖ Smazat skicu
        </button>
      </div>
      <canvas
        ref={canvas}
        class="mark-canvas"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={e => e.preventDefault()}
        onWheel={e => {
          e.preventDefault();
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, local(e as unknown as PointerEvent));
        }}
      />
      <label class="field mark-note">
        <span>Poznámka (skladba, materiály, rozměry)</span>
        <textarea rows={3} value={note} placeholder="např. EPS tl. 160 mm, hydroizolační pás vytažen 150 mm nad terén…" onInput={e => setNote((e.target as HTMLTextAreaElement).value)} />
      </label>
      {photoBusy && <p class="muted small">{photoBusy}</p>}
      {saveError && <p class="mark-error">⚠️ {saveError} Okno zůstává otevřené, skica se neztratila.</p>}
      {prompt && <TextPrompt title={prompt.title} label="Text" initial={prompt.initial} onSubmit={prompt.done} onClose={() => setPrompt(null)} />}
    </div>
  );
}
