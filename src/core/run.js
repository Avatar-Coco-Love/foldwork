// Run state (docs/03 run structure): the plain data that lasts from floor to
// floor. Pure; no DOM. Values in, values out, like FloorState, so a run can
// be saved (Phase 7), sent with telemetry and tested.
//
//   RunState = {
//     v,          RUN_VERSION (saves)
//     seed,       run seed; each floor forks its own stream from it
//     spirit,     spirit id, or null until spirits exist (Phase 4c)
//     floor,      the floor being played (1-based)
//     lastFloor,  the run is won after clearing this floor
//     hp, maxHp,  the player's HP, carried between floors
//     relics,     relic ids, in the order taken (core/relics.js)
//     cleared,    floors cleared
//     status,     'playing' | 'won' | 'lost'
//     cause,      why it was lost ('hp', 'fall'), else null
//   }
//
// The floor screen asks floorSetupFor() how to start each floor and hands
// the finished FloorState to finishFloor(). Relic offers between floors
// (Phase 4b) and spirits (4c) extend this module.

import { playerOf } from './turn.js';
import { CREATURE_DEFS } from './creatures.js';
import { templateFloors } from './floors.js';
import { applyRelics, relicDef } from './relics.js';

export const RUN_VERSION = 1;

/** Floors in a full run before the boss (docs/03). */
export const RUN_FLOORS = 8;

/**
 * How many floors a run has today: RUN_FLOORS, or fewer while later floors
 * have no templates yet (until Phase 5 the run ends after floor 3).
 */
export function runLength(floors = templateFloors()) {
  return Math.min(RUN_FLOORS, Math.max(0, ...floors));
}

/**
 * A new run. `relics` start in the run (dev `?relics=`; spirits in 4c);
 * `floor` starts it deeper (dev `?floor=`).
 */
export function createRun({ seed, relics = [], spirit = null, floor = 1, lastFloor = runLength() } = {}) {
  const hp = CREATURE_DEFS.player.hp;
  let run = {
    v: RUN_VERSION,
    seed: String(seed),
    spirit,
    floor: Math.min(Math.max(1, floor), lastFloor),
    lastFloor,
    hp,
    maxHp: hp,
    relics: [],
    cleared: 0,
    status: 'playing',
    cause: null,
  };
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
 * floor's own setup (core/floors.js generateFloor): relic hooks, rules and
 * the carried HP.
 */
export function floorSetupFor(run, setup) {
  return { ...applyRelics(setup, run.relics, run), hp: run.hp, maxHp: run.maxHp };
}

/**
 * The run after a floor ends. A win carries the player's HP over and moves
 * to the next floor, or wins the run after lastFloor. A loss ends the run.
 * A floor still being played changes nothing.
 */
export function finishFloor(run, floorState) {
  if (run.status !== 'playing') return run;
  if (floorState.status === 'lost') {
    const cause = (floorState.outcome && floorState.outcome.cause) || null;
    return { ...run, status: 'lost', cause, hp: 0 };
  }
  if (floorState.status !== 'won') return run;
  const me = playerOf(floorState);
  const next = { ...run, hp: me ? me.hp : run.hp, cleared: run.cleared + 1 };
  if (run.floor >= run.lastFloor) return { ...next, status: 'won' };
  return { ...next, floor: run.floor + 1 };
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
