// Reference telemetry collector: zero dependencies, schema-free.
// Usage: node tools/telemetry-collector.js [port] [dataDir]
//        (defaults: 8787, ./telemetry-data). Then play with
//        ?telemetry=http://localhost:8787/collect
//
// It implements the whole backend contract in docs/07-telemetry.md:
// accept a batch, sanity-check the envelope, store every event as one JSON
// line, and never look inside `data`. New event types and new fields need
// no change here. A production backend does the same into a database (see
// the doc for a one-table schema); this file is the executable spec.
import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const DIR = resolve(process.argv[3] || process.env.TELEMETRY_DIR || 'telemetry-data');
const MAX_BODY = 256 * 1024;
const seen = new Set(); // recent event ids, for retry dedupe (per process)

/**
 * Validate a batch. Returns the events to store (each stamped with the
 * receive time) or throws. Only the envelope is checked; `data` is opaque.
 */
export function acceptBatch(text, receivedAt = Date.now()) {
  const batch = JSON.parse(text);
  if (!batch || !Array.isArray(batch.events)) throw new Error('missing events');
  return batch.events
    .filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string' && e.id.length <= 64 && e.type.length <= 64)
    .map((e) => ({ ...e, received: receivedAt }));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function store(events) {
  const fresh = events.filter((e) => !seen.has(e.id));
  for (const e of fresh) seen.add(e.id);
  if (seen.size > 100000) seen.clear();
  if (!fresh.length) return 0;
  const day = new Date().toISOString().slice(0, 10);
  await appendFile(join(DIR, `events-${day}.ndjson`), fresh.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return fresh.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(DIR, { recursive: true });
  createServer(async (req, res) => {
    cors(res);
    try {
      if (req.method === 'OPTIONS') return res.writeHead(204).end();
      if (req.method === 'GET' && req.url === '/health') return res.writeHead(200).end('ok');
      if (req.method !== 'POST') return res.writeHead(405).end();
      const events = acceptBatch(await readBody(req));
      const n = await store(events);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ stored: n }));
    } catch (err) {
      res.writeHead(err.status || 400).end(String(err.message || err));
    }
  }).listen(PORT, () => console.log(`Telemetry collector: http://localhost:${PORT}/collect → ${DIR}`));
}
