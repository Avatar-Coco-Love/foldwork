import assert from 'node:assert/strict';
import { test } from './harness.js';
import { getCell, topLayer, findCreature } from '../src/core/board.js';
import { TILE, ITEM } from '../src/core/tiles.js';
import { parseMap, DEV_MAPS } from '../src/core/maps.js';
import { pressedLinks, syncGates, keyMeetsLock } from '../src/core/environment.js';
import { createFloorState, act, canUndo, PLAYER_ID } from '../src/core/turn.js';
import { buildFoldPreview } from '../src/render/preview.js';

const types = (r) => r.events.map((e) => e.type);
const at = (s) => {
  const p = findCreature(s.board, PLAYER_ID);
  return p && { col: p.col, row: p.row };
};
const tileAt = (s, col, row) => topLayer(s.board, col, row).tile;
const floor = (rows, opts = {}) => createFloorState({ ...parseMap(rows), ...opts });
const move = (s, dir) => act(s, { type: 'move', dir });

test('parseMap: tiles, links, key items, player and enemy spots', () => {
  const { board, player, enemies } = parseMap([
    'E . L o #',
    '1 a 2 b k',
    '. . @ . m',
  ]);
  assert.equal(board.w, 5);
  assert.equal(board.h, 3);
  assert.equal(topLayer(board, 0, 0).tile, TILE.EXIT);
  assert.equal(topLayer(board, 2, 0).tile, TILE.LOCK);
  assert.equal(topLayer(board, 3, 0).tile, TILE.VOID);
  assert.deepEqual([topLayer(board, 0, 1).tile, topLayer(board, 0, 1).link], [TILE.PLATE, 1]);
  assert.deepEqual([topLayer(board, 3, 1).tile, topLayer(board, 3, 1).link], [TILE.GATE, 2]);
  assert.deepEqual([topLayer(board, 4, 1).tile, topLayer(board, 4, 1).item], [TILE.FLOOR, ITEM.KEY]);
  assert.deepEqual(player, { col: 2, row: 2 });
  assert.deepEqual(enemies, [{ kind: 'mite', col: 4, row: 2 }]);
  assert.throws(() => parseMap(['..', '.']));
  assert.throws(() => parseMap(['.Z']));
});

test('key: walking onto it picks it up', () => {
  const s = floor(['. k .', '. @ .']);
  const r = move(s, 'up');
  assert.deepEqual(types(r), ['move', 'pickup']);
  assert.equal(r.state.keys, 1);
  assert.equal(topLayer(r.state.board, 1, 0).item, null);
  assert.equal(s.keys, 0, 'input state untouched');
  assert.equal(topLayer(s.board, 1, 0).item, ITEM.KEY);
});

test('lock: refused without a key (no turn); opened and entered with one', () => {
  const s = floor(['. L .', 'k @ .']);
  const no = move(s, 'up');
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'locked');
  let t = move(s, 'left').state;
  t = move(t, 'right').state;
  const r = move(t, 'up');
  assert.deepEqual(types(r), ['unlock', 'move']);
  assert.deepEqual(r.events[0], { type: 'unlock', at: { col: 1, row: 0 }, by: 'walk' });
  assert.equal(tileAt(r.state, 1, 0), TILE.DOOR);
  assert.equal(r.state.keys, 0);
  assert.deepEqual(at(r.state), { col: 1, row: 0 });
});

test('plate: a gate opens in the environment phase and closes when released', () => {
  const s = floor(['a . .', '. . .', '1 @ .']);
  assert.equal(move(floor(['a @ .', '1 . .']), 'left').reason, 'gate-closed');
  const on = move(s, 'left');
  assert.deepEqual(types(on), ['move', 'gate']);
  assert.deepEqual(on.events[1], { type: 'gate', at: { col: 0, row: 0 }, open: true, link: 1 });
  assert.equal(tileAt(on.state, 0, 0), TILE.GATE_OPEN);
  const off = move(on.state, 'up');
  assert.deepEqual(types(off), ['move', 'gate']);
  assert.equal(tileAt(off.state, 0, 0), TILE.GATE);
});

test('plate: links are separate; a gate stays open while something stands in it', () => {
  const b = parseMap(['a b .', '1 2 .', '. . .']);
  getCell(b.board, 0, 1).layers[0].creature = { id: 'x', kind: 'dummy', hp: 1, maxHp: 1 };
  syncGates(b.board);
  assert.deepEqual([...pressedLinks(b.board)], [1]);
  assert.equal(topLayer(b.board, 0, 0).tile, TILE.GATE_OPEN);
  assert.equal(topLayer(b.board, 1, 0).tile, TILE.GATE);
  // Something in the open gate; the plate is released: the gate stays open.
  getCell(b.board, 0, 1).layers[0].creature = null;
  topLayer(b.board, 0, 0).creature = { id: 'y', kind: 'dummy', hp: 1, maxHp: 1 };
  const events = [];
  syncGates(b.board, (e) => events.push(e));
  assert.equal(topLayer(b.board, 0, 0).tile, TILE.GATE_OPEN);
  assert.deepEqual(events, []);
  topLayer(b.board, 0, 0).creature = null;
  syncGates(b.board, (e) => events.push(e));
  assert.equal(topLayer(b.board, 0, 0).tile, TILE.GATE);
  assert.equal(events.length, 1);
});

