// Meta-progression (docs/03, Phase 7): what lasts between runs. Pure; no
// DOM. ui/metaStore.js keeps it in localStorage under `foldwork.meta`.
//
//   Meta = {
//     v,        META_VERSION
//     scraps,   paper scraps to spend (the unlocks shop, Phase 7b)
//     earned,   scraps earned over all runs (never goes down)
//     runs,     runs banked (won or lost)
//   }
//
// Later phases add fields (unlocks, stats); parseMeta() fills any that are
// missing, so an older meta still loads.

export const META_VERSION = 1;

/** A new player's meta. */
export function createMeta() {
  return { v: META_VERSION, scraps: 0, earned: 0, runs: 0 };
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** A meta read back from storage; broken or missing data starts fresh. */
export function parseMeta(data) {
  if (!data || typeof data !== 'object' || data.v !== META_VERSION) return createMeta();
  return { ...createMeta(), scraps: count(data.scraps), earned: count(data.earned), runs: count(data.runs) };
}

/** The meta after banking a finished run's scraps (core/scraps.js total). */
export function bankScraps(meta, amount) {
  const n = count(amount);
  return { ...meta, scraps: meta.scraps + n, earned: meta.earned + n, runs: meta.runs + 1 };
}
