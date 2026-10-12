// Fold gesture math: turns a drag or key presses into a crease. Pure (no
// DOM), so it is unit tested; ui/input.js feeds it pointer and key events.
//
// Drag model, like real paper: you grab the paper where the drag starts and
// pull it, so the crease is the perpendicular bisector of the drag (its
// midpoint), snapped to the nearest grid line. The dominant drag direction
// picks the axis. The start cell is always on the folding side.

/** Drag shorter than this (in cells) is not a fold gesture yet (e.g. a tap). */
export const MIN_DRAG_CELLS = 0.5;
/** Pointer this far (in cells) outside the board means "abort the fold". */
export const OFF_BOARD_CELLS = 0.6;

/** Point in CSS px → board-local position in cell units (may be outside). */
export function toCellUnits(layout, px, py) {
  return { x: (px - layout.boardX) / layout.cellSize, y: (py - layout.boardY) / layout.cellSize };
}

export function isOffBoard(layout, px, py) {
  const p = toCellUnits(layout, px, py);
  const m = OFF_BOARD_CELLS;
  return p.x < -m || p.y < -m || p.x > layout.cols + m || p.y > layout.rows + m;
}

/**
 * Crease for a drag from `start` to `current` (CSS px). Returns
 * { axis, index, side } or null when the drag is too short, starts off the
 * board, or the snapped crease would not leave the start cell on the folding
 * side moving in the drag direction.
 */
export function creaseFromDrag(layout, start, current) {
  const a = toCellUnits(layout, start.x, start.y);
  const b = toCellUnits(layout, current.x, current.y);
  const startCol = Math.floor(a.x);
  const startRow = Math.floor(a.y);
  if (startCol < 0 || startRow < 0 || startCol >= layout.cols || startRow >= layout.rows) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DRAG_CELLS) return null;

  const vertical = Math.abs(dx) >= Math.abs(dy); // horizontal drag → vertical crease
  const axis = vertical ? 'v' : 'h';
  const lines = vertical ? layout.cols - 1 : layout.rows - 1;
  if (lines < 1) return null;
  const mid = vertical ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
  const index = Math.min(lines, Math.max(1, Math.round(mid)));

  // Drag toward + means the folding half is the 'before' half, and vice versa.
  const side = (vertical ? dx : dy) > 0 ? 'before' : 'after';
  const startLine = vertical ? startCol : startRow;
  const startOnSide = side === 'before' ? startLine < index : startLine >= index;
  return startOnSide ? { axis, index, side } : null;
}

/** Keyboard fold mode starts at the vertical centre line, left half folding. */
export function defaultCrease(board) {
  if (board.w > 1) return { axis: 'v', index: Math.floor(board.w / 2), side: 'before' };
  return { axis: 'h', index: Math.floor(board.h / 2), side: 'before' };
}

const KEY_ACTIONS = {
  ArrowLeft: ['v', -1], a: ['v', -1], A: ['v', -1],
  ArrowRight: ['v', 1], d: ['v', 1], D: ['v', 1],
  ArrowUp: ['h', -1], w: ['h', -1], W: ['h', -1],
  ArrowDown: ['h', 1], s: ['h', 1], S: ['h', 1],
};

/**
 * Keyboard fold mode: Left/Right move a vertical crease, Up/Down a horizontal
 * one (pressing the other pair switches axis, starting at the centre line).
 * F flips which side folds. Returns the new crease, or the same object if the
 * key does nothing.
 */
export function stepCrease(board, crease, key) {
  if (key === 'f' || key === 'F') {
    return { ...crease, side: crease.side === 'before' ? 'after' : 'before' };
  }
  const action = KEY_ACTIONS[key];
  if (!action) return crease;
  const [axis, delta] = action;
  const lines = axis === 'v' ? board.w - 1 : board.h - 1;
  if (lines < 1) return crease;
  if (crease.axis !== axis) {
    return { axis, index: Math.max(1, Math.floor((lines + 1) / 2)), side: crease.side };
  }
  const index = Math.min(lines, Math.max(1, crease.index + delta));
  return index === crease.index ? crease : { ...crease, index };
}

export function sameCrease(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.axis === b.axis && a.index === b.index && a.side === b.side;
}
