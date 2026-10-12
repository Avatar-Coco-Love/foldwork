// Which tutorial hints the player has already seen (docs/04: hints appear
// once), saved in localStorage under `foldwork.hints`. Storage is optional
// and every access is guarded, as in settings.js.

export const HINTS_KEY = 'foldwork.hints';
const VERSION = 1;

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadSeenHints(storage = defaultStorage()) {
  try {
    const saved = JSON.parse((storage && storage.getItem(HINTS_KEY)) || 'null');
    return new Set(saved && saved.v === VERSION && Array.isArray(saved.seen) ? saved.seen : []);
  } catch {
    return new Set();
  }
}

export function saveSeenHints(seen, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(HINTS_KEY, JSON.stringify({ v: VERSION, seen: [...seen] }));
    return true;
  } catch {
    return false;
  }
}
