/**
 * Panel samostatného textu (a odkazové šipky).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { TextNote } from '../../model/types';
import { deleteSelection, duplicateSelection, takeFreshTextId, updateText } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

const TEXT_SIZES = [
  { v: 50, label: 'Malé' },
  { v: 100, label: 'Střední' },
  { v: 200, label: 'Velké' }
];

export function TextPanel({ note }: { note: TextNote }) {
  const set = (patch: Partial<TextNote>) => updateText(note.id, patch);
  const area = useRef<HTMLTextAreaElement>(null);
  // nově vložený text: pole se rovnou aktivuje a výchozí „Text“ se označí, takže stačí psát
  useEffect(() => {
    if (takeFreshTextId() === note.id) area.current?.focus();
  }, [note.id]);
  return (
    <Panel title="Text" onClose={close}>
      <label class="field">
        <span>Text (víc řádků = Enter)</span>
        <textarea
          ref={area}
          rows={3}
          value={note.text}
          key={note.text}
          onFocus={e => (e.target as HTMLTextAreaElement).select()}
          onChange={e => set({ text: (e.target as HTMLTextAreaElement).value })}
        />
      </label>
      <button class="btn btn-primary btn-lg" style="width:100%" onClick={close}>
        ✔ Hotovo
      </button>
      <div class="field field-inline">
        <span>Šipka</span>
        <Seg
          options={[
            { v: 'no', label: 'Bez šipky' },
            { v: 'yes', label: 'S šipkou' }
          ]}
          value={note.leader ? 'yes' : 'no'}
          onChange={v => set({ leader: v === 'yes' ? note.leader ?? { x: note.x - 600, y: note.y + 600 } : undefined })}
        />
      </div>
      <div class="field field-inline">
        <span>Velikost</span>
        <Seg options={TEXT_SIZES} value={note.size} onChange={v => set({ size: v })} />
      </div>
      <div class="field field-inline">
        <span>Natočení</span>
        <Seg
        options={[
          { v: 0, label: '0°' },
          { v: 90, label: '90°' },
          { v: 180, label: '180°' },
          { v: 270, label: '270°' }
        ]}
        value={note.angle}
        onChange={v => set({ angle: v })}
      />
      </div>
      <div class="field-grid">
        <NumField label="Výška písma" value={note.size} min={20} onCommit={v => v !== null && set({ size: v })} />
        <NumField label="Úhel" value={note.angle} unit="°" onCommit={v => v !== null && set({ angle: ((v % 360) + 360) % 360 })} />
      </div>
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
