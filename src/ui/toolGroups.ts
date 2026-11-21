/**
 * Skupiny nástrojů levé lišty (návrh ovládání navrh-ovladani/index.html, rozhodnutí uživatele 2026-11-21) –
 * JEDINÉ místo: pořadí, barva skupiny, ikona, název, nápověda na kartě nástroje a popis. Lišta, rozbalená řada,
 * karta aktivního nástroje, rámeček výkresu i ikona u hrotu pera berou odsud. **Nový nástroj přidat sem**
 * (a do registru `tools/registry.ts`); test `ui/toolGroups.test.ts` hlídá, že každý nástroj má skupinu a ikonu.
 *
 * Tlačítko skupiny ukazuje naposledy použitý nástroj (jedno ťuknutí ho zapne), druhé ťuknutí na aktivní skupinu
 * otevře řadu všech jejích nástrojů. Skupina s `pinFirst` (Vybrat) zapíná vždy první nástroj.
 */
import { store, type ToolId } from '../store/store';
import { tools } from '../tools/registry';
import { trimMsg } from '../tools/trimTool';
import { splitMsg } from '../tools/splitTool';
import { dimToolMsg } from '../tools/dimTool';
import { stairToolMsg } from '../tools/stairTool';
import { drawTrimMsg } from '../tools/drawTrimTool';
import type { IconName } from './icons';

export interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: string;
  /** Krátká nápověda na kartě nástroje. */
  hint: string;
  /** Delší popis (title tlačítka). */
  title: string;
}

export interface ToolGroup {
  id: string;
  name: string;
  /** Barva skupiny (CSS) – tlačítko, karta nástroje, rámeček výkresu, ikona u pera. */
  color: string;
  tools: ToolDef[];
  /** Tlačítko vždy zapne první nástroj (ostatní jen z rozbalené řady). */
  pinFirst?: boolean;
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'select',
    name: 'Vybrat',
    color: '#334155',
    pinFirst: true,
    tools: [
      { id: 'select', icon: 'select', label: 'Vybrat', hint: 'Ťukni na prvek, táhni roh nebo otvor', title: 'Vybrat prvek, posunout roh / otvor, ťuknutím na stěnu zadat délku' },
      { id: 'pan', icon: 'pan', label: 'Posun', hint: 'Táhni výkres', title: 'Posouvat výkres (prst posouvá i v ostatních nástrojích)' }
    ]
  },
  {
    id: 'walls',
    name: 'Stěny',
    color: '#c2410c',
    tools: [
      { id: 'wall', icon: 'wall', label: 'Stěna', hint: 'Táhni perem, délku zadej NumPadem', title: 'Kreslit stěny tažením pera' },
      { id: 'line', icon: 'bump', label: 'Výstupek', hint: 'Čára od líce zpět na týž líc = výstupek / vybrání', title: 'Čára ve stěnách: od líce stěny zpět na týž líc vytvoří výstupek nebo vybrání' },
      { id: 'trim', icon: 'trim', label: 'Do rohu', hint: 'Ťukni na části stěn, které zůstanou', title: 'Zkrátit / prodloužit dvě stěny do rohu, nebo jednu stěnu k hraně druhé' },
      { id: 'split', icon: 'split', label: 'Rozdělit', hint: 'Ťukni na místo dělení stěny', title: 'Ťuknutím rozdělit stěnu na dvě; v režimu S mezerou dvěma ťuknutími vyjmout úsek stěny' }
    ]
  },
  {
    id: 'openings',
    name: 'Otvory',
    color: '#0e7490',
    tools: [
      { id: 'door', icon: 'door', label: 'Dveře', hint: 'Ťukni na stěnu', title: 'Ťuknutím na stěnu vložit dveře' },
      { id: 'window', icon: 'window', label: 'Okno', hint: 'Ťukni na stěnu', title: 'Ťuknutím na stěnu vložit okno' },
      { id: 'opening', icon: 'opening', label: 'Průchod', hint: 'Ťukni na stěnu', title: 'Ťuknutím na stěnu vložit průchod bez dveří' },
      { id: 'niche', icon: 'niche', label: 'Nika', hint: 'Ťukni na stěnu', title: 'Ťuknutím na stěnu vložit niku' }
    ]
  },
  {
    id: 'dims',
    name: 'Kóty',
    color: '#be185d',
    tools: [
      { id: 'dim', icon: 'dim', label: 'Kóta', hint: 'Ťukni na dva body', title: 'Volná kóta: ťukni na dva body (roh, bod kresby, místo ve výkresu); délku zadáš ťuknutím na číslo' },
      { id: 'text', icon: 'text', label: 'Text', hint: 'Ťukni, kam přijde text', title: 'Ťuknutím vložit text; ťuknutím na text ho upravit, tažením přesunout' },
      { id: 'leader', icon: 'leader', label: 'Šipka', hint: 'Táhni od místa k textu', title: 'Odkazová šipka s textem: táhni od místa, na které se ukazuje, tam kam má přijít text' }
    ]
  },
  {
    id: 'room',
    name: 'Místnost',
    color: '#15803d',
    tools: [{ id: 'room', icon: 'room', label: 'Místnost', hint: 'Ťukni do místnosti – plocha se spočítá', title: 'Ťuknutím vložit štítek místnosti (název, světlá výška, plocha)' }]
  },
  {
    id: 'mark',
    name: 'Poznámka',
    color: '#7c3aed',
    tools: [{ id: 'mark', icon: 'mark', label: 'Poznámka', hint: 'Ťukni – text, skica, fotka', title: 'Poznámka v půdorysu: ťuknutím založit s dalším číslem; ťuknutím na poznámku otevřít text, skicu a fotku' }]
  },
  {
    id: 'draw',
    name: 'Kresba',
    color: '#1d4ed8',
    tools: [
      { id: 'drawLine', icon: 'line', label: 'Čára', hint: 'Táhni, další úsek navazuje', title: 'Kreslit čáru (jen kresba – nikdy stěna ani výstupek)' },
      { id: 'drawDouble', icon: 'double', label: 'Dvojitá', hint: 'Dvě rovnoběžné čáry (překlad)', title: 'Dvojitá čára (překlad): dvě rovnoběžné čáry' },
      { id: 'rect', icon: 'rect', label: 'Obdélník', hint: 'Táhni přes úhlopříčku', title: 'Tažením nakreslit obdélník (kresba)' },
      { id: 'circle', icon: 'circle', label: 'Kruh', hint: 'Táhni od středu', title: 'Tažením od středu nakreslit kruh' },
      { id: 'arc', icon: 'arc', label: 'Oblouk', hint: 'Táhni mezi konci', title: 'Tažením mezi krajními body nakreslit oblouk, vzepětí se upřesní kótou' },
      { id: 'drawTrim', icon: 'cut', label: 'Ořezat', hint: 'Ťukni na úsek čáry', title: 'Kresba: ťuknutím oříznout čáru k nejbližším průsečíkům, nebo prodloužit její konec' }
    ]
  },
  {
    id: 'pen',
    name: 'Pero',
    color: '#a16207',
    tools: [
      { id: 'pen', icon: 'pen', label: 'Pero', hint: 'Kresli rukou, prst posouvá', title: 'Ruční kresba perem do aktivní vrstvy (barva vrstvy); prst posouvá a zoomuje' },
      { id: 'eraser', icon: 'eraser', label: 'Guma', hint: 'Přejeď přes tah', title: 'Guma: maže celé ruční tahy v aktivní vrstvě' }
    ]
  },
  {
    id: 'items',
    name: 'Prvky',
    color: '#475569',
    tools: [{ id: 'stair', icon: 'stair', label: 'Schodiště', hint: 'Táhni rameno z rohu do rohu', title: 'Schodiště: rameno z rohu do rohu, zadanými rozměry, nebo točité; podrobnosti v panelu' }]
  }
];

