// The one run save (core/save.js), in localStorage under `foldwork.run`.
// Every access is guarded, as in settings.js. When storage is blocked
// (private mode, full) the save still lives in memory, so Menu and
// Continue work for the rest of the session.

import { parseSave } from '../core/save.js';

export const SAVE_KEY = 'foldwork.run';

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** A store over `storage` (tests pass their own). */
export function createSaveStore(storage = defaultStorage()) {
  let memory = null; // last written save; the fallback when storage fails

  return {
    /** The save to continue, or null. */
    load() {
      try {
        const raw = storage && storage.getItem(SAVE_KEY);
        if (raw != null) return parseSave(JSON.parse(raw));
      } catch {
        // Broken JSON or blocked storage: fall back to this session's copy.
      }
      return parseSave(memory);
    },
    /** Write a save; true when it reached storage. */
    write(save) {
      memory = save;
      try {
        if (!storage) return false;
        storage.setItem(SAVE_KEY, JSON.stringify(save));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      memory = null;
      try {
        if (storage) storage.removeItem(SAVE_KEY);
      } catch {
        // Nothing to do: the memory copy is gone either way.
      }
    },
  };
}
