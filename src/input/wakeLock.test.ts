import { describe, expect, it } from 'vitest';
import { createWakeLock, wakeLockSupported, type WakeLockEnv } from './wakeLock';

/** Falešný prohlížeč: počítá žádosti, umí „přepnout aplikaci“ (uvolnit zámek) a vyžadovat dotyk. */
function fakeEnv(opts: { needsTouch?: boolean } = {}) {
  let visible = true;
  let touched = false;
  let requests = 0;
  const sentinels: { released: boolean; fire: () => void }[] = [];
  let onVisible = () => {};
  let onTouch = () => {};
  const env: WakeLockEnv = {
    wakeLock: {
      request: () => {
        requests++;
        if (opts.needsTouch && !touched) return Promise.reject(new Error('NotAllowedError'));
        const fns: (() => void)[] = [];
        const s = {
          released: false,
          release: async () => {
            s.released = true;
            fns.forEach(f => f());
          },
          addEventListener: (_: 'release', fn: () => void) => fns.push(fn),
          fire: () => {
            s.released = true;
            fns.forEach(f => f());
          }
        };
        sentinels.push(s);
        return Promise.resolve(s);
      }
    },
    isVisible: () => visible,
    listen(v, t) {
      onVisible = v;
      onTouch = t;
      return () => {};
    }
  };
  return {
    env,
    get requests() {
      return requests;
    },
    sentinels,
    hide() {
      visible = false;
      sentinels.forEach(s => !s.released && s.fire()); // prohlížeč zámek uvolní
    },
    show() {
      visible = true;
      onVisible();
    },
    touch() {
      touched = true;
      onTouch();
    }
  };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('Nevypínat displej (Wake Lock)', () => {
  it('bez API = nepodporováno, nic se nestane', () => {
    const env: WakeLockEnv = { isVisible: () => true, listen: () => () => {} };
    expect(wakeLockSupported(env)).toBe(false);
    const wl = createWakeLock(env);
    wl.setEnabled(true);
    expect(wl.isActive()).toBe(false);
  });

  it('zapnuto → zámek; po přepnutí aplikace a návratu se získá znovu', async () => {
    const f = fakeEnv();
    const wl = createWakeLock(f.env);
    wl.setEnabled(true);
    await flush();
    expect(wl.isActive()).toBe(true);
    f.hide();
    expect(wl.isActive()).toBe(false);
    f.show();
    await flush();
    expect(wl.isActive()).toBe(true);
    expect(f.requests).toBe(2);
  });

  it('prohlížeč, který chce dotyk: první pokus selže, po ťuknutí se zámek získá; další ťuknutí nežádají znovu', async () => {
    const f = fakeEnv({ needsTouch: true });
    const wl = createWakeLock(f.env);
    wl.setEnabled(true);
    await flush();
    expect(wl.isActive()).toBe(false);
    f.touch();
    await flush();
    expect(wl.isActive()).toBe(true);
    f.touch();
    await flush();
    expect(f.requests).toBe(2);
  });

  it('vypnutí volby zámek uvolní a ťuknutí ho už nezíská', async () => {
    const f = fakeEnv();
    const wl = createWakeLock(f.env);
    wl.setEnabled(true);
    await flush();
    wl.setEnabled(false);
    expect(wl.isActive()).toBe(false);
    f.touch();
    await flush();
    expect(wl.isActive()).toBe(false);
  });
});
