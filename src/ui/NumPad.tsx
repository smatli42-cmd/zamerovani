/**
 * Číselná klávesnice pro zadávání rozměrů v mm (podporuje 1200+800, 3000-150).
 */
import { wallNodes } from '../core/floorQueries';
import { OPENING_DEFAULTS } from '../model/factory';
import type { Floor } from '../model/types';
import { numpadValue, pressKey, setMoveTarget, unlockCurrentWall, type NumKey } from '../store/numpadController';
import { store, type NumPadTarget } from '../store/store';
import { useStore } from '../store/useStore';

function title(floor: Floor | null, t: NumPadTarget): string {
  if (t.kind === 'wall-length') return 'Délka stěny';
  if (t.kind === 'wall-sagitta') return 'Vzepětí oblouku';
  if (t.kind === 'circle-diameter') return 'Průměr kruhu';
  if (t.kind === 'wall-thickness') return 'Tloušťka stěny';
  if (t.kind === 'wall-face-length') return 'Délka stěny po líci';
  if (t.kind === 'comp-gap') {
    const side = { left: 'vlevo', right: 'vpravo', top: 'nahoře', bottom: 'dole' }[t.side];
    return `Odstup od stěny ${side}`;
  }
  const op = floor?.openings[t.kind === 'opening-gap' ? t.secondId : t.openingId];
  const name = op ? `${OPENING_DEFAULTS[op.kind].label} ${op.number}` : 'Otvor';
  switch (t.kind) {
    case 'opening-offset':
      return `${name} – odstup od rohu ${t.ref.toUpperCase()}`;
    case 'opening-width':
      return `${name} – šířka`;
    case 'opening-gap':
      return `${name} – meziostění`;
    case 'opening-reveal':
      return `${name} – ${{ depth: 'hloubka ostění od vnitřního líce', depthBack: 'hloubka ostění od vnějšího líce', left: 'ostění vlevo', right: 'ostění vpravo', top: 'ostění nahoře', frameWidth: op?.kind === 'door' ? 'šířka zárubně' : 'šířka rámu', frameDepth: op?.kind === 'door' ? 'hloubka zárubně' : 'hloubka rámu', frameOffset: op?.kind === 'door' ? 'odsazení zárubně od vnitřního líce' : 'odsazení rámu od vnitřního líce' }[t.part]}`;
  }
}

const KEYS: { k: NumKey; label: string; cls?: string }[] = [
  { k: '7', label: '7' },
  { k: '8', label: '8' },
  { k: '9', label: '9' },
  { k: 'BACK', label: '⌫', cls: 'op' },
  { k: '4', label: '4' },
  { k: '5', label: '5' },
  { k: '6', label: '6' },
  { k: 'CLEAR', label: 'C', cls: 'op' },
  { k: '1', label: '1' },
  { k: '2', label: '2' },
  { k: '3', label: '3' },
  { k: '+', label: '+', cls: 'op' },
  { k: '0', label: '0' },
  { k: '00', label: '00' },
  { k: '-', label: '−', cls: 'op' },
  { k: 'NEXT', label: 'Další ➔', cls: 'op next' }
];

export function NumPad() {
  const np = useStore(s => s.numpad);
  const project = useStore(s => s.project);
  void project; // překreslit i při změně výkresu
  if (!np) return null;
  const floor = store.floor();
  const t = np.target;
  const value = numpadValue();
  const hasExpr = /[+-]/.test(np.buffer.slice(1));
  const wall = t.kind === 'wall-length' ? floor?.walls[t.wallId] : null;
  const nodes = floor && wall ? wallNodes(floor, wall) : null;

  return (
    <section class="numpad" aria-label="Zadání rozměru">
      <div class="numpad-head">
        <span>{title(floor, t)}</span>
        <button class="icon-close" onClick={() => pressKey('ESC')} title="Zavřít (Esc)">
          ✕
        </button>
      </div>
      <div class={`numpad-display ${np.fresh ? 'fresh' : ''}`}>
        {hasExpr && <div class="numpad-expr">{np.buffer.replace(/-/g, '−')} =</div>}
        <div class="numpad-value">
          {value === null ? np.buffer || '0' : Math.round(value)} <small>mm</small>
        </div>
      </div>

      {t.kind === 'wall-length' && wall && nodes && (
        <div class="numpad-move">
          <span class="muted small">Posunout roh (nebo ťukni na roh):</span>
          <div class="seg">
            <button class={t.move !== 'both' && t.move.nodeId === wall.a ? 'active' : ''} onClick={() => setMoveTarget({ nodeId: wall.a })}>
              ◀ A
            </button>
            <button class={t.move === 'both' ? 'active' : ''} onClick={() => setMoveTarget('both')}>
              ◀ střed ▶
            </button>
            <button class={t.move !== 'both' && t.move.nodeId === wall.b ? 'active' : ''} onClick={() => setMoveTarget({ nodeId: wall.b })}>
              B ▶
            </button>
          </div>
        </div>
      )}

      <div class="numpad-grid">
        {KEYS.map(key => (
          <button key={key.k} class={`np-key ${key.cls ?? ''}`} onClick={() => pressKey(key.k)}>
            {key.label}
          </button>
        ))}
      </div>
      <div class="numpad-actions">
        <button class="btn btn-primary btn-lg" onClick={() => pressKey('ENTER')}>
          ✔ Potvrdit
        </button>
        {wall?.measured !== null && wall && (
          <button class="btn btn-sm" onClick={unlockCurrentWall} title="Vrátit stěnu do stavu náčrtu">
            🔓 Zrušit změření
          </button>
        )}
      </div>
    </section>
  );
}
