// Seeded RNG (mulberry32) with named, splittable streams.
//
// An Rng is plain serializable data: { seed, state }. All functions are pure
// helpers that advance `rng.state` in place, so an Rng can be saved with the
// run and cloned by the solver with a shallow copy.
//
// Use fork(rng, label) to derive independent streams (e.g. 'floors',
// 'enemies', 'ambient'). A fork depends only on the parent's seed and the
// label, never on how many numbers the parent has drawn, so adding a new
// stream later does not change existing ones.

const UINT32 = 0x100000000;

/** Hash a string to an unsigned 32-bit integer (FNV-1a + murmur finalizer). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Avalanche a 32-bit integer. */
function mix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Normalize a number or string seed to an unsigned 32-bit integer. */
export function normalizeSeed(seed) {
  if (typeof seed === 'string') return hashString(seed);
  if (typeof seed === 'number' && Number.isFinite(seed)) return mix32(Math.floor(seed) >>> 0);
  throw new TypeError(`Invalid seed: ${seed}`);
}

/** Create a new RNG stream. */
export function createRng(seed) {
  const s = normalizeSeed(seed);
  return { seed: s, state: s };
}

/** Derive an independent child stream from a parent's seed and a label. */
export function fork(rng, label) {
  return createRng(mix32(rng.seed ^ hashString(String(label))));
}

/** Copy an RNG (for previews and solver branches). */
export function cloneRng(rng) {
  return { seed: rng.seed, state: rng.state };
}

/** Next unsigned 32-bit integer (mulberry32). */
export function nextU32(rng) {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(rng) {
  return nextU32(rng) / UINT32;
}

/** Integer in [min, max) . */
export function nextInt(rng, min, max) {
  if (!(max > min)) throw new RangeError(`nextInt: empty range [${min}, ${max})`);
  return min + Math.floor(nextFloat(rng) * (max - min));
}

/** True with probability p. */
export function chance(rng, p) {
  return nextFloat(rng) < p;
}

/** Uniformly pick one element. */
export function pick(rng, list) {
  if (list.length === 0) throw new RangeError('pick: empty list');
  return list[nextInt(rng, 0, list.length)];
}

/** Pick by weight. `weightOf(item)` returns a non-negative number. */
export function pickWeighted(rng, list, weightOf) {
  let total = 0;
  for (const item of list) total += weightOf(item);
  if (!(total > 0)) throw new RangeError('pickWeighted: total weight must be > 0');
  let r = nextFloat(rng) * total;
  for (const item of list) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return list[list.length - 1];
}

/** Fisher-Yates shuffle in place; returns the same array. */
export function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i + 1);
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Daily seed string from a Date, in UTC: 'YYYY-MM-DD'. */
export function dailySeedString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
