// Foldwork telemetry collector for Google Sheets (Google Apps Script).
// Setup steps: docs/07-telemetry.md, "Google Sheets backend".
//
// It implements the backend contract in docs/07-telemetry.md, like the
// reference tools/telemetry-collector.js: accept a batch, check only the
// envelope, store one row per event with `data` as raw JSON, never reject
// unknown types or fields, ignore duplicate ids. New events need no change
// here.
//
// Columns (sheet "events"):
//   received, id, type, dv, ts, seq, install, session, run, app, logic, data
// A cell holds at most 50,000 characters, so a longer `data` continues in
// the columns after `data` (tools/sheet-to-ndjson.js joins them back).
//
// Feedback (9j): every `feedback` event is stored in "events" like any
// other, and also copied as a readable row to the sheet "feedback"
// (FEEDBACK_HEADERS). Analysis reads "events"; "feedback" is for people.
//
// Reading events back (READ_KEY): GET <exec URL>?key=<READ_KEY> returns
// stored events as JSON, so a session can fetch them instead of a CSV
// export (tools/fetch-events.js). Set READ_KEY under Project Settings →
// Script properties; with none set, reading is off. Params: `after` (a
// row number from a previous reply's `next`; default 1, the header),
// `limit` (rows, default 2000, at most 5000), `type` (only that event
// type). Reply: { status, events, next, more }.

var SHEET = 'events';
var HEADERS = ['received', 'id', 'type', 'dv', 'ts', 'seq', 'install', 'session', 'run', 'app', 'logic', 'data'];
var MAX_BODY = 256 * 1024;
var CELL = 45000; // characters per data cell (the hard limit is 50,000)
var SEEN_SECONDS = 6 * 60 * 60; // retry dedupe window
var FEEDBACK_SHEET = 'feedback';
var FEEDBACK_HEADERS = ['received', 'sent', 'kind', 'message', 'from', 'floor', 'layout', 'variant', 'spirit', 'turn', 'app', 'device', 'install', 'id'];
var READ_LIMIT = 2000;
var READ_MAX = 5000;

function doPost(e) {
  var batch;
  try {
    var text = e && e.postData ? e.postData.contents : '';
    if (!text || text.length > MAX_BODY) return reply(413, 'too large or empty');
    batch = JSON.parse(text);
  } catch (err) {
    return reply(400, 'not JSON');
  }
  if (!batch || !Array.isArray(batch.events)) return reply(400, 'missing events');
  try {
    return reply(200, 'stored ' + store(batch.events));
  } catch (err) {
    // Busy (lock timeout) or a Sheets hiccup: 503 tells the game to keep
    // the batch and retry later.
    return reply(503, 'try again');
  }
}

// Without a key: a quick check that the deployment is live (open the
// /exec URL). With ?key=: read events back (see the header).
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.key) return reply(200, 'foldwork collector ok');
  var want = PropertiesService.getScriptProperties().getProperty('READ_KEY');
  if (!want || p.key !== want) return reply(403, 'bad key');
  try {
    return json(readEvents(p));
  } catch (err) {
    return reply(503, 'try again');
  }
}

function readEvents(p) {
  var sheet = eventsSheet();
  var last = sheet.getLastRow();
  var after = Math.max(1, parseInt(p.after, 10) || 1);
  var limit = Math.min(READ_MAX, Math.max(1, parseInt(p.limit, 10) || READ_LIMIT));
  var count = Math.min(limit, last - after);
  var events = [];
  if (count > 0) {
    var rows = sheet.getRange(after + 1, 1, count, sheet.getLastColumn()).getValues();
    rows.forEach(function (r) {
      if (p.type && r[2] !== p.type) return;
      var data = r.slice(HEADERS.length - 1).join('');
      var parsed = null;
      try { parsed = JSON.parse(data); } catch (err) { parsed = data; }
      events.push({
        received: r[0], id: r[1], type: r[2], dv: num(r[3]), ts: num(r[4]), seq: num(r[5]),
        install: r[6] || null, session: r[7] || null, run: r[8] || null, app: r[9], logic: num(r[10]),
        data: parsed,
      });
    });
  }
  var next = after + Math.max(0, count);
  return { status: 200, events: events, next: next, more: next < last };
}

