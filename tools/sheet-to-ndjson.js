// Turns a CSV export of the Google Sheets collector (tools/telemetry-sheets/)
// back into event objects, the same shape the reference collector writes
// as NDJSON. Usage:
//   node tools/sheet-to-ndjson.js events.csv > events.ndjson
// tools/replay-check.js reads .csv files directly through readEvents().
//
// Columns: received, id, type, dv, ts, seq, install, session, run, app,
// logic, data, then any overflow cells of a long `data` (joined back).
import { readFileSync } from 'node:fs';

const NUMERIC = new Set(['dv', 'ts', 'seq', 'logic']);

/** RFC 4180 CSV → rows of strings (quoted fields, "" escapes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Sheet rows (header first) → event objects. Rows that don't parse are skipped. */
export function rowsToEvents(rows) {
  const [header, ...body] = rows;
  if (!header) return [];
  const dataAt = header.indexOf('data');
  const out = [];
  for (const row of body) {
    if (!row.some((v) => v !== '')) continue;
    const ev = {};
    header.forEach((name, i) => {
      if (!name || i >= dataAt) return;
      const v = row[i] ?? '';
      ev[name] = NUMERIC.has(name) && v !== '' ? Number(v) : v === '' ? null : v;
    });
    try {
      ev.data = JSON.parse(row.slice(dataAt).join(''));
    } catch {
      continue;
    }
    out.push(ev);
  }
  return out;
}

/** Events from an .ndjson (reference collector) or .csv (Sheets export) file. */
export function readEvents(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.csv')) return rowsToEvents(parseCsv(text));
  return text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    for (const ev of readEvents(file)) process.stdout.write(`${JSON.stringify(ev)}\n`);
  }
}
