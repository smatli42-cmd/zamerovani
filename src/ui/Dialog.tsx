/**
 * Jednoduchý modální dialog (náhrada za prompt/confirm, které jsou na tabletu nepohodlné).
 */
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface Props {
  title: string;
  children: ComponentChildren;
  onClose: () => void;
  actions: ComponentChildren;
}

export function Dialog({ title, children, onClose, actions }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="dialog-backdrop" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div class="dialog-body">{children}</div>
        <div class="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <button class="btn" onClick={onClose}>
            Zrušit
          </button>
          <button
            class={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}

interface TextPromptProps {
  title: string;
  label: string;
  initial: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function TextPrompt({ title, label, initial, onSubmit, onClose }: TextPromptProps) {
  let value = initial;
  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
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
          <button class="btn btn-primary" onClick={submit}>
            OK
          </button>
        </>
      }
    >
      <label class="field">
        <span>{label}</span>
        <input
          type="text"
          value={initial}
          autoFocus
          onInput={e => (value = (e.target as HTMLInputElement).value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
      </label>
    </Dialog>
  );
}
