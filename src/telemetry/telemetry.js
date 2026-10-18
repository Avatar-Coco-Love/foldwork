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

/** A trim tier for events that are never dropped to make room. */
export const NEVER_TRIM = Infinity;

/**
 * Which events go first when the queue is over its caps (long offline
 * stretches): the lowest tier, oldest first. Types not listed are
 * DEFAULT_TRIM_TIER. NEVER_TRIM events are kept whatever the caps say
 * (feedback: the player wrote it on purpose).
 */
export const TRIM_TIERS = Object.freeze({
  // Noise: derivable, or only interesting in bulk.
  'session.hide': 0,
  'screen.view': 0,
  'hint.dismiss': 0,
  // Context around a floor; floor.end carries the floor tag and the log.
  'hint.show': 1,
  'hint.ask': 1,
  'floor.start': 1,
  'floor.rewind': 1,
  'floor.takeback': 1,
  'relic.offer': 1,
  'settings.change': 1,
  'share': 1,
  'error': 1,
  // The records analysis is built on: replayable floors, run outcomes.
  'floor.end': 3,
  'run.end': 3,
  // Written by the player (9j).
  'feedback': NEVER_TRIM,
});
export const DEFAULT_TRIM_TIER = 2;

/**
 * Event types recorded and sent even while play data is off (`enabled`
 * false): the player wrote them on purpose each time (OPEN-QUESTIONS
 * "Offline: does feedback follow 'Share play data'?"). With play data off
 * they carry no install id, so they tie to nothing else.
 */
export const ALWAYS_SEND = Object.freeze(['feedback']);

/** Trim tier of an event type under `tiers` (TRIM_TIERS shape). */
export function trimTier(type, tiers = TRIM_TIERS) {
  return Object.prototype.hasOwnProperty.call(tiers, type) ? tiers[type] : DEFAULT_TRIM_TIER;
}

/**
 * The queue cut down to at most `maxCount` events and `maxBytes` (sum of
 * `sizeOf(event)`), dropping the lowest trim tier first and, within a tier,
 * the oldest. NEVER_TRIM events always stay, so the result can still be
 * over the caps when they alone are. Order is kept. Pure.
 */
export function trimQueue(queue, { maxCount = Infinity, maxBytes = Infinity, tiers = TRIM_TIERS, sizeOf = eventBytes } = {}) {
  let count = queue.length;
  let bytes = maxBytes === Infinity ? 0 : queue.reduce((n, e) => n + sizeOf(e), 0);
  const over = () => count > maxCount || bytes > maxBytes;
  if (!over()) return queue;
  // Drop candidates: lowest tier first, then oldest (queue order).
  const order = queue
    .map((e, i) => ({ i, tier: trimTier(e.type, tiers) }))
    .filter((c) => c.tier !== NEVER_TRIM)
    .sort((a, b) => a.tier - b.tier || a.i - b.i);
  const drop = new Set();
  for (const c of order) {
    if (!over()) break;
    drop.add(c.i);
    count -= 1;
    if (maxBytes !== Infinity) bytes -= sizeOf(queue[c.i]);
  }
  return queue.filter((_, i) => !drop.has(i));
}

/** An event's size as stored (JSON characters; one per byte for ASCII). */
export function eventBytes(ev) {
  return JSON.stringify(ev).length;
}

/**
 * opts:
 *   endpoint    collector URL ('' = keep events local only)
 *   enabled     player setting; false drops the queue and records nothing
 *               but `alwaysTypes`
 *   app, logic  versions stamped on every event
 *   storage     localStorage-like ({ getItem, setItem, removeItem }) or null
 *   send(url, body, { beacon }) → Promise<boolean>  transport
 *   sink(envelope)  optional: called for every event (dev console log)
 *   now(), newId(prefix)  clock and id source
 *   online()    false while the device is known to be offline: nothing is
 *               sent (the queue waits for the next flush)
 *   setTimer(fn, ms) / clearTimer(handle)
 *   batchSize, flushMs
 *   maxQueue, maxBytes   queue caps; over them, trimQueue() by `trimTiers`
 *   maxBackoffMs  after failed sends, retries wait flushMs, then twice
 *               that, and so on up to this
 *   alwaysTypes event types kept and sent while disabled (ALWAYS_SEND);
 *               [] makes "disabled" mean nothing at all
 */
