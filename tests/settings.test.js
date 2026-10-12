import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  normalizeSettings, resolveMotion, loadSettings, saveSettings, cycleOption,
  ANIM_SPEEDS, DEFAULT_SETTINGS, SETTINGS_KEY,
} from '../src/ui/settings.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('settings normalize: defaults, unknown values reset per field', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
  const s = normalizeSettings({ animSpeed: 'fast', reducedMotion: 'warp', extra: 1 });
  assert.equal(s.animSpeed, 'fast');
  assert.equal(s.reducedMotion, 'system');
  assert.equal(s.extra, undefined);
  assert.equal(s.telemetry, 'on');
  assert.equal(normalizeSettings({ telemetry: 'off' }).telemetry, 'off');
  assert.equal(normalizeSettings({ telemetry: 'maybe' }).telemetry, 'on');
});

test('resolveMotion follows the system only in system mode', () => {
  const base = normalizeSettings({ animSpeed: 'fast' });
  assert.deepEqual(resolveMotion(base, false), { speed: 1.6, reducedMotion: false });
  assert.equal(resolveMotion(base, true).reducedMotion, true);
  assert.equal(resolveMotion({ ...base, reducedMotion: 'off' }, true).reducedMotion, false);
  assert.equal(resolveMotion({ ...base, reducedMotion: 'on' }, false).reducedMotion, true);
});

test('settings round-trip through storage and survive broken storage', () => {
  const st = memoryStorage();
  assert.equal(saveSettings({ animSpeed: 'slow', reducedMotion: 'on' }, st), true);
  assert.equal(JSON.parse(st.m.get(SETTINGS_KEY)).version, 1);
  assert.deepEqual(loadSettings(st), { ...DEFAULT_SETTINGS, animSpeed: 'slow', reducedMotion: 'on' });
  st.m.set(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(st), { ...DEFAULT_SETTINGS });
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSettings(throwing), { ...DEFAULT_SETTINGS });
  assert.equal(saveSettings(DEFAULT_SETTINGS, throwing), false);
  assert.equal(saveSettings(DEFAULT_SETTINGS, null), false);
});

test('cycleOption wraps', () => {
  assert.equal(cycleOption(ANIM_SPEEDS, 'slow'), 'normal');
  assert.equal(cycleOption(ANIM_SPEEDS, 'fast'), 'slow');
});
