import assert from 'node:assert/strict';
import { test } from './harness.js';
import { foldsInEffect } from '../src/core/foldHistory.js';

test('foldsInEffect numbers folds still in effect; undo takes the latest back', () => {
  assert.deepEqual(foldsInEffect([]), []);
  const log = ['r', 'fv2a', 'w', 'fh3b'];
  assert.deepEqual(foldsInEffect(log), [
    { fold: { axis: 'v', index: 2, side: 'after' }, n: 1, at: 1 },
    { fold: { axis: 'h', index: 3, side: 'before' }, n: 2, at: 3 },
  ]);
  // Undone, then a new fold takes its number.
  const redo = foldsInEffect([...log, 'z', 'fv1b']);
  assert.deepEqual(redo.map((f) => [f.n, f.fold.axis, f.at]), [[1, 'v', 1], [2, 'v', 5]]);
  // Action objects work too; unknown codes are skipped.
  assert.equal(foldsInEffect([{ type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } }, '?']).length, 1);
});

test('buildCreaseMarks places each fold on its line; repeats on a line get the next slot', async () => {
  const { buildCreaseMarks } = await import('../src/render/preview.js');
  const { createBoard } = await import('../src/core/board.js');
  const board = createBoard(5, 5);
  const marks = buildCreaseMarks(board, foldsInEffect(['fv1b', 'fh2a', 'fv1a']));
  assert.deepEqual(marks.map((m) => [m.n, m.slot]), [[1, 0], [2, 0], [3, 1]]);
  assert.deepEqual([marks[0].line.x0, marks[0].line.x1], [1, 1]); // the line between columns 0 and 1
});
