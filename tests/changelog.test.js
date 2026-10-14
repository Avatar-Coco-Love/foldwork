import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  CHANGELOG, LATEST_VERSION, compareVersions, newSince, startingSeen, dateText,
} from '../src/core/changelog.js';
import { APP_VERSION } from '../src/config.js';
import { loadSeenVersion, saveSeenVersion, SEEN_VERSION_KEY } from '../src/ui/whatsNew.js';

test('changelog: the newest entry is the game version', () => {
  assert.equal(APP_VERSION, CHANGELOG[0].version);
  assert.equal(LATEST_VERSION, APP_VERSION);
});

test('changelog: entries are well formed, newest first, one per PR', () => {
  const versions = new Set();
  const prs = new Set();
  for (const [i, e] of CHANGELOG.entries()) {
    assert.match(e.version, /^\d+\.\d+\.\d+$/, e.version);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, e.version);
    assert.ok(Number.isInteger(e.pr) && e.pr > 0, `${e.version} pr`);
    assert.ok(e.title && e.title.length <= 40, `${e.version} title`);
    assert.ok(e.notes.length >= 1 && e.notes.every((n) => typeof n === 'string' && n.length > 0), `${e.version} notes`);
    assert.ok(!versions.has(e.version) && !prs.has(e.pr), `${e.version} is listed once`);
    versions.add(e.version);
    prs.add(e.pr);
    const older = CHANGELOG[i + 1];
    if (!older) continue;
    assert.ok(compareVersions(e.version, older.version) > 0, `${e.version} is newer than ${older.version}`);
    assert.ok(e.date >= older.date && e.pr > older.pr, `${e.version} comes after ${older.version}`);
  }
});

test('changelog: version compare, new entries and the starting version', () => {
  assert.ok(compareVersions('0.6.10', '0.6.9') > 0, 'numeric, not text');
  assert.ok(compareVersions('0.9.1', '0.8.12') > 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.deepEqual(newSince(LATEST_VERSION), []);
  assert.deepEqual(newSince(null), []);
  assert.deepEqual(newSince(CHANGELOG[2].version).map((e) => e.version), [CHANGELOG[0].version, CHANGELOG[1].version]);
  // New player: nothing new. Returning player from before the page: the
  // newest entry is new. A saved version wins; a broken one is ignored.
  assert.equal(startingSeen(null, false), LATEST_VERSION);
  assert.equal(startingSeen(null, true), CHANGELOG[1].version);
  assert.equal(startingSeen('0.7.1', false), '0.7.1');
  assert.equal(startingSeen('nope', true), CHANGELOG[1].version);
  assert.equal(dateText('2026-10-04'), 'Oct 4, 2026');
});

test('changelog: the seen version saves, and storage failures are quiet', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.equal(loadSeenVersion(storage), null);
  assert.ok(saveSeenVersion('0.8.6', storage));
  assert.equal(data.get(SEEN_VERSION_KEY), '0.8.6');
  assert.equal(loadSeenVersion(storage), '0.8.6');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.equal(loadSeenVersion(broken), null);
  assert.equal(saveSeenVersion('0.8.6', broken), false);
  assert.equal(saveSeenVersion('0.8.6', null), false);
});
