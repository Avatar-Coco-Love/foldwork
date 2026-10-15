// Player settings, saved in localStorage under `foldwork.settings`.
// normalizeSettings / resolveMotion are pure and tested; load/save take an
// optional storage so tests (and private-mode browsers) never throw.
//
// SETTINGS_GROUPS lays out the Settings screen (playtest P3) as data: a
// later phase adds a row here, not mount code.

import { PALETTES, DEFAULT_PALETTE_ID } from '../render/palette.js';
import { VOLUME_STEPS, MUTE_MODES } from '../audio/sounds.js';

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

/**
 * Color palettes (render/palette.js); every one is colorblind-safe. All
 * are valid settings; the Settings row offers only the ones the player
 * owns (core/unlocks.js), and main.js shows the default for any other.
 */
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

/** Screen shake on a hit (8d): on, subtle; never under reduced motion. */
export const SCREEN_SHAKE = Object.freeze([
  { id: 'on', name: 'On' },
  { id: 'off', name: 'Off' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  palette: DEFAULT_PALETTE_ID,
  textSize: 'normal',
  animSpeed: 'normal',
  reducedMotion: 'system',
  screenShake: 'on',
  hand: 'right',
  confirmFolds: 'off',
  telemetry: 'on',
  // Audio (8a): on by default; it starts after the first tap or key.
  masterVolume: '75',
  musicVolume: '50',
  sfxVolume: '75',
  mute: 'off',
});

/** The settings that are a choice from a list, and the list. */
const CHOICES = Object.freeze({
  palette: PALETTE_OPTIONS,
  textSize: TEXT_SIZES,
  animSpeed: ANIM_SPEEDS,
  reducedMotion: MOTION_MODES,
  screenShake: SCREEN_SHAKE,
  hand: HANDS,
  confirmFolds: CONFIRM_FOLDS,
  telemetry: TELEMETRY_MODES,
  masterVolume: VOLUME_STEPS,
  musicVolume: VOLUME_STEPS,
  sfxVolume: VOLUME_STEPS,
  mute: MUTE_MODES,
});

/**
 * The Settings screen, in groups. A row is either a choice
 * ({ id, label, key }: tapping cycles `settings[key]` through its list) or
 * an action ({ id, label, action }: the screen runs `actions[action]`).
 * `show(ctx)` hides a row; a group with no rows shown is hidden. A choice
 * row's `allowed(ctx, id)` narrows its list (palettes the player owns). The
 * About group is drawn by the screen (version, credits).
 */
export const SETTINGS_GROUPS = Object.freeze([
  {
    id: 'display',
    title: 'Display',
    rows: [
      {
        id: 'palette',
        label: 'Palette',
        key: 'palette',
        allowed: (ctx, id) => ctx.owns('palette', id),
        note: (ctx) => (PALETTE_OPTIONS.some((o) => !ctx.owns('palette', o.id)) ? 'More palettes in Unlocks.' : null),
      },
      { id: 'text-size', label: 'Text size', key: 'textSize' },
      { id: 'anim-speed', label: 'Animation', key: 'animSpeed' },
      { id: 'reduced-motion', label: 'Reduced motion', key: 'reducedMotion' },
      { id: 'screen-shake', label: 'Screen shake', key: 'screenShake', note: 'A small shake when you are hit or something falls. Off under reduced motion.' },
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
      { id: 'telemetry', label: 'Share play data', key: 'telemetry', note: 'Anonymous: how floors and folds go, and your device type. No names or accounts.', show: (ctx) => !!ctx.telemetryOffered },
      { id: 'save-code', label: 'Save code', note: 'Move your run to another device.', action: 'saveCode' },
      // Every choice back to its default (8g). Asks with a second tap.
      { id: 'restore-settings', label: 'Restore default settings', note: 'Display, gameplay and audio. Your runs and progress stay.', action: 'restoreAll' },
      // Title screen only (the panel drops a row without its action).
      { id: 'reset-progress', label: 'Reset progress', note: 'Erase scraps, unlocks, stats and history.', action: 'resetProgress' },
    ],
  },
  {
    // Every sound is made in code (audio/). Volumes step Off → 100%.
    id: 'audio',
    title: 'Audio',
    rows: [
      { id: 'master-volume', label: 'Master volume', key: 'masterVolume' },
      { id: 'music-volume', label: 'Music', key: 'musicVolume' },
      { id: 'sfx-volume', label: 'Effects', key: 'sfxVolume' },
      { id: 'mute', label: 'Mute', key: 'mute' },
      { id: 'restore-audio', label: 'Restore audio defaults', note: 'Every volume and Mute back to how they started.', action: 'restoreAudio' },
    ],
  },
]);

/** Settings Restore defaults leaves alone: sharing play data stays the player's choice. */
const KEPT_ON_RESTORE = new Set(['telemetry']);

/**
 * The defaults for one group's choice rows (`'audio'`), or for every
 * group (null), as a patch for ctx.updateSettings.
 */
export function defaultsFor(groupId = null) {
  const patch = {};
  for (const g of SETTINGS_GROUPS) {
    if (groupId && g.id !== groupId) continue;
    for (const r of g.rows) {
      if (r.key && !KEPT_ON_RESTORE.has(r.key)) patch[r.key] = DEFAULT_SETTINGS[r.key];
    }
  }
  return patch;
}

/** The option list for a choice setting (`palette`, `animSpeed`, …). */
export function choicesFor(key) {
  return CHOICES[key] || null;
}

/** A choice row's options for this player (its `allowed`), never empty. */
export function rowChoices(row, ctx) {
  const list = choicesFor(row.key);
  if (!list || !row.allowed) return list;
  const mine = list.filter((o) => row.allowed(ctx, o.id));
  return mine.length ? mine : list;
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
 * `shake`: impact screen shake plays (on, and motion isn't reduced).
 * @returns {{ speed: number, reducedMotion: boolean, shake: boolean }}
 */
export function resolveMotion(settings, systemReduced = false) {
  const speed = (ANIM_SPEEDS.find((o) => o.id === settings.animSpeed) || ANIM_SPEEDS[1]).speed;
  const mode = settings.reducedMotion;
  const reducedMotion = mode === 'on' || (mode === 'system' && !!systemReduced);
  const shake = settings.screenShake !== 'off' && !reducedMotion;
  return { speed, reducedMotion, shake };
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
