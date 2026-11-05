/**
 * Společné prvky formulářů v panelech (změna se zapíše až po dopsání – 1 krok Zpět).
 */
import type { ComponentChildren } from 'preact';

interface NumProps {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  unit?: string;
}

export function NumField({ label, value, onCommit, allowEmpty, min = 0, unit = 'mm' }: NumProps) {
  return (
    <label class="field field-inline">
      <span>{label}</span>
      <span class="input-unit">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          step={10}
          value={value ?? ''}
          key={String(value)}
          onChange={e => {
            const raw = (e.target as HTMLInputElement).value.trim();
            if (raw === '') {
              if (allowEmpty) onCommit(null);
              return;
            }
            const v = Math.round(Number(raw));
            if (Number.isFinite(v) && v >= min) onCommit(v);
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
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
      <div class="panel-body">{children}</div>
    </section>
  );
}
