// Fetches stored events from the Google Sheets collector's keyed read
// (tools/telemetry-sheets/Code.gs, doGet with ?key=) and prints them as
// NDJSON, the same shape tools/sheet-to-ndjson.js writes from a CSV
// export. Usage:
//   FOLDWORK_READ_KEY=... node tools/fetch-events.js [--type feedback] [--after N] > events.ndjson
//   node tools/replay-check.js events.ndjson
// The endpoint is TELEMETRY.endpoint (src/config.js) unless --url is given.
// Pages through the sheet (`next` / `more`) until it has every row; the
// last row read goes to stderr, to pass as --after next time.

import { TELEMETRY } from '../src/config.js';

export function pageUrl(base, { key, after = 1, limit = 2000, type = '' }) {
  const u = new URL(base);
  u.searchParams.set('key', key);
  u.searchParams.set('after', String(after));
  u.searchParams.set('limit', String(limit));
  if (type) u.searchParams.set('type', type);
  return u.toString();
}

/** Every event after row `after`, a page at a time. `get(url)` → reply JSON. */
export async function fetchAll(base, opts, get) {
  const events = [];
  let after = opts.after || 1;
  for (;;) {
    const reply = await get(pageUrl(base, { ...opts, after }));
    if (!reply || reply.status !== 200 || !Array.isArray(reply.events)) {
      throw new Error(`collector said ${reply ? `${reply.status} ${reply.message || ''}` : 'nothing'}`);
    }
    events.push(...reply.events);
    if (!reply.more || reply.next <= after) return { events, next: reply.next };
    after = reply.next;
  }
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.FOLDWORK_READ_KEY || arg('key');
  if (!key) {
    console.error('Set FOLDWORK_READ_KEY (the Script property READ_KEY).');
    process.exit(1);
  }
  const base = arg('url', TELEMETRY.endpoint);
  const get = async (url) => {
    const res = await fetch(url, { redirect: 'follow' });
    return JSON.parse(await res.text());
  };
  const { events, next } = await fetchAll(base, {
    key, after: Number(arg('after', '1')) || 1, type: arg('type'),
  }, get);
  for (const ev of events) process.stdout.write(`${JSON.stringify(ev)}\n`);
  console.error(`${events.length} events; next --after ${next}`);
}
