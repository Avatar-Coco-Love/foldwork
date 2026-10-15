// Build-wide constants. Edit here; nothing else hard-codes them.

import { LATEST_VERSION } from './core/changelog.js';

/**
 * Shown to players and sent with telemetry: the newest What's new entry
 * (core/changelog.js), so adding that entry is the version bump.
 */
export const APP_VERSION = LATEST_VERSION;

/** Back to Projects (title screen, playtest P3): the author's project page. */
export const PROJECTS_URL = 'https://avatar-coco-love.github.io/';

/**
 * Game-rule version. Bump it whenever a rule change would make an old
 * action log replay differently (core/replay.js), so analysis replays each
 * log with matching rules, or skips it.
 */
export const LOGIC_VERSION = 5; // 3: Lockjaw opens its jaws a turn before it bites; 4: Crane phases 2-3; 5: lifting a flap, Wasp sees up (playtest round 2)

/**
 * Telemetry (src/telemetry, docs/07-telemetry.md).
 *   collect   master switch. false: nothing is recorded at all (no events,
 *             no local queue, no install id) and the "Share play data"
 *             toggle is hidden. Flip to true (with an endpoint) once we're
 *             ready to collect from playtests. Dev overrides still work:
 *             `?telemetry=console` or a localhost collector URL.
 *   endpoint  collector URL (e.g. the Google Apps Script web app in
 *             tools/telemetry-sheets/); empty means nothing leaves the
 *             device.
 */
export const TELEMETRY = Object.freeze({
  collect: true, // on for playtests (OPEN-QUESTIONS "Telemetry consent")
  endpoint: 'https://script.google.com/macros/s/AKfycbz9Eua5ZSykcj-1NO6uFII-7eTSbeRRQU1WPf-NgNFwtqnGwBtCLnK66LCoPI8IqLq3Ew/exec',
  batchSize: 25, // events per request
  flushMs: 15000, // send at most this long after an event
  // Queue caps for offline play (9i, tools/queue-size.js): a full run is
  // about 65 events and 30 KB, so a week of 3 runs a day is about 1,400
  // events and 640 KB. Over a cap, low-value events go first (telemetry.js
  // TRIM_TIERS). 1 MB leaves most of the origin's ~5 MB localStorage
  // (shared with saves, and with other projects on the same github.io
  // origin) free.
  maxQueue: 2000,
  maxBytes: 1000000,
  maxBackoffMs: 600000, // failed sends retry after 15 s, 30 s, ... up to 10 min
  maxErrors: 20, // error events per session
});
