// Fold preview model: what the board overlay shows for a candidate crease.
// Pure (no DOM). Built once per crease change, not per frame, so the draw
// pass only reads typed arrays.

import { validateFold } from '../core/fold.js';
import { cellIndex, topLayer } from '../core/board.js';
import { coverEffect, PLAYER_ID } from '../core/turn.js';
import { keyMeetsLock } from '../core/environment.js';

export const CELL = Object.freeze({
  NONE: 0,
  LEAVING: 1, // on the folding side; its stack moves away
  LANDING: 2, // receives a stack
  OVERFLOW: 3, // receives a stack and exceeds max stack
  CLIPPED: 4, // on the folding side but mirrors off-board; stays put
});

/** What a landing does to the creature it covers (core/turn.js coverEffect). */
export const EFFECT = Object.freeze({
  NONE: 0,
  PIN: 1, // covered: can't act, can't be attacked
  DROP: 2, // a void sheet lands on it: it falls
});

/**
 * @returns {{ fold, ok, reasons, heights: number[], state: Uint8Array,
 *   source: Int16Array, effect: Uint8Array, unlock: Uint8Array,
 *   unlocks: number, player: 'pin'|'drop'|null }}
 *   `source[dest]` is the cell index whose stack lands on `dest` (or -1).
 *   `effect[dest]` is an EFFECT; `unlock[dest]` is 1 where the landing
 *   stacks a key and a lock together (the lock opens), `unlocks` counts
 *   them. `player` says what the fold does to the player. Returns null for
 *   a malformed crease.
 */
export function buildFoldPreview(board, fold) {
  const check = validateFold(board, fold);
  if (!check.perCellHeights) return null;
  const n = board.w * board.h;
  const state = new Uint8Array(n);
  const source = new Int16Array(n).fill(-1);
  const effect = new Uint8Array(n);
  const unlock = new Uint8Array(n);
  let unlocks = 0;
  let player = null;
  for (const m of check.moves) {
    const from = cellIndex(board, m.from.col, m.from.row);
    if (m.clipped) {
      state[from] = CELL.CLIPPED;
      continue;
    }
    state[from] = CELL.LEAVING;
    if (!board.cells[from].layers.length) continue; // nothing actually moves
    const to = cellIndex(board, m.to.col, m.to.row);
    state[to] = CELL.LANDING;
    source[to] = from;
    if (keyMeetsLock(topLayer(board, m.to.col, m.to.row), topLayer(board, m.from.col, m.from.row))) {
      unlock[to] = 1;
      unlocks += 1;
    }
    const fx = coverEffect(board, m.from, m.to);
    if (!fx) continue;
    effect[to] = fx === 'drop' ? EFFECT.DROP : EFFECT.PIN;
    if (topLayer(board, m.to.col, m.to.row).creature.id === PLAYER_ID) player = fx;
  }
  for (const r of check.reasons) {
    if (r.code === 'stack-overflow') state[cellIndex(board, r.col, r.row)] = CELL.OVERFLOW;
  }
  return { fold, ok: check.ok, reasons: check.reasons, heights: check.perCellHeights, state, source, effect, unlock, unlocks, player };
}
