// Browser wiring for the telemetry client: transport (fetch / sendBeacon),
// device context, input-source tracking, error capture and page-exit
// flushing. The only telemetry module that touches the DOM.

import { createTelemetry } from './telemetry.js';
import { APP_VERSION, LOGIC_VERSION, TELEMETRY } from '../config.js';

/**
 * Whether telemetry records anything, given the player's "Share play data"
 * setting (`shareOn`) and the `?telemetry=` dev override. Nothing is
 * recorded while TELEMETRY.collect is false, unless a developer asks for it
 * with `?telemetry=console` or a localhost collector URL.
 */
export function telemetryActive(shareOn, override = '') {
  if (override === 'off') return false;
  if (override === 'console' || isLocalUrl(override)) return true;
  return TELEMETRY.collect && !!shareOn;
}

/**
 * Create the app's telemetry client. `override` is the `?telemetry=` dev
 * param: 'console' logs every event, 'off' disables, and a localhost URL
 * replaces the endpoint (for a local collector, tools/telemetry-collector.js).
 */
export function setupTelemetry({ enabled, override = '' }) {
  const endpoint = endpointFor(override);
  const telemetry = createTelemetry({
    endpoint,
    enabled: telemetryActive(enabled, override),
    app: APP_VERSION,
    logic: LOGIC_VERSION,
    storage: safeStorage(),
    send,
    sink: override === 'console' ? (ev) => console.info('[telemetry]', ev.type, ev) : null,
    batchSize: TELEMETRY.batchSize,
    flushMs: TELEMETRY.flushMs,
    maxQueue: TELEMETRY.maxQueue,
  });

  // Input source of the latest pointer or key press, so an action can be
  // tagged with how it was made (input parity, docs/04).
  let lastInput = 'unknown';
  window.addEventListener('pointerdown', (e) => { lastInput = e.pointerType || 'pointer'; }, { capture: true, passive: true });
  window.addEventListener('keydown', () => { lastInput = 'key'; }, { capture: true, passive: true });

  let errors = 0;
  const onError = (data) => {
    if (errors++ < TELEMETRY.maxErrors) telemetry.track('error', data);
  };
  window.addEventListener('error', (e) => onError({
    message: String(e.message || '').slice(0, 300),
    source: String(e.filename || '').split('/').pop(),
    line: e.lineno || 0,
    col: e.colno || 0,
    stack: String((e.error && e.error.stack) || '').slice(0, 1500),
  }));
  window.addEventListener('unhandledrejection', (e) => onError({
    message: String((e.reason && e.reason.message) || e.reason || '').slice(0, 300),
    stack: String((e.reason && e.reason.stack) || '').slice(0, 1500),
    rejection: true,
  }));

  // Leaving or backgrounding the page: send what's queued in a way that
  // survives the page closing.
  const started = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    telemetry.track('session.hide', { ms: Date.now() - started });
    telemetry.flush({ beacon: true });
  });
  window.addEventListener('online', () => telemetry.flush());

  return {
    telemetry,
    inputSource: () => lastInput,
    /** Device and display context, sent once per session. */
    deviceInfo() {
      const mq = (q) => window.matchMedia(q).matches;
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        screen: { w: screen.width, h: screen.height },
        dpr: window.devicePixelRatio || 1,
        orientation: mq('(orientation: landscape)') ? 'landscape' : 'portrait',
        pointer: mq('(pointer: coarse)') ? 'coarse' : mq('(pointer: fine)') ? 'fine' : 'none',
        hover: mq('(hover: hover)'),
        touchPoints: navigator.maxTouchPoints || 0,
        reducedMotion: mq('(prefers-reduced-motion: reduce)'),
        colorScheme: mq('(prefers-color-scheme: dark)') ? 'dark' : 'light',
        lang: navigator.language || '',
        tzOffset: new Date().getTimezoneOffset(),
        ua: String(navigator.userAgent || '').slice(0, 250),
        standalone: mq('(display-mode: standalone)'),
      };
    },
  };
}

function isLocalUrl(text) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(text);
}

function endpointFor(override) {
  return isLocalUrl(override) ? override : TELEMETRY.endpoint;
}

function safeStorage() {
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * POST a batch. text/plain keeps it a CORS "simple request" (no preflight)
 * and is what sendBeacon sends anyway; the collector parses the JSON.
 */
async function send(url, body, { beacon }) {
  if (beacon && navigator.sendBeacon) {
    return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
  }
  if (typeof fetch !== 'function') return false;
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: body.length < 60000,
    credentials: 'omit',
    mode: 'cors',
  });
  if (!res.ok) return false;
  // Collectors that can't set HTTP status codes (the Google Apps Script one,
  // tools/telemetry-sheets/) answer 200 with { status } in the body: 5xx
  // there means "busy, send again later".
  try {
    const reply = JSON.parse(await res.text());
    return !(reply && typeof reply.status === 'number' && reply.status >= 500);
  } catch {
    return true; // no JSON body: the HTTP status said it all
  }
}
