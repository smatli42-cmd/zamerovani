/**
 * Vstupní bod aplikace.
 */
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { requestPersistentStorage } from './persistence/db';
import { startAutosave } from './persistence/autosave';
import { store } from './store/store';
import { useStore } from './store/useStore';
import { Editor } from './ui/Editor';
import { ProjectList } from './ui/ProjectList';
import './styles.css';

function App() {
  const screen = useStore(s => s.screen);
  return screen === 'editor' ? <Editor /> : <ProjectList />;
}

startAutosave();
void requestPersistentStorage();
registerSW({ immediate: true });

// Pro automatické testy v prohlížeči (jen ve vývojovém režimu)
if (import.meta.env.DEV) (window as unknown as { __store: typeof store }).__store = store;

render(<App />, document.getElementById('app')!);
