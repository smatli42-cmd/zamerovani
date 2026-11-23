/**
 * Okno Export (EXPORT-NAVRH.md, krok 2 – PDF): rozsah, listy, papír, měřítko, obsah (kategorie) a vrstvy.
 * Co se exportuje, rozhoduje jen core/exportSelect.ts; PDF skládá export/pdfExport.ts (načte se až při exportu).
 * Uložené sady exportu přijdou v kroku 4.
 */
import { useState } from 'preact/hooks';
import type { Id, Project } from '../model/types';
import { categoryOn, EXPORT_CATEGORIES, type ExportCategory, type ExportContent, type ExportScope } from '../core/exportSelect';
import { layersOf } from '../core/layers';
import { SCALES, type Paper } from '../export/sheetFormat';
import type { PdfOptions } from '../export/pdfExport';
import { canShareFile, downloadFile, shareFile } from '../export/saveFile';
import { getPhoto } from '../persistence/photos';
import { requestRender } from '../canvas/invalidate';
import { store } from '../store/store';
import { Dialog } from './Dialog';

type ScopeKind = 'project' | 'floor' | 'rooms';
const PDF = 'application/pdf';

/** Vybrané štítky místností (rozsah „vybraná místnost“ se předvyplní). */
function selectedRooms(): Id[] {
  const s = store.get().selection;
  if (!s) return [];
  if (s.kind === 'room') return [s.id];
  if (s.kind === 'multi') return s.items.filter(i => i.kind === 'room').map(i => i.id);
  return [];
}

let fontCache: Promise<[Uint8Array, Uint8Array]> | null = null;
function loadFonts(): Promise<[Uint8Array, Uint8Array]> {
  const get = async (n: string) => new Uint8Array(await (await fetch(`${import.meta.env.BASE_URL}fonts/${n}`)).arrayBuffer());
  fontCache ??= Promise.all([get('NotoSans-Regular.ttf'), get('NotoSans-Bold.ttf')]).catch(e => {
    fontCache = null;
    throw e;
  });
  return fontCache;
}

