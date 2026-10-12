// Player settings, saved in localStorage under `foldwork.settings`.
// normalizeSettings / resolveMotion are pure and tested; load/save take an
// optional storage so tests (and private-mode browsers) never throw.
//
// Phase 7 adds the full settings screen; for now the title screen cycles
// the animation options.

export const SETTINGS_KEY = 'foldwork.settings';
export const SETTINGS_VERSION = 1;

/** Animation speed choices: multiplier on effect durations (higher = faster). */
export const ANIM_SPEEDS = Object.freeze([
  { id: 'slow', name: 'Slow', speed: 0.7 },
  { id: 'normal', name: 'Normal', speed: 1 },
  { id: 'fast', name: 'Fast', speed: 1.6 },
]);

/** Reduced motion: follow the OS setting, or force it on/off. */
export const MOTION_MODES = Object.freeze([
  { id: 'system', name: 'System' },
  { id: 'on', name: 'On' },
  { id: 'off', name: 'Off' },
]);

/** Share anonymous play data (src/telemetry, docs/07-telemetry.md). */
export const TELEMETRY_MODES = Object.freeze([
  { id: 'on', name: 'On' },
  { id: 'off', name: 'Off' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  animSpeed: 'normal',
  reducedMotion: 'system',
  telemetry: 'on',
});

/** Fill defaults and drop unknown values (bad or old saves reset per field). */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if (ANIM_SPEEDS.some((o) => o.id === raw.animSpeed)) s.animSpeed = raw.animSpeed;
  if (MOTION_MODES.some((o) => o.id === raw.reducedMotion)) s.reducedMotion = raw.reducedMotion;
  if (TELEMETRY_MODES.some((o) => o.id === raw.telemetry)) s.telemetry = raw.telemetry;
  return s;
}

/**
 * Effective motion options for render/fx.js.
 * @returns {{ speed: number, reducedMotion: boolean }}
 */
export function resolveMotion(settings, systemReduced = false) {
  const speed = (ANIM_SPEEDS.find((o) => o.id === settings.animSpeed) || ANIM_SPEEDS[1]).speed;
  const mode = settings.reducedMotion;
  const reducedMotion = mode === 'on' || (mode === 'system' && !!systemReduced);
  return { speed, reducedMotion };
}

/** Next option id in a choices list, wrapping around. */
export function cycleOption(list, id) {
  const i = list.findIndex((o) => o.id === id);
  return list[(i + 1) % list.length].id;
}

export function optionName(list, id) {
  return (list.find((o) => o.id === id) || list[0]).name;
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // access itself can throw (blocked site data)
  }
}

export function loadSettings(storage = defaultStorage()) {
  try {
    const text = storage && storage.getItem(SETTINGS_KEY);
    return normalizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return normalizeSettings(null);
  }
}

/** Returns false if the settings could not be saved (they still apply). */
export function saveSettings(settings, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
