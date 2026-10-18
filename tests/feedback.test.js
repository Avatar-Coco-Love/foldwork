// Send Feedback (9j): the event's data, sending with play data off, the
// Sheets collector's feedback tab and keyed read, and the Privacy page.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { test } from './harness.js';
import {
  feedbackData, feedbackContext, cleanMessage, FEEDBACK_KINDS, FEEDBACK_MAX, EMAIL_MARK,
} from '../src/telemetry/feedback.js';
import { createTelemetry, ALWAYS_SEND, QUEUE_KEY, INSTALL_KEY, trimTier, NEVER_TRIM } from '../src/telemetry/telemetry.js';
import { saidAfterSend, FEEDBACK_SAID } from '../src/ui/feedback.js';
import { PRIVACY_SECTIONS } from '../src/ui/privacy.js';
import { SETTINGS_GROUPS } from '../src/ui/settings.js';
import { fetchAll, pageUrl } from '../tools/fetch-events.js';

function memoryStorage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function rig(opts = {}) {
  let n = 0;
  const sent = [];
  const storage = opts.storage || memoryStorage();
  const tel = createTelemetry({
    endpoint: 'https://collect.example/e',
    storage,
    now: () => 1000,
    newId: (p) => `${p}_${n++}`,
    setTimer: () => 1,
    clearTimer: () => {},
    send: async (url, body) => {
      sent.push(JSON.parse(body));
      return true;
    },
    ...opts,
  });
  return { tel, sent, storage };
}

const TAG = {
  floor: 3, seed: 'abc', source: 'template', templateId: 'f3-vault', variant: 'b',
  loadout: { spirit: 'frog', relics: ['laminate'], hp: 2, maxHp: 2 },
};

test('feedback data: kind, cleaned message, where from, run context, device', () => {
  const ctx = feedbackContext(TAG, 4);
  assert.deepEqual(ctx, { floor: 3, templateId: 'f3-vault', variant: 'b', spirit: 'frog', seed: 'abc', turn: 4 });
  assert.equal(feedbackContext(null), null);
  const d = feedbackData({ kind: 'bug', text: '  The fold went wrong  ', from: 'pause', context: ctx, device: { pointer: 'coarse' } });
  assert.deepEqual(Object.keys(d), ['kind', 'message', 'from', 'context', 'device'], 'a new field must be named on the Privacy page');
  assert.equal(d.message, 'The fold went wrong');
  assert.equal(d.from, 'pause');
  assert.equal(feedbackData({ kind: 'nope', text: 'x' }).kind, 'other');
  assert.equal(feedbackData({ kind: 'idea', text: '   ' }), null, 'nothing to send');
  assert.deepEqual(FEEDBACK_KINDS.map((k) => k.id), ['bug', 'idea', 'other']);
});

test('feedback data: emails are removed, long messages capped', () => {
  assert.equal(cleanMessage('mail me at sam.lee+fw@example.co.uk please'), `mail me at ${EMAIL_MARK} please`);
  assert.equal(cleanMessage('floor 3 @ turn 4'), 'floor 3 @ turn 4', 'a lone @ stays');
  assert.equal(cleanMessage('a'.repeat(FEEDBACK_MAX + 50)).length, FEEDBACK_MAX);
});

test('feedback is sent with play data off, with no install id', async () => {
  assert.ok(ALWAYS_SEND.includes('feedback'));
  assert.equal(trimTier('feedback'), NEVER_TRIM);
  const { tel, sent, storage } = rig({ enabled: false });
  assert.equal(tel.track('floor.end', {}), null, 'play data stays off');
  const ev = tel.track('feedback', { kind: 'bug', message: 'hi' });
  assert.ok(ev);
  assert.equal(ev.install, null);
  assert.equal(storage.getItem(INSTALL_KEY), null, 'no install id is made');
  assert.equal(await tel.flush(), 1);
  assert.deepEqual(sent[0].events.map((e) => e.type), ['feedback']);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});

test('feedback carries the install id while play data is on, not after it is turned off', () => {
  const { tel } = rig();
  assert.ok(tel.track('feedback', { message: 'a' }).install);
  tel.setEnabled(false);
  assert.equal(tel.track('feedback', { message: 'b' }).install, null);
});

test('turning play data off keeps unsent feedback; a disabled reload keeps only feedback', () => {
  const storage = memoryStorage();
  const { tel } = rig({ storage, online: () => false });
  tel.track('floor.end', {});
  tel.track('feedback', { message: 'offline note' });
  tel.setEnabled(false);
  assert.deepEqual(tel.queue.map((e) => e.type), ['feedback']);
  // Next launch with play data on (a queue saved with both) then off.
  const both = rig({ storage, online: () => false });
  both.tel.track('screen.view', {});
  const later = rig({ storage, enabled: false });
  assert.deepEqual(later.tel.queue.map((e) => e.type), ['feedback']);
});

test('feedback waits offline and goes once back online', async () => {
  let online = false;
  const { tel, sent } = rig({ enabled: false, online: () => online });
  tel.track('feedback', { message: 'hi' });
  assert.equal(await tel.flush(), 0);
  online = true;
  assert.equal(await tel.reconnected(), 1);
  assert.equal(sent.length, 1);
});

test('alwaysTypes [] (?telemetry=off): a disabled client sends nothing at all', async () => {
  const { tel, sent } = rig({ enabled: false, alwaysTypes: [] });
  assert.equal(tel.track('feedback', { message: 'x' }), null);
  assert.equal(await tel.flush(), 0);
  assert.equal(sent.length, 0);
});

test('feedback form: what the player sees after Send', () => {
  assert.equal(saidAfterSend({ queued: true, online: true }), FEEDBACK_SAID.online);
  assert.equal(saidAfterSend({ queued: true, online: false }), FEEDBACK_SAID.offline);
  assert.equal(saidAfterSend({ queued: false, online: true }), FEEDBACK_SAID.off);
});

