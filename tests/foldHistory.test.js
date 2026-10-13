import assert from 'node:assert/strict';
import { test } from './harness.js';
import { foldsInEffect, rewindTo, foldText } from '../src/core/foldHistory.js';
import { createBoard } from '../src/core/board.js';
import { createFloorState } from '../src/core/turn.js';
import { replay, encodeAction, decodeAction } from '../src/core/replay.js';

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

const start = () => createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 }, charges: 6 });

test('rewindTo a fold\'s index gives the floor just before it, same as replaying by hand', () => {
  const s0 = start();
  const log = ['r', 'fv1b', 'w', 'u', 'fh1b', 'l'];
  const folds = foldsInEffect(log);
  const second = folds[1];
  const back = rewindTo(s0, log, second.at);
  assert.deepEqual(back.actions, ['r', 'fv1b', 'w', 'u']);
  // Restart Floor plus the same moves gives the very same state.
  assert.deepEqual(back.state, replay(s0, log.slice(0, 4)).state);
  assert.equal(back.state.charges, 5); // one fold spent, the second not yet
  assert.equal(foldsInEffect(back.actions).length, 1);
  // A fold made right before is still undoable, as it was then.
  assert.ok(rewindTo(s0, ['fv1b', 'fh1b'], 1).state.undo);
  // To the first fold: the floor before any fold, full charges.
  const first = rewindTo(s0, log, folds[0].at);
  assert.equal(first.state.charges, 6);
  assert.equal(first.state.turn, 1); // after the step right, before the fold
  // The start state itself is untouched.
  assert.equal(s0.turn, 0);
});

test('rewindTo refuses an index out of range or a log that no longer replays', () => {
  const s0 = start();
  assert.equal(rewindTo(s0, ['r'], 2), null);
  assert.equal(rewindTo(s0, ['r'], -1), null);
  assert.equal(rewindTo(s0, ['r'], 0.5), null);
  assert.deepEqual(rewindTo(s0, ['r'], 0).actions, []);
  assert.equal(rewindTo(s0, ['z', 'r'], 1), null); // nothing to undo: refused
});

test('rewind codes round-trip and replay back to the accepted prefix', () => {
  assert.equal(encodeAction({ type: 'rewind', to: 4 }), 'x4');
  assert.deepEqual(decodeAction('x12'), { type: 'rewind', to: 12 });
  assert.equal(encodeAction({ type: 'rewind', to: -1 }), null);
  const s0 = start();
  // A telemetry log: refused actions stay in it but don't count toward `to`.
  const tele = ['r', 'z', 'fv1b', 'w', 'x1', 'u'];
  const { state, refused } = replay(s0, tele);
  assert.deepEqual(refused, [1]);
  assert.deepEqual(state, replay(s0, ['r', 'u']).state);
  assert.deepEqual(replay(s0, ['r', 'x5']).refused, [1]); // past the accepted actions
});

test('foldText says which part of the paper moved', () => {
  const b = createBoard(5, 5);
  assert.equal(foldText(b, { axis: 'v', index: 1, side: 'before' }), 'Left 1 column folded over to the right');
  assert.equal(foldText(b, { axis: 'v', index: 2, side: 'after' }), 'Right 3 columns folded over to the left');
  assert.equal(foldText(b, { axis: 'h', index: 2, side: 'before' }), 'Top 2 rows folded down');
  assert.equal(foldText(b, { axis: 'h', index: 4, side: 'after' }), 'Bottom 1 row folded up');
  assert.match(foldText(b, { axis: 'd', index: 3, side: 'before' }), /Lower-left/);
  assert.match(foldText(b, { axis: 'a', index: 3, side: 'after' }), /Lower-right/);
});
