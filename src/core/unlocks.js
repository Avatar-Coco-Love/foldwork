// Unlocks (docs/03 meta-progression, Phase 7b): what paper scraps buy.
// Pure; no DOM. The meta (core/meta.js) stores what was bought; this
// module knows what can be bought and what each costs.
//
// The shop is built from the content tables themselves, so new content
// joins it by being added to its table, with no shop code to change:
//
//   SHOP_KINDS   one entry per kind of unlock, in shop order:
//                { kind, title, noun, defs: { [id]: def }, cost(def) }
//                (noun: one item, in a sentence: "Frog (spirit)")
//
// Each def says how the player gets it with an optional `unlock` field:
//
//   'starter'   owned from the start (default for nothing: see below)
//   'shop'      bought with paper scraps (the default when `unlock` is
//               left out, so new content is a shop item unless marked)
//   'reward'    granted by something else (grantUnlock), shown in the
//               shop as locked, with `unlockText` saying how to earn it
//
// A shop item costs `def.cost` if set, else its kind's default cost
// (relics by rarity, RELIC_COSTS). Costs are docs/03's; tune in Phase 9.
//
// Rules that keep old progress safe as the game grows:
// - The meta stores only what was bought or granted, never the starter
//   set, so making something a starter later just hands it out.
// - Never turn a starter into a shop item: players would lose it.
// - Ids are forever (as in core/saveCode.js). A removed item's id stays
//   in the meta (it is ignored, not deleted), so bringing it back, or
//   loading the meta in an older build, loses nothing.
// - A new kind is a new SHOP_KINDS entry; the meta keeps a list per kind
//   and fills in the missing ones (parseMeta).

import { RELIC_DEFS } from './relics.js';
import { SPIRIT_DEFS } from './spirits.js';
// Palettes are plain data (no DOM); the shop sells them like any content.
import { PALETTES } from '../render/palette.js';

/** Relic cost by rarity (docs/03, OPEN-QUESTIONS "Paper scraps"). */
export const RELIC_COSTS = Object.freeze({ common: 40, uncommon: 70, rare: 120 });

/** A palette's cost, unless its def sets one. */
export const PALETTE_COST = 50;

export const SHOP_KINDS = Object.freeze([
  { kind: 'spirit', title: 'Spirits', noun: 'spirit', defs: SPIRIT_DEFS, cost: () => null },
  { kind: 'relic', title: 'Relics', noun: 'relic', defs: RELIC_DEFS, cost: (def) => RELIC_COSTS[def.rarity] ?? null },
  { kind: 'palette', title: 'Palettes', noun: 'palette', defs: PALETTES, cost: () => PALETTE_COST },
]);

const KINDS = Object.fromEntries(SHOP_KINDS.map((k) => [k.kind, k]));

/** The shop kind entry for `kind`, or null. */
export function shopKind(kind) {
  return KINDS[kind] || null;
}

/** The def for `kind`/`id`, or null when either is unknown. */
export function unlockDef(kind, id) {
  const k = KINDS[kind];
  return k && Object.prototype.hasOwnProperty.call(k.defs, id) ? k.defs[id] : null;
}

/** How `def` is unlocked: 'starter' | 'shop' | 'reward'. */
export function unlockWay(def) {
  return def.unlock === 'starter' || def.unlock === 'reward' ? def.unlock : 'shop';
}

/** What a shop item costs in paper scraps, or null when it isn't sold. */
export function unlockCost(kind, id) {
  const def = unlockDef(kind, id);
  if (!def || unlockWay(def) !== 'shop') return null;
  const cost = Number.isInteger(def.cost) ? def.cost : KINDS[kind].cost(def);
  return Number.isInteger(cost) && cost >= 0 ? cost : null;
}

/** Ids bought or granted for `kind` (the meta's own list; may hold ids this build doesn't know). */
function boughtIds(meta, kind) {
  const list = meta && meta.unlocks && meta.unlocks[kind];
  return Array.isArray(list) ? list : [];
}

