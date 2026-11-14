import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { openField, pressKey } from './numpadController';
import { store } from './store';

describe('NumPad pro obecná pole (výška, parapet, úhel…)', () => {
  it('tlačítko 000 přidá tisíce: 2 + 000 = 2000, hodnota se zapíše po potvrzení', () => {
    store.openProject(createProject({ name: 't' }));
    let got: number | null | undefined;
    openField({ label: 'Výška' }, 1500, v => (got = v));
    pressKey('2');
    pressKey('000');
    expect(store.get().numpad?.buffer).toBe('2000');
    pressKey('ENTER');
    expect(got).toBe(2000);
    expect(store.get().numpad).toBeNull();
  });

  it('první číslice nahradí výchozí hodnotu, Esc nic nezapíše', () => {
    store.openProject(createProject({ name: 't' }));
    let got: number | null | undefined;
    openField({ label: 'Parapet' }, 900, v => (got = v));
    pressKey('8');
    pressKey('5');
    pressKey('0');
    pressKey('ESC');
    expect(got).toBeUndefined();
  });

  it('pod minimem se nic nezapíše; prázdné pole jen u allowEmpty; záporné číslo jen u pole se záporným minimem', () => {
    store.openProject(createProject({ name: 't' }));
    let got: number | null | undefined = 7;
    openField({ label: 'Výška', min: 100 }, 2000, v => (got = v));
    pressKey('5');
    pressKey('ENTER');
    expect(got).toBe(7);

    openField({ label: 'Výška', allowEmpty: true }, 2000, v => (got = v));
    pressKey('CLEAR');
    pressKey('ENTER');
    expect(got).toBeNull();

    openField({ label: 'Otočit', unit: '°', min: -360 }, null, v => (got = v));
    pressKey('-');
    pressKey('9');
    pressKey('0');
    pressKey('ENTER');
    expect(got).toBe(-90);

    openField({ label: 'Výška' }, null, v => (got = v));
    pressKey('-');
    expect(store.get().numpad?.buffer).toBe('');
    pressKey('ESC');
  });

  it('výběr na výkrese zůstane beze změny', () => {
    store.openProject(createProject({ name: 't' }));
    store.set({ selection: { kind: 'wall', id: 'x' } });
    openField({ label: 'Výška' }, 1, () => {});
    expect(store.get().selection).toEqual({ kind: 'wall', id: 'x' });
    pressKey('ESC');
  });
});

describe('NumPad: výraz hned po otevření', () => {
  it('čerstvá hodnota + „−“ dá výraz (1200 − 150), ne zahození znaménka', () => {
    store.openProject(createProject({ name: 't' }));
    let got: number | null | undefined;
    openField({ label: 'Výška' }, 1200, v => (got = v));
    pressKey('-');
    pressKey('1');
    pressKey('5');
    pressKey('0');
    expect(store.get().numpad?.buffer).toBe('1200-150');
    pressKey('ENTER');
    expect(got).toBe(1050);
  });
});
