/**
 * Vstupní bod aplikace.
 */
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { requestPersistentStorage } from './persistence/db';
import { startAutosave } from './persistence/autosave';
import { browserWakeLockEnv, createWakeLock } from './input/wakeLock';
import { store } from './store/store';
import { useStore } from './store/useStore';
import { Editor } from './ui/Editor';
import { ProjectList } from './ui/ProjectList';
import './styles.css';
import './ui/chrome.css';

function App() {
  const screen = useStore(s => s.screen);
  return screen === 'editor' ? <Editor /> : <ProjectList />;
}

startAutosave();
void requestPersistentStorage();
registerSW({ immediate: true });

// Nevypínat displej během zaměřování (volba v Nastavení, výchozí zapnuto)
const wakeLock = createWakeLock(browserWakeLockEnv());
wakeLock.setEnabled(store.get().settings.keepAwake);
store.subscribe((s, prev) => {
  if (s.settings.keepAwake !== prev.settings.keepAwake) wakeLock.setEnabled(s.settings.keepAwake);
});

// Pro automatické testy v prohlížeči (jen ve vývojovém režimu)
if (import.meta.env.DEV) (window as unknown as { __store: typeof store }).__store = store;

render(<App />, document.getElementById('app')!);
