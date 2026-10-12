import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  creaseFromDrag, isOffBoard, defaultCrease, stepCrease, sameCrease,
} from '../src/ui/foldGesture.js';
import { createBoard } from '../src/core/board.js';

// 5x5 board, 10px cells, origin offset to catch coordinate bugs.
const L = { boardX: 100, boardY: 50, cellSize: 10, cols: 5, rows: 5 };
const pt = (cx, cy) => ({ x: L.boardX + cx * L.cellSize, y: L.boardY + cy * L.cellSize });

test('drag right from the left edge: crease at the drag midpoint, left half folds', () => {
  assert.deepEqual(creaseFromDrag(L, pt(0.5, 2.5), pt(3.5, 2.5)), { axis: 'v', index: 2, side: 'before' });
  assert.deepEqual(creaseFromDrag(L, pt(0.5, 2.5), pt(1.5, 2.7)), { axis: 'v', index: 1, side: 'before' });
});

test('drag left folds the right half; drag up/down gives horizontal creases', () => {
  assert.deepEqual(creaseFromDrag(L, pt(4.5, 1), pt(1.5, 1.2)), { axis: 'v', index: 3, side: 'after' });
  assert.deepEqual(creaseFromDrag(L, pt(2, 0.5), pt(2.3, 2.5)), { axis: 'h', index: 2, side: 'before' });
  assert.deepEqual(creaseFromDrag(L, pt(2, 4.5), pt(2, 0.5)), { axis: 'h', index: 3, side: 'after' });
});

test('crease snaps to the nearest line and clamps to interior lines', () => {
  assert.deepEqual(creaseFromDrag(L, pt(0.2, 1), pt(4.9, 1)), { axis: 'v', index: 3, side: 'before' });
  assert.deepEqual(creaseFromDrag(L, pt(0.5, 1), pt(9, 1)), { axis: 'v', index: 4, side: 'before' });
});

test('short drags, off-board starts and inconsistent snaps give no crease', () => {
  assert.equal(creaseFromDrag(L, pt(2.5, 2.5), pt(2.8, 2.6)), null); // tap
  assert.equal(creaseFromDrag(L, pt(-0.5, 2), pt(3, 2)), null); // starts off board
  // Start at x=2.1, drag to 2.7: midpoint 2.4 snaps to line 2, which is not
  // ahead of the start cell (col 2), so nothing folds yet.
  assert.equal(creaseFromDrag(L, pt(2.1, 1), pt(2.7, 1)), null);
  // Dragging outward from the last column can't fold anything.
  assert.equal(creaseFromDrag(L, pt(4.5, 1), pt(9, 1)), null);
});

test('the start cell is always on the folding side', () => {
  for (let sx = 0.1; sx < 5; sx += 0.37) {
    for (let ex = -1; ex < 6; ex += 0.41) {
      const c = creaseFromDrag(L, pt(sx, 2), pt(ex, 2));
      if (!c) continue;
      const col = Math.floor(sx);
      assert.ok(c.side === 'before' ? col < c.index : col >= c.index, `${sx}→${ex}`);
    }
  }
});

test('off-board detection uses a margin', () => {
  assert.equal(isOffBoard(L, pt(5.3, 2).x, pt(5.3, 2).y), false);
  assert.equal(isOffBoard(L, pt(5.7, 2).x, pt(5.7, 2).y), true);
  assert.equal(isOffBoard(L, pt(2, -0.7).x, pt(2, -0.7).y), true);
});

test('keyboard: default crease, move, clamp, switch axis, flip side', () => {
  const b = createBoard(6, 5);
  let c = defaultCrease(b);
  assert.deepEqual(c, { axis: 'v', index: 3, side: 'before' });
  c = stepCrease(b, c, 'ArrowRight');
  c = stepCrease(b, c, 'd');
  c = stepCrease(b, c, 'ArrowRight');
  assert.equal(c.index, 5);
  assert.equal(stepCrease(b, c, 'ArrowRight'), c); // clamped: same object
  c = stepCrease(b, c, 'f');
  assert.equal(c.side, 'after');
  c = stepCrease(b, c, 'ArrowDown'); // switch to horizontal at centre
  assert.deepEqual(c, { axis: 'h', index: 2, side: 'after' });
  c = stepCrease(b, c, 'w');
  c = stepCrease(b, c, 'ArrowUp');
  assert.equal(c.index, 1);
  assert.equal(stepCrease(b, c, 'x'), c);
  assert.ok(sameCrease(c, { ...c }) && !sameCrease(c, null));
});

test('diagonal drags snap to diagonal creases only when unlocked', () => {
  const on = { diagonal: true };
  assert.deepEqual(creaseFromDrag(L, pt(0.5, 0.5), pt(2.5, 2.5), on), { axis: 'a', index: 2, side: 'before' });
  assert.deepEqual(creaseFromDrag(L, pt(0.5, 4.5), pt(2.5, 2.5), on), { axis: 'd', index: 2, side: 'before' });
  assert.deepEqual(creaseFromDrag(L, pt(4.5, 0.5), pt(2.5, 2.5), on), { axis: 'd', index: 6, side: 'after' });
  assert.equal(creaseFromDrag(L, pt(0.5, 0.5), pt(2.5, 2.5)).axis, 'v'); // locked: dominant axis
  // Mostly-horizontal drags stay orthogonal even when diagonals are on.
  assert.equal(creaseFromDrag(L, pt(0.5, 2), pt(3.5, 2.8), on).axis, 'v');
});

test('keyboard: R turns the crease through the unlocked axes; arrows push diagonals', () => {
  const b = createBoard(5, 5);
  const v = defaultCrease(b);
  const on = { diagonal: true };
  const h = stepCrease(b, v, 'r', on);
  assert.equal(h.axis, 'h');
  const d = stepCrease(b, h, 'R', on);
  assert.deepEqual(d, { axis: 'd', index: 4, side: v.side });
  const a = stepCrease(b, d, 'r', on);
  assert.deepEqual(a, { axis: 'a', index: 4, side: v.side });
  assert.equal(stepCrease(b, a, 'r', on).axis, 'v');
  assert.equal(stepCrease(b, h, 'r').axis, 'v'); // locked: v ↔ h only
  assert.equal(stepCrease(b, d, 'ArrowRight', on).index, 5);
  assert.equal(stepCrease(b, d, 'ArrowDown', on).index, 3);
  assert.equal(stepCrease(b, a, 'ArrowUp', on).index, 3);
  assert.equal(stepCrease(b, { ...a, index: 7 }, 'ArrowRight', on).index, 7); // clamped
});
