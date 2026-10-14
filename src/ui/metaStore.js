// The meta save (core/meta.js), in localStorage under `foldwork.meta`.
// Every access is guarded, as in saveStore.js. When storage is blocked the
// meta still lives in memory for the rest of the session.

import { parseMeta } from '../core/meta.js';

export const META_KEY = 'foldwork.meta';

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** A store over `storage` (tests pass their own). */
export function createMetaStore(storage = defaultStorage()) {
  let memory = null; // last written meta; the fallback when storage fails

  return {
    /** The saved meta, or a fresh one. */
    load() {
      try {
        const raw = storage && storage.getItem(META_KEY);
        if (raw != null) return parseMeta(JSON.parse(raw));
      } catch {
        // Broken JSON or blocked storage: fall back to this session's copy.
      }
      return parseMeta(memory);
    },
    /** Write the meta; true when it reached storage. */
    write(meta) {
      memory = meta;
      try {
        if (!storage) return false;
        storage.setItem(META_KEY, JSON.stringify(meta));
        return true;
      } catch {
        return false;
      }
    },
  };
}
