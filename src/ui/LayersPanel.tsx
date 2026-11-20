/**
 * Okno Vrstvy (pravidla v core/layers.ts), seznam shora dolů v pořadí kreslení (nahoře = kreslí se nejvýš).
 * Dvě podoby podle toho, odkud se otevře (rozhodnutí uživatele 2026-11-20):
 * - 'top' z horní lišty, vpravo nahoře – správa všech vrstev i systémových: oko, zámek, barva, přetažení za ≡ mění
 *   pořadí, přidat, přejmenovat, smazat. Aktivní vrstva se tu nevolí.
 * - 'tool' z lišty nástroje kresby / Pera / Gumy – jen vlastní vrstvy (do systémových se nekreslí): ťuknutí na název
 *   = aktivní vrstva, oko, zámek, barva, přidat.
 */
import { useState } from 'preact/hooks';
import type { Id, Layer } from '../model/types';
import { activeDrawLayer, layersOf } from '../core/layers';
import { addLayer, deleteLayer, layerItemCount, moveLayerTo, renameLayer, setActiveLayer, setLayerColor, setLayerLocked, setLayerVisible } from '../store/actions';
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { Dialog, TextPrompt } from './Dialog';

/** Výška řádku seznamu (px) – podle ní se počítá cíl přetažení. */
const ROW = 52;

type LayerDialog = { type: 'add' } | { type: 'rename'; layer: Layer } | { type: 'delete'; layer: Layer; count: number } | null;

