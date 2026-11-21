/**
 * Aktivní nástroj na první pohled (návrh ovládání, rozhodnutí uživatele 2026-11-21): nástroj s nápovědou
 * v horní liště (`ToolBadge`, ✕ = zpět na Vybrat – karta na výkresu zabírala místo, přání uživatele),
 * barevný rámeček kolem výkresu a ikona nástroje u hrotu pera / kurzoru, když pero visí nad displejem.
 * Ve Vybrat se rámeček ani ikona u pera nekreslí. Barvy a texty z ui/toolGroups.ts.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { activateTool, toolInfo } from './toolGroups';

const isNeutral = (tool: string) => tool === 'select' || tool === 'pan';

/** Volby nástroje (`children`) a okno vrstev nástroje – jeden sloupec vlevo nahoře na výkresu. */
export function ToolHead({ children }: { children: ComponentChildren }) {
  return <div class="tool-head">{children}</div>;
}

/** Aktivní nástroj v horní liště: ikona v barvě skupiny, název, nápověda, ✕ = zpět na Vybrat. */
export function ToolBadge() {
  const tool = useStore(s => s.tool);
  const { group, def } = toolInfo(tool);
  const neutral = isNeutral(tool);
  return (
    <div class={`tool-badge ${neutral ? 'neutral' : ''}`} style={{ '--gc': group.color }} title={def.title}>
      <span class="tool-badge-ico">
        <Icon name={def.icon} size={24} />
      </span>
      <b>{def.label}</b>
      <span class="tool-badge-hint">{def.hint}</span>
      {tool !== 'select' && (
        <button type="button" class="tool-badge-x" title="Zpět na Vybrat" aria-label="Zpět na Vybrat" onClick={() => activateTool('select')}>
          <Icon name="close" size={18} />
        </button>
      )}
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
