import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  createTelemetry, ENVELOPE_VERSION, INSTALL_KEY, QUEUE_KEY, trimQueue, trimTier, eventBytes,
  NEVER_TRIM, DEFAULT_TRIM_TIER,
} from '../src/telemetry/telemetry.js';
import { createFloorRecorder } from '../src/telemetry/floorRecorder.js';
import { acceptBatch } from '../tools/telemetry-collector.js';
import { checkFloorEnd } from '../tools/replay-check.js';
import { FLOOR_TEMPLATES, buildFloor } from '../src/core/floors.js';
import { createFloorState, act } from '../src/core/turn.js';
import { solve } from '../src/core/solver.js';
import { LOGIC_VERSION, TELEMETRY } from '../src/config.js';
import { telemetryActive, setupTelemetry } from '../src/telemetry/browser.js';
import { parseCsv, rowsToEvents } from '../tools/sheet-to-ndjson.js';
import { floorSetupFor } from '../src/core/run.js';
import { encodeAction } from '../src/core/replay.js';

function memoryStorage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// A deterministic client: fake clock, counter ids, manual timers, and a
// transport that records bodies and answers with `ok`.
function rig({ ok = true, ...opts } = {}) {
  let t = 1000;
  let n = 0;
  const timers = [];
  const sent = [];
  const storage = opts.storage || memoryStorage();
  const tel = createTelemetry({
    endpoint: 'https://collect.example/e',
    app: '9.9.9',
    logic: 7,
    storage,
    now: () => t++,
    newId: (p) => `${p}_${n++}`,
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => {},
    send: async (url, body, o) => {
      sent.push({ url, body: JSON.parse(body), beacon: o.beacon });
      return typeof ok === 'function' ? ok() : ok;
    },
    batchSize: 3,
    ...opts,
  });
  return { tel, sent, timers, storage, advance: (ms) => { t += ms; }, time: () => t };
}

test('telemetry: envelope fields are stamped on every event', () => {
  const { tel } = rig();
  tel.setRun('r_1');
  const ev = tel.track('floor.end', { floor: 2 }, { dv: 3 });
  assert.equal(ev.v, ENVELOPE_VERSION);
  assert.equal(ev.type, 'floor.end');
  assert.equal(ev.dv, 3);
  assert.equal(ev.seq, 0);
  assert.equal(ev.run, 'r_1');
  assert.equal(ev.app, '9.9.9');
  assert.equal(ev.logic, 7);
  assert.equal(ev.install, tel.install);
  assert.equal(ev.session, tel.session);
  assert.deepEqual(ev.data, { floor: 2 });
  assert.equal(tel.track('x').seq, 1);
  assert.equal(tel.track(''), null);
});

test('telemetry: install id persists; session id is new per client', () => {
  const storage = memoryStorage();
  const a = rig({ storage }).tel;
  const b = rig({ storage }).tel;
  assert.equal(a.install, b.install);
  assert.equal(storage.getItem(INSTALL_KEY), a.install);
});

test('telemetry: batches flush at batchSize; sent events leave the queue', async () => {
  const { tel, sent } = rig();
  tel.track('a');
  tel.track('b');
  assert.equal(sent.length, 0);
  tel.track('c'); // hits batchSize 3
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.v, ENVELOPE_VERSION);
  assert.deepEqual(sent[0].body.events.map((e) => e.type), ['a', 'b', 'c']);
  assert.equal(tel.queue.length, 0);
});

test('telemetry: a failed send keeps events (persisted) for the next flush', async () => {
  let up = false;
  const { tel, sent, storage, timers, advance } = rig({ ok: () => up });
  tel.track('a');
  assert.equal(timers.length, 1); // a flush is scheduled
  assert.equal(await tel.flush(), 0);
  assert.equal(tel.queue.length, 1);
  assert.ok(storage.getItem(QUEUE_KEY).includes('"a"'));
  // A new client (page reload) picks the queue back up.
  const again = rig({ storage, ok: true });
  assert.equal(again.tel.queue.length, 1);
  up = true;
  advance(15000); // past the first backoff
  assert.equal(await tel.flush({ beacon: true }), 1);
  assert.equal(sent.at(-1).beacon, true);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});

