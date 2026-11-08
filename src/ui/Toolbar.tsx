/**
 * Svislá lišta nástrojů (velká tlačítka pro prst i pero).
 */
import { store, type ToolId } from '../store/store';
import { useStore } from '../store/useStore';
import { tools } from '../tools/registry';

const TOOLS: { id: ToolId; icon: string; label: string; title: string }[] = [
  { id: 'select', icon: '👆', label: 'Vybrat', title: 'Vybrat prvek, posunout roh / otvor, ťuknutím na stěnu zadat délku' },
  { id: 'wall', icon: '✏️', label: 'Stěna', title: 'Kreslit stěny tažením pera' },
  { id: 'door', icon: '🚪', label: 'Dveře', title: 'Ťuknutím na stěnu vložit dveře' },
  { id: 'window', icon: '🪟', label: 'Okno', title: 'Ťuknutím na stěnu vložit okno' },
  { id: 'opening', icon: '⬜', label: 'Otvor', title: 'Ťuknutím na stěnu vložit průchod bez dveří' },
  { id: 'niche', icon: '◫', label: 'Nika', title: 'Ťuknutím na stěnu vložit niku' },
  { id: 'room', icon: '🏷️', label: 'Místnost', title: 'Ťuknutím vložit štítek místnosti' },
  { id: 'rect', icon: '▭', label: 'Obdélník', title: 'Tažením nakreslit obdélník (sloup, komín, překlad…)' },
  { id: 'circle', icon: '◯', label: 'Kruh', title: 'Tažením od středu nakreslit kruh' },
  { id: 'dline', icon: '═', label: 'Dvojčára', title: 'Příčka dvěma čarami: táhni od stěny ke stěně, napojením se stěny rozdělí (tloušťka nad plátnem)' },
  { id: 'arc', icon: '◠', label: 'Oblouk', title: 'Tažením mezi krajními body nakreslit oblouk, vzepětí se upřesní kótou' },
  { id: 'text', icon: '🅰️', label: 'Text', title: 'Ťuknutím vložit text; ťuknutím na text ho upravit, tažením přesunout' },
  { id: 'pan', icon: '✋', label: 'Posun', title: 'Posouvat výkres' }
];

export function Toolbar() {
  const active = useStore(s => s.tool);
  return (
    <nav class="toolbar" aria-label="Nástroje">
      {TOOLS.map(t => (
        <button
          key={t.id}
          class={`tool-btn ${active === t.id ? 'active' : ''}`}
          title={t.title}
          onClick={() => {
            tools[store.get().tool].cancel?.();
            store.set({ tool: t.id, hover: null });
          }}
        >
          <span class="tool-icon">{t.icon}</span>
          <span class="tool-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