test('privacy page: in Settings > Data, and names what feedback carries', () => {
  const data = SETTINGS_GROUPS.find((g) => g.id === 'data');
  assert.ok(data.rows.some((r) => r.id === 'privacy' && r.action === 'privacy'));
  const text = PRIVACY_SECTIONS.flatMap((s) => s.paras).join(' ');
  for (const words of ['Share play data', 'message', 'kind', 'game version', 'screen size', 'input type', 'floor, layout and spirit', 'random id', 'Email addresses are removed', 'no connection']) {
    assert.ok(text.includes(words), `privacy text names "${words}"`);
  }
});

// --- Sheets collector (tools/telemetry-sheets/Code.gs) in a sandbox ---

function fakeSheets(readKey = 'k123') {
  const books = {};
  const sheet = (name) => {
    const rows = [];
    const s = {
      rows,
      appendRow: (r) => rows.push(r.slice()),
      setFrozenRows: () => {},
      getLastRow: () => rows.length,
      getLastColumn: () => rows.reduce((n, r) => Math.max(n, r.length), 0),
      getRange: (row, col, n, w) => ({
        setNumberFormat: () => {},
        setValues: (vals) => {
          // Sheets reads a leading ' as "this is text" and drops it.
          vals.forEach((v, i) => { rows[row - 1 + i] = v.map((x) => (typeof x === 'string' && x[0] === "'" ? x.slice(1) : x)); });
        },
        getValues: () => rows.slice(row - 1, row - 1 + n).map((r) => {
          const out = r.map(String);
          while (out.length < w) out.push('');
          return out;
        }),
      }),
    };
    books[name] = s;
    return s;
  };
  const written = [];
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => books[n] || null, insertSheet: (n) => sheet(n) }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ getAll: () => ({}), putAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'READ_KEY' ? readKey : null) }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
    },
    written,
  };
  vm.runInNewContext(readFileSync(new URL('../tools/telemetry-sheets/Code.gs', import.meta.url), 'utf8'), ctx);
  return { ctx, books, call: (fn, e) => JSON.parse(ctx[fn](e).text) };
}

const env = (id, type, data, extra = {}) => ({
  v: 1, id, type, dv: 1, ts: 1760000000000, seq: 0, install: 'i_1', session: 's_1', run: null, app: '0.9.9', logic: 5, data, ...extra,
});

test('sheets collector: feedback also lands on a readable feedback tab; formulas stay text', () => {
  const { books, call } = fakeSheets();
  const note = env('e_2', 'feedback', {
    kind: 'bug', message: '=HYPERLINK("x") the fold broke', from: 'pause',
    context: { floor: 3, templateId: 'f3-vault', variant: { transform: 'id', picks: [] }, spirit: 'frog', turn: 4 },
    device: { viewport: { w: 390, h: 844 }, orientation: 'portrait', pointer: 'coarse', standalone: true },
  });
  const r = call('doPost', { postData: { contents: JSON.stringify({ v: 1, events: [env('e_1', 'floor.end', { a: 1 }), note] }) } });
  assert.equal(r.status, 200);
  assert.equal(books.events.rows.length, 3, 'header + both events');
  const fb = books.feedback.rows;
  assert.equal(fb.length, 2);
  const row = Object.fromEntries(fb[0].map((h, i) => [h, fb[1][i]]));
  assert.equal(row.kind, 'bug');
  assert.equal(row.message, '=HYPERLINK("x") the fold broke', 'written as text (quote prefix), read back as typed');
  assert.equal(row.layout, 'f3-vault');
  assert.equal(row.spirit, 'frog');
  assert.equal(row.variant, '{"transform":"id","picks":[]}');
  assert.equal(row.device, '390x844 portrait coarse installed');
  assert.equal(row.id, 'e_2');
});

test('sheets collector: keyed read returns events in pages; a wrong or missing key is refused', async () => {
  const { call } = fakeSheets();
  const events = [1, 2, 3, 4, 5].map((i) => env(`e_${i}`, i === 3 ? 'feedback' : 'floor.end', { i }));
  call('doPost', { postData: { contents: JSON.stringify({ v: 1, events }) } });
  assert.equal(call('doGet', { parameter: {} }).message, 'foldwork collector ok');
  assert.equal(call('doGet', { parameter: { key: 'wrong' } }).status, 403);
  const page = call('doGet', { parameter: { key: 'k123', limit: '2' } });
  assert.deepEqual(page.events.map((e) => e.id), ['e_1', 'e_2']);
  assert.equal(page.more, true);
  assert.deepEqual(page.events[0].data, { i: 1 });
  assert.equal(page.events[0].ts, 1760000000000);
  assert.equal(page.events[0].run, null);
  assert.deepEqual(call('doGet', { parameter: { key: 'k123', type: 'feedback' } }).events.map((e) => e.id), ['e_3']);
  // tools/fetch-events.js pages through it all.
  const get = async (url) => {
    const q = Object.fromEntries(new URL(url).searchParams);
    return call('doGet', { parameter: q });
  };
  const all = await fetchAll('https://x.example/exec', { key: 'k123', limit: 2 }, get);
  assert.deepEqual(all.events.map((e) => e.id), ['e_1', 'e_2', 'e_3', 'e_4', 'e_5']);
  assert.equal(all.next, 6);
  assert.ok(pageUrl('https://x.example/exec', { key: 'k', type: 'feedback' }).includes('type=feedback'));
});

test('sheets collector: reading is off until READ_KEY is set', () => {
  const { call } = fakeSheets(null);
  assert.equal(call('doGet', { parameter: { key: 'anything' } }).status, 403);
});
