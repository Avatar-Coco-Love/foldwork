import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { test } from './harness.js';
import { ROOT, reachableFiles, swShell, moduleRefs, htmlRefs } from '../tools/shell-files.js';
import { swMode, isLocalHost } from '../src/ui/serviceWorker.js';
import { APP_VERSION } from '../src/config.js';

const SW_CODE = readFileSync(join(ROOT, 'sw.js'), 'utf8');

test('offline: every file the game loads is in the sw.js shell', () => {
  const shell = new Set(swShell());
  const missing = reachableFiles().filter((f) => !shell.has(f));
  assert.deepEqual(missing, [], `add to sw.js SHELL (node tools/shell-files.js): ${missing.join(', ')}`);
  assert.ok(shell.has('./') && shell.has('index.html') && shell.has('src/main.js') && shell.has('src/ui/hintWorker.js'));
});

test('offline: the shell lists only real game files (no share.png, tools/, docs/)', () => {
  const reachable = new Set(reachableFiles());
  const shell = swShell();
  assert.equal(new Set(shell).size, shell.length, 'duplicates in SHELL');
  for (const f of shell) {
    if (f === './') continue;
    assert.ok(reachable.has(f), `sw.js SHELL lists ${f}, which the game never loads`);
    assert.ok(!/^(tools|docs|tests)\/|share\.png$|^sw\.js$/.test(f), f);
  }
});

test('offline: the cache is versioned by APP_VERSION', () => {
  const m = SW_CODE.match(/const VERSION = '([^']+)';/);
  assert.ok(m, 'sw.js: const VERSION');
  assert.equal(m[1], APP_VERSION, 'set sw.js VERSION to the new changelog version');
});

test('offline: import scanning finds static, re-export, dynamic and worker refs', () => {
  const code = [
    "import { a } from './a.js';",
    "import b, {\n  c,\n} from '../b.js';",
    "export { d } from './d.js';",
    "import './side.js';",
    "const m = await import('./lazy.js');",
    "new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });",
    "// import { no } from './commented.js';",
    "import { ext } from 'node:fs';",
  ].join('\n');
  assert.deepEqual(moduleRefs(code).sort(), ['../b.js', './a.js', './d.js', './lazy.js', './side.js', './worker.js']);
  const html = '<link href="css/a.css"><script src="src/m.js?x=1"></script><link rel="icon" href="data:x"><a href="https://x.io/">'
    + '<!-- <script src="old.js"> -->';
  assert.deepEqual(htmlRefs(html), ['css/a.css', 'src/m.js']);
});

test('offline: the service worker stays off on localhost unless ?sw=1; ?nosw=1 removes it anywhere', () => {
  assert.equal(swMode('avatar-coco-love.github.io'), 'register');
  assert.equal(swMode('avatar-coco-love.github.io', { nosw: '1' }), 'unregister');
  assert.equal(swMode('localhost'), 'unregister');
  assert.equal(swMode('127.0.0.1'), 'unregister');
  assert.equal(swMode('localhost', { sw: '1' }), 'register');
  assert.equal(swMode('localhost', { sw: '1', nosw: '1' }), 'unregister');
  assert.ok(isLocalHost('game.localhost') && !isLocalHost('example.com'));
});

// sw.js in a sandbox: fake caches, fetch and registration, so the install,
// activate and fetch handlers run in Node.
function loadWorker({ scope = 'https://x.io/foldwork/', caches: existing = [] } = {}) {
  const stores = new Map(existing.map((name) => [name, new Map()]));
  const listeners = {};
  const fetched = [];
  let skipped = false;
  let claimed = false;
  class Request {
    constructor(url, init = {}) {
      this.url = new URL(url, scope).href;
      this.cache = init.cache;
      this.method = init.method || 'GET';
      this.mode = init.mode || 'cors';
    }
  }
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      addAll: async (reqs) => reqs.forEach((r) => m.set(r.url, { body: r.url, cache: r.cache })),
      match: async (key) => m.get(typeof key === 'string' ? key : key.url),
    };
  };
  const self = {
    location: new URL(scope + 'sw.js'),
    registration: { scope },
    clients: { claim: async () => { claimed = true; } },
    skipWaiting: () => { skipped = true; },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const context = {
    self,
    Request,
    URL,
    caches: {
      open: async (name) => store(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (req) => { fetched.push(req.url); return { body: 'network' }; },
  };
  vm.runInNewContext(SW_CODE, context);
  const fire = async (type, data) => {
    let waited = null;
    let response = null;
    listeners[type]({
      ...data,
      waitUntil: (p) => { waited = p; },
      respondWith: (p) => { response = p; },
    });
    await waited;
    return response ? await response : null;
  };
  const get = (url, mode = 'no-cors') => fire('fetch', { request: new Request(url, { mode }) });
  return { stores, fire, get, fetched, Request, state: () => ({ skipped, claimed }) };
}

test('offline: install caches the whole shell fresh; activate drops older releases only', async () => {
  const sw = loadWorker({ caches: ['foldwork-0.9.5', 'foldwork-0.9.4', 'someone-else'] });
  await sw.fire('install');
  const name = `foldwork-${APP_VERSION}`;
  const cached = sw.stores.get(name);
  assert.equal(cached.size, swShell().length);
  assert.ok(cached.has('https://x.io/foldwork/') && cached.has('https://x.io/foldwork/src/main.js'));
  assert.ok([...cached.values()].every((e) => e.cache === 'reload')); // not from the HTTP cache
  assert.equal(sw.state().skipped, false); // waits for the page to switch
  await sw.fire('activate');
  assert.deepEqual([...sw.stores.keys()].sort(), [name, 'someone-else']);
  assert.equal(sw.state().claimed, true);
  await sw.fire('message', { data: 'activate' });
  assert.equal(sw.state().skipped, true);
});

test('offline: fetches come from the cache first; the page opens with any params', async () => {
  const sw = loadWorker();
  await sw.fire('install');
  const page = 'https://x.io/foldwork/';
  assert.equal((await sw.get(page + 'src/core/turn.js')).body, page + 'src/core/turn.js');
  assert.equal((await sw.get(page + '?challenge=123&seed=a', 'navigate')).body, page);
  assert.equal((await sw.get(page + 'index.html', 'navigate')).body, page);
  assert.equal(sw.fetched.length, 0);
});

test('offline: share.png, tools/, other sites and POSTs are left to the network', async () => {
  const sw = loadWorker();
  await sw.fire('install');
  const page = 'https://x.io/foldwork/';
  assert.equal(await sw.get(page + 'share.png'), null);
  assert.equal(await sw.get(page + 'tools/share-image.html', 'navigate'), null);
  assert.equal(await sw.get('https://x.io/other-project/', 'navigate'), null);
  assert.equal(await sw.get('https://script.google.com/macros/s/x/exec'), null);
  assert.equal(await sw.fire('fetch', { request: new sw.Request(page + 'src/main.js', { method: 'POST' }) }), null);
  // A shell file missing from the cache still loads from the network.
  sw.stores.get(`foldwork-${APP_VERSION}`).delete(page + 'css/style.css');
  assert.equal((await sw.get(page + 'css/style.css')).body, 'network');
});
