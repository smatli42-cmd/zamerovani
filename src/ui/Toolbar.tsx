/**
 * Levá lišta nástrojů po skupinách (ui/toolGroups.ts): tlačítko skupiny zapne naposledy použitý nástroj,
 * druhé ťuknutí na aktivní skupinu (nebo podržení) rozbalí vedle lišty řadu všech jejích nástrojů.
 * Aktivní skupina je plná v barvě skupiny. Vše se vejde bez rolování (9 tlačítek).
 */
import { useEffect, useRef } from 'preact/hooks';
import { store } from '../store/store';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { activateTool, groupTool, TOOL_GROUPS, toolInfo, type ToolGroup } from './toolGroups';

const LONG_PRESS_MS = 450;

export function Toolbar() {
  const tool = useStore(s => s.tool);
  const last = useStore(s => s.settings.lastTools) ?? {};
  const open = useStore(s => s.toolGroupOpen);
  const activeGroup = toolInfo(tool).group.id;
  const nav = useRef<HTMLElement>(null);

  // rozbalená řada se zavře ťuknutím mimo lištu
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) store.set({ toolGroupOpen: null });
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.set({ toolGroupOpen: null });
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <nav class="toolbar rail" aria-label="Nástroje" ref={nav}>
      {TOOL_GROUPS.map(g => (
        <RailItem key={g.id} g={g} active={g.id === activeGroup} open={open === g.id} shown={g.id === activeGroup && !g.pinFirst ? toolInfo(tool).def : groupTool(g, last)} tool={tool} />
      ))}
    </nav>
  );
}

function RailItem({ g, active, open, shown, tool }: { g: ToolGroup; active: boolean; open: boolean; shown: ReturnType<typeof groupTool>; tool: string }) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const multi = g.tools.length > 1;
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div class="rail-item" style={{ '--gc': g.color }}>
      <button
        type="button"
        class={`rail-btn ${active ? 'on' : ''} ${multi ? 'more' : ''}`}
        title={`${g.name}${multi ? ' – podržením nebo druhým ťuknutím další nástroje' : ''}`}
        aria-pressed={active}
        aria-expanded={multi ? open : undefined}
        onPointerDown={() => {
          longPressed.current = false;
          if (!multi) return;
          clear();
          timer.current = window.setTimeout(() => {
            longPressed.current = true;
            store.set({ toolGroupOpen: g.id });
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onClick={() => {
          clear();
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          // aktivní skupina: druhé ťuknutí rozbalí řadu (Vybrat z Posunu nejdřív přepne zpět na Vybrat)
          if (active && multi && (!g.pinFirst || tool === g.tools[0]!.id)) {
            store.set({ toolGroupOpen: open ? null : g.id });
            return;
          }
          activateTool(shown.id);
        }}
      >
        <Icon name={shown.icon} size={30} />
        <span class="rail-label">{shown.label}</span>
      </button>
      {open && (
        <div class="rail-fly" role="group" aria-label={g.name}>
          {g.tools.map(t => (
            <button key={t.id} type="button" class={`fly-btn ${t.id === tool ? 'on' : ''}`} title={t.title} onClick={() => activateTool(t.id)}>
              <Icon name={t.icon} size={28} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
