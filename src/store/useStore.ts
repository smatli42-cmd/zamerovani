/**
 * Napojení komponent rozhraní (Preact) na store.
 * Komponenta se překreslí jen tehdy, když se změní hodnota, kterou si vybrala.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { store, type AppState } from './store';

export function useStore<T>(selector: (s: AppState) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const [, forceRender] = useState(0);
  const value = selector(store.get());
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () =>
      store.subscribe(s => {
        const next = selectorRef.current(s);
        if (!Object.is(next, valueRef.current)) {
          valueRef.current = next;
          forceRender(n => n + 1);
        }
      }),
    []
  );
  return value;
}
