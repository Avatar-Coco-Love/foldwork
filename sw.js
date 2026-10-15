// Foldwork service worker (9i, offline play): caches the app shell so the
// game opens and plays with no connection. Registered by
// src/ui/serviceWorker.js; docs/07-telemetry.md "Offline play".
//
// - Install: cache every SHELL file, fresh from the network, in a cache
//   named for this release (VERSION = APP_VERSION, tests check).
// - Fetch: same-origin GETs come from the cache first, the network only
//   for what isn't there (share.png, tools/ and docs/ are never cached).
//   Opening the game (any URL params) is served the cached page.
// - Update: a release changes this file (VERSION, and SHELL when modules
//   change), so the browser installs the new shell in the background
//   while the old one keeps serving; on activate older caches are deleted.
//   The page decides when to switch (a 'activate' message).
//
// SHELL is hand-written (no build step): every file reachable from
// index.html and src/main.js. `node tools/shell-files.js` prints it;
// tests/offline.test.js fails when it's out of date.

const VERSION = '0.9.6';
const CACHE_PREFIX = 'foldwork-';
const CACHE = CACHE_PREFIX + VERSION;

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'src/main.js',
  'src/config.js',
  'src/audio/ambient.js',
  'src/audio/music.js',
  'src/audio/sfx.js',
  'src/audio/sounds.js',
  'src/core/board.js',
  'src/core/boss.js',
  'src/core/changelog.js',
  'src/core/creatures.js',
  'src/core/daily.js',
  'src/core/enemies.js',
  'src/core/environment.js',
  'src/core/floors.js',
  'src/core/fold.js',
  'src/core/foldHistory.js',
  'src/core/hintLine.js',
  'src/core/hints.js',
  'src/core/maps.js',
  'src/core/meta.js',
  'src/core/relics.js',
  'src/core/replay.js',
  'src/core/rng.js',
  'src/core/run.js',
  'src/core/save.js',
  'src/core/saveCode.js',
  'src/core/scraps.js',
  'src/core/solver.js',
  'src/core/spirits.js',
  'src/core/stats.js',
  'src/core/summary.js',
  'src/core/tiles.js',
  'src/core/turn.js',
  'src/core/unlocks.js',
  'src/render/appIcon.js',
  'src/render/creatures.js',
  'src/render/frameStats.js',
  'src/render/fx.js',
  'src/render/grain.js',
  'src/render/layout.js',
  'src/render/palette.js',
  'src/render/playback.js',
  'src/render/preview.js',
  'src/render/renderer.js',
  'src/telemetry/browser.js',
  'src/telemetry/floorRecorder.js',
  'src/telemetry/telemetry.js',
  'src/ui/appManifest.js',
  'src/ui/backButton.js',
  'src/ui/dom.js',
  'src/ui/foldGesture.js',
  'src/ui/fpsMeter.js',
  'src/ui/hintSearch.js',
  'src/ui/hintStore.js',
  'src/ui/hintWorker.js',
  'src/ui/hud.js',
  'src/ui/input.js',
  'src/ui/metaStore.js',
  'src/ui/moveInput.js',
  'src/ui/router.js',
  'src/ui/saveStore.js',
  'src/ui/screens.js',
  'src/ui/serviceWorker.js',
  'src/ui/settings.js',
  'src/ui/share.js',
  'src/ui/stats.js',
  'src/ui/unlocks.js',
  'src/ui/whatsNew.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page found this release waiting and is ready to switch to it.
self.addEventListener('message', (event) => {
  if (event.data === 'activate') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the telemetry collector, other sites
  const key = cacheKey(url, req.mode === 'navigate');
  if (!key) return;
  event.respondWith(fromCache(key, req));
});

/**
 * The cached URL a request is served from, or null to leave it to the
 * network. Opening the game with params (?challenge=, ?seed=) is the
 * cached page; other files match exactly.
 */
function cacheKey(url, navigate) {
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return null;
  const path = url.pathname.slice(scope.pathname.length);
  if (navigate || path === '' || path === 'index.html') {
    return path === '' || path === 'index.html' ? scope.href : null;
  }
  return SHELL.includes(path) && !url.search ? url.href : null;
}

async function fromCache(key, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  return hit || fetch(req);
}
