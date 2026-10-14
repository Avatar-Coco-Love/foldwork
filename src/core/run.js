// Run state (docs/03 run structure): the plain data that lasts from floor to
// floor. Pure; no DOM. Values in, values out, like FloorState, so a run can
// be saved (Phase 7), sent with telemetry and tested.
//
//   RunState = {
//     v,          RUN_VERSION (saves)
//     seed,       run seed; each floor forks its own stream from it
//     spirit,     spirit id (core/spirits.js), or null for a run with no
//                 spirit (dev runs, tests): 3 HP and no perk
//     floor,      the floor being played (1-based)
//     lastFloor,  the run is won after clearing this floor
//     hp, maxHp,  the player's HP, carried between floors
//     relics,     relic ids, in the order taken (core/relics.js)
//     pool,       the relics this run's offers draw from: an array of ids
//                 (the player's unlocks when the run started, Phase 7b),
//                 or RELIC_POOL_ALL for every relic in the game (challenge
//                 and daily runs, so everyone gets the same pool; absent
//                 in older saves, which started with every relic)
//     landings,   falls the player can still survive (Soft Landing)
//     rewinds,    turns the player can still take back (Rewind Charm;
//                 absent in older saves: 0)
//     cleared,    floors cleared
//     foldKills,  enemies killed by the player's folds, floors finished so
//                 far (paper scraps, core/scraps.js; absent in older saves)
//     offer,      null, or the relic offer waiting to be taken after a
//                 floor: { floor, relics: [ids], rest } (rollOffer)
//     clean,      whether the last floor won was cleared without damage
//                 (it healed CLEAN_HEAL; the HUD says so), else false
//     hints,      optional { [floor]: Hint button presses } (run summary)
//     status,     'playing' | 'won' | 'lost'
//     cause,      why it was lost ('hp', 'fall'), else null
//   }
//
// The floor screen asks floorSetupFor() how to start each floor and hands
// the finished FloorState to finishFloor(). A win before the last floor
// rolls an offer; the offer screen hands the choice to takeOffer(), and
// the next floor starts. The spirit's hooks run before the relics' at
// every hook point.

import { playerOf } from './turn.js';
import { CREATURE_DEFS } from './creatures.js';
import { templateFloors } from './floors.js';
import { applyRelics, relicDef, runHooks, RELIC_DEFS, RARITY_WEIGHTS } from './relics.js';
import { spiritDef, spiritHook } from './spirits.js';
import { createRng, fork, pickWeighted } from './rng.js';

export const RUN_VERSION = 2;

/** Relic choices per offer (docs/03), before relic hooks (Origami Luck). */
export const OFFER_SIZE = 3;

/** Floors whose offer also has a rest option (docs/03). */
export const REST_FLOORS = Object.freeze([4, 7]);

/** HP the rest option heals (playtest round 1: was 1). */
export const REST_HEAL = 2;

/** HP healed for a floor cleared without taking damage (playtest round 1). */
export const CLEAN_HEAL = 1;

/** run.pool for every relic in the game (see RunState). */
export const RELIC_POOL_ALL = 'all';

/** The relic ids a run's offers may draw from (ids this build doesn't know are skipped). */
export function poolIds(pool) {
  if (!Array.isArray(pool)) return Object.keys(RELIC_DEFS);
  const ids = new Set(pool);
  return Object.keys(RELIC_DEFS).filter((id) => ids.has(id));
}

/** Floors in a full run before the boss (docs/03). */
export const RUN_FLOORS = 8;

/** The boss floor (the Great Crane), the last floor of a full run. */
export const BOSS_FLOOR = RUN_FLOORS + 1;

/**
 * How many floors a run has: BOSS_FLOOR, or fewer while later floors have
 * no templates. It stops before the first floor without one, so a run
 * never reaches an untemplated floor (dev `?floor=` still reaches them).
 */
export function runLength(floors = templateFloors()) {
  const have = new Set(floors);
  let n = 0;
  while (n < BOSS_FLOOR && have.has(n + 1)) n += 1;
  return n;
}

/**
 * A new run as `spirit` (its HP, then its `gain` hook). `relics` start in
 * the run (dev `?relics=`); `floor` starts it deeper (dev `?floor=`).
 * `pool` is the relics its offers draw from (RunState.pool).
 */
export function createRun({
  seed, relics = [], spirit = null, floor = 1, lastFloor = runLength(), pool = RELIC_POOL_ALL,
} = {}) {
  const hp = spirit ? spiritDef(spirit).hp : CREATURE_DEFS.player.hp;
  let run = {
    v: RUN_VERSION,
    seed: String(seed),
    spirit,
    floor: Math.min(Math.max(1, floor), lastFloor),
    lastFloor,
    hp,
    maxHp: hp,
    relics: [],
    pool: Array.isArray(pool) ? pool.slice() : RELIC_POOL_ALL,
    landings: 0,
    rewinds: 0,
    cleared: 0,
    foldKills: 0,
    offer: null,
    clean: false,
    status: 'playing',
    cause: null,
  };
  run = spiritHook(spirit, 'gain', run);
  for (const id of relics) run = addRelic(run, id);
  return run;
}

