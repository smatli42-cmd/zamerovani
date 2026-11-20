/**
 * Panel kresby (samostatná čára, obdélník, kruh, oblouk, dvojitá čára): styl a barva čáry, šrafa u uzavřeného
 * tvaru (pravidlo canHatch v core/drawing.ts), rozměry podle tvaru.
 */
import { requestDelete } from '../deleteConfirm';
import { canHatch, DRAW_COLOR_LABELS, HATCH_LABELS, rectSize } from '../../core/drawing';
import type { Drawing, Floor, HatchKind } from '../../model/types';
import { stairsOf } from '../../core/stairs';
import { store } from '../../store/store';
import { drawingToLanding, drawingToStair, duplicateSelection, flipDrawingSide, setDrawingBulge, setDrawingRadius, setDrawingRect, setDrawingWidth, updateDrawing } from '../../store/actions';
import { close, DRAW_LINE_STYLES } from './common';
import { NumField, Panel, Seg } from './fields';

const TITLES: Record<Drawing['shape'], string> = {
  line: 'Čára',
  rect: 'Obdélník',
  circle: 'Kruh',
  arc: 'Oblouk',
  double: 'Dvojitá čára'
};

const NO_HATCH = 'none' as const;

export function DrawingPanel({ d }: { d: Drawing }) {
  const size = rectSize(d);
  const hatchOk = canHatch(d);
  // podestu jde nahradit jen u schodiště se dvěma a více rameny
  const hasLandingSpot = stairsOf(store.floor() ?? ({} as Floor)).some(st => !st.outline && st.flights.length > 1);
  return (
    <Panel title={TITLES[d.shape]} onClose={close}>
      <p class="muted small">Kresba – jen čáry, nikdy stěna ani výstupek.</p>
      {d.shape === 'circle' && (
        <NumField label="Průměr" value={Math.round((d.r ?? 0) * 2)} min={2} onCommit={v => v !== null && setDrawingRadius(d.id, v / 2)} />
      )}
      {size && (
        <div class="field-grid">
          <NumField label="Šířka" value={Math.round(size.w)} min={1} onCommit={v => v !== null && setDrawingRect(d.id, v, size.h)} />
          <NumField label="Výška" value={Math.round(size.h)} min={1} onCommit={v => v !== null && setDrawingRect(d.id, size.w, v)} />
        </div>
      )}
      {d.shape === 'arc' && (
        <NumField label="Vzepětí" value={Math.round(Math.abs(d.pts[0]?.s ?? 0))} min={10} onCommit={v => v !== null && setDrawingBulge(d.id, 0, (Math.sign(d.pts[0]?.s ?? 1) || 1) * v)} />
      )}
      {d.shape === 'double' && (
        <>
          <div class="field-grid">
            <NumField label="Vzdálenost čar" value={d.width ?? null} min={1} onCommit={v => v !== null && setDrawingWidth(d.id, v)} />
            <button class="btn" onClick={() => flipDrawingSide(d.id)}>
              ⇅ Přehodit stranu
            </button>
          </div>
          <div class="field field-inline">
            <span>Konce</span>
            <Seg
              options={[
                { v: 'open', label: 'Otevřené' },
                { v: 'closed', label: 'Uzavřené' }
              ]}
              value={d.closedEnds ? 'closed' : 'open'}
              onChange={v => updateDrawing(d.id, { closedEnds: v === 'closed' })}
            />
          </div>
        </>
      )}
      {d.shape === 'line' && d.pts.length >= 3 && (
        <div class="field field-inline">
          <span>Tvar</span>
          <Seg
            options={[
              { v: 'open', label: 'Otevřená' },
              { v: 'closed', label: 'Uzavřená' }
            ]}
            value={d.closed ? 'closed' : 'open'}
            onChange={v => updateDrawing(d.id, { closed: v === 'closed' })}
          />
        </div>
      )}
      <div class="field">
        <span>Styl čáry</span>
        <Seg options={DRAW_LINE_STYLES} value={d.style ?? 'solid'} onChange={v => updateDrawing(d.id, { style: v })} />
      </div>
      <div class="field">
        <span>Barva čáry</span>
        <Seg options={DRAW_COLOR_LABELS} value={d.color ?? 'black'} onChange={v => updateDrawing(d.id, { color: v })} />
      </div>
      {hatchOk ? (
        <>
          <div class="field">
            <span>Šrafa</span>
            <Seg<HatchKind | typeof NO_HATCH>
              options={[{ v: NO_HATCH, label: 'Žádná' }, ...HATCH_LABELS]}
              value={d.hatch ?? NO_HATCH}
              onChange={v => updateDrawing(d.id, { hatch: v === NO_HATCH ? null : v })}
            />
          </div>
          {d.hatch && (
            <div class="field">
              <span>Barva šrafy</span>
              <Seg options={DRAW_COLOR_LABELS} value={d.hatchColor ?? d.color ?? 'black'} onChange={v => updateDrawing(d.id, { hatchColor: v })} />
            </div>
          )}
        </>
      ) : (
        <p class="muted small">Šrafu jde zapnout jen u uzavřeného tvaru.</p>
      )}
      {hatchOk && d.shape !== 'double' && (
        <button class="btn" onClick={() => drawingToStair(d.id)} title="Uzavřený tvar se stane schodištěm s ručním obrysem (zabíhavé, točité…); doplní se počet stupňů a směr">
          🪜 Označit jako schodiště
        </button>
      )}
      {hatchOk && d.shape !== 'double' && hasLandingSpot && (
        <button class="btn" onClick={() => drawingToLanding(d.id)} title="Uzavřený tvar se stane podestou schodiště, které má podestu v tvaru nebo poblíž (do 1 m)">
          🪜 Použít jako podestu
        </button>
      )}
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={requestDelete}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
