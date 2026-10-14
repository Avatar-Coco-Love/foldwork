import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  SETTINGS_GROUPS, DEFAULT_SETTINGS, choicesFor, normalizeSettings, textScale, PALETTE_OPTIONS,
} from '../src/ui/settings.js';
import { PALETTES } from '../src/render/palette.js';
import {
  shareData, shareGame, challengeUrl, challengeSeed, CHALLENGE_PARAM,
} from '../src/ui/share.js';

test('settings groups: every choice row names a setting with a list and a default', () => {
  const ids = new Set();
  for (const g of SETTINGS_GROUPS) {
    for (const r of g.rows) {
      assert.ok(!ids.has(r.id), `duplicate row ${r.id}`);
      ids.add(r.id);
      if (r.action) continue;
      const list = choicesFor(r.key);
      assert.ok(list && list.length > 1, `${r.id}: no choices for ${r.key}`);
      assert.ok(list.some((o) => o.id === DEFAULT_SETTINGS[r.key]), `${r.id}: default not in its list`);
    }
  }
});

test('settings: palette, text size and hand are saved and checked', () => {
  assert.deepEqual(PALETTE_OPTIONS.map((o) => o.id), Object.keys(PALETTES));
  const s = normalizeSettings({ palette: 'night-ink', textSize: 'large', hand: 'left' });
  assert.equal(s.palette, 'night-ink');
  assert.equal(textScale(s), 1.2);
  assert.equal(s.hand, 'left');
  const bad = normalizeSettings({ palette: 'neon', textSize: 'huge', hand: 'both' });
  assert.equal(bad.palette, DEFAULT_SETTINGS.palette);
  assert.equal(textScale(bad), 1);
  assert.equal(bad.hand, 'right');
});

test('settings: share play data shows only when collection is offered', () => {
  const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.key === 'telemetry');
  assert.equal(row.show({ telemetryOffered: false }), false);
  assert.equal(row.show({ telemetryOffered: true }), true);
});

test('share sends only a title and the link (no text joined onto it)', async () => {
  assert.deepEqual(shareData('https://x.test/'), { title: 'Foldwork', url: 'https://x.test/' });
  const shared = [];
  const nav = { share: async (d) => shared.push(d), canShare: () => true };
  assert.equal(await shareGame('https://x.test/', nav), 'shared');
  assert.deepEqual(shared, [{ title: 'Foldwork', url: 'https://x.test/' }]);
  const abort = { share: async () => { throw Object.assign(new Error('no'), { name: 'AbortError' }); } };
  assert.equal(await shareGame('u', abort), 'cancelled');
  const copied = [];
  assert.equal(await shareGame('u', { clipboard: { writeText: async (t) => copied.push(t) } }), 'copied');
  assert.deepEqual(copied, ['u']);
  assert.equal(await shareGame('u', {}), 'manual');
});

test('challenge links carry a plain run seed, and only that is accepted', async () => {
  const url = challengeUrl('3141592653', 'https://x.test/foldwork/');
  assert.equal(url, `https://x.test/foldwork/?${CHALLENGE_PARAM}=3141592653`);
  const params = Object.fromEntries(new URL(url).searchParams);
  assert.equal(challengeSeed(params), '3141592653');
  for (const bad of ['', 'abc', '01', '4294967296', '1e9']) {
    assert.equal(challengeSeed({ [CHALLENGE_PARAM]: bad }), null, bad);
  }
  assert.equal(challengeSeed({}), null);
  const shared = [];
  const nav = { share: async (d) => shared.push(d) };
  assert.equal(await shareGame(url, nav, 'Foldwork challenge'), 'shared');
  assert.deepEqual(shared, [{ title: 'Foldwork challenge', url }]);
});

test('settings: Save code is an action row in the Data group', () => {
  const data = SETTINGS_GROUPS.find((g) => g.id === 'data');
  const row = data.rows.find((r) => r.id === 'save-code');
  assert.equal(row.action, 'saveCode');
  assert.ok(!row.show, 'always shown');
});