function num(v) {
  var n = Number(v);
  return v === '' || isNaN(n) ? null : n;
}

function store(events) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = eventsSheet();
    var cache = CacheService.getScriptCache();
    var ids = events.map(function (ev) { return ev && typeof ev.id === 'string' ? ev.id : ''; });
    var seen = ids.length ? cache.getAll(ids.filter(String)) : {};
    var received = new Date().toISOString();
    var rows = [];
    var notes = [];
    var width = HEADERS.length;
    var fresh = {};
    events.forEach(function (ev) {
      if (!ev || typeof ev.id !== 'string' || typeof ev.type !== 'string') return;
      if (ev.id.length > 64 || ev.type.length > 64) return;
      if (seen[ev.id] || fresh[ev.id]) return; // a retry of a stored event
      fresh[ev.id] = '1';
      var row = [received, ev.id, ev.type, ev.dv, ev.ts, ev.seq, ev.install, ev.session, ev.run, ev.app, ev.logic];
      var data = JSON.stringify(ev.data === undefined ? null : ev.data);
      for (var i = 0; i < data.length || i === 0; i += CELL) row.push(data.slice(i, i + CELL));
      width = Math.max(width, row.length);
      rows.push(row);
      if (ev.type === 'feedback') notes.push(feedbackRow(received, ev));
    });
    if (!rows.length) return 0;
    rows = rows.map(function (r) {
      while (r.length < width) r.push('');
      return r.map(cell);
    });
    var start = sheet.getLastRow() + 1;
    var range = sheet.getRange(start, 1, rows.length, width);
    range.setNumberFormat('@'); // plain text: no date or number guessing
    range.setValues(rows);
    if (notes.length) {
      var fb = feedbackSheet();
      var fbRange = fb.getRange(fb.getLastRow() + 1, 1, notes.length, FEEDBACK_HEADERS.length);
      fbRange.setNumberFormat('@');
      fbRange.setValues(notes);
    }
    cache.putAll(fresh, SEEN_SECONDS);
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

function eventsSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET);
  if (!sheet) {
    sheet = book.insertSheet(SHEET);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// One readable row per feedback note (FEEDBACK_HEADERS).
function feedbackRow(received, ev) {
  var d = ev.data && typeof ev.data === 'object' ? ev.data : {};
  var c = d.context && typeof d.context === 'object' ? d.context : {};
  var dev = d.device && typeof d.device === 'object' ? d.device : {};
  var size = dev.viewport ? dev.viewport.w + 'x' + dev.viewport.h : '';
  var device = [size, dev.orientation, dev.pointer, dev.standalone ? 'installed' : ''].filter(String).join(' ');
  var sent = typeof ev.ts === 'number' ? new Date(ev.ts).toISOString() : '';
  var row = [received, sent, d.kind, String(d.message || '').slice(0, CELL), d.from,
    c.floor, c.templateId, c.variant, c.spirit, c.turn, ev.app, device, ev.install, ev.id];
  // Objects (a template's variant) as JSON; a cell takes only plain values.
  row = row.map(function (v) { return v !== null && typeof v === 'object' ? JSON.stringify(v) : v; });
  return row.map(cell);
}

// A value as written: empty for none, and text that Sheets would read as a
// formula (=, +, -, @ first: feedback is free text) kept as text.
function cell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function feedbackSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(FEEDBACK_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(FEEDBACK_SHEET);
    sheet.appendRow(FEEDBACK_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function reply(status, message) {
  // Apps Script can't set HTTP status codes (it always answers 200), so the
  // status goes in the JSON body. The game retries a batch only when the
  // body's status is 5xx (src/telemetry/browser.js send()).
  return ContentService.createTextOutput(JSON.stringify({ status: status, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
