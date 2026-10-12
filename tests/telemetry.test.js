import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createTelemetry, ENVELOPE_VERSION, INSTALL_KEY, QUEUE_KEY } from '../src/telemetry/telemetry.js';
import { createFloorRecorder } from '../src/telemetry/floorRecorder.js';
import { acceptBatch } from '../tools/telemetry-collector.js';
import { checkFloorEnd } from '../tools/replay-check.js';
import { FLOOR_TEMPLATES, buildFloor } from '../src/core/floors.js';
import { createFloorState, act } from '../src/core/turn.js';
import { solve } from '../src/core/solver.js';
import { LOGIC_VERSION, TELEMETRY } from '../src/config.js';
import { telemetryActive } from '../src/telemetry/browser.js';
import { parseCsv, rowsToEvents } from '../tools/sheet-to-ndjson.js';
import { floorSetupFor } from '../src/core/run.js';

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
  return { tel, sent, timers, storage };
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
  const { tel, sent, storage, timers } = rig({ ok: () => up });
  tel.track('a');
  assert.equal(timers.length, 1); // a flush is scheduled
  assert.equal(await tel.flush(), 0);
  assert.equal(tel.queue.length, 1);
  assert.ok(storage.getItem(QUEUE_KEY).includes('"a"'));
  // A new client (page reload) picks the queue back up.
  const again = rig({ storage, ok: true });
  assert.equal(again.tel.queue.length, 1);
  up = true;
  assert.equal(await tel.flush({ beacon: true }), 1);
  assert.equal(sent.at(-1).beacon, true);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});

test('telemetry: no endpoint keeps events local; maxQueue drops the oldest', async () => {
  const { tel, sent } = rig({ endpoint: '', maxQueue: 4, batchSize: 100 });
  for (let i = 0; i < 6; i++) tel.track(`e${i}`);
  assert.equal(await tel.flush(), 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(tel.queue.map((e) => e.type), ['e2', 'e3', 'e4', 'e5']);
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
