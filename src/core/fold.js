// Fold logic: crease geometry, mirror mapping, validation, application, undo.
// Pure functions over the plain-data board from board.js. No DOM access.
//
//   Fold = { axis, index, side }
//     axis  'v' — vertical crease line between columns index-1 and index
//           'h' — horizontal crease line between rows index-1 and index
//           'd' — diagonal "\" through cell centres, col - row = index - (h-1)
//           'a' — anti-diagonal "/" through cell centres, col + row = index
//     index grid line, 1..lineCount (w-1, h-1, or w+h-3 for diagonals)
//     side  the half that folds over (where the drag starts):
//           'before' = left / top of the line (for 'd': below-left),
//           'after' = right / bottom (for 'd': above-right)
//     pocket  optional (Pocket Fold): only one lane folds, the row (for
//           'v') or column (for 'h') with this index; straight creases only.
//           Whether a player may use it is a turn rule (rules.pocket).
//
// Diagonal creases (docs/OPEN-QUESTIONS.md): cells on the line are the
// hinge. They are on neither side, so they stay put and are not covered.
// Whether a player may use them is a turn rule (rules.diagonal), not geometry.
//
// New crease shapes are added as a new entry in AXES. Callers only go
// through the exported functions, so they don't change.
//
// Rules (docs/02-core-mechanics.md, docs/05-tech-architecture.md):
// - Every cell on the folding side moves its whole stack onto its mirror cell,
//   keeping internal order (bottom stays bottom), on top of what is there.
// - A cell whose mirror falls off the board is clipped: its stack stays on its
//   own cell, unfolded and still active.
// - Vacated cells keep `layers: []`. Gameplay treats an empty cell as a void.
// - Lifting a flap (playtest round 2): every layer a fold moves remembers
//   that crease (layer.hinge, hingeKey()). A fold along the same line from
//   the other side, when its folding side holds any such layers, lifts the
//   flap back instead of folding the whole side: on each cell only the
//   layers from the lowest flap layer up (the flap and anything lying on it)
//   move; the paper underneath, and anything pinned there, stays. Cells with
//   no flap layers don't move. Mirroring is its own inverse, so the flap
//   lands back where it came from.
// - A fold is invalid if any resulting stack exceeds board.maxStack.
// - A fold is invalid if a stack would land on a heavy creature (Card
//   Brute: can't be pinned), unless the landing stack's top is a hole, which
//   drops it (docs/OPEN-QUESTIONS.md).
// - Fold charges are the caller's concern.

import { DEFAULT_MAX_STACK, inBounds, cellIndex, cloneBoard, topLayer } from './board.js';
import { tileDef } from './tiles.js';
import { isHeavy } from './creatures.js';

export const SIDES = Object.freeze(['before', 'after']);

/**
 * Crease geometry per axis. Each entry:
 *   lineCount(board)          number of lines (valid index is 1..count)
 *   onFoldingSide(fold, c, r, board)  true if (c, r) is in the half that folds
 *   mirror(fold, c, r, board) destination {col,row} (may be off-board)
 *   normal                    [nx, ny]: the line is { p : n·p = offset }, in
 *                             board cell units (cell (c,r) spans c..c+1);
 *                             n points from 'before' to 'after'
 *   offset(board, index)      that offset; consecutive lines differ by 1
 *   diagonal                  needs rules.diagonal to play (core/turn.js)
 * The continuous fields serve input (snapping a drag) and rendering.
 */
export const AXES = Object.freeze({
  v: {
    lineCount: (board) => board.w - 1,
    onFoldingSide: (fold, col) => (fold.side === 'before' ? col < fold.index : col >= fold.index),
    mirror: (fold, col, row) => ({ col: 2 * fold.index - 1 - col, row }),
    normal: [1, 0],
    offset: (board, index) => index,
    diagonal: false,
  },
  h: {
    lineCount: (board) => board.h - 1,
    onFoldingSide: (fold, col, row) => (fold.side === 'before' ? row < fold.index : row >= fold.index),
    mirror: (fold, col, row) => ({ col, row: 2 * fold.index - 1 - row }),
    normal: [0, 1],
    offset: (board, index) => index,
    diagonal: false,
  },
  // col - row = k, k = index - (h - 1). Lines through a corner cell only
  // (k = ±(size-1)) fold nothing, so they are left out.
  d: {
    lineCount: (board) => Math.max(0, board.w + board.h - 3),
    onFoldingSide: (fold, col, row, board) => {
      const k = fold.index - (board.h - 1);
      return fold.side === 'before' ? col - row < k : col - row > k;
    },
    mirror: (fold, col, row, board) => {
      const k = fold.index - (board.h - 1);
      return { col: row + k, row: col - k };
    },
    normal: [1, -1],
    offset: (board, index) => index - (board.h - 1),
    diagonal: true,
  },
  // col + row = index.
  a: {
    lineCount: (board) => Math.max(0, board.w + board.h - 3),
    onFoldingSide: (fold, col, row) => (fold.side === 'before' ? col + row < fold.index : col + row > fold.index),
    mirror: (fold, col, row) => ({ col: fold.index - row, row: fold.index - col }),
    normal: [1, 1],
    offset: (board, index) => index + 1,
    diagonal: true,
  },
});

