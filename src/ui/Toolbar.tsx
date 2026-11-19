/**
 * Svislá lišta nástrojů (velká tlačítka pro prst i pero).
 */
import { store, type ToolId } from '../store/store';
import { useStore } from '../store/useStore';
import { tools } from '../tools/registry';
import { trimMsg } from '../tools/trimTool';
import { splitMsg } from '../tools/splitTool';
import { dimToolMsg } from '../tools/dimTool';

const TOOLS: { id: ToolId; icon: string; label: string; title: string }[] = [
  { id: 'select', icon: '👆', label: 'Vybrat', title: 'Vybrat prvek, posunout roh / otvor, ťuknutím na stěnu zadat délku' },
  { id: 'wall', icon: '✏️', label: 'Stěna', title: 'Kreslit stěny tažením pera; v menu Stěny i Čára (výstupky a vybrání stěn)' },
  { id: 'trim', icon: '⌐', label: 'Do rohu', title: 'Zkrátit / prodloužit dvě stěny do rohu, nebo jednu stěnu k hraně druhé: ťukni na části, které mají zůstat' },
  { id: 'split', icon: '✂️', label: 'Rozdělit', title: 'Ťuknutím rozdělit stěnu na dvě; v režimu S mezerou dvěma ťuknutími vyjmout úsek stěny' },
  { id: 'door', icon: '🚪', label: 'Dveře', title: 'Ťuknutím na stěnu vložit dveře' },
  { id: 'window', icon: '🪟', label: 'Okno', title: 'Ťuknutím na stěnu vložit okno' },
  { id: 'opening', icon: '⬜', label: 'Otvor', title: 'Ťuknutím na stěnu vložit průchod bez dveří' },
  { id: 'niche', icon: '◫', label: 'Nika', title: 'Ťuknutím na stěnu vložit niku' },
  { id: 'room', icon: '🏷️', label: 'Místnost', title: 'Ťuknutím vložit štítek místnosti' },
  { id: 'drawLine', icon: '╱', label: 'Čára', title: 'Kreslit čáru (jen kresba – nikdy stěna ani výstupek); další úsek navazuje na konec, čára zpět do počátku se uzavře' },
  { id: 'drawDouble', icon: '═', label: 'Dvojitá', title: 'Dvojitá čára (překlad): dvě rovnoběžné čáry; od líce podél stěny přes celou její tloušťku' },
  { id: 'rect', icon: '▭', label: 'Obdélník', title: 'Tažením nakreslit obdélník (kresba – sloup, komín…)' },
  { id: 'circle', icon: '◯', label: 'Kruh', title: 'Tažením od středu nakreslit kruh' },
  { id: 'arc', icon: '◠', label: 'Oblouk', title: 'Tažením mezi krajními body nakreslit oblouk, vzepětí se upřesní kótou' },
  { id: 'stair', icon: '🪜', label: 'Schodiště', title: 'Schodiště: tažením z rohu do protějšího rohu nakreslit rameno (první stupeň na straně začátku); L / U, výšku a počet stupňů v panelu' },
  { id: 'dim', icon: '📏', label: 'Kóta', title: 'Volná kóta: ťukni na dva body (roh, bod kresby, místo ve výkresu); délku zadáš ťuknutím na číslo, odsazení tažením za čáru' },
  { id: 'leader', icon: '↗️', label: 'Šipka', title: 'Odkazová šipka s textem: táhni od místa, na které se ukazuje, tam kam má přijít text' },
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
          class={`tool-btn ${active === t.id || (t.id === 'wall' && active === 'line') ? 'active' : ''}`}
          title={t.title}
          onClick={() => {
            tools[store.get().tool].cancel?.();
            store.set({ tool: t.id, hover: null, chainNode: null, toolMsg: t.id === 'trim' ? trimMsg(store.get().settings.trimEdge) : t.id === 'split' ? splitMsg(store.get().settings.splitGap) : t.id === 'dim' ? dimToolMsg(false) : null });
          }}
        >
          <span class="tool-icon">{t.icon}</span>
          <span class="tool-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