test('telemetry: no endpoint keeps events local; maxQueue drops the oldest of a tier', async () => {
  const { tel, sent } = rig({ endpoint: '', maxQueue: 4, batchSize: 100 });
  for (let i = 0; i < 6; i++) tel.track(`e${i}`);
  assert.equal(await tel.flush(), 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(tel.queue.map((e) => e.type), ['e2', 'e3', 'e4', 'e5']);
});

test('telemetry: trimming drops low-value events before floor.end and run.end, never feedback', () => {
  const ev = (type, i) => ({ id: `e${i}`, type });
  const queue = ['feedback', 'floor.end', 'session.hide', 'run.start', 'screen.view', 'run.end', 'floor.start', 'session.hide']
    .map(ev);
  const keep = (max) => trimQueue(queue, { maxCount: max }).map((e) => e.type);
  assert.equal(trimQueue(queue, { maxCount: 8 }), queue); // under the cap: untouched
  // Tier 0 (session.hide, screen.view) goes first, oldest first; order kept.
  assert.deepEqual(keep(7), ['feedback', 'floor.end', 'run.start', 'screen.view', 'run.end', 'floor.start', 'session.hide']);
  assert.deepEqual(keep(5), ['feedback', 'floor.end', 'run.start', 'run.end', 'floor.start']);
  // Then floor.start (tier 1), then unlisted types (run.start), then the records.
  assert.deepEqual(keep(3), ['feedback', 'floor.end', 'run.end']);
  assert.deepEqual(keep(2), ['feedback', 'run.end']);
  // Feedback stays even when it alone is over the cap.
  assert.deepEqual(keep(0), ['feedback']);
  assert.equal(trimTier('feedback'), NEVER_TRIM);
  assert.equal(trimTier('something.new'), DEFAULT_TRIM_TIER);
  assert.ok(trimTier('session.hide') < trimTier('floor.start'));
  assert.ok(trimTier('floor.start') < DEFAULT_TRIM_TIER && DEFAULT_TRIM_TIER < trimTier('floor.end'));
  assert.equal(trimTier('run.end'), trimTier('floor.end'));
});

test('telemetry: the trim policy is data: a custom table and a byte cap', () => {
  const queue = [
    { id: 'a', type: 'chatty', pad: 'x'.repeat(100) },
    { id: 'b', type: 'note', pad: 'x'.repeat(100) },
    { id: 'c', type: 'chatty', pad: 'x'.repeat(10) },
  ];
  const tiers = { chatty: 0, note: NEVER_TRIM };
  const total = queue.reduce((n, e) => n + eventBytes(e), 0);
  assert.deepEqual(trimQueue(queue, { maxBytes: total, tiers }).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(trimQueue(queue, { maxBytes: total - 1, tiers }).map((e) => e.id), ['b', 'c']);
  assert.deepEqual(trimQueue(queue, { maxBytes: 1, tiers }).map((e) => e.id), ['b']);
  // The client applies the same table and caps as events arrive.
  const { tel } = rig({ endpoint: '', maxQueue: 2, batchSize: 100, trimTiers: tiers });
  tel.track('note');
  tel.track('chatty');
  tel.track('chatty');
  tel.track('note');
  assert.deepEqual(tel.queue.map((e) => e.type), ['note', 'note']);
});

test('telemetry: a reload trims a queue saved under larger caps', () => {
  const storage = memoryStorage();
  const big = rig({ storage, endpoint: '', batchSize: 100 }).tel;
  for (const type of ['screen.view', 'floor.end', 'session.hide', 'run.end']) big.track(type);
  const small = rig({ storage, endpoint: '', batchSize: 100, maxQueue: 2 }).tel;
  assert.deepEqual(small.queue.map((e) => e.type), ['floor.end', 'run.end']);
});

test('telemetry: offline, nothing is sent (no beacon either); events wait', async () => {
  let online = false;
  const { tel, sent } = rig({ online: () => online, batchSize: 100 });
  tel.track('a');
  tel.track('session.hide');
  assert.equal(await tel.flush({ beacon: true }), 0);
  assert.equal(await tel.flush(), 0);
  assert.equal(sent.length, 0);
  assert.equal(tel.queue.length, 2);
  online = true;
  assert.equal(await tel.reconnected(), 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].beacon, false);
  assert.equal(tel.queue.length, 0);
});

test('telemetry: failed sends back off (doubling, capped); reconnecting resets it', async () => {
  let up = false;
  const { tel, sent, advance, time } = rig({ ok: () => up, batchSize: 100, flushMs: 1000, maxBackoffMs: 4000 });
  tel.track('a');
  const waits = [];
  for (let i = 0; i < 4; i++) {
    const t0 = time();
    assert.equal(await tel.flush(), 0);
    waits.push(Math.round((tel.retryAt - t0) / 100) * 100); // the fake clock ticks per call
    // Focus / visible flushes (and the page-hide beacon) inside the wait
    // don't hit the endpoint.
    assert.equal(await tel.flush(), 0);
    assert.equal(await tel.flush({ beacon: true }), 0);
    assert.equal(sent.length, i + 1);
    advance(tel.retryAt - time());
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 4000]);
  // Reconnecting (the `online` event) forgets the backoff and sends at once.
  up = true;
  tel.track('b');
  assert.equal(await tel.reconnected(), 2);
  assert.equal(tel.retryAt, 0);
  assert.equal(tel.queue.length, 0);
});

