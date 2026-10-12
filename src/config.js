// Build-wide constants. Edit here; nothing else hard-codes them.

/** Shown to players and sent with telemetry. Bump with each release. */
export const APP_VERSION = '0.3.2';

/**
 * Game-rule version. Bump it whenever a rule change would make an old
 * action log replay differently (core/replay.js), so analysis replays each
 * log with matching rules, or skips it.
 */
export const LOGIC_VERSION = 1;

/**
 * Telemetry (src/telemetry, docs/07-telemetry.md). `endpoint` is the
 * collector URL; empty means nothing leaves the device (events are still
 * built, and `?telemetry=console` logs them for development).
 */
export const TELEMETRY = Object.freeze({
  endpoint: '',
  batchSize: 25, // events per request
  flushMs: 15000, // send at most this long after an event
  maxQueue: 500, // oldest events are dropped beyond this (offline play)
  maxErrors: 20, // error events per session
});
