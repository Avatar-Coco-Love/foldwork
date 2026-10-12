// Fold gesture math: turns a drag or key presses into a crease. Pure (no
// DOM), so it is unit tested; ui/input.js feeds it pointer and key events.
//
// Drag model, like real paper: you grab the paper where the drag starts and
// pull it, so the crease is the perpendicular bisector of the drag (its
// midpoint), snapped to the nearest grid line. The dominant drag direction
// picks the axis (a diagonal too, when unlocked). The start cell is always
// on the folding side.

import { AXES, axesFor } from '../core/fold.js';

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

/** Drags within this angle (degrees) of a diagonal snap to a diagonal crease. */
export const DIAGONAL_SNAP_DEG = 22.5;
const DIAGONAL_RATIO = Math.tan((DIAGONAL_SNAP_DEG * Math.PI) / 180);

/**
 * Crease for a drag from `start` to `current` (CSS px). Returns
 * { axis, index, side } or null when the drag is too short, starts off the
 * board, or the snapped crease would not leave the start cell on the folding
 * side moving in the drag direction (a diagonal's hinge cells never are).
 * With `diagonal`, a drag close to 45° gives a diagonal crease.
 */
export function creaseFromDrag(layout, start, current, { diagonal = false } = {}) {
  const a = toCellUnits(layout, start.x, start.y);
  const b = toCellUnits(layout, current.x, current.y);
  const startCol = Math.floor(a.x);
  const startRow = Math.floor(a.y);
  if (startCol < 0 || startRow < 0 || startCol >= layout.cols || startRow >= layout.rows) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < MIN_DRAG_CELLS) return null;

  // The drag runs along the crease's normal: horizontal drag → 'v' crease,
  // down-right drag → 'a' (the "/" line), up-right drag → 'd' (the "\" line).
  let axis;
  if (diagonal && Math.min(ax, ay) >= Math.max(ax, ay) * DIAGONAL_RATIO) axis = dx * dy > 0 ? 'a' : 'd';
  else axis = ax >= ay ? 'v' : 'h';
  const board = { w: layout.cols, h: layout.rows };
  const geo = AXES[axis];
  const lines = geo.lineCount(board);
  if (lines < 1) return null;

  // Snap the drag's midpoint to the nearest line (lines are 1 apart in n·p).
  const [nx, ny] = geo.normal;
  const mid = (nx * (a.x + b.x) + ny * (a.y + b.y)) / 2;
  const index = Math.min(lines, Math.max(1, Math.round(mid - geo.offset(board, 0))));

  // Dragging along +n means the folding half is the 'before' half.
  const side = nx * dx + ny * dy > 0 ? 'before' : 'after';
  const crease = { axis, index, side };
  return geo.onFoldingSide(crease, startCol, startRow, board) ? crease : null;
}

/** Keyboard fold mode starts at the vertical centre line, left half folding. */
export function defaultCrease(board) {
  if (board.w > 1) return { axis: 'v', index: Math.floor(board.w / 2), side: 'before' };
  return { axis: 'h', index: Math.floor(board.h / 2), side: 'before' };
}

/** Key → the direction it pushes the crease, in cell units. */
const KEY_DIRS = {
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
};

/** The crease line of `axis` nearest the board's centre. */
function centreCrease(board, axis, side) {
  const lines = AXES[axis].lineCount(board);
  return lines < 1 ? null : { axis, index: Math.max(1, Math.floor((lines + 1) / 2)), side };
}

/**
 * Keyboard fold mode. Arrows/WASD push the crease that way: on a vertical
 * or horizontal crease, the other pair switches axis (starting at the
 * centre line); a diagonal moves with any arrow. F flips which side folds.
 * With `diagonal`, R turns the crease to the next axis (v → h → d → a),
 * starting at that axis's centre line. Returns the new crease, or the same
 * object if the key does nothing.
 */
export function stepCrease(board, crease, key, { diagonal = false } = {}) {
  if (key === 'f' || key === 'F') {
    return { ...crease, side: crease.side === 'before' ? 'after' : 'before' };
  }
  if (key === 'r' || key === 'R') {
    const axes = axesFor({ diagonal });
    if (axes.length < 2) return crease;
    for (let n = 1; n < axes.length; n++) {
      const next = centreCrease(board, axes[(axes.indexOf(crease.axis) + n) % axes.length], crease.side);
      if (next) return next;
    }
    return crease;
  }
  const dir = KEY_DIRS[key];
  if (!dir) return crease;
  const [nx, ny] = AXES[crease.axis].normal;
  const push = nx * dir[0] + ny * dir[1];
  if (push === 0) return centreCrease(board, dir[0] ? 'v' : 'h', crease.side) || crease;
  const lines = AXES[crease.axis].lineCount(board);
  const index = Math.min(lines, Math.max(1, crease.index + Math.sign(push)));
  return index === crease.index ? crease : { ...crease, index };
}

export function sameCrease(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.axis === b.axis && a.index === b.index && a.side === b.side;
}
