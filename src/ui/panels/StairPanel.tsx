/**
 * Panel schodiště (2D značka; core/stairs.ts): výška a počet stupňů se zadávají jen zde, výška a šířka stupně se
 * dopočítají. Rozměry ramen a podest se mění kótami na výkresu (jen u vybraného schodiště) nebo zde.
 */
import { flightLength, stairLabel, stepHeight, totalSteps, treadDepth, type StairTurn } from '../../core/stairs';
import type { Stair } from '../../model/types';
import { addStairFlight, applyNumpadValue, deleteSelection, duplicateSelection, flipStairDirection, removeStairFlight, rotateSelection, setFlightSteps, setStairTurn, turnStairAxis, updateStair } from '../../store/actions';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

const TURNS: { v: StairTurn; label: string }[] = [
  { v: 'left', label: 'L vlevo' },
  { v: 'right', label: 'L vpravo' },
  { v: 'u-left', label: 'U vlevo' },
  { v: 'u-right', label: 'U vpravo' }
];

const mm = (v: number | null) => (v === null ? '–' : `${Math.round(v)} mm`);

export function StairPanel({ s }: { s: Stair }) {
  const v = stepHeight(s);
  const manual = !!s.outline;
  const many = s.flights.length > 1;
  return (
    <Panel title={manual ? 'Schodiště (ruční obrys)' : 'Schodiště'} onClose={close}>
      <p class="muted small">Jen značka v půdorysu. Ťuknutím na hrot šipky se přepne směr výstupu, tažením se schodiště posune.</p>
      <NumField label="Výška schodiště" value={s.height ?? null} allowEmpty min={1} onCommit={h => updateStair(s.id, { height: h ?? undefined })} />
      {s.flights.slice(0, manual ? 1 : undefined).map((f, i) => (
        <div key={f.id} class="field-grid">
          <NumField label={many ? `Počet stupňů – ${i + 1}. rameno` : 'Počet stupňů'} value={f.steps} min={2} unit="" onCommit={n => n !== null && setFlightSteps(s.id, f.id, n)} />
          {!manual && (
            <>
              <NumField label={many ? `Délka ${i + 1}. ramene` : 'Délka ramene'} value={Math.round(flightLength(f))} min={100} onCommit={x => x !== null && applyNumpadValue({ kind: 'stair-dim', stairId: s.id, flightId: f.id, dim: 'length' }, x)} />
              <NumField label={many ? `Šířka ${i + 1}. ramene` : 'Šířka ramene'} value={f.width} min={100} onCommit={x => x !== null && applyNumpadValue({ kind: 'stair-dim', stairId: s.id, flightId: f.id, dim: 'width' }, x)} />
            </>
          )}
          <p class="small">Šířka stupně: {mm(treadDepth(s, f))}</p>
          {i > 0 && (
            <div class="field">
              <span>Napojení přes podestu</span>
              <Seg options={TURNS} value={f.turn ?? 'left'} onChange={t => setStairTurn(s.id, f.id, t)} />
            </div>
          )}
        </div>
      ))}
      <p class="small">
        Celkem {totalSteps(s)} stupňů, výška stupně: {v === null ? 'zadejte výšku schodiště' : mm(v)}
      </p>
      <div class="field field-inline">
        <span>Popisek {stairLabel(s)}</span>
        <Seg
          options={[
            { v: 'on', label: 'Zobrazit' },
            { v: 'off', label: 'Skrýt' }
          ]}
          value={s.noLabel ? 'off' : 'on'}
          onChange={x => updateStair(s.id, { noLabel: x === 'off' || undefined })}
        />
      </div>
      <div class="btn-row" style={{ flexWrap: 'wrap' }}>
        <button class="btn btn-sm" onClick={() => flipStairDirection(s.id)}>
          ⇅ Směr výstupu
        </button>
        <button class="btn btn-sm" onClick={() => rotateSelection(-90)}>
          ⟲ 90°
        </button>
        <button class="btn btn-sm" onClick={() => rotateSelection(90)}>
          ⟳ 90°
        </button>
      </div>
      {manual ? (
        <>
          <button class="btn" onClick={() => turnStairAxis(s.id)}>
            ⟲ Osa výstupu o 90°
          </button>
          <div class="field field-inline">
            <span>Čáry nášlapů</span>
            <Seg
              options={[
                { v: 'auto', label: 'Rovnoměrně' },
                { v: 'manual', label: 'Kreslím ručně' }
              ]}
              value={s.manualTreads ? 'manual' : 'auto'}
              onChange={x => updateStair(s.id, { manualTreads: x === 'manual' || undefined })}
            />
          </div>
        </>
      ) : (
        <div class="field">
          <span>Přidat podestu a rameno</span>
          <div class="btn-row" style={{ flexWrap: 'wrap' }}>
            {TURNS.map(t => (
              <button key={t.v} class="btn btn-sm" onClick={() => addStairFlight(s.id, t.v)}>
                {t.label}
              </button>
            ))}
          </div>
          {many && (
            <button class="btn btn-sm" onClick={() => removeStairFlight(s.id)}>
              Odebrat poslední rameno
            </button>
          )}
        </div>
      )}
      <div class="panel-actions">
        <button class="btn" onClick={duplicateSelection}>📄 Kopírovat</button>
        <button class="btn btn-danger" onClick={deleteSelection}>🗑️ Smazat</button>
      </div>
    </Panel>
  );
}
