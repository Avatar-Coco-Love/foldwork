// Player settings, saved in localStorage under `foldwork.settings`.
// normalizeSettings / resolveMotion are pure and tested; load/save take an
// optional storage so tests (and private-mode browsers) never throw.
//
// SETTINGS_GROUPS lays out the Settings screen (playtest P3) as data: a
// later phase adds a row here, not mount code.

import { PALETTES, DEFAULT_PALETTE_ID } from '../render/palette.js';

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

/** Color palettes (render/palette.js); every one is colorblind-safe. */
export const PALETTE_OPTIONS = Object.freeze(Object.values(PALETTES).map((p) => ({ id: p.id, name: p.name })));

/** Text size for menus, the HUD and hint cards: a multiplier on font sizes. */
export const TEXT_SIZES = Object.freeze([
  { id: 'normal', name: 'Normal', scale: 1 },
  { id: 'large', name: 'Large', scale: 1.2 },
]);

/** Which side the landscape HUD panel sits on. */
export const HANDS = Object.freeze([
  { id: 'right', name: 'Off' },
  { id: 'left', name: 'On' },
]);

/** Tap-to-confirm folds: a drag stops at its preview until Fold is tapped. */
export const CONFIRM_FOLDS = Object.freeze([
  { id: 'off', name: 'Off' },
  { id: 'on', name: 'On' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  palette: DEFAULT_PALETTE_ID,
  textSize: 'normal',
  animSpeed: 'normal',
  reducedMotion: 'system',
  hand: 'right',
  confirmFolds: 'off',
  telemetry: 'on',
});

/** The settings that are a choice from a list, and the list. */
const CHOICES = Object.freeze({
  palette: PALETTE_OPTIONS,
  textSize: TEXT_SIZES,
  animSpeed: ANIM_SPEEDS,
  reducedMotion: MOTION_MODES,
  hand: HANDS,
  confirmFolds: CONFIRM_FOLDS,
  telemetry: TELEMETRY_MODES,
});

/**
 * The Settings screen, in groups. A row is either a choice
 * ({ id, label, key }: tapping cycles `settings[key]` through its list) or
 * an action ({ id, label, action }: the screen runs `actions[action]`).
 * `show(ctx)` hides a row; a group with no rows shown is hidden. The
 * About group is drawn by the screen (version, credits).
 */
export const SETTINGS_GROUPS = Object.freeze([
  {
    id: 'display',
    title: 'Display',
    rows: [
      { id: 'palette', label: 'Palette', key: 'palette' },
      { id: 'text-size', label: 'Text size', key: 'textSize' },
      { id: 'anim-speed', label: 'Animation', key: 'animSpeed' },
      { id: 'reduced-motion', label: 'Reduced motion', key: 'reducedMotion' },
      { id: 'left-handed', label: 'Left-handed layout', key: 'hand', note: 'Puts the side panel on the left in landscape.' },
    ],
  },
  {
    id: 'gameplay',
    title: 'Gameplay',
    rows: [
      { id: 'confirm-folds', label: 'Tap to confirm folds', key: 'confirmFolds', note: 'After a drag, tap Fold to play it.' },
      { id: 'reset-hints', label: 'Show tutorial hints again', action: 'resetHints' },
    ],
  },
  {
    id: 'data',
    title: 'Data',
    rows: [
      // Hidden until collection is switched on (config TELEMETRY.collect).
      { id: 'telemetry', label: 'Share play data', key: 'telemetry', show: (ctx) => !!ctx.telemetryOffered },
      { id: 'save-code', label: 'Save code', note: 'Move your run to another device.', action: 'saveCode' },
    ],
  },
]);

/** The option list for a choice setting (`palette`, `animSpeed`, …). */
export function choicesFor(key) {
  return CHOICES[key] || null;
}

/** Fill defaults and drop unknown values (bad or old saves reset per field). */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  for (const [key, list] of Object.entries(CHOICES)) {
    if (list.some((o) => o.id === raw[key])) s[key] = raw[key];
  }
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

/** Font-size multiplier for the text size setting. */
export function textScale(settings) {
  return (TEXT_SIZES.find((o) => o.id === settings.textSize) || TEXT_SIZES[0]).scale;
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