test('plate: an enemy can hold it, including from the start', () => {
  const s = floor(['a . .', 'm . .', '1 . .', '. . .', '@ . .']);
  assert.equal(tileAt(s, 0, 0), TILE.GATE, 'nobody on the plate yet');
  const r = act(s, { type: 'wait' }); // the mite steps down onto the plate
  assert.deepEqual(types(r), ['wait', 'move', 'gate']);
  assert.equal(tileAt(r.state, 0, 0), TILE.GATE_OPEN);
  const held = floor(['a . .', '1 . .', '. . @'], { enemies: [{ kind: 'mite', col: 0, row: 1 }] });
  assert.equal(tileAt(held, 0, 0), TILE.GATE_OPEN, 'createFloorState syncs gates');
});

test('plate: a plate covered by a fold is not pressed', () => {
  // The player stands on the plate; folding the right column over pins
  // them under a floor sheet, so the plate is no longer the top layer.
  const s = floor(['a . . .', '. . . .', '. . 1 .', '. . @ .']);
  let t = move(s, 'up').state;
  assert.equal(tileAt(t, 0, 0), TILE.GATE_OPEN);
  const r = act(t, { type: 'fold', fold: { axis: 'v', index: 3, side: 'after' } });
  assert.deepEqual(types(r), ['fold', 'pin', 'gate']);
  assert.equal(tileAt(r.state, 0, 0), TILE.GATE);
  t = act(r.state, { type: 'undo' }).state;
  assert.equal(tileAt(t, 0, 0), TILE.GATE_OPEN, 'undo restores the gate');
});

test('fold: a key folded onto a lock opens it, and the key is used', () => {
  // A key that lands on plain floor does nothing.
  const miss = floor(['L . k', '. . .', '. @ .']);
  const r0 = act(miss, { type: 'fold', fold: { axis: 'v', index: 2, side: 'after' } });
  assert.equal(r0.events.some((e) => e.type === 'unlock'), false);
  // Folding columns 1-2 left over line 1 lands the key on the lock.
  const s2 = floor(['L k .', '. . .', '. @ .']);
  const f2 = { axis: 'v', index: 1, side: 'after' };
  const pv = buildFoldPreview(s2.board, f2);
  assert.equal(pv.unlocks, 1);
  assert.equal(pv.unlock[0], 1);
  const r = act(s2, { type: 'fold', fold: f2 });
  assert.ok(r.ok);
  assert.ok(types(r).includes('unlock'));
  assert.deepEqual(r.events.find((e) => e.type === 'unlock'), { type: 'unlock', at: { col: 0, row: 0 }, by: 'fold' });
  const cell = getCell(r.state.board, 0, 0).layers;
  assert.deepEqual(cell.map((l) => l.tile), [TILE.DOOR, TILE.FLOOR]);
  assert.equal(cell[1].item, null, 'key used up');
  assert.equal(r.state.keys, 0);
  // Undo puts the lock and key back.
  const u = act(r.state, { type: 'undo' }).state;
  assert.equal(tileAt(u, 0, 0), TILE.LOCK);
  assert.equal(topLayer(u.board, 1, 0).item, ITEM.KEY);
});

test('fold: a lock folded onto a key also opens', () => {
  const s = floor(['L k .', '. . .', '. @ .']);
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  assert.ok(types(r).includes('unlock'));
  const cell = getCell(r.state.board, 1, 0).layers;
  assert.deepEqual(cell.map((l) => l.tile), [TILE.FLOOR, TILE.DOOR]);
  assert.equal(cell[0].item, null);
  assert.equal(keyMeetsLock(null, cell[1]), null);
});

test('exit: reaching it wins at once; enemies get no last turn', () => {
  const s = floor(['m E .', '. @ .']);
  const r = move(s, 'up');
  assert.deepEqual(types(r), ['move', 'victory']);
  assert.equal(r.state.status, 'won');
  assert.deepEqual(r.state.outcome, { cause: 'exit' });
  assert.equal(r.state.turn, 1);
  assert.equal(act(r.state, { type: 'wait' }).reason, 'game-over');
  assert.equal(canUndo(r.state), false);
});

test('exit: a buried exit is not active', () => {
  const s = floor(['. E', '. .', '@ .']);
  // Fold the left column over the exit: a floor sheet now tops it.
  const folded = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } }).state;
  assert.equal(at(folded).col, 1, 'the player rode the sheet');
  const t = move(folded, 'up');
  assert.equal(t.state.status, 'playing');
  const u = move(t.state, 'up');
  assert.equal(u.state.status, 'playing', 'standing on the sheet over the exit');
});

test('locks block enemies', () => {
  const s = floor(['m L @']);
  const r = act(s, { type: 'wait' });
  assert.deepEqual(types(r), ['wait'], 'stranded behind the lock');
});

test('dev sandbox map: the key route reaches the exit', () => {
  const { board, player } = parseMap(DEV_MAPS.sandbox.rows);
  let s = createFloorState({ board, player, charges: DEV_MAPS.sandbox.charges });
  const route = 'R R R U U U U U D D D L L L L U U U L';
  const dirs = { R: 'right', L: 'left', U: 'up', D: 'down' };
  for (const k of route.split(' ')) {
    const r = move(s, dirs[k]);
    assert.ok(r.ok, `step ${k} refused: ${r.reason}`);
    s = r.state;
  }
  assert.equal(s.status, 'won');
});

test('dev courier map: folding the key row up opens the lock and wins', () => {
  const { board, player } = parseMap(DEV_MAPS.courier.rows);
  let s = createFloorState({ board, player, charges: DEV_MAPS.courier.charges });
  const r = act(s, { type: 'fold', fold: { axis: 'h', index: 3, side: 'after' } });
  assert.ok(types(r).includes('unlock'));
  s = move(move(r.state, 'up').state, 'up').state;
  assert.equal(s.status, 'won');
});
