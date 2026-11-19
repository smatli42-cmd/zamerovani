/**
 * Společné prvky formulářů v panelech (změna se zapíše až po dopsání – 1 krok Zpět).
 */
import type { ComponentChildren } from 'preact';
import { openField } from '../../store/numpadController';
import { LayerField } from './LayerField';

interface NumProps {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  unit?: string;
}

/**
 * Číselné pole: ťuknutí otevře NumPad (do malého políčka se stylusem špatně píše).
 * Zápis proběhne po potvrzení v NumPadu (1 krok Zpět).
 */
export function NumField({ label, value, onCommit, allowEmpty, min = 0, unit = 'mm' }: NumProps) {
  return (
    <button type="button" class="field-button num-field" onClick={() => openField({ label, unit, min, allowEmpty }, value, onCommit)}>
      <span>{label}</span>
      <b>
        {value ?? '—'} {unit}
      </b>
    </button>
  );
}

interface TextProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  presets?: string[];
  /** Předvolba se přidá k textu (true) nebo ho nahradí (false). */
  appendPreset?: boolean;
}

export function TextField({ label, value, onCommit, placeholder, presets, appendPreset }: TextProps) {
  return (
    <div class="field">
      <span>{label}</span>
      <input type="text" value={value} key={value} placeholder={placeholder} onChange={e => onCommit((e.target as HTMLInputElement).value)} />
      {presets && (
        <div class="chips">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              class="chip"
              onClick={() => onCommit(appendPreset && value && !value.includes(p) ? `${value}, ${p}` : p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Seg<T extends string | number>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      {options.map(o => (
        <button key={String(o.v)} type="button" class={o.v === value ? 'active' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, children, onClose }: { title: string; children: ComponentChildren; onClose: () => void }) {
  return (
    <section class="side-panel">
      <div class="panel-head">
        <span>{title}</span>
        <button class="icon-close" onClick={onClose} title="Zavřít">
          ✕
        </button>
      </div>
      <div class="panel-body">
        {children}
        {/* vrstva vybraného prvku a přesun do jiné vrstvy – stejně ve všech panelech (core/layers.ts) */}
        <LayerField />
      </div>
    </section>
  );
}
