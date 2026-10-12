// Fold preview model: what the board overlay shows for a candidate crease.
// Pure (no DOM). Built once per crease change, not per frame, so the draw
// pass only reads typed arrays.

import { validateFold } from '../core/fold.js';
import { cellIndex } from '../core/board.js';

export const CELL = Object.freeze({
  NONE: 0,
  LEAVING: 1, // on the folding side; its stack moves away
  LANDING: 2, // receives a stack
  OVERFLOW: 3, // receives a stack and exceeds max stack
  CLIPPED: 4, // on the folding side but mirrors off-board; stays put
});

/**
 * @returns {{ fold, ok, reasons, heights: number[], state: Uint8Array,
 *   source: Int16Array }} `source[dest]` is the cell index whose stack lands
 *   on `dest` (or -1). Returns null for a malformed crease.
 */
export function buildFoldPreview(board, fold) {
  const check = validateFold(board, fold);
  if (!check.perCellHeights) return null;
  const n = board.w * board.h;
  const state = new Uint8Array(n);
  const source = new Int16Array(n).fill(-1);
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
  }
  for (const r of check.reasons) {
    if (r.code === 'stack-overflow') state[cellIndex(board, r.col, r.row)] = CELL.OVERFLOW;
  }
  return { fold, ok: check.ok, reasons: check.reasons, heights: check.perCellHeights, state, source };
}