test('telemetry: full storage trims the queue to make room instead of losing it all', () => {
  const store = memoryStorage();
  let limit = Infinity;
  const storage = {
    ...store,
    setItem: (k, v) => {
      if (String(v).length > limit) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      store.setItem(k, v);
    },
  };
  const { tel } = rig({ storage, endpoint: '', batchSize: 100 });
  for (let i = 0; i < 10; i++) tel.track('floor.end', { i });
  tel.track('session.hide');
  limit = store.getItem(QUEUE_KEY).length; // the next write won't fit
  tel.track('floor.end', { i: 10 });
  const saved = JSON.parse(store.getItem(QUEUE_KEY)).queue;
  assert.ok(saved.length > 0 && saved.length < 12);
  assert.ok(!saved.some((e) => e.type === 'session.hide')); // the low-value one went first
  assert.equal(saved.at(-1).data.i, 10);
});

test('telemetry: blocked storage (not full) never trims the in-memory queue', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} };
  const { tel } = rig({ storage, endpoint: '', batchSize: 100 });
  for (let i = 0; i < 10; i++) tel.track('floor.end', { i });
  assert.equal(tel.queue.length, 10);
});

test('telemetry: opting out clears the queue and records nothing', () => {
  const { tel, storage } = rig({ batchSize: 100 });
  tel.track('a');
  tel.setEnabled(false);
  assert.equal(tel.queue.length, 0);
  assert.equal(storage.getItem(QUEUE_KEY), null);
  assert.equal(tel.track('b'), null);
  tel.setEnabled(true);
  assert.ok(tel.track('c'));
  const off = rig({ enabled: false });
  assert.equal(off.tel.track('x'), null);
});

test('telemetry: a disabled client writes nothing and deletes an old queue', () => {
  const storage = memoryStorage();
  storage.setItem(QUEUE_KEY, JSON.stringify({ v: ENVELOPE_VERSION, queue: [{ id: 'old', type: 't' }] }));
  const { tel } = rig({ enabled: false, storage });
  assert.equal(tel.track('x'), null);
  assert.equal(tel.install, null);
  assert.equal(storage.m.size, 0, 'no install id, no queue');
  tel.setEnabled(true);
  assert.ok(tel.install);
  assert.equal(storage.getItem(INSTALL_KEY), tel.install);
});

test('telemetry: collection stays off until config.collect, except dev overrides', () => {
  assert.equal(telemetryActive(true, ''), TELEMETRY.collect);
  assert.equal(telemetryActive(false, ''), false);
  assert.equal(telemetryActive(false, 'console'), true);
  assert.equal(telemetryActive(false, 'http://localhost:8787/collect'), true);
  assert.equal(telemetryActive(true, 'https://example.com/collect'), TELEMETRY.collect);
  assert.equal(telemetryActive(true, 'off'), false);
});

