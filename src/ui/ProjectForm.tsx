/**
 * Formulář s údaji projektu (název, adresa, kdo a kdy měřil, poznámka).
 */
import { useState } from 'preact/hooks';
import { todayIso } from '../model/factory';
import type { Project } from '../model/types';
import { Dialog } from './Dialog';

type Fields = Pick<Project, 'name' | 'address' | 'surveyor' | 'surveyDate' | 'note'>;

const SURVEYOR_KEY = 'zamerovani.lastSurveyor';

interface Props {
  title: string;
  initial?: Fields;
  onSubmit: (fields: Fields) => void | Promise<void>;
  onClose: () => void;
}

export function ProjectForm({ title, initial, onSubmit, onClose }: Props) {
  const [f, setF] = useState<Fields>(
    initial ?? { name: '', address: '', surveyor: localStorage.getItem(SURVEYOR_KEY) ?? '', surveyDate: todayIso(), note: '' }
  );
  const set = (k: keyof Fields) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });

  const submit = async () => {
    if (!f.name.trim()) return;
    if (f.surveyor) localStorage.setItem(SURVEYOR_KEY, f.surveyor);
    await onSubmit({ ...f, name: f.name.trim() });
    onClose();
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <button class="btn" onClick={onClose}>
            Zrušit
          </button>
          <button class="btn btn-primary" disabled={!f.name.trim()} onClick={() => void submit()}>
            {initial ? 'Uložit' : 'Založit'}
          </button>
        </>
      }
    >
      <label class="field">
        <span>Název projektu *</span>
        <input type="text" value={f.name} onInput={set('name')} placeholder="např. RD Novákovi" autoFocus />
      </label>
      <label class="field">
        <span>Adresa</span>
        <input type="text" value={f.address} onInput={set('address')} placeholder="ulice, obec" />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Zaměřil</span>
          <input type="text" value={f.surveyor} onInput={set('surveyor')} />
        </label>
        <label class="field">
          <span>Datum zaměření</span>
          <input type="date" value={f.surveyDate} onInput={set('surveyDate')} />
        </label>
      </div>
      <label class="field">
        <span>Poznámka</span>
        <textarea rows={3} value={f.note} onInput={set('note')} />
      </label>
    </Dialog>
  );
}
