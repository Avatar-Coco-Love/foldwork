import assert from 'node:assert/strict';
import { test } from './harness.js';
import { drawAppIcon, iconPoints } from '../src/render/appIcon.js';
import {
  appBase, buildManifest, manifestHref, installAppManifest,
  ICON_SIZES, MASKABLE_SIZE, APPLE_ICON_SIZE, THEME_COLOR,
} from '../src/ui/appManifest.js';
import { getPalette } from '../src/render/palette.js';

// A 2D context that records every call; enough for drawAppIcon.
function fakeCtx() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => { calls.push([k, v]); return true; },
  });
}

test('appIcon: draws the sheet inside the icon square', () => {
  for (const size of [180, 192, 512]) {
    for (const [x, y] of iconPoints(size)) {
      assert.ok(x >= 0 && x <= size && y >= 0 && y <= size, `${size}: ${x},${y}`);
    }
  }
});

test('appIcon: maskable sheet sits inside the safe circle (80% wide)', () => {
  const size = 512;
  for (const [x, y] of iconPoints(size, { maskable: true })) {
    const d = Math.hypot(x - size / 2, y - size / 2);
    assert.ok(d <= size * 0.4, `${x},${y} is ${d.toFixed(1)} from centre`);
  }
});

test('appIcon: uses palette colours and fills the whole square when maskable', () => {
  const p = getPalette('paper');
  const ctx = fakeCtx();
  drawAppIcon(ctx, 512, p, { maskable: true });
  const set = (k) => ctx.calls.filter((c) => c[0] === k).map((c) => c[1]);
  assert.deepEqual(set('fillStyle'), [p.background, p.tileFace, p.accent]);
  assert.ok(ctx.calls.some((c) => c[0] === 'fillRect' && c[3] === 512 && c[4] === 512));
  const plain = fakeCtx();
  drawAppIcon(plain, 192, p);
  assert.ok(!plain.calls.some((c) => c[0] === 'fillRect'), 'rounded, not square');
});

test('appManifest: base is the page folder without query or hash', () => {
  assert.equal(appBase('https://a.io/foldwork/?seed=1#x'), 'https://a.io/foldwork/');
  assert.equal(appBase('https://a.io/foldwork/index.html'), 'https://a.io/foldwork/');
  assert.equal(appBase('http://localhost:8080/'), 'http://localhost:8080/');
});

test('appManifest: installable fields, absolute addresses, any and maskable icons', () => {
  const base = 'https://a.io/foldwork/';
  const m = buildManifest({
    base,
    background: '#e9e2d3',
    icons: [{ src: 'data:a', size: 192 }, { src: 'data:b', size: 512, maskable: true }],
  });
  assert.equal(m.name, 'Foldwork');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, base);
  assert.equal(m.scope, base);
  assert.equal(m.id, base);
  assert.equal(m.theme_color, THEME_COLOR);
  assert.deepEqual(m.icons, [
    { src: 'data:a', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'data:b', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  const href = manifestHref(m);
  assert.ok(href.startsWith('data:application/manifest+json,'));
  assert.deepEqual(JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1))), m);
});

test('appManifest: install adds the manifest and Apple icon links', () => {
  const head = [];
  const doc = {
    head: { append: (n) => head.push(n) },
    createElement: (tag) => (tag === 'canvas'
      ? { getContext: () => fakeCtx(), toDataURL() { return `data:image/png;${this.width}`; } }
      : { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
  installAppManifest(doc, 'https://a.io/foldwork/?seed=1');
  assert.deepEqual(head.map((l) => l.rel), ['manifest', 'apple-touch-icon']);
  const json = decodeURIComponent(head[0].href.slice(head[0].href.indexOf(',') + 1));
  const m = JSON.parse(json);
  assert.equal(m.start_url, 'https://a.io/foldwork/');
  assert.deepEqual(m.icons.map((i) => i.src),
    [...ICON_SIZES, MASKABLE_SIZE].map((s) => `data:image/png;${s}`));
  assert.equal(head[1].href, `data:image/png;${APPLE_ICON_SIZE}`);
  assert.equal(head[1].attrs.sizes, '180x180');
});

test('appManifest: install never throws without a canvas', () => {
  assert.doesNotThrow(() => installAppManifest({ createElement() { throw new Error('no'); } }, 'https://a.io/'));
});
