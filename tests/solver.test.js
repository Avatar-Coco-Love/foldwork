import assert from 'node:assert/strict';
import { test } from './harness.js';
import { parseMap, DEV_MAPS } from '../src/core/maps.js';
import { createFloorState } from '../src/core/turn.js';
import { solve, stateKey, candidateActions } from '../src/core/solver.js';
import { encodeAction, decodeAction, replay } from '../src/core/replay.js';

const floor = (rows, opts = {}) => createFloorState({ ...parseMap(rows), ...opts });

test('solver: finds the shortest line and it replays to a win', () => {
  const s = floor(['. E .', '. . .', '. @ .']);
  const r = solve(s);
  assert.equal(r.solvable, true);
  assert.equal(r.turns, 2);
  assert.equal(replay(s, r.actions).state.status, 'won');
  const walk = solve(s, { noFolds: true });
  assert.deepEqual(walk.actions, [{ type: 'move', dir: 'up' }, { type: 'move', dir: 'up' }]);
});

test('solver: courier dev map needs its fold; unsolvable boards say so', () => {
  const m = DEV_MAPS.courier;
  const s = floor(m.rows, { charges: m.charges });
  const r = solve(s);
  assert.equal(r.solvable, true);
  assert.equal(r.folds, 1);
  const walled = floor(['E # .', '# # .', '. . @'], { charges: 0 });
  const none = solve(walled);
  assert.equal(none.solvable, false);
  assert.equal(none.capped, false);
});

test('solver: caps stop the search and are reported', () => {
  const s = floor(['. . . . .', '. . . . .', '# # # # #', '. . . . .', '. . @ . .'], { charges: 0 });
  const r = solve(s, { maxStates: 3 });
  assert.equal(r.solvable, false);
  assert.equal(r.capped, true);
});

test('solver: state key ignores turn and undo, sees charges, keys and creatures', () => {
  const s = floor(['. k .', '. @ m']);
  assert.equal(stateKey(s), stateKey({ ...s, turn: 9, undo: { state: s } }));
  assert.notEqual(stateKey(s), stateKey({ ...s, charges: s.charges - 1 }));
  assert.notEqual(stateKey(s), stateKey({ ...s, keys: 1 }));
  const moved = replay(s, ['l']).state;
  assert.notEqual(stateKey(s), stateKey(moved));
  // 4 moves + wait + 2 axes × 2 lines(3 wide: 2, 2 high: 1) × 2 sides
  assert.equal(candidateActions(s.board).length, 5 + (2 + 1) * 2);
  assert.equal(candidateActions(s.board, { noFolds: true }).length, 5);
});

test('replay codes: every action round-trips; unknown codes decode to null', () => {
  const actions = [
    { type: 'move', dir: 'up' }, { type: 'move', dir: 'down' }, { type: 'move', dir: 'left' },
    { type: 'move', dir: 'right' }, { type: 'wait' }, { type: 'undo' },
    { type: 'fold', fold: { axis: 'h', index: 3, side: 'after' } },
    { type: 'fold', fold: { axis: 'v', index: 12, side: 'before' } },
  ];
  for (const a of actions) assert.deepEqual(decodeAction(encodeAction(a)), a);
  assert.equal(encodeAction({ type: 'fold', fold: { axis: 'v', index: 1, side: 'x' } }), null);
  assert.equal(decodeAction('q'), null);
  assert.equal(decodeAction('fv1c'), null);
  assert.equal(decodeAction(7), null);
});

test('replay: refused actions are skipped and reported, others apply in order', () => {
  const s = floor(['# E', '. .', '@ .']);
  const r = replay(s, ['u', 'u', 'r', 'u']); // second 'u' hits the wall
  assert.deepEqual(r.refused, [1]);
  assert.equal(r.state.status, 'won');
  assert.equal(r.state.turn, 3);
});