/** Nástroje mimo lištu (dočasný režim). */
const EXTRA: Record<string, { group: ToolGroup; def: ToolDef }> = {
  paste: {
    group: TOOL_GROUPS[2]!,
    def: { id: 'paste', icon: 'paste', label: 'Vložit otvory', hint: 'Ťukni na stěnu, kam vložit', title: 'Vložit zkopírované otvory' }
  }
};

/** Skupina a definice nástroje. */
export function toolInfo(id: ToolId): { group: ToolGroup; def: ToolDef } {
  for (const g of TOOL_GROUPS) {
    const def = g.tools.find(t => t.id === id);
    if (def) return { group: g, def };
  }
  return EXTRA[id] ?? { group: TOOL_GROUPS[0]!, def: TOOL_GROUPS[0]!.tools[0]! };
}

/** Nástroj, který ukazuje tlačítko skupiny (naposledy použitý; u `pinFirst` vždy první). */
export function groupTool(g: ToolGroup, last: Partial<Record<string, ToolId>>): ToolDef {
  if (g.pinFirst) return g.tools[0]!;
  return g.tools.find(t => t.id === last[g.id]) ?? g.tools[0]!;
}

/** Zapne nástroj (zruší rozpracovaný úkon předchozího, zapamatuje si ho ve skupině). */
export function activateTool(id: ToolId): void {
  const s = store.get();
  tools[s.tool].cancel?.();
  const msg =
    id === 'trim' ? trimMsg(s.settings.trimEdge) : id === 'split' ? splitMsg(s.settings.splitGap) : id === 'dim' ? dimToolMsg(false) : id === 'stair' ? stairToolMsg(false) : id === 'drawTrim' ? drawTrimMsg(s.settings.drawTrimMode === 'extend') : null;
  store.set({ tool: id, ...(s.layersOpen === 'tool' ? { layersOpen: false } : {}), hover: null, chainNode: null, stairAppend: null, toolMsg: msg, toolGroupOpen: null });
  const { group } = toolInfo(id);
  if (!group.pinFirst && s.settings.lastTools?.[group.id] !== id) store.updateSettings({ lastTools: { ...s.settings.lastTools, [group.id]: id } });
}
