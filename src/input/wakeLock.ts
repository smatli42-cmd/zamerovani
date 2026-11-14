/**
 * Nevypínat displej (Screen Wake Lock API) – tablet během zaměřování neusne.
 *
 * - Zámek jde získat jen při viditelné stránce a v zabezpečeném spojení (https / localhost); některé prohlížeče
 *   (Safari) ho dají až po dotyku uživatele → zkusí se znovu při každém ťuknutí, dokud se nepodaří.
 * - Po přepnutí aplikace / zhasnutí displeje prohlížeč zámek sám uvolní → po návratu (visibilitychange) se získá znovu.
 * - Podpora: Chrome / Edge na Androidu (84+), Safari na iPadOS 16.4+ (v aplikaci na ploše spolehlivě až od 18.4),
 *   Firefox 126+. Bez podpory se nic nestane (v Nastavení je upozornění).
 */

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}

export interface WakeLockEnv {
  /** `navigator.wakeLock` (chybí = nepodporováno). */
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
  isVisible(): boolean;
  /** Přihlásí posluchače na návrat do aplikace a na dotyk; vrátí odhlášení. */
  listen(onVisible: () => void, onTouch: () => void): () => void;
}

export function browserWakeLockEnv(): WakeLockEnv {
  const nav = navigator as Navigator & { wakeLock?: WakeLockEnv['wakeLock'] };
  return {
    wakeLock: typeof window !== 'undefined' && window.isSecureContext ? nav.wakeLock : undefined,
    isVisible: () => document.visibilityState === 'visible',
    listen(onVisible, onTouch) {
      const vis = () => {
        if (document.visibilityState === 'visible') onVisible();
      };
      document.addEventListener('visibilitychange', vis);
      document.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
      return () => {
        document.removeEventListener('visibilitychange', vis);
        document.removeEventListener('pointerdown', onTouch, { capture: true });
      };
    }
  };
}

export const wakeLockSupported = (env: WakeLockEnv = browserWakeLockEnv()): boolean => !!env.wakeLock;

/**
 * Řídí zámek displeje podle nastavení. `setEnabled` volat při změně volby „Nevypínat displej“.
 * `isActive` = zámek je právě drží (pro ladění / zobrazení).
 */
export function createWakeLock(env: WakeLockEnv) {
  let enabled = false;
  let sentinel: Sentinel | null = null;
  let pending = false;

  const acquire = () => {
    if (!enabled || !env.wakeLock || pending || (sentinel && !sentinel.released) || !env.isVisible()) return;
    pending = true;
    env.wakeLock
      .request('screen')
      .then(s => {
        pending = false;
        if (!enabled) return void s.release();
        sentinel = s;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      })
      .catch(() => {
        // např. bez dotyku uživatele nebo při šetření baterie – zkusí se při dalším ťuknutí / návratu
        pending = false;
      });
  };
  const release = () => {
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) void s.release();
  };
  const stop = env.listen(acquire, acquire);

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (on) acquire();
      else release();
    },
    isActive: () => !!sentinel && !sentinel.released,
    dispose() {
      stop();
      release();
    }
  };
}