/** Whether this crease needs diagonal creases unlocked (rules.diagonal). */
export function isDiagonal(fold) {
  return !!(fold && AXES[fold.axis] && AXES[fold.axis].diagonal);
}

/** Axis ids playable with or without diagonals, in AXES order. */
export function axesFor({ diagonal = false } = {}) {
  return Object.keys(AXES).filter((id) => diagonal || !AXES[id].diagonal);
}

export function maxStackOf(board) {
  return board.maxStack ?? DEFAULT_MAX_STACK;
}

/** Whether this is a one-lane fold (Pocket Fold, rules.pocket). */
export function isPocket(fold) {
  return !!fold && fold.pocket != null;
}

/** Lanes a pocket fold on `axis` may pick (rows for 'v', columns for 'h'); 0 for diagonals. */
export function pocketLanes(board, axis) {
  if (axis === 'v') return board.h;
  if (axis === 'h') return board.w;
  return 0;
}

// Whether (col, row) is in the fold's lane (always, for a whole fold).
function inPocket(fold, col, row) {
  if (!isPocket(fold)) return true;
  return (fold.axis === 'v' ? row : col) === fold.pocket;
}

/** Problems with the crease itself (shape, bounds). Empty array = well-formed. */
export function creaseErrors(board, fold) {
  if (!fold || typeof fold !== 'object') return [{ code: 'bad-fold' }];
  const geo = AXES[fold.axis];
  if (!geo) return [{ code: 'bad-axis', axis: fold.axis }];
  const errors = [];
  if (!Number.isInteger(fold.index) || fold.index < 1 || fold.index > geo.lineCount(board)) {
    errors.push({ code: 'bad-index', index: fold.index });
  }
  if (!SIDES.includes(fold.side)) errors.push({ code: 'bad-side', side: fold.side });
  if (isPocket(fold) && !(Number.isInteger(fold.pocket) && fold.pocket >= 0 && fold.pocket < pocketLanes(board, fold.axis))) {
    errors.push({ code: 'bad-pocket', pocket: fold.pocket });
  }
  return errors;
}

/**
 * The cells along the crease on the side that stays (Crease Trap): the
 * lane right beside a straight crease, or the hinge cells on a diagonal.
 * A pocket fold's edge is the one cell in its lane. Well-formed folds only.
 */
export function creaseEdge(board, fold) {
  const geo = AXES[fold.axis];
  const cells = [];
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      if (!inPocket(fold, col, row)) continue;
      let edge;
      if (geo.diagonal) {
        edge = !geo.onFoldingSide({ ...fold, side: 'before' }, col, row, board)
          && !geo.onFoldingSide({ ...fold, side: 'after' }, col, row, board);
      } else {
        const at = fold.axis === 'v' ? col : row;
        edge = at === (fold.side === 'before' ? fold.index : fold.index - 1);
      }
      if (edge) cells.push({ col, row });
    }
  }
  return cells;
}

/**
 * Where a source cell lands. Returns null if (col,row) is not on the folding
 * side; otherwise { col, row, clipped } where clipped means off-board.
 */
export function mirrorCell(board, fold, col, row) {
  const geo = AXES[fold.axis];
  if (!inPocket(fold, col, row) || !geo.onFoldingSide(fold, col, row, board)) return null;
  const dest = geo.mirror(fold, col, row, board);
  return { col: dest.col, row: dest.row, clipped: !inBounds(board, dest.col, dest.row) };
}

/**
 * Full mapping for a well-formed fold, in row-major order of source cells:
 *   [{ from: {col,row}, to: {col,row}, clipped }]
 */
export function foldMapping(board, fold) {
  const moves = [];
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      const dest = mirrorCell(board, fold, col, row);
      if (!dest) continue;
      moves.push({ from: { col, row }, to: { col: dest.col, row: dest.row }, clipped: dest.clipped });
    }
  }
  return moves;
}

/** The crease a layer remembers after `fold` moves it (pocket lanes share it). */
export function hingeKey(fold) {
  return `${fold.axis}${fold.index}${fold.side === 'before' ? 'b' : 'a'}`;
}

/** The hinge of the flaps this fold would lift: the same line, the other side. */
export function liftKey(fold) {
  return hingeKey({ ...fold, side: fold.side === 'before' ? 'after' : 'before' });
}

// How many top layers leave a cell's stack: from the lowest layer hinged on
// `key` up, or 0 when it has none.
function flapCount(layers, key) {
  for (let d = 0; d < layers.length; d++) {
    if (layers[d].hinge === key) return layers.length - d;
  }
  return 0;
}