test('telemetry: broken storage never throws', () => {
  const throwing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const { tel } = rig({ storage: throwing, batchSize: 100 });
  assert.ok(tel.install);
  assert.ok(tel.track('a'));
});

test('floor recorder: log entries, counts, inputs and cancelled previews', () => {
  let t = 0;
  const rec = createFloorRecorder(() => t);
  t = 50;
  rec.preview({ axis: 'h', index: 1, side: 'before' });
  rec.preview({ axis: 'h', index: 2, side: 'before' }); // same preview session
  rec.preview(null); // backed out
  rec.preview({ axis: 'v', index: 1, side: 'after' });
  rec.foldAttempt();
  rec.action({ type: 'fold', fold: { axis: 'v', index: 1, side: 'after' } }, 'touch', { ok: true, tookTurn: true });
  t = 90;
  rec.action({ type: 'move', dir: 'up' }, 'key', { ok: false, reason: 'blocked' });
  rec.action({ type: 'undo' }, 'mouse', { ok: true });
  rec.hintShown();
  const s = rec.summary();
  assert.deepEqual(s.log, [[50, 'fv1a', 'touch'], [90, 'u', 'key', 'blocked'], [90, 'z', 'mouse']]);
  assert.equal(s.turns, 1);
  assert.equal(s.folds, 1);
  assert.equal(s.undos, 1);
  assert.equal(s.refused, 1);
  assert.equal(s.previews, 2);
  assert.equal(s.previewsCancelled, 1);
  assert.equal(s.hints, 1);
  assert.deepEqual(s.inputs, { touch: 1, key: 1, mouse: 1 });
  assert.equal(s.ms, 90);
});

test('collector: accepts any event type and data, drops malformed envelopes', () => {
  const body = JSON.stringify({ v: 1, events: [
    { id: 'e_1', type: 'brand.new.event', data: { anything: [1, { deep: true }] } },
    { id: 'e_2' },
    { type: 'no-id' },
    null,
  ] });
  const out = acceptBatch(body, 42);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].data, { anything: [1, { deep: true }] });
  assert.equal(out[0].received, 42);
  assert.throws(() => acceptBatch('{"nope":1}'));
  assert.throws(() => acceptBatch('not json'));
});

test('replay check: a recorded floor.end rebuilds and replays identically', () => {
  const template = FLOOR_TEMPLATES[0];
  const variant = { transform: 'flipH', picks: [], anchors: [1] };
  let state = createFloorState(buildFloor(template, variant));
  const rec = createFloorRecorder(() => 0);
  const line = [{ type: 'move', dir: 'down' }, ...solve(state).actions]; // first one is refused (edge)
  for (const action of line) {
    const r = act(state, action);
    rec.action(action, 'key', { ok: r.ok, reason: r.reason, tookTurn: r.ok });
    if (r.ok) state = r.state;
  }
  const data = { source: 'template', templateId: template.id, variant, outcome: 'won', turn: state.turn, ...rec.summary() };
  const ev = { type: 'floor.end', logic: LOGIC_VERSION, data };
  assert.equal(checkFloorEnd(ev).ok, true);
  assert.equal(checkFloorEnd({ ...ev, data: { ...data, outcome: 'lost' } }).ok, false);
  assert.ok(checkFloorEnd({ ...ev, logic: LOGIC_VERSION + 1 }).skip);
  assert.ok(checkFloorEnd({ ...ev, data: { ...data, source: 'dev' } }).skip);
  assert.ok(checkFloorEnd({ ...ev, data: { ...data, overrides: { charges: 9 } } }).skip);
});

