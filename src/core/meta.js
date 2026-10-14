// Meta-progression (docs/03, Phase 7): what lasts between runs. Pure; no
// DOM. ui/metaStore.js keeps it in localStorage under `foldwork.meta`.
//
//   Meta = {
//     v,        META_VERSION (or a newer build's, kept as is)
//     scraps,   paper scraps to spend (the unlocks shop)
//     earned,   scraps earned over all runs (never goes down)
//     runs,     runs banked (won or lost)
//     unlocks,  { [kind]: [ids] } bought or granted (core/unlocks.js);
//               starters are never listed
//     daily,    { [date]: DailyRecord } days the daily seed was played
//               (core/daily.js)
//     stats,    Stats: totals, best run, per spirit, recent runs
//               (core/stats.js; Phase 7e)
//   }
//
// The meta only grows: later phases add fields, and parseMeta() fills any
// that are missing, so an older meta still loads. It also keeps what it
// doesn't know (fields, unlock kinds and ids from a newer build or from
// content since removed), so a meta never loses progress by passing
// through a build that doesn't understand all of it. A field whose shape
// changes takes a META_MIGRATIONS step and a META_VERSION bump.

import { SHOP_KINDS } from './unlocks.js';
import { parseDaily } from './daily.js';
import { createStats, parseStats } from './stats.js';

export const META_VERSION = 1;

/**
 * Upgrades from older metas: META_MIGRATIONS[v] turns a version v meta
 * into a version v + 1 one. Empty until a field changes shape.
 */
const META_MIGRATIONS = Object.freeze({});

/** An empty unlocks record: a list per shop kind. */
function emptyUnlocks() {
  return Object.fromEntries(SHOP_KINDS.map((k) => [k.kind, []]));
}

/** A new player's meta. */
export function createMeta() {
  return {
    v: META_VERSION, scraps: 0, earned: 0, runs: 0, unlocks: emptyUnlocks(), daily: {}, stats: createStats(),
  };
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** Unlock lists read back: string ids only, no repeats; unknown kinds kept. */
function parseUnlocks(data) {
  const out = emptyUnlocks();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [kind, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    out[kind] = [...new Set(list.filter((id) => typeof id === 'string' && id))];
  }
  return out;
}

/** A meta read back from storage; broken or missing data starts fresh. */
export function parseMeta(data) {
  if (!data || typeof data !== 'object' || !Number.isInteger(data.v) || data.v < 1) return createMeta();
  let m = data;
  for (let v = m.v; v < META_VERSION; v++) {
    const step = META_MIGRATIONS[v];
    m = { ...(step ? step(m) : m), v: v + 1 };
  }
  return {
    ...m, // fields this build doesn't know yet
    v: Math.max(m.v, META_VERSION),
    scraps: count(m.scraps),
    earned: count(m.earned),
    runs: count(m.runs),
    unlocks: parseUnlocks(m.unlocks),
    daily: parseDaily(m.daily),
    stats: parseStats(m.stats),
  };
}

/** The meta after banking a finished run's scraps (core/scraps.js total). */
export function bankScraps(meta, amount) {
  const n = count(amount);
  return { ...meta, scraps: meta.scraps + n, earned: meta.earned + n, runs: meta.runs + 1 };
}
