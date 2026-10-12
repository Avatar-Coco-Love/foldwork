import assert from 'node:assert/strict';
import { test } from './harness.js';
import { HINTS, hintsFor } from '../src/core/hints.js';
import { loadSeenHints, saveSeenHints, HINTS_KEY } from '../src/ui/hintStore.js';

const ids = Object.keys(HINTS);

test('hints: start, event and who triggers; seen hints never repeat', () => {
  const none = new Set();
  assert.deepEqual(hintsFor(['fold-drag', 'fold-bridge'], { type: 'start' }, none), ['fold-drag']);
  const fold = { type: 'events', events: [{ type: 'fold' }] };
  assert.deepEqual(hintsFor(['fold-drag', 'fold-bridge', 'undo'], fold, none), ['fold-bridge', 'undo']);
  assert.deepEqual(hintsFor(['fold-bridge'], fold, new Set(['fold-bridge'])), []);
  const pinMite = { type: 'events', events: [{ type: 'pin', id: 'mite-0' }] };
  const pinMe = { type: 'events', events: [{ type: 'pin', id: 'player' }] };
  assert.deepEqual(hintsFor(['pin', 'pinned-self'], pinMite, none), ['pin']);
  assert.deepEqual(hintsFor(['pin', 'pinned-self'], pinMe, none), ['pinned-self']);
  assert.deepEqual(hintsFor(['nope'], { type: 'start' }, none), []);
});

test('hints: refuse triggers match the reason', () => {
  const defs = { t: { title: 'T', text: 'x', on: 'refuse:locked' } };
  assert.deepEqual(hintsFor(['t'], { type: 'refuse', reason: 'locked' }, new Set(), 'player', defs), ['t']);
  assert.deepEqual(hintsFor(['t'], { type: 'refuse', reason: 'edge' }, new Set(), 'player', defs), []);
  assert.deepEqual(hintsFor(['t'], { type: 'start' }, new Set(), 'player', defs), []);
});

test('hints: every hint has a title, text and a known trigger', () => {
  for (const id of ids) {
    const h = HINTS[id];
    assert.ok(h.title && h.text, id);
    assert.match(h.on, /^(start|event:[a-z-]+|refuse:[a-z-]+)$/, id);
  }
});

test('hint store: round-trips seen ids and survives broken storage', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(loadSeenHints(st).size, 0);
  assert.equal(saveSeenHints(new Set(['pin', 'undo']), st), true);
  assert.deepEqual([...loadSeenHints(st)].sort(), ['pin', 'undo']);
  m.set(HINTS_KEY, '{bad json');
  assert.equal(loadSeenHints(st).size, 0);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadSeenHints(throwing).size, 0);
  assert.equal(saveSeenHints(new Set(['x']), throwing), false);
  assert.equal(saveSeenHints(new Set(['x']), null), false);
});
