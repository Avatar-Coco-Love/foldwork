// Offline play (9i): registers the service worker (../../sw.js), which
// caches the app shell so the game opens with no connection. Browser layer
// only; the pure part (swMode) is tested in Node.
//
// Updates: the browser fetches sw.js again on launch (and the page asks
// when it comes back into view); a new release's sw.js installs its whole
// shell in the background while this one keeps serving. It takes over when
// every window of the game has closed, or at the next launch: a page that
// starts on the title screen with a new version waiting switches to it and
// reloads once, before anything is played.
//
// Development: no service worker on localhost (the dev server always
// serves fresh files), and any left from testing is removed. `?sw=1`
// registers it there anyway (offline testing); `?nosw=1` skips and removes
// it anywhere.

const SW_URL = new URL('../../sw.js', import.meta.url);

/**
 * 'register' or 'unregister' for a page at `hostname` with URL params
 * `params` ({ sw, nosw }).
 */
export function swMode(hostname, params = {}) {
  if (params.nosw === '1') return 'unregister';
  if (params.sw === '1') return 'register';
  return isLocalHost(hostname) ? 'unregister' : 'register';
}

export function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

/**
 * Register (or remove) the service worker. `canReload()`: whether the page
 * may reload now to take a waiting update (the player hasn't started
 * anything). Never throws; resolves to the registration or null.
 */
export async function setupServiceWorker({ params = {}, canReload = () => false } = {}) {
  const sw = typeof navigator !== 'undefined' && navigator.serviceWorker;
  if (!sw) return null;
  try {
    if (swMode(location.hostname, params) === 'unregister') {
      const regs = await sw.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      return null;
    }
    const reg = await sw.register(SW_URL.href, { scope: new URL('./', SW_URL).href });
    let switching = false;
    sw.addEventListener('controllerchange', () => {
      // Only a switch this page asked for reloads it; the first install
      // taking control of the page doesn't.
      if (switching) location.reload();
    });
    const takeUpdate = () => {
      if (!reg.waiting || !sw.controller || switching || !canReload()) return;
      switching = true;
      reg.waiting.postMessage('activate');
    };
    takeUpdate();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (navigator.onLine !== false) reg.update().catch(() => {});
      takeUpdate();
    });
    return reg;
  } catch {
    return null; // private mode, file://, blocked: the game still runs online
  }
}
