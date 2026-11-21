/**
 * Aktivní nástroj na první pohled (návrh ovládání, rozhodnutí uživatele 2026-11-21): barevná karta nástroje
 * vlevo nahoře na výkresu (ikona, název, nápověda; ✕ = zpět na Vybrat), barevný rámeček kolem výkresu
 * a ikona nástroje u hrotu pera / kurzoru, když pero visí nad displejem. Ve Vybrat se rámeček ani ikona
 * u pera nekreslí. Barvy a texty z ui/toolGroups.ts.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { activateTool, toolInfo } from './toolGroups';

const isNeutral = (tool: string) => tool === 'select' || tool === 'pan';

/** Karta nástroje a pod ní volby nástroje (`children`) – jeden sloupec vlevo nahoře na výkresu. */
export function ToolHead({ children }: { children: ComponentChildren }) {
  const tool = useStore(s => s.tool);
  const { group, def } = toolInfo(tool);
  return (
    <div class="tool-head" style={{ '--gc': group.color }}>
      <div class="tool-chip" title={def.title}>
        <Icon name={def.icon} size={26} />
        <b>{def.label}</b>
        <span class="tool-chip-hint">{def.hint}</span>
        {tool !== 'select' && (
          <button type="button" class="tool-chip-x" title="Zpět na Vybrat" aria-label="Zpět na Vybrat" onClick={() => activateTool('select')}>
            <Icon name="close" size={20} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Barevný rámeček výkresu a ikona nástroje u hrotu pera (nad plátnem, bez zásahů do ovládání). */
export function ToolFrame() {
  const tool = useStore(s => s.tool);
  const { group, def } = toolInfo(tool);
  const tag = useRef<HTMLDivElement>(null);
  const neutral = isNeutral(tool);

  useEffect(() => {
    const el = tag.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    let r = wrap.getBoundingClientRect();
    const measure = () => (r = wrap.getBoundingClientRect());
    const hide = () => (el.style.display = 'none');
    const move = (e: PointerEvent) => {
      // jen pero / myš bez stisku (pero visí nad displejem) a jen nad samotným výkresem
      if (neutral || e.pointerType === 'touch' || e.buttons !== 0 || !(e.target as Element).classList?.contains('plan-canvas')) return hide();
      el.style.display = 'flex';
      el.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
    };
    wrap.addEventListener('pointerenter', measure);
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerdown', hide);
    wrap.addEventListener('pointerleave', hide);
    window.addEventListener('resize', measure);
    hide();
    return () => {
      wrap.removeEventListener('pointerenter', measure);
      window.removeEventListener('resize', measure);
      wrap.removeEventListener('pointermove', move);
      wrap.removeEventListener('pointerdown', hide);
      wrap.removeEventListener('pointerleave', hide);
    };
  }, [neutral]);

  return (
    <>
      {!neutral && <div class="tool-frame" style={{ '--gc': group.color }} aria-hidden="true" />}
      <div class="pen-tag" ref={tag} style={{ '--gc': group.color }} aria-hidden="true">
        <Icon name={def.icon} size={20} />
      </div>
    </>
  );
}
