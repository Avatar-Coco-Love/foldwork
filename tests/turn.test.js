import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, getCell, topLayer, findCreature, cloneBoard } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createCreature, CREATURE_DEFS } from '../src/core/creatures.js';
import {
  createFloorState, defaultStart, act, playerOf, canUndo, foldCheck, PLAYER_ID, DEFAULT_FOLD_CHARGES,
} from '../src/core/turn.js';

const at = (s) => {
  const p = findCreature(s.board, PLAYER_ID);
  return p && { col: p.col, row: p.row };
};
const types = (r) => r.events.map((e) => e.type);
const fresh = (opts = {}) => createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 }, ...opts });
// A plain test creature (enemy kinds arrive in Phase 2b).
const dummy = (id, hp = 1) => ({ id, kind: 'dummy', hp, maxHp: hp });

test('floor state: player placed on the top layer with default HP and charges', () => {
  const board = createBoard(5, 5);
  const s = createFloorState({ board });
  assert.deepEqual(at(s), { col: 2, row: 4 }); // bottom-centre default
  assert.equal(playerOf(s).hp, CREATURE_DEFS.player.hp);
  assert.equal(playerOf(s).hp, 3);
  assert.equal(s.charges, DEFAULT_FOLD_CHARGES);
  assert.equal(s.status, 'playing');
  assert.equal(topLayer(board, 2, 4).creature, null, 'input board untouched');
});

test('default start skips walls, voids and stacks topped by them', () => {
  const b = createBoard(5, 5, (c, r) => (r === 4 ? TILE.WALL : TILE.FLOOR));
  getCell(b, 2, 3).layers.push({ tile: TILE.VOID, creature: null, item: null, flags: 0 });
  // Row 4 is wall and (2,3) is void-topped, so the nearest free cells to
  // (2,4) are at distance 2; row-major order picks (2,2) before (1,3).
  assert.deepEqual(defaultStart(b), { col: 2, row: 2 });
  assert.equal(defaultStart(createBoard(5, 5, TILE.WALL)), null);
  assert.throws(() => createFloorState({ board: createBoard(5, 5, TILE.WALL) }));
});

test('move: one step, takes a turn, input state untouched', () => {
  const s = fresh();
  const r = act(s, { type: 'move', dir: 'up' });
  assert.ok(r.ok);
  assert.deepEqual(at(r.state), { col: 2, row: 1 });
  assert.deepEqual(at(s), { col: 2, row: 2 });
  assert.equal(r.state.turn, 1);
  assert.deepEqual(r.events, [{ type: 'move', id: PLAYER_ID, from: { col: 2, row: 2 }, to: { col: 2, row: 1 } }]);
});