/** Take a relic: runs its `gain` hook. Duplicates are ignored. */
export function addRelic(run, id) {
  const def = relicDef(id);
  if (run.relics.includes(id)) return run;
  const next = { ...run, relics: [...run.relics, id] };
  return def.hooks.gain ? def.hooks.gain(next) : next;
}

/**
 * createFloorState() options for this run's current floor, from the
 * floor's own setup (core/floors.js generateFloor): spirit and relic hooks,
 * rules and the carried HP. `run` may also be a telemetry loadout
 * ({ spirit, relics, hp, maxHp, landings, rewinds }), which is how replays rebuild
 * a floor.
 */
export function floorSetupFor(run, setup) {
  const spirit = run.spirit || null;
  const out = applyRelics(spiritHook(spirit, 'setup', setup, run), run.relics || [], run);
  return {
    ...out,
    rules: spiritHook(spirit, 'rules', out.rules),
    hp: run.hp,
    maxHp: run.maxHp,
    landings: run.landings || 0,
    rewinds: run.rewinds || 0,
  };
}

/**
 * The run after a floor ends. A win carries the player's HP (and Soft
 * Landings and Rewind Charm uses left) over, heals CLEAN_HEAL if the floor took no damage (HP
 * never drops below the floor's start, run.hp, with no healing mid-floor),
 * runs the relics' `cleared` hooks, and moves to the
 * next floor with an offer to take first, or wins the run after lastFloor
 * (no offer after the last floor). A loss ends the run. A floor still being
 * played changes nothing.
 */
export function finishFloor(run, floorState) {
  if (run.status !== 'playing') return run;
  if (floorState.status !== 'won' && floorState.status !== 'lost') return run;
  const foldKills = (run.foldKills || 0) + (floorState.foldKills || 0);
  if (floorState.status === 'lost') {
    const cause = (floorState.outcome && floorState.outcome.cause) || null;
    return { ...run, status: 'lost', cause, hp: 0, foldKills };
  }
  const me = playerOf(floorState);
  const uses = floorState.uses || {};
  const hp = me ? me.hp : run.hp;
  const clean = hp >= run.hp;
  let next = {
    ...run,
    hp: clean ? Math.min(run.maxHp, hp + CLEAN_HEAL) : hp,
    landings: uses.landings ?? run.landings,
    rewinds: uses.rewinds ?? run.rewinds ?? 0,
    cleared: run.cleared + 1,
    foldKills,
    clean,
  };
  next = runHooks(next.relics, 'cleared', next);
  if (run.floor >= run.lastFloor) return { ...next, status: 'won' };
  return { ...next, floor: run.floor + 1, offer: rollOffer(next, run.floor) };
}

/**
 * The relic offer after clearing `floor`: OFFER_SIZE relics (or what the
 * relics' `offer` hooks make it) from the run's pool (in RELIC_DEFS
 * order, so a pool's own order never matters), weighted by rarity, none already owned
 * or covered by the spirit's perk, and no repeats, from the run seed's
 * own stream (`offers-<floor>`), so a seed always offers the same. `rest` adds the rest option (REST_FLOORS).
 * Fewer relics are offered once the pool runs low.
 */
export function rollOffer(run, floor) {
  const { count } = runHooks(run.relics, 'offer', { count: OFFER_SIZE });
  const rng = fork(createRng(run.seed), `offers-${floor}`);
  const covered = run.spirit ? spiritDef(run.spirit).covers : [];
  const pool = poolIds(run.pool).filter((id) => !run.relics.includes(id) && !covered.includes(id));
  const relics = [];
  while (relics.length < count && pool.length) {
    const id = pickWeighted(rng, pool, (r) => RARITY_WEIGHTS[relicDef(r).rarity] ?? 1);
    relics.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return { floor, relics, rest: REST_FLOORS.includes(floor) };
}

/**
 * Take the waiting offer: `choice` is one of its relic ids, or 'rest' when
 * it has the rest option (heal REST_HEAL). With nothing to choose from
 * (an empty pool, no rest), null moves on. Anything else is refused: the
 * run comes back unchanged.
 */
export function takeOffer(run, choice) {
  const offer = run.offer;
  if (!offer || run.status !== 'playing') return run;
  if (choice === 'rest' && offer.rest) {
    return { ...run, offer: null, hp: Math.min(run.maxHp, run.hp + REST_HEAL) };
  }
  if (offer.relics.includes(choice)) return addRelic({ ...run, offer: null }, choice);
  if (choice == null && !offer.relics.length && !offer.rest) return { ...run, offer: null };
  return run;
}

/** The run with `count` Hint button presses recorded for `floor`. */
export function addHints(run, floor, count) {
  if (!count) return run;
  const hints = { ...(run.hints || {}) };
  hints[floor] = (hints[floor] || 0) + count;
  return { ...run, hints };
}

/** What telemetry (and the HUD) report about a run. */
export function runTag(run) {
  return {
    seed: run.seed,
    floor: run.floor,
    hp: run.hp,
    maxHp: run.maxHp,
    relics: run.relics.slice(),
    spirit: run.spirit,
  };
}
