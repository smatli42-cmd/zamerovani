/**
 * Panel schodiště (2D značka; core/stairs.ts): výška a počet stupňů se zadávají jen zde, výška a šířka stupně se
 * dopočítají. Rozměry ramen a podest se mění kótami na výkresu (jen u vybraného schodiště) nebo zde; tvar ramene
 * (rovné / po oblouku), napojení dalšího ramene (L, U, volně), zabíhavé stupně místo podesty.
 */
import { isArcFlight } from '../../core/stairFlight';
import { flightLength, isUTurn, stairDimValue, stairLabel, stepHeight, totalSteps, treadDepth, type StairDim, type StairJoin, type StairTurn } from '../../core/stairs';
import { WINDERS } from '../../core/stairWinders';
import type { Stair, StairFlight } from '../../model/types';
import {
  addStairFlight,
  applyNumpadValue,
  deleteSelection,
  duplicateSelection,
  flipStairDirection,
  mirrorStairArc,
  removeStairFlight,
  rotateSelection,
  setFlightArc,
  setFlightSteps,
  setLandingWinders,
  setStairTurn,
  turnStairAxis,
  updateStair
} from '../../store/actions';
import { store } from '../../store/store';
import { stairToolMsg } from '../../tools/stairTool';
import { tools } from '../../tools/registry';
import { close } from './common';
import { NumField, Panel, Seg } from './fields';

const TURNS: { v: StairTurn; label: string }[] = [
  { v: 'left', label: 'L vlevo' },
  { v: 'right', label: 'L vpravo' },
  { v: 'u-left', label: 'U vlevo' },
  { v: 'u-right', label: 'U vpravo' }
];
const JOINS: { v: StairJoin; label: string }[] = [...TURNS, { v: 'free', label: 'Volně' }];

const mm = (v: number | null) => (v === null ? '–' : `${Math.round(v)} mm`);

/** Zadání rozměru přes kótu schodiště (zámky a pravidla kót platí stejně jako na výkresu). */
const setDim = (s: Stair, f: StairFlight, dim: StairDim) => (x: number | null) => x !== null && applyNumpadValue({ kind: 'stair-dim', stairId: s.id, flightId: f.id, dim }, x);

/** Tlačítko „Nakreslit další rameno“: nástroj Schodiště kreslí rameno k tomuto schodišti. */
function drawNextFlight(id: string): void {
  tools[store.get().tool].cancel?.();
  store.set({ tool: 'stair', stairAppend: id, hover: null, chainNode: null });
  if (store.get().settings.stairMode === 'spiral') store.updateSettings({ stairMode: 'rect' });
  store.set({ toolMsg: stairToolMsg(false) });
}

function FlightFields({ s, f, i }: { s: Stair; f: StairFlight; i: number }) {
  const many = s.flights.length > 1;
  const arc = isArcFlight(f);
  const land = i > 0 ? s.landings[i - 1] : undefined;
  const join = f.turn ?? 'left';
  return (
    <div>
      {many && <h4>{i + 1}. rameno</h4>}
      {i > 0 && (
        <>
          <div class="field">
            <span>Napojení na předchozí rameno</span>
            <Seg options={JOINS} value={join} onChange={t => setStairTurn(s.id, f.id, t)} />
          </div>
          {join === 'free' ? (
            <p class="muted small">Rameno stojí, kde je nakreslené. Tvar podesty: nakreslete uzavřený tvar (Čára, Obdélník) a v jeho panelu zvolte „Použít jako podestu“.</p>
          ) : (
            <div class="field field-inline">
              <span>Otočka</span>
              <Seg
                options={[
                  { v: 'landing', label: 'Podesta' },
                  { v: 'winders', label: 'Zabíhavé stupně' }
                ]}
                value={land?.winders ? 'winders' : 'landing'}
                onChange={v => setLandingWinders(s.id, f.id, v === 'winders' ? 0 : null)}
              />
            </div>
          )}
          {join !== 'free' && land?.winders && (
            <NumField label={`Zabíhavých stupňů${isUTurn(join) ? ' (U)' : ' (L)'}`} value={land.winders} min={WINDERS.min} unit="" onCommit={k => k !== null && setLandingWinders(s.id, f.id, k)} />
          )}
        </>
      )}
      <div class="field field-inline">
        <span>Tvar ramene</span>
        <Seg
          options={[
            { v: 'straight', label: 'Rovné' },
            { v: 'arc', label: 'Po oblouku' }
          ]}
          value={arc ? 'arc' : 'straight'}
          onChange={v => setFlightArc(s.id, f.id, v === 'arc')}
        />
      </div>
      <div class="field-grid">
        <NumField label="Počet stupňů" value={f.steps} min={2} unit="" onCommit={k => k !== null && setFlightSteps(s.id, f.id, k)} />
        <NumField label="Šířka ramene" value={f.width} min={100} onCommit={setDim(s, f, 'width')} />
        {arc ? (
          <>
            <NumField label="Vnější poloměr" value={Math.round(stairDimValue(s, f.id, 'radius') ?? 0)} min={100} onCommit={setDim(s, f, 'radius')} />
            <NumField label="Úhel oblouku" value={Math.round(stairDimValue(s, f.id, 'sweep') ?? 0)} min={1} unit="°" onCommit={setDim(s, f, 'sweep')} />
          </>
        ) : (
          <NumField label="Délka ramene" value={Math.round(flightLength(f))} min={100} onCommit={setDim(s, f, 'length')} />
        )}
      </div>
      {arc && (
        <button class="btn btn-sm" onClick={() => mirrorStairArc(s.id, f.id)}>
          ↔ Oblouk na druhou stranu
        </button>
      )}
      <p class="small">
        {arc ? `Délka po ose ${mm(flightLength(f))}, šířka` : 'Šířka'} stupně{arc ? ' na ose' : ''}: {mm(treadDepth(s, f))}
      </p>
    </div>
  );
}

export function StairPanel({ s }: { s: Stair }) {
  const v = stepHeight(s);
  const manual = !!s.outline;
  const many = s.flights.length > 1;
  const spiral = s.flights.length === 1 && isArcFlight(s.flights[0]!) && Math.abs(s.flights[0]!.sweep!) >= 180;
  return (
    <Panel title={manual ? 'Schodiště (ruční obrys)' : spiral ? 'Schodiště (točité)' : 'Schodiště'} onClose={close}>
      <p class="muted small">Jen značka v půdorysu. Ťuknutím na hrot šipky se přepne směr výstupu, tažením se schodiště posune.</p>
      <NumField label="Výška schodiště" value={s.height ?? null} allowEmpty min={1} onCommit={h => updateStair(s.id, { height: h ?? undefined })} />
      {manual ? (
        <div class="field-grid">
          <NumField label="Počet stupňů" value={s.flights[0]?.steps ?? 2} min={2} unit="" onCommit={k => k !== null && s.flights[0] && setFlightSteps(s.id, s.flights[0].id, k)} />
          <p class="small">Šířka stupně: {mm(s.flights[0] ? treadDepth(s, s.flights[0]) : null)}</p>
        </div>
      ) : (
        s.flights.map((f, i) => <FlightFields key={f.id} s={s} f={f} i={i} />)
      )}
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
            <button class="btn btn-sm" onClick={() => drawNextFlight(s.id)}>
              ✏️ Nakreslit další rameno
            </button>
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