/**
 * The fold's moves with what each carries: foldMapping() entries plus
 * `count`, the layers that leave the source cell (its top `count`; 0 for a
 * clipped or empty cell). Returns { lift, moves }: lift says the fold lifts
 * flaps back (see the rules above) rather than folding whole stacks.
 */
export function foldMoves(board, fold) {
  const moves = foldMapping(board, fold);
  const key = liftKey(fold);
  let lift = false;
  for (const m of moves) {
    if (!m.clipped && flapCount(board.cells[cellIndex(board, m.from.col, m.from.row)].layers, key)) {
      lift = true;
      break;
    }
  }
  for (const m of moves) {
    const layers = board.cells[cellIndex(board, m.from.col, m.from.row)].layers;
    m.count = m.clipped ? 0 : lift ? flapCount(layers, key) : layers.length;
  }
  return { lift, moves };
}

/**
 * Check a fold without applying it.
 * Returns { ok, reasons, perCellHeights, moves }:
 *   reasons         [{ code, ... }]; per-cell problems carry col/row
 *                   ('stack-overflow' with height and max; 'heavy' with
 *                   the creature's kind)
 *   perCellHeights  resulting stack height per cell (row-major), or null if
 *                   the crease is malformed
 *   moves           foldMoves() entries (with `count`), or null if malformed
 *   lift            the fold lifts flaps back (foldMoves)
 */
export function validateFold(board, fold) {
  const errors = creaseErrors(board, fold);
  if (errors.length) return { ok: false, reasons: errors, perCellHeights: null, moves: null, lift: false };

  const perCellHeights = board.cells.map((cell) => cell.layers.length);
  const { lift, moves } = foldMoves(board, fold);
  for (const m of moves) {
    if (!m.count) continue;
    perCellHeights[cellIndex(board, m.to.col, m.to.row)] += m.count;
    perCellHeights[cellIndex(board, m.from.col, m.from.row)] -= m.count;
  }

  const max = maxStackOf(board);
  const reasons = [];
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      const height = perCellHeights[cellIndex(board, col, row)];
      if (height > max) reasons.push({ code: 'stack-overflow', col, row, height, max });
    }
  }
  for (const m of moves) {
    if (!m.count) continue;
    const dest = topLayer(board, m.to.col, m.to.row);
    const src = topLayer(board, m.from.col, m.from.row);
    if (!src || !dest || !isHeavy(dest.creature) || tileDef(src.tile).hole) continue;
    reasons.push({ code: 'heavy', col: m.to.col, row: m.to.row, kind: dest.creature.kind });
  }
  return { ok: reasons.length === 0, reasons, perCellHeights, moves, lift };
}

/**
 * Apply a fold and return a new board. The input board is never mutated.
 * Throws if the fold is invalid (call validateFold first for previews).
 *
 * `resolve(board, landings)` is the hook for creature interactions (pin,
 * strand, void drop: Phase 2). It receives the new board (safe to mutate or
 * replace) and the landings list, and returns the board. Each landing is
 *   { from, to, baseHeight, count }
 * meaning `count` layers moved from `from` onto `to`, sitting above the
 * `baseHeight` layers already there. Default: no resolution.
 */
export function applyFold(board, fold, { resolve = null } = {}) {
  const check = validateFold(board, fold);
  if (!check.ok) {
    const codes = check.reasons.map((r) => r.code).join(', ');
    throw new Error(`Invalid fold: ${codes}`);
  }
  const next = cloneBoard(board);
  const landings = [];
  const hinge = hingeKey(fold);
  for (const m of check.moves) {
    if (!m.count) continue;
    const src = next.cells[cellIndex(next, m.from.col, m.from.row)];
    const dst = next.cells[cellIndex(next, m.to.col, m.to.row)];
    landings.push({ from: m.from, to: m.to, baseHeight: dst.layers.length, count: m.count });
    const moving = src.layers.splice(src.layers.length - m.count, m.count);
    for (const l of moving) l.hinge = hinge;
    dst.layers.push(...moving);
  }
  return resolve ? resolve(next, landings) : next;
}

/**
 * Undo snapshot for the free unfold: an exact copy of the board before the
 * fold, plus the fold itself (for UI/animation). Plain serializable data.
 */
export function createUndoSnapshot(board, fold) {
  return { board: cloneBoard(board), fold: { ...fold } };
}

/** Restore the board from an undo snapshot (returns a fresh copy). */
export function unfold(snapshot) {
  return cloneBoard(snapshot.board);
}

/** Convenience: apply a fold and capture its undo snapshot in one call. */
export function foldWithUndo(board, fold, opts) {
  return { board: applyFold(board, fold, opts), undo: createUndoSnapshot(board, fold) };
}