/**
 * Whether the player has `kind`/`id`: a starter, or in the meta. `all`
 * (dev `?unlocks=all`) owns everything known.
 */
export function owns(meta, kind, id, { all = false } = {}) {
  const def = unlockDef(kind, id);
  if (!def) return false;
  return all || unlockWay(def) === 'starter' || boughtIds(meta, kind).includes(id);
}

/** Every id of `kind` the player has, in table order. */
export function ownedIds(meta, kind, opts) {
  const k = KINDS[kind];
  return k ? Object.keys(k.defs).filter((id) => owns(meta, kind, id, opts)) : [];
}

/**
 * Buy `kind`/`id`. Returns { ok: true, meta } with the scraps spent and
 * the item recorded, or { ok: false, reason, meta } (meta unchanged):
 * 'unknown', 'owned', 'not-for-sale' (a starter or reward), 'scraps'.
 */
export function buyUnlock(meta, kind, id) {
  if (!unlockDef(kind, id)) return { ok: false, reason: 'unknown', meta };
  if (owns(meta, kind, id)) return { ok: false, reason: 'owned', meta };
  const cost = unlockCost(kind, id);
  if (cost == null) return { ok: false, reason: 'not-for-sale', meta };
  if (meta.scraps < cost) return { ok: false, reason: 'scraps', meta };
  return { ok: true, meta: withUnlock({ ...meta, scraps: meta.scraps - cost }, kind, id) };
}

/** Grant `kind`/`id` for free (a 'reward' item, or any later award). */
export function grantUnlock(meta, kind, id) {
  if (!unlockDef(kind, id) || owns(meta, kind, id)) return meta;
  return withUnlock(meta, kind, id);
}

function withUnlock(meta, kind, id) {
  const unlocks = { ...(meta.unlocks || {}) };
  unlocks[kind] = [...boughtIds(meta, kind), id];
  return { ...meta, unlocks };
}

/**
 * One shop item's state for the player: { kind, id, def, way, cost,
 * state, short }. state is 'owned', 'buy' (affordable), 'short' (needs
 * `short` more scraps) or 'reward' (not sold).
 */
export function shopItem(meta, kind, id, opts) {
  const def = unlockDef(kind, id);
  const way = unlockWay(def);
  const cost = unlockCost(kind, id);
  let state;
  if (owns(meta, kind, id, opts)) state = 'owned';
  else if (cost == null) state = 'reward';
  else state = meta.scraps >= cost ? 'buy' : 'short';
  return { kind, id, def, way, cost, state, short: state === 'short' ? cost - meta.scraps : 0 };
}

/**
 * The whole shop for the player, in SHOP_KINDS order:
 * [{ kind, title, items: [shopItem] }]. Starters are left out (they were
 * never for sale); a kind with nothing to show is left out.
 */
export function shopCatalog(meta, opts) {
  return SHOP_KINDS.map(({ kind, title, defs }) => ({
    kind,
    title,
    items: Object.keys(defs)
      .filter((id) => unlockWay(defs[id]) !== 'starter')
      .map((id) => shopItem(meta, kind, id, opts)),
  })).filter((section) => section.items.length);
}

/** Shop items the player can buy right now. */
export function affordable(meta, opts) {
  return shopCatalog(meta, opts).flatMap((s) => s.items).filter((it) => it.state === 'buy');
}

/**
 * Shop items `after` can buy that `before` couldn't (the run summary's
 * "now affordable" line after banking a run's scraps).
 */
export function newlyAffordable(before, after) {
  const had = new Set(affordable(before).map((it) => `${it.kind}:${it.id}`));
  return affordable(after).filter((it) => !had.has(`${it.kind}:${it.id}`));
}

/**
 * The relics a new run may offer (core/run.js run.pool): the ones the
 * player owns. Challenge and daily runs use every relic instead
 * (core/run.js RELIC_POOL_ALL), so every player gets the same pool.
 */
export function relicPool(meta, opts) {
  return ownedIds(meta, 'relic', opts);
}