test('move: walls and the board edge reject without taking a turn', () => {
  const b = createBoard(5, 5, (c, r) => (c === 3 && r === 2 ? TILE.WALL : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const wall = act(s, { type: 'move', dir: 'right' });
  assert.equal(wall.ok, false);
  assert.equal(wall.reason, 'blocked');
  assert.equal(wall.state, s);
  const edge = createFloorState({ board: createBoard(5, 5), player: { col: 0, row: 0 } });
  assert.equal(act(edge, { type: 'move', dir: 'left' }).reason, 'edge');
  assert.equal(act(s, { type: 'move', dir: 'north' }).reason, 'bad-action');
  assert.equal(act(s, { type: 'dance' }).reason, 'bad-action');
});

test('move: the player climbs onto stacks and stands on the top layer', () => {
  const b = createBoard(5, 5);
  getCell(b, 2, 1).layers.push({ tile: TILE.FLOOR, creature: null, item: null, flags: 0 });
  const r = act(createFloorState({ board: b, player: { col: 2, row: 2 } }), { type: 'move', dir: 'up' });
  const p = findCreature(r.state.board, PLAYER_ID);
  assert.equal(p.depth, 1);
  assert.ok(p.top);
});

test('move into a void tile: fall and defeat', () => {
  const b = createBoard(5, 5, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  const r = act(createFloorState({ board: b, player: { col: 2, row: 2 } }), { type: 'move', dir: 'up' });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['move', 'fall', 'defeat']);
  assert.equal(r.state.status, 'lost');
  assert.deepEqual(r.state.outcome, { cause: 'fall' });
  assert.equal(playerOf(r.state), null);
  assert.equal(act(r.state, { type: 'wait' }).reason, 'game-over');
});

test('move into an empty (folded-away) cell also falls', () => {
  const b = createBoard(5, 5);
  getCell(b, 2, 1).layers = [];
  const r = act(createFloorState({ board: b, player: { col: 2, row: 2 } }), { type: 'move', dir: 'up' });
  assert.deepEqual(types(r), ['move', 'fall', 'defeat']);
  assert.equal(r.state.status, 'lost');
});

test('a void covered by a folded floor layer is walkable', () => {
  const b = createBoard(5, 5, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  let s = createFloorState({ board: b, player: { col: 2, row: 3 } });
  // Fold row 0 down over row 1: the floor from (2,0) covers the void at (2,1).
  s = act(s, { type: 'fold', fold: { axis: 'h', index: 1, side: 'before' } }).state;
  assert.equal(topLayer(s.board, 2, 1).tile, TILE.FLOOR);
  s = act(s, { type: 'move', dir: 'up' }).state;
  s = act(s, { type: 'move', dir: 'up' }).state;
  assert.equal(s.status, 'playing');
  assert.deepEqual(at(s), { col: 2, row: 1 });
});

test('bump: moving into a creature hits it for 1 and the player stays put', () => {
  const b = createBoard(5, 5);
  topLayer(b, 2, 1).creature = dummy('m1', 2);
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const r = act(s, { type: 'move', dir: 'up' });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['bump', 'damage']);
  assert.deepEqual(at(r.state), { col: 2, row: 2 });
  assert.equal(topLayer(r.state.board, 2, 1).creature.hp, 1);
  assert.equal(topLayer(s.board, 2, 1).creature.hp, 2, 'previous state untouched');
  const r2 = act(r.state, { type: 'move', dir: 'up' });
  assert.deepEqual(types(r2), ['bump', 'damage', 'death']);
  assert.equal(topLayer(r2.state.board, 2, 1).creature, null);
  assert.equal(r2.events[2].creature.id, 'm1');
});

test('damage to the player at 0 HP ends the floor', async () => {
  const { damageAt } = await import('../src/core/turn.js');
  const s = { ...fresh({ hp: 1 }) };
  s.board = cloneBoard(s.board);
  const events = [];
  damageAt(s, { col: 2, row: 2 }, 1, (e) => events.push(e));
  assert.deepEqual(events.map((e) => e.type), ['damage', 'death', 'defeat']);
  assert.equal(s.status, 'lost');
  assert.deepEqual(s.outcome, { cause: 'hp' });
});

test('custom HP and charges', () => {
  const s = fresh({ hp: 5, charges: 1 });
  assert.equal(playerOf(s).hp, 5);
  assert.equal(playerOf(s).maxHp, 5);
  assert.equal(s.charges, 1);
});

test('wait takes a turn and changes nothing else', () => {
  const s = fresh();
  const r = act(s, { type: 'wait' });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['wait']);
  assert.equal(r.state.turn, 1);
  assert.deepEqual(r.state.board, s.board);
});

test('fold: costs a charge, moves the player with its layer, takes a turn', () => {
  const s = fresh();
  const fold = { axis: 'v', index: 3, side: 'before' };
  const r = act(s, { type: 'fold', fold });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['fold']);
  assert.equal(r.state.charges, s.charges - 1);
  assert.equal(r.state.turn, 1);
  assert.deepEqual(at(r.state), { col: 3, row: 2 }); // mirrored over line 3
  assert.ok(canUndo(r.state));
});