export function LayersPanel({ mode }: { mode: 'top' | 'tool' }) {
  const project = useStore(s => s.project);
  const [dialog, setDialog] = useState<LayerDialog>(null);
  const [drag, setDrag] = useState<{ id: Id; from: number; y0: number; dy: number } | null>(null);
  if (!project) return null;
  const tool = mode === 'tool';
  // shora dolů: nejvýš kreslená vrstva první; v okně nástroje jen vlastní vrstvy
  const all = layersOf(project).reverse();
  const list = tool ? all.filter(l => !l.system) : all;
  const active = tool ? activeDrawLayer(project).id : null;
  const target = drag ? Math.max(0, Math.min(list.length - 1, drag.from + Math.round(drag.dy / ROW))) : -1;

  const onDelete = (l: Layer) => {
    const count = layerItemCount(project, l.id);
    if (count === 0) deleteLayer(l.id, null);
    else setDialog({ type: 'delete', layer: l, count });
  };

  return (
    <section class={`layers-panel ${mode}`} aria-label="Vrstvy">
      <div class="panel-head">
        <span>{tool ? 'Kreslit do vrstvy' : 'Vrstvy'}</span>
        <button class="icon-close" onClick={() => store.set({ layersOpen: false })} title="Zavřít">
          ✕
        </button>
      </div>
      <ul class="layer-list" style={{ height: `${list.length * ROW}px` }}>
        {list.map((l, i) => {
          const dragging = drag?.id === l.id;
          // posun ostatních řádků podle místa, kam se přetahuje
          let shift = 0;
          if (drag && !dragging) {
            if (drag.from < i && i <= target) shift = -ROW;
            if (target <= i && i < drag.from) shift = ROW;
          }
          const y = i * ROW + (dragging ? drag.dy : shift);
          return (
            <li key={l.id} class={`layer-row ${l.id === active ? 'active' : ''} ${dragging ? 'dragging' : ''}`} style={{ transform: `translateY(${y}px)` }}>
              {!tool && (
              <span
                class="layer-handle"
                title="Přetažením změníte pořadí"
                onPointerDown={e => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ id: l.id, from: i, y0: e.clientY, dy: 0 });
                }}
                onPointerMove={e => {
                  if (drag?.id === l.id) setDrag({ ...drag, dy: e.clientY - drag.y0 });
                }}
                onPointerUp={() => {
                  if (drag?.id === l.id && target !== drag.from) moveLayerTo(l.id, list.length - 1 - target);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                ≡
              </span>
              )}
              <button
                class="layer-btn"
                title={l.visible ? 'Skrýt vrstvu' : 'Zobrazit vrstvu'}
                onClick={() => setLayerVisible(l.id, !l.visible)}
              >
                {l.visible ? '👁️' : '🚫'}
              </button>
              <button class="layer-btn" title={l.locked ? 'Odemknout vrstvu' : 'Zamknout vrstvu'} onClick={() => setLayerLocked(l.id, !l.locked)}>
                {l.locked ? '🔒' : '🔓'}
              </button>
              <label class="layer-color" title="Barva vrstvy (ruční kresba a symboly)" style={{ background: l.color }}>
                <input type="color" value={l.color} onChange={e => setLayerColor(l.id, (e.target as HTMLInputElement).value)} />
              </label>
              {tool ? (
                <button class={`layer-name ${l.visible ? '' : 'off'}`} title="Ťuknutím sem budete kreslit" onClick={() => setActiveLayer(l.id)}>
                  {l.name}
                  {l.id === active && <small> ·kreslí se sem</small>}
                </button>
              ) : (
                <span class={`layer-name ${l.visible ? '' : 'off'}`}>
                  {l.name}
                  {l.system && <small> ·systémová</small>}
                </span>
              )}
              {!tool && !l.system && (
                <>
                  <button class="layer-btn" title="Přejmenovat" onClick={() => setDialog({ type: 'rename', layer: l })}>
                    ✏️
                  </button>
                  <button class="layer-btn" title="Smazat vrstvu" disabled={l.locked} onClick={() => onDelete(l)}>
                    🗑️
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div class="panel-body">
        <button class="btn" onClick={() => setDialog({ type: 'add' })}>
          ＋ Přidat vrstvu
        </button>
        {tool ? (
          <p class="muted small">
            {list.length ? 'Kresba a Pero kreslí do zvýrazněné vrstvy.' : 'Zatím není žádná vlastní vrstva – kreslí se do Kresby. Přidejte vrstvu.'} Systémové vrstvy (Stavba, Kresba, Popisky, Kóty) jsou v okně Vrstvy v horní liště.
          </p>
        ) : (
          <p class="muted small">Stěny a schodiště jdou do Stavby, kóty do Kót, texty a štítky do Popisků. Vrstvu pro kresbu a Pero zvolíte v liště nástroje.</p>
        )}
      </div>

      {dialog?.type === 'add' && <TextPrompt title="Nová vrstva" label="Název vrstvy" initial="Nová vrstva" onSubmit={name => addLayer(name)} onClose={() => setDialog(null)} />}
      {dialog?.type === 'rename' && (
        <TextPrompt title="Přejmenovat vrstvu" label="Název vrstvy (hladina v DXF)" initial={dialog.layer.name} onSubmit={name => renameLayer(dialog.layer.id, name)} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'delete' && <DeleteLayerDialog layer={dialog.layer} count={dialog.count} others={list.filter(l => l.id !== dialog.layer.id)} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Smazání neprázdné vrstvy (pravidlo 7): přesunout obsah do vybrané vrstvy / smazat i s obsahem / zrušit. */
function DeleteLayerDialog({ layer, count, others, onClose }: { layer: Layer; count: number; others: Layer[]; onClose: () => void }) {
  const [to, setTo] = useState<Id>(others.find(l => l.id === 'kresba')?.id ?? others[0]!.id);
  return (
    <Dialog
      title={`Smazat vrstvu „${layer.name}“?`}
      onClose={onClose}
      actions={
        <>
          <button class="btn" onClick={onClose}>
            Zrušit
          </button>
          <button
            class="btn btn-primary"
            onClick={() => {
              deleteLayer(layer.id, to);
              onClose();
            }}
          >
            Přesunout obsah a smazat
          </button>
          <button
            class="btn btn-danger"
            onClick={() => {
              deleteLayer(layer.id, null);
              onClose();
            }}
          >
            Smazat i s obsahem
          </button>
        </>
      }
    >
      <p>Vrstva obsahuje {count} prvků (na všech podlažích).</p>
      <label class="field">
        <span>Přesunout obsah do vrstvy</span>
        <select value={to} onChange={e => setTo((e.target as HTMLSelectElement).value)}>
          {others.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}
