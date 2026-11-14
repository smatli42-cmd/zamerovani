/**
 * Hlášení, že se úprava neprovedla kvůli zamčené kótě (KOTY-ZAMEK-EXPORT.md, A). Zmizí samo po chvíli
 * nebo ťuknutím; zamčená kóta, která brání, má po tu dobu zvýrazněnou ikonu zámku.
 */
import { useEffect } from 'preact/hooks';
import { store } from '../store/store';
import { setDimLock } from '../store/actions';
import { useStore } from '../store/useStore';

export function LockNotice() {
  const block = useStore(s => s.lockBlock);
  useEffect(() => {
    if (!block) return;
    const t = setTimeout(() => {
      if (store.get().lockBlock === block) store.set({ lockBlock: null });
    }, 8000);
    return () => clearTimeout(t);
  }, [block]);
  if (!block) return null;
  return (
    <div class="lock-notice" aria-live="assertive">
      <span>🔒 {block.text}</span>
      <button type="button" class="btn btn-sm" onClick={() => setDimLock(block.target, false)} title="Odemknout kótu, která brání (úpravu pak zopakuj)">
        🔓 Odemknout
      </button>
      <button type="button" class="btn btn-sm" onClick={() => store.set({ lockBlock: null })} title="Zavřít">
        ✕
      </button>
    </div>
  );
}