test('replay check: a floor continued from a save replays its saved actions first', () => {
  const template = FLOOR_TEMPLATES[0];
  const variant = { transform: 'id', picks: [], anchors: [0] };
  const start = createFloorState(buildFloor(template, variant));
  const line = solve(start).actions;
  const [first, ...rest] = line;
  let state = act(start, first).state;
  const rec = createFloorRecorder(() => 0);
  for (const action of [{ type: 'move', dir: 'down' }, ...rest]) { // first one refused (edge)
    const r = act(state, action);
    rec.action(action, 'key', { ok: r.ok, reason: r.reason, tookTurn: r.ok });
    if (r.ok) state = r.state;
  }
  const data = {
    source: 'template', templateId: template.id, variant, outcome: 'won', turn: state.turn, resumedFrom: [encodeAction(first)], ...rec.summary(),
  };
  const ev = { type: 'floor.end', logic: LOGIC_VERSION, data };
  assert.equal(state.status, 'won');
  assert.equal(checkFloorEnd(ev).ok, true);
  assert.equal(checkFloorEnd({ ...ev, data: { ...data, resumedFrom: [] } }).ok, false);
  // Left mid-floor (Menu, run saved): replays to a floor still in play.
  const partial = { ...data, outcome: 'left', turn: 1, log: [] };
  assert.equal(checkFloorEnd({ ...ev, data: partial }).ok, true);
});

test('replay check: floors replay with the loadout (relics, HP) they started with', () => {
  const template = FLOOR_TEMPLATES[0];
  const variant = { transform: 'id', picks: [], anchors: [0] };
  const loadout = { relics: ['spring-crease'], hp: 2, maxHp: 3 };
  let state = createFloorState(floorSetupFor(loadout, buildFloor(template, variant)));
  const rec = createFloorRecorder(() => 0);
  const twoFolds = [{ type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } }, { type: 'fold', fold: { axis: 'h', index: 4, side: 'after' } }];
  const line = [...twoFolds, { type: 'undo' }, { type: 'undo' }];
  for (const action of line) {
    const r = act(state, action);
    assert.ok(r.ok, `${action.type} accepted`);
    rec.action(action, 'key', { ok: true, tookTurn: action.type !== 'undo' });
    state = r.state;
  }
  const data = { source: 'template', templateId: template.id, variant, loadout, outcome: 'abandoned', turn: state.turn, ...rec.summary() };
  const ev = { type: 'floor.end', logic: LOGIC_VERSION, data };
  assert.equal(checkFloorEnd(ev).ok, true);
  assert.equal(checkFloorEnd({ ...ev, data: { ...data, loadout: undefined } }).ok, false, 'second undo needs Spring Crease');
});

test('sheets export: CSV rows (quotes, overflow cells) turn back into events', () => {
  const data = { log: [[0, 'u', 'key']], text: 'a, "quoted"\nline' };
  const json = JSON.stringify(data);
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    'received,id,type,dv,ts,seq,install,session,run,app,logic,data,',
    ['2026-01-01T00:00:00Z', 'e_1', 'floor.end', 1, 5, 0, 'i_1', 's_1', '', '0.4.0', 1, json.slice(0, 10), json.slice(10)].map(cell).join(','),
    ['x', 'e_2', 'bad', 1, 5, 1, '', '', '', '', 1, '{oops', ''].map(cell).join(','),
  ].join('\r\n');
  const events = rowsToEvents(parseCsv(csv));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, data);
  assert.deepEqual([events[0].id, events[0].type, events[0].dv, events[0].seq, events[0].run], ['e_1', 'floor.end', 1, 0, null]);
});

test('session.start device info has no user agent or time zone (dv 2)', () => {
  const stubs = {
    window: {
      addEventListener() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
      matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }),
    },
    document: { addEventListener() {} },
    navigator: { onLine: true, language: 'en-US', userAgent: 'Mozilla/5.0 Test', maxTouchPoints: 5 },
    screen: { width: 390, height: 844 },
  };
  const saved = {};
  for (const [k, v] of Object.entries(stubs)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  try {
    const device = setupTelemetry({ enabled: false, override: 'off' }).deviceInfo();
    assert.equal(device.lang, 'en-US');
    assert.equal(device.pointer, 'coarse');
    assert.ok(!('ua' in device), 'no user agent');
    assert.ok(!('tzOffset' in device), 'no time zone');
  } finally {
    for (const k of Object.keys(stubs)) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  }
});
