// Phase 5c: the Lockjaw (a stationary guard holding a key) and the Spore
// Bloom (a stationary Mite spawner), docs/03 and docs/OPEN-QUESTIONS.md.
import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, findCreature, topLayer } from '../src/core/board.js';
import { TILE, ITEM } from '../src/core/tiles.js';
import { CREATURE_DEFS, createCreature } from '../src/core/creatures.js';
import { pendingSpawns, reachField, spawnSpot } from '../src/core/enemies.js';
import { createFloorState, act, playerOf, nearestFreeFooting } from '../src/core/turn.js';
import { parseMap } from '../src/core/maps.js';
import { stateKey } from '../src/core/solver.js';
import { NEEDS } from '../src/core/floors.js';
import { buildClips } from '../src/render/playback.js';

const types = (r) => r.events.map((e) => e.type);
const floor = (opts, board = createBoard(5, 5)) => createFloorState({ board, ...opts });
const at = (kind, col, row, id = kind) => ({ kind, col, row, id });
const WAIT = { type: 'wait' };
const move = (dir) => ({ type: 'move', dir });
const fold = (axis, index, side) => ({ type: 'fold', fold: { axis, index, side } });
const MOTION = { speed: 1, reducedMotion: false };

function waitTurns(s, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const r = act(s, WAIT);
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, events };
}

test('defs: Lockjaw 2 HP guard holding a key (J), Spore Bloom 2 HP spawner (S); both fixed', () => {
  const j = CREATURE_DEFS.lockjaw;
  const b = CREATURE_DEFS.bloom;
  assert.deepEqual([j.hp, j.ai, j.fixed, j.carry], [2, 'guard', true, ITEM.KEY]);
  assert.deepEqual([b.hp, b.ai, b.fixed, b.spawn], [2, 'spore', true, { kind: 'mite', every: 3 }]);
  assert.equal(createCreature('lockjaw').item, ITEM.KEY);
  assert.equal(createCreature('bloom').sprout, 3);
  assert.deepEqual(parseMap(['J S', '. @']).enemies.map((e) => e.kind), ['lockjaw', 'bloom']);
});

test('Lockjaw: bites an adjacent player for 1 and never moves', () => {
  let s = floor({ player: { col: 2, row: 4 }, enemies: [at('lockjaw', 2, 2)] });
  let r = act(s, WAIT);
  assert.deepEqual(types(r), ['wait'], 'two tiles away: nothing');
  r = act(r.state, move('up'));
  assert.deepEqual(types(r), ['move', 'bump', 'damage']);
  assert.equal(playerOf(r.state).hp, 2);
  const j = findCreature(r.state.board, 'lockjaw');
  assert.deepEqual([j.col, j.row], [2, 2]);
  // Diagonal is not adjacent.
  s = floor({ player: { col: 1, row: 1 }, enemies: [at('lockjaw', 2, 2)] });
  assert.deepEqual(types(act(s, WAIT)), ['wait']);
});

test('Lockjaw: killed, it drops its key on its own tile; the player picks it up', () => {
  let s = floor({ player: { col: 2, row: 3 }, enemies: [at('lockjaw', 2, 2)] });
  let r = act(s, move('up'));
  assert.equal(findCreature(r.state.board, 'lockjaw').creature.hp, 1);
  r = act(r.state, move('up'));
  const drop = r.events.find((e) => e.type === 'drop');
  assert.ok(drop);
  assert.deepEqual([drop.item, drop.from, drop.at], [ITEM.KEY, { col: 2, row: 2 }, { col: 2, row: 2 }]);
  assert.equal(topLayer(r.state.board, 2, 2).item, ITEM.KEY);
  r = act(r.state, move('up'));
  assert.equal(r.state.keys, 1);
  // Playback shows the key hopping out.
  const shown = act(act(s, move('up')).state, move('up'), { snapshots: true });
  const clip = buildClips(act(s, move('up')).state.board, shown.events, MOTION).find((c) => c.actor && c.actor.kind === 'drop');
  assert.ok(clip);
});

test('Lockjaw: dropped into a void, its key lands on the nearest free footing', () => {
  // A void at (0, 0): folding column 0 onto column 1 lands that void on
  // the Lockjaw at (1, 0) and drops it.
  const board = createBoard(5, 5, (c, r) => (c === 0 && r === 0 ? TILE.VOID : TILE.FLOOR));
  const s = floor({ player: { col: 4, row: 4 }, enemies: [at('lockjaw', 1, 0)] }, board);
  const r = act(s, fold('v', 1, 'before'));
  assert.ok(r.events.some((e) => e.type === 'fall' && e.id === 'lockjaw'));
  const drop = r.events.find((e) => e.type === 'drop');
  // Up is off the board; down, (1, 1), now holds the sheet from (0, 1).
  assert.deepEqual(drop.at, { col: 1, row: 1 });
  assert.equal(topLayer(r.state.board, 1, 1).item, ITEM.KEY);
});

test('nearestFreeFooting: skips holes, items and creatures; ties in DIRS order', () => {
  const board = createBoard(3, 3, (c, r) => (c === 1 && r === 1 ? TILE.VOID : TILE.FLOOR));
  assert.deepEqual(nearestFreeFooting(board, { col: 1, row: 1 }), { col: 1, row: 0 }); // up first
  topLayer(board, 1, 0).item = ITEM.KEY;
  assert.deepEqual(nearestFreeFooting(board, { col: 1, row: 1 }), { col: 1, row: 2 }); // then down
  topLayer(board, 1, 2).creature = createCreature('mite');
  assert.deepEqual(nearestFreeFooting(board, { col: 1, row: 1 }), { col: 0, row: 1 }); // then left
});

