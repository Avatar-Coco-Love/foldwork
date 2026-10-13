// Solver v1: breadth-first search over act() (docs/05). States are values,
// so every branch is just another act() call on the same input state. Pure;
// no DOM.
//
//   solve(state, opts) → {
//     solvable,   a winning line was found
//     actions,    that line (shortest in turns), or null
//     turns,      actions.length, or null
//     folds,      folds the line spends, or null
//     explored,   states expanded
//     capped,     the search hit maxStates or maxTurns before finishing, so
//                 "not solvable" only means "not within the caps"
//   }
//
// Options:
//   maxStates  stop after expanding this many states (default 20000)
//   maxTurns   ignore lines longer than this (default 40)
//   noFolds    search without folding (to check a floor needs a fold)
//   noPins     skip folds that pin, strand or void-drop an enemy (to check
//              a floor needs folds aimed at enemies, core/floors.js NEEDS)
//   noDamage   skip lines where the player loses HP (the Hint button tries
//              a clean line first)
//
// The search skips undo (it only returns to a state already seen) and
// dedupes states by stateKey() without the player's HP: a state reached
// again with no more HP than before is skipped, since more HP never closes
// off a line (dominance). Turn counts aren't part of the key, so the first
// visit of a state is always its shortest route.

import { act, PLAYER_ID } from './turn.js';
import { DIRS, findCreature } from './board.js';
import { AXES, SIDES, axesFor } from './fold.js';

export const SOLVER_DEFAULTS = Object.freeze({ maxStates: 20000, maxTurns: 40, noFolds: false, noPins: false, noDamage: false });

/**
 * Every action worth trying on this board, in a fixed order. Diagonal
 * creases only when `diagonal` (the floor's rules.diagonal).
 */
export function candidateActions(board, { noFolds = false, diagonal = false } = {}) {
  const list = Object.keys(DIRS).map((dir) => ({ type: 'move', dir }));
  list.push({ type: 'wait' });
  if (noFolds) return list;
  for (const axis of axesFor({ diagonal })) {
    const lines = AXES[axis].lineCount(board);
    for (let index = 1; index <= lines; index++) {
      for (const side of SIDES) list.push({ type: 'fold', fold: { axis, index, side } });
    }
  }
  return list;
}

/**
 * Identity of a floor state for the search: the board (tiles, items,
 * links, plate holds, creatures by kind with their HP, rest, held item,
 * spawn count and marked crease) plus keys, charges and limited uses left
 * (wards, free locks, landings). Turn number, the undo snapshot and
 * creature ids (spawns are named by turn) don't change what can happen
 * next.
 */
export function stateKey(state, { playerHp = true } = {}) {
  const u = state.uses || {};
  // One short string built in place: the search keeps one per state, so
  // ids (tiles, items, kinds) are replaced by one-character codes.
  let key = `${state.keys},${state.charges},${u.wards},${u.freeLocks},${u.landings}|`;
  const cells = state.board.cells;
  for (let i = 0; i < cells.length; i++) {
    const layers = cells[i].layers;
    for (let d = 0; d < layers.length; d++) {
      const l = layers[d];
      key += code(l.tile) + (l.item ? code(l.item) : '') + (l.link || '') + (l.hold ? `h${l.hold}` : '');
      if (l.creature) key += `(${creatureKey(l.creature, playerHp)})`;
      key += ';';
    }
    key += '|';
  }
  return key;
}

function creatureKey(c, withHp) {
  const hp = withHp || c.id !== PLAYER_ID ? c.hp : '';
  return `${code(c.kind)}${hp}${c.rest != null ? `r${c.rest}` : ''}${c.item ? code(c.item) : ''}${c.sprout != null ? `s${c.sprout}` : ''}${c.mark ? `m${c.mark}` : ''}`;
}

// Short codes for ids, handed out on first use (letters, so they never
// clash with the digits and markers around them).
const CODES = new Map();
function code(id) {
  let c = CODES.get(id);
  if (c === undefined) {
    const n = CODES.size;
    c = n < 26 ? String.fromCharCode(65 + n) : `[${n}]`;
    CODES.set(id, c);
  }
  return c;
}

/** The player's HP in `state` (0 when it has left the board). */
function playerHp(state) {
  const p = findCreature(state.board, PLAYER_ID);
  return p ? p.creature.hp : 0;
}

export function solve(start, options = {}) {
  const { maxStates, maxTurns, noFolds, noPins, noDamage } = { ...SOLVER_DEFAULTS, ...options };
  const actions = candidateActions(start.board, { noFolds, diagonal: !!(start.rules && start.rules.diagonal) });
  const fail = (explored, capped) => ({ solvable: false, actions: null, turns: null, folds: null, explored, capped });
  if (start.status === 'won') return { solvable: true, actions: [], turns: 0, folds: 0, explored: 0, capped: false };
  if (start.status !== 'playing') return fail(0, false);

  // Nodes: { state, parent, action, depth }. Parent links rebuild the line.
  // Search key (no player HP) → the most HP that state was reached with.
  const startHp = playerHp(start);
  const seen = new Map([[stateKey(start, { playerHp: false }), startHp]]);
  const queue = [{ state: start, parent: null, action: null, depth: 0 }];
  let capped = false;
  for (let q = 0; q < queue.length; q++) {
    if (q >= maxStates) {
      capped = true;
      break;
    }
    const node = queue[q];
    if (node.depth >= maxTurns) {
      capped = true;
      continue;
    }
    for (const action of actions) {
      if (action.type === 'fold' && node.state.charges <= 0) continue;
      const result = act(node.state, action);
      if (!result.ok || result.state.status === 'lost') continue;
      if (noPins && action.type === 'fold' && result.events.some(isPinEvent)) continue;
      if (noDamage && playerHp(result.state) < startHp) continue;
      const child = { state: result.state, parent: node, action, depth: node.depth + 1 };
      if (result.state.status === 'won') return found(child, q + 1);
      const key = stateKey(result.state, { playerHp: false });
      const hp = playerHp(result.state);
      if (seen.has(key) && seen.get(key) >= hp) continue;
      seen.set(key, hp);
      queue.push(child);
    }
  }
  return fail(Math.min(queue.length, maxStates), capped);
}

/** A fold effect on an enemy: pinned, stranded or dropped into a void. */
export function isPinEvent(ev) {
  return (ev.type === 'pin' || ev.type === 'strand' || ev.type === 'fall') && ev.id !== PLAYER_ID;
}

function found(node, explored) {
  const line = [];
  for (let n = node; n.parent; n = n.parent) line.push(n.action);
  line.reverse();
  return {
    solvable: true,
    actions: line,
    turns: line.length,
    folds: line.filter((a) => a.type === 'fold').length,
    explored,
    capped: false,
  };
}