test('fold: invalid creases and empty charges are rejected', () => {
  const s = fresh();
  assert.equal(act(s, { type: 'fold', fold: { axis: 'v', index: 9, side: 'before' } }).reason, 'invalid-fold');
  const none = fresh({ charges: 0 });
  const fold = { axis: 'v', index: 1, side: 'before' };
  assert.equal(act(none, { type: 'fold', fold }).reason, 'no-charges');
  const check = foldCheck(none, fold);
  assert.equal(check.ok, false);
  assert.equal(check.reasons[0].code, 'no-charges');
  assert.ok(foldCheck(s, fold).ok);
});

test('undo restores the exact prior state, refunds the charge, takes no turn', () => {
  const s = act(fresh(), { type: 'move', dir: 'up' }).state;
  const folded = act(s, { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  const r = act(folded.state, { type: 'undo' });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['unfold']);
  assert.deepEqual(r.state, { ...s, undo: null });
  assert.equal(r.state.charges, DEFAULT_FOLD_CHARGES);
  assert.equal(r.state.turn, 1);
  assert.equal(canUndo(r.state), false);
  assert.equal(act(r.state, { type: 'undo' }).reason, 'no-undo');
});

test('undo is only available until the next action; only the latest fold', () => {
  const f1 = { axis: 'v', index: 1, side: 'before' };
  const f2 = { axis: 'v', index: 4, side: 'after' };
  let s = act(fresh(), { type: 'fold', fold: f1 }).state;
  assert.equal(canUndo(act(s, { type: 'wait' }).state), false);
  assert.equal(canUndo(act(s, { type: 'move', dir: 'up' }).state), false);
  // A rejected action does not spend the undo.
  assert.equal(act(s, { type: 'move', dir: 'nowhere' }).ok, false);
  assert.ok(canUndo(s));
  const s1 = s;
  s = act(s, { type: 'fold', fold: f2 }).state;
  assert.equal(s.charges, 1);
  s = act(s, { type: 'undo' }).state;
  assert.deepEqual(s, { ...s1, undo: null }); // back to after the first fold
  assert.equal(s.charges, 2);
  assert.equal(canUndo(s), false);
});

test('a player covered by a fold is pinned: cannot move, can still wait', () => {
  // Folding the left half over the player at (1,2) stacks (0,2) on top.
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 1, row: 2 } });
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  const p = findCreature(r.state.board, PLAYER_ID);
  assert.equal(p.top, false);
  assert.equal(act(r.state, { type: 'move', dir: 'up' }).reason, 'pinned');
  assert.ok(act(r.state, { type: 'wait' }).ok);
});

test('snapshots: each event carries the board right after it', () => {
  const b = createBoard(5, 5);
  topLayer(b, 2, 1).creature = dummy('m1', 1);
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const r = act(s, { type: 'move', dir: 'up' }, { snapshots: true });
  assert.deepEqual(types(r), ['bump', 'damage', 'death']);
  assert.equal(topLayer(r.events[1].board, 2, 1).creature.hp, 0);
  assert.equal(topLayer(r.events[2].board, 2, 1).creature, null);
  assert.equal(act(s, { type: 'move', dir: 'up' }).events[0].board, undefined);
  const u = act(act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } }).state,
    { type: 'undo' }, { snapshots: true });
  assert.deepEqual(u.events[0].board, s.board);
});

test('states are plain data (structuredClone round-trips)', () => {
  const s = act(fresh(), { type: 'fold', fold: { axis: 'v', index: 2, side: 'after' } }).state;
  assert.deepEqual(structuredClone(s), s);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('createCreature uses the definition HP unless overridden', () => {
  assert.deepEqual(createCreature('player'), { id: 'player', kind: 'player', hp: 3, maxHp: 3 });
  assert.throws(() => createCreature('nope'));
});