test('Lockjaw: a fold that stacks it and a lock opens the lock with its key', () => {
  // Fold row 0 (a lock) down onto the Lockjaw at row 1: it is pinned under
  // the lock, which its key opens.
  const board = createBoard(5, 5, (c, r) => (c === 2 && r === 0 ? TILE.LOCK : TILE.FLOOR));
  const s = floor({ player: { col: 0, row: 4 }, enemies: [at('lockjaw', 2, 1)] }, board);
  const r = act(s, fold('h', 1, 'before'));
  assert.ok(r.ok);
  assert.ok(r.events.some((e) => e.type === 'unlock' && e.by === 'fold'));
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'lockjaw'));
  const j = findCreature(r.state.board, 'lockjaw');
  assert.ok(!j.creature.item, 'the key is spent');
  assert.equal(topLayer(r.state.board, 2, 1).tile, TILE.DOOR);
});

test('Spore Bloom: a Mite sprouts every 3 turns on the free neighbour closest to the player', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('bloom', 2, 1)] });
  const two = waitTurns(s, 2);
  assert.ok(!two.events.some((e) => e.type === 'spawn'));
  assert.equal(findCreature(two.state.board, 'bloom').creature.sprout, 1);
  assert.deepEqual(pendingSpawns(two.state.board, 'player'), [{ col: 2, row: 2 }]);
  const r = act(two.state, WAIT);
  const ev = r.events.find((e) => e.type === 'spawn');
  assert.deepEqual([ev.id, ev.creature.kind, ev.at], ['bloom', 'mite', { col: 2, row: 2 }]);
  assert.equal(topLayer(r.state.board, 2, 2).creature.kind, 'mite');
  assert.equal(findCreature(r.state.board, 'bloom').creature.sprout, 3);
  // Spawned this turn, it acts from the next one.
  assert.ok(!r.events.some((e) => e.type === 'move' && e.id === ev.creature.id));
  const next = act(r.state, WAIT);
  assert.ok(next.events.some((e) => e.type === 'move' && e.id === ev.creature.id));
  assert.ok(buildClips(two.state.board, act(two.state, WAIT, { snapshots: true }).events, MOTION)
    .some((c) => c.actor && c.actor.kind === 'spawn'));
});

test('spawnSpot: ties go in DIRS order; no free neighbour means it waits, ready', () => {
  const board = createBoard(3, 3);
  const field = reachField(board, { col: 1, row: 1 });
  // Player in the middle, Bloom in a corner: down and right tie; DIRS lists down first.
  assert.deepEqual(spawnSpot(board, { col: 0, row: 0 }, field), { col: 0, row: 1 });
  const walled = createBoard(5, 5, (c, r) => ((c === 1 && r === 0) || (c === 0 && r === 1) ? TILE.WALL : TILE.FLOOR));
  let s = floor({ player: { col: 4, row: 4 }, enemies: [at('bloom', 0, 0)] }, walled);
  s = waitTurns(s, 4).state;
  // Walled in: no path to the player, so it is stranded and never counts down.
  assert.equal(findCreature(s.board, 'bloom').creature.sprout, 3);
});

test('Spore Bloom: stranded (no path to the player) or pinned, the count waits', () => {
  // A void row cuts the board: the Bloom above it can't reach the player.
  const cut = createBoard(5, 5, (c, r) => (r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('bloom', 2, 0)] }, cut);
  const w = waitTurns(s, 5);
  assert.ok(!w.events.some((e) => e.type === 'spawn'));
  assert.equal(findCreature(w.state.board, 'bloom').creature.sprout, 3);
  // Pinned: row 0 folds down onto the Bloom in row 1.
  const open = floor({ player: { col: 2, row: 4 }, enemies: [at('bloom', 2, 1)] });
  let r = act(open, fold('h', 1, 'before'));
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'bloom'));
  r = waitTurns(r.state, 4);
  assert.ok(!r.events.some((e) => e.type === 'spawn'));
  assert.equal(findCreature(r.state.board, 'bloom').creature.sprout, 3);
  // The same Bloom left alone spawns on schedule.
  assert.ok(waitTurns(open, 3).events.some((e) => e.type === 'spawn'));
});

test('Spore Bloom never attacks, even next to the player', () => {
  const s = floor({ player: { col: 2, row: 2 }, enemies: [at('bloom', 2, 1)] });
  const w = waitTurns(s, 2);
  assert.ok(!w.events.some((e) => e.type === 'bump' || e.type === 'damage'));
});

test('stateKey: carried items and spawn counts count; creature ids do not', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('bloom', 2, 1), at('lockjaw', 0, 0)] });
  const t = floor({ player: { col: 2, row: 4 }, enemies: [at('bloom', 2, 1, 'b2'), at('lockjaw', 0, 0, 'j2')] });
  assert.equal(stateKey(s), stateKey(t));
  assert.notEqual(stateKey(s), stateKey(act(s, WAIT).state), 'sprout ticked');
  const keyless = floor({ player: { col: 2, row: 4 }, enemies: [{ ...at('bloom', 2, 1) }, { ...at('lockjaw', 0, 0), item: null }] });
  assert.notEqual(stateKey(s), stateKey(keyless));
});

test('NEEDS.key also takes the key from carriers', () => {
  const built = { board: createBoard(3, 3), player: { col: 1, row: 2 }, enemies: [at('lockjaw', 0, 0)], charges: 1 };
  const without = NEEDS.key(built).built;
  const s = createFloorState(without);
  assert.equal(findCreature(s.board, 'lockjaw').creature.item, undefined);
});
