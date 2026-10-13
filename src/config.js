// Build-wide constants. Edit here; nothing else hard-codes them.

/** Shown to players and sent with telemetry. Bump with each release. */
export const APP_VERSION = '0.4.0';

/** Back to Projects (title screen, playtest P3): the author's project page. */
export const PROJECTS_URL = 'https://avatar-coco-love.github.io/';

/**
 * Game-rule version. Bump it whenever a rule change would make an old
 * action log replay differently (core/replay.js), so analysis replays each
 * log with matching rules, or skips it.
 */
export const LOGIC_VERSION = 2; // 2: bumps only startle the Great Crane; a winning fold stops resolving

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
  collect: false,
  endpoint: '',
  batchSize: 25, // events per request
  flushMs: 15000, // send at most this long after an event
  maxQueue: 500, // oldest events are dropped beyond this (offline play)
  maxErrors: 20, // error events per session
});