export function createTelemetry(opts) {
  const {
    endpoint = '', app = '', logic = 0, storage = null, send = null, sink = null,
    now = () => Date.now(), newId = defaultId,
    online = () => true,
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h),
    batchSize = 25, flushMs = 15000, maxQueue = 500, maxBytes = Infinity, maxBackoffMs = 600000,
    trimTiers = TRIM_TIERS, alwaysTypes = ALWAYS_SEND,
  } = opts;
  let enabled = opts.enabled !== false;
  const always = new Set(alwaysTypes);
  const isAlways = (ev) => always.has(ev.type);
  // Disabled clients write nothing but ALWAYS_SEND events: no install id,
  // and an earlier session's queue keeps only those.
  let install = enabled ? loadInstall(storage, newId) : null;
  const session = newId('s');
  let seq = 0;
  let run = null;
  let queue = loadQueue(storage);
  let timer = null;
  let sending = false;
  // Backoff after failed sends: no send before retryAt.
  let failures = 0;
  let retryAt = 0;
  // Stored size of each queued event, measured once.
  const sizes = new WeakMap();
  const sizeOf = (ev) => {
    let n = sizes.get(ev);
    if (n === undefined) sizes.set(ev, (n = eventBytes(ev)));
    return n;
  };
  trim(); // a queue saved under larger caps
  if (!enabled) {
    queue = queue.filter(isAlways);
    if (queue.length) persist();
    else clearQueue(storage);
  }

  function trim(caps = { maxCount: maxQueue, maxBytes }) {
    queue = trimQueue(queue, { ...caps, tiers: trimTiers, sizeOf });
  }

  function persist() {
    if (!storage) return;
    try {
      if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify({ v: ENVELOPE_VERSION, queue }));
      else storage.removeItem(QUEUE_KEY);
    } catch (err) {
      // Full storage (saves and settings share it): make room by trimming
      // to half the bytes and try once more. Blocked storage keeps the
      // queue in memory only, untrimmed.
      if (!isQuotaError(err)) return;
      try {
        const bytes = queue.reduce((n, e) => n + sizeOf(e), 0);
        trim({ maxCount: maxQueue, maxBytes: Math.floor(Math.min(bytes, maxBytes) / 2) });
        if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify({ v: ENVELOPE_VERSION, queue }));
      } catch {
        // Still no room.
      }
    }
  }

  function schedule() {
    if (timer || !endpoint || !send) return;
    timer = setTimer(() => {
      timer = null;
      flush();
    }, Math.max(flushMs, retryAt - now()));
  }

  function failed() {
    failures += 1;
    retryAt = now() + Math.min(maxBackoffMs, flushMs * 2 ** (failures - 1));
  }

  function track(type, data = {}, { dv = 1 } = {}) {
    if (typeof type !== 'string' || !type || (!enabled && !always.has(type))) return null;
    const ev = {
      v: ENVELOPE_VERSION,
      id: newId('e'),
      type,
      dv,
      ts: now(),
      seq: seq++,
      install: enabled ? install : null, // feedback with play data off: no link to it
      session,
      run,
      app,
      logic,
      data,
    };
    if (sink) sink(ev);
    queue.push(ev);
    trim();
    persist();
    if (queue.length >= batchSize) flush();
    else schedule();
    return ev;
  }

  /**
   * Send queued events, a batch at a time. `beacon` asks the transport for
   * a send that survives the page closing. Events leave the queue only
   * once the collector accepted them. Resolves to the number sent.
   *
   * Nothing is sent while offline (a beacon would be "accepted" and lost)
   * or while backing off after failed sends; the queue just waits for the
   * next flush. A beacon is never the retry that finds the endpoint back,
   * since it can't tell: during backoff it is skipped too. Disabled, only
   * ALWAYS_SEND events are queued, so only they go.
   */
  async function flush({ beacon = false } = {}) {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    if (!endpoint || !send || sending || !queue.length) return 0;
    if (!isOnline() || now() < retryAt) {
      schedule();
      return 0;
    }
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
        if (!ok) {
          failed(); // offline or rejected: keep them for next time
          break;
        }
        failures = 0;
        retryAt = 0;
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

  function isOnline() {
    try {
      return online() !== false;
    } catch {
      return true;
    }
  }

  return {
    track,
    flush,
    /**
     * The connection is back (the browser's `online` event): forget the
     * backoff and send now.
     */
    reconnected() {
      failures = 0;
      retryAt = 0;
      return flush();
    },
    /** Time of the next allowed send after failures (0: none pending). */
    get retryAt() {
      return retryAt;
    },
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
    /**
     * Turning it off also deletes anything not yet sent, except
     * ALWAYS_SEND events (feedback waiting to go).
     */
    setEnabled(value) {
      enabled = !!value;
      if (enabled && !install) install = loadInstall(storage, newId);
      if (!enabled) {
        queue = queue.filter(isAlways);
        persist();
        if (!queue.length && timer) {
          clearTimer(timer);
          timer = null;
        }
      }
    },
    /** Copy of the unsent events (tests, debugging). */
    get queue() {
      return queue.slice();
    },
  };
}

/** localStorage's "full" error, across browsers. */
export function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
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

function clearQueue(storage) {
  try {
    if (storage) storage.removeItem(QUEUE_KEY);
  } catch {
    // Blocked storage: nothing was saved either.
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
