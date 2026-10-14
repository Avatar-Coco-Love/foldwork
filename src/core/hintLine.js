// The Hint button's search (OPEN-QUESTIONS "Playtest round 1"). Pure; no
// DOM. Three levels, one more per press: the floor's written tip (template
// `tip`, core/floors.js), then the next step of a winning line from where
// the player stands, or word that no line exists from here.
//
// findLine() runs in a Web Worker (ui/hintWorker.js) since a search can
// take seconds on a phone. It tries a line that loses no HP first (every
// floor is proven winnable that way from its start, and the search is
// smaller), then any winning line. Where diagonal creases are allowed
// (Frog, Diagonal Crease) each of those tries straight creases first:
// floors are proven with straight ones, and diagonals multiply the folds
// to try, so a diagonal search can run out of states before it reaches a
// line a straight one finds at once (playtest: floor 8 with the Frog).
//
// The floor screen keeps the line it got and walks it: lineKeys() names
// the state before each step, so nextStep() answers without a new search
// while the player follows the line (or undoes back onto it).

import { solve, stateKey } from './solver.js';
import { act } from './turn.js';

/** Search caps for a hint: the floor tests' proof caps. */
export const HINT_SOLVE = Object.freeze({ maxStates: 40000, maxTurns: 40 });

/**
 * A winning line from `state`:
 *   { status: 'line', actions, clean }  clean = it loses no HP
 *   { status: 'stuck' }                 no winning line exists from here
 *   { status: 'unknown' }               none found within the caps
 */
export function findLine(state, opts = HINT_SOLVE) {
  const passes = state.rules && state.rules.diagonal ? [{ noDiagonal: true }, {}] : [{}];
  let capped = false;
  for (const noDamage of [true, false]) {
    for (const pass of passes) {
      const r = solve(state, { ...opts, ...pass, noDamage });
      if (r.solvable) return { status: 'line', actions: r.actions, clean: noDamage };
      capped = capped || r.capped;
    }
  }
  return { status: capped ? 'unknown' : 'stuck' };
}

/**
 * The stateKey() of the state before each action of `actions`, played
 * from `state`. Keys are only comparable within one realm (the solver's
 * short codes are handed out per module instance), so the floor screen
 * builds these itself, not the worker.
 */
export function lineKeys(state, actions) {
  const keys = [];
  let s = state;
  for (const action of actions) {
    keys.push(stateKey(s));
    const r = act(s, action);
    if (!r.ok) break;
    s = r.state;
  }
  return keys;
}

/** The step to take now on `line` ({ keys, actions }), or null if off it. */
export function nextStep(line, state) {
  if (!line) return null;
  const i = line.keys.indexOf(stateKey(state));
  return i >= 0 ? line.actions[i] : null;
}
