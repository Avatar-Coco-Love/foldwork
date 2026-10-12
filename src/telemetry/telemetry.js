// Telemetry client: builds event envelopes, queues them (persisted, so
// offline play is kept), and sends them in batches. No DOM here: storage,
// transport, clock and ids are injected, so it runs in tests. The browser
// wiring is telemetry/browser.js; the contract with the backend is
// docs/07-telemetry.md.
//
// The backend never needs to change for new events. Every event has the
// same envelope; what varies lives in `data`, which the backend stores as
// it came. A new event is one track() call; a changed shape bumps that
// event's `dv` (data version) so analysis can tell old from new.
//
//   Envelope = {
//     v,        envelope version (ENVELOPE_VERSION)
//     id,       unique event id (the backend dedupes on it)
//     type,     dotted name, e.g. 'floor.end'
//     dv,       data version for this type (default 1)
//     ts,       client time, ms since epoch
//     seq,      per-session counter (order, gaps = lost events)
//     install,  anonymous random id, kept in localStorage
//     session,  random id per page load
//     run,      current run id, or null
//     app,      APP_VERSION
//     logic,    LOGIC_VERSION (for replaying action logs)
//     data,     anything JSON
//   }
//   Batch (request body) = { v, sent, events: Envelope[] }

export const ENVELOPE_VERSION = 1;
export const INSTALL_KEY = 'foldwork.install';
export const QUEUE_KEY = 'foldwork.telemetry';

/**
 * opts:
 *   endpoint    collector URL ('' = keep events local only)
 *   enabled     player setting; false drops the queue and records nothing
 *   app, logic  versions stamped on every event
 *   storage     localStorage-like ({ getItem, setItem, removeItem }) or null
 *   send(url, body, { beacon }) → Promise<boolean>  transport
 *   sink(envelope)  optional: called for every event (dev console log)
 *   now(), newId(prefix)  clock and id source
 *   setTimer(fn, ms) / clearTimer(handle)
 *   batchSize, flushMs, maxQueue
 */
export function createTelemetry(opts) {
  const {
    endpoint = '', app = '', logic = 0, storage = null, send = null, sink = null,
    now = () => Date.now(), newId = defaultId,
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h),
    batchSize = 25, flushMs = 15000, maxQueue = 500,
  } = opts;
  let enabled = opts.enabled !== false;
  const install = loadInstall(storage, newId);
  const session = newId('s');
  let seq = 0;
  let run = null;
  let queue = enabled ? loadQueue(storage) : [];
  let timer = null;
  let sending = false;

  function persist() {
    try {
      if (!storage) return;
      if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify({ v: ENVELOPE_VERSION, queue }));
      else storage.removeItem(QUEUE_KEY);
    } catch {
      // Full or blocked storage: keep the queue in memory only.
    }
  }

  function schedule() {
    if (timer || !endpoint || !send) return;
    timer = setTimer(() => {
      timer = null;
      flush();
    }, flushMs);
  }

  function track(type, data = {}, { dv = 1 } = {}) {
    if (!enabled || typeof type !== 'string' || !type) return null;
    const ev = {
      v: ENVELOPE_VERSION,
      id: newId('e'),
      type,
      dv,
      ts: now(),
      seq: seq++,
      install,
      session,
      run,
      app,
      logic,
      data,
    };
    if (sink) sink(ev);
    queue.push(ev);
    if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
    persist();
    if (queue.length >= batchSize) flush();
    else schedule();
    return ev;
  }

  /**
   * Send queued events, a batch at a time. `beacon` asks the transport for
   * a send that survives the page closing. Events leave the queue only
   * once the collector accepted them. Resolves to the number sent.
   */
  async function flush({ beacon = false } = {}) {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    if (!enabled || !endpoint || !send || sending) return 0;
    sending = true;
    let sent = 0;
    try {
      while (queue.length) {
        const batch = queue.slice(0, batchSize);
        const body = JSON.stringify({ v: ENVELOPE_VERSION, sent: now(), events: batch });
        let ok = false;
        try {
          ok = await send(endpoint, body, { beacon });
        } catch {
          ok = false;
        }
        if (!ok) break; // offline or rejected: keep them for next time
        const ids = new Set(batch.map((e) => e.id));
        queue = queue.filter((e) => !ids.has(e.id));
        sent += batch.length;
        persist();
      }
    } finally {
      sending = false;
    }
    if (queue.length) schedule();
    return sent;
  }

  return {
    track,
    flush,
    get install() {
      return install;
    },
    get session() {
      return session;
    },
    get run() {
      return run;
    },
    /** Tag later events with a run id (null between runs). */
    setRun(id) {
      run = id || null;
    },
    get enabled() {
      return enabled;
    },
    /** Turning it off also deletes anything not yet sent. */
    setEnabled(value) {
      enabled = !!value;
      if (!enabled) {
        queue = [];
        persist();
        if (timer) clearTimer(timer);
        timer = null;
      }
    },
    /** Copy of the unsent events (tests, debugging). */
    get queue() {
      return queue.slice();
    },
  };
}

function loadInstall(storage, newId) {
  try {
    const saved = storage && storage.getItem(INSTALL_KEY);
    if (saved) return saved;
    const id = newId('i');
    if (storage) storage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return newId('i');
  }
}

function loadQueue(storage) {
  try {
    const text = storage && storage.getItem(QUEUE_KEY);
    const saved = text ? JSON.parse(text) : null;
    return saved && saved.v === ENVELOPE_VERSION && Array.isArray(saved.queue) ? saved.queue : [];
  } catch {
    return [];
  }
}

/** Random id with a prefix. Ids are not game logic, so no seeded RNG. */
export function defaultId(prefix) {
  const c = globalThis.crypto;
  const raw = c && c.randomUUID ? c.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${raw.slice(0, 20)}`;
}