export function ExportDialog({ project, floorId, onClose }: { project: Project; floorId: Id | null; onClose: () => void }) {
  const rooms = selectedRooms();
  const [scope, setScope] = useState<ScopeKind>(rooms.length ? 'rooms' : 'floor');
  const [paper, setPaper] = useState<Paper>('A4');
  const [landscape, setLandscape] = useState(true);
  const [scale, setScale] = useState<number | 'auto'>('auto');
  const [sheets, setSheets] = useState({ plan: true, rooms: false, openings: false, marks: false });
  const [content, setContent] = useState<ExportContent>({});
  const [layers, setLayers] = useState<Id[]>(layersOf(project).filter(l => l.visible).map(l => l.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<{ bytes: Uint8Array; name: string } | null>(null);

  const scopeOf = (): ExportScope =>
    scope === 'project' ? { kind: 'project' } : scope === 'rooms' && floorId ? { kind: 'rooms', floorId, roomIds: rooms } : { kind: 'floors', floorIds: floorId ? [floorId] : [] };

  const build = async () => {
    setBusy(true);
    setMsg(null);
    setFile(null);
    try {
      const [{ buildPdf, pdfFileName }, [fontRegular, fontBold]] = await Promise.all([import('../export/pdfExport'), loadFonts()]);
      const opts: PdfOptions = { paper, landscape, scale, sheets, content, layers, scope: scopeOf() };
      const loadPhoto = async (id: string) => {
        const p = await getPhoto(id);
        return p ? new Uint8Array(await p.blob.arrayBuffer()) : null;
      };
      const { bytes, warnings } = await buildPdf(project, opts, { fontRegular, fontBold, loadPhoto });
      if (warnings.length) setMsg(warnings.join(' '));
      const floor = project.floors.find(f => f.id === floorId);
      const suffix = scope === 'project' ? '' : scope === 'rooms' ? `mistnost` : (floor?.name ?? '');
      setFile({ bytes, name: pdfFileName(project, suffix) });
    } catch (e) {
      setMsg(`PDF se nepodařilo vytvořit: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      // export kreslil stejnými funkcemi jako plátno – editor se překreslí (klikací kóty)
      requestRender();
    }
  };

  const cats = EXPORT_CATEGORIES.filter(c => c.pdf !== 'never');
  const on = (id: ExportCategory) => categoryOn('pdf', content, id);
  const sheet = (key: keyof typeof sheets, label: string) => (
    <label class="toggle-row">
      <input type="checkbox" checked={sheets[key]} onChange={() => setSheets({ ...sheets, [key]: !sheets[key] })} />
      <span>{label}</span>
    </label>
  );

  return (
    <Dialog
      title="Export do PDF"
      onClose={onClose}
      actions={
        <>
          <button class="btn" onClick={onClose}>
            Zavřít
          </button>
          {!file && (
            <button class="btn btn-primary" disabled={busy || (scope === 'rooms' && !rooms.length)} onClick={build}>
              {busy ? 'Vytvářím…' : 'Vytvořit PDF'}
            </button>
          )}
          {file && canShareFile(file.name, PDF) && (
            <button class="btn" onClick={() => void shareFile(file.bytes, file.name, PDF).then(ok => !ok && setMsg('Sdílení se nepovedlo – použijte Stáhnout.'))}>
              Sdílet
            </button>
          )}
          {file && (
            <button class="btn btn-primary" onClick={() => downloadFile(file.bytes, file.name, PDF)}>
              Stáhnout
            </button>
          )}
        </>
      }
    >
      <div class="export-form" onChange={() => setFile(null)}>
        <div class="export-row">
          <span class="muted small">Rozsah</span>
          <div class="seg">
            <button class={scope === 'floor' ? 'active' : ''} onClick={() => (setScope('floor'), setFile(null))}>
              Aktuální podlaží
            </button>
            <button class={scope === 'project' ? 'active' : ''} onClick={() => (setScope('project'), setFile(null))}>
              Všechna podlaží
            </button>
            <button class={scope === 'rooms' ? 'active' : ''} disabled={!rooms.length} title={rooms.length ? '' : 'Nejdřív vyberte štítek místnosti ve výkresu'} onClick={() => (setScope('rooms'), setFile(null))}>
              Vybraná místnost{rooms.length > 1 ? ` (${rooms.length})` : ''}
            </button>
          </div>
        </div>
        <div class="export-row">
          <span class="muted small">Listy</span>
          {sheet('plan', scope === 'rooms' ? 'Půdorys místnosti (okolí šedě)' : 'Půdorys podlaží')}
          {sheet('rooms', 'Výpis místností')}
          {sheet('openings', 'Výpis otvorů')}
          {sheet('marks', 'Poznámky (strana na poznámku)')}
        </div>
        <div class="export-row">
          <span class="muted small">Papír a měřítko</span>
          <div class="seg">
            {(['A4', 'A3'] as const).map(p => (
              <button key={p} class={paper === p ? 'active' : ''} onClick={() => (setPaper(p), setFile(null))}>
                {p}
              </button>
            ))}
            <button class={landscape ? 'active' : ''} onClick={() => (setLandscape(true), setFile(null))}>
              Na šířku
            </button>
            <button class={!landscape ? 'active' : ''} onClick={() => (setLandscape(false), setFile(null))}>
              Na výšku
            </button>
          </div>
          <select value={String(scale)} onChange={e => setScale((e.target as HTMLSelectElement).value === 'auto' ? 'auto' : Number((e.target as HTMLSelectElement).value))}>
            <option value="auto">Měřítko automaticky</option>
            {SCALES.map(n => (
              <option key={n} value={n}>
                1 : {n}
              </option>
            ))}
          </select>
        </div>
        <details class="export-row">
          <summary>Obsah výkresu</summary>
          {cats.map(c => (
            <label key={c.id} class="toggle-row">
              <input type="checkbox" checked={on(c.id)} onChange={() => setContent({ ...content, [c.id]: !on(c.id) })} />
              <span>{c.label}</span>
            </label>
          ))}
        </details>
        <details class="export-row">
          <summary>Vrstvy</summary>
          {layersOf(project).map(l => (
            <label key={l.id} class="toggle-row">
              <input type="checkbox" checked={layers.includes(l.id)} onChange={() => setLayers(layers.includes(l.id) ? layers.filter(x => x !== l.id) : [...layers, l.id])} />
              <span>{l.name}</span>
            </label>
          ))}
        </details>
        {file && <p class="small">Hotovo: {file.name} ({Math.round(file.bytes.length / 1024)} kB)</p>}
        {msg && <p class="panel-warn">{msg}</p>}
      </div>
    </Dialog>
  );
}
