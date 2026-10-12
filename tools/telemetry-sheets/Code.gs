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

var SHEET = 'events';
var HEADERS = ['received', 'id', 'type', 'dv', 'ts', 'seq', 'install', 'session', 'run', 'app', 'logic', 'data'];
var MAX_BODY = 256 * 1024;
var CELL = 45000; // characters per data cell (the hard limit is 50,000)
var SEEN_SECONDS = 6 * 60 * 60; // retry dedupe window

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

// A quick check that the deployment is live (open the /exec URL).
function doGet() {
  return reply(200, 'foldwork collector ok');
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
    });
    if (!rows.length) return 0;
    rows = rows.map(function (r) {
      while (r.length < width) r.push('');
      return r.map(function (v) { return v === undefined || v === null ? '' : v; });
    });
    var start = sheet.getLastRow() + 1;
    var range = sheet.getRange(start, 1, rows.length, width);
    range.setNumberFormat('@'); // plain text: no date or number guessing
    range.setValues(rows);
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

function reply(status, message) {
  // Apps Script can't set HTTP status codes (it always answers 200), so the
  // status goes in the JSON body. The game retries a batch only when the
  // body's status is 5xx (src/telemetry/browser.js send()).
  return ContentService.createTextOutput(JSON.stringify({ status: status, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
