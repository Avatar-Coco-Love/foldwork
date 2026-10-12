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
//
// The search skips undo (it only returns to a state already seen) and
// dedupes states by stateKey(). Turn counts aren't part of the key, so the
// first visit of a state is always its shortest route.

import { act } from './turn.js';
import { DIRS } from './board.js';
import { AXES, SIDES, axesFor } from './fold.js';

export const SOLVER_DEFAULTS = Object.freeze({ maxStates: 20000, maxTurns: 40, noFolds: false });

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
 * links, plate holds, creatures with their HP and rest) plus keys, charges and
 * limited uses left (wards, free locks, landings). Turn number and
 * the undo snapshot don't change what can happen next.
 */
export function stateKey(state) {
  const u = state.uses || {};
  const parts = [state.keys, state.charges, u.wards, u.freeLocks, u.landings];
  for (const cell of state.board.cells) {
    for (const l of cell.layers) {
      parts.push(l.tile, l.item || '', l.link || '', l.hold || '', l.creature ? `${l.creature.id}:${l.creature.hp}:${l.creature.rest ?? ''}` : '');
    }
    parts.push('|');
  }
  return parts.join(',');
}

export function solve(start, options = {}) {
  const { maxStates, maxTurns, noFolds } = { ...SOLVER_DEFAULTS, ...options };
  const actions = candidateActions(start.board, { noFolds, diagonal: !!(start.rules && start.rules.diagonal) });
  const fail = (explored, capped) => ({ solvable: false, actions: null, turns: null, folds: null, explored, capped });
  if (start.status === 'won') return { solvable: true, actions: [], turns: 0, folds: 0, explored: 0, capped: false };
  if (start.status !== 'playing') return fail(0, false);

  // Nodes: { state, parent, action, depth }. Parent links rebuild the line.
  const seen = new Set([stateKey(start)]);
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
      const child = { state: result.state, parent: node, action, depth: node.depth + 1 };
      if (result.state.status === 'won') return found(child, q + 1);
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(child);
    }
  }
  return fail(Math.min(queue.length, maxStates), capped);
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
