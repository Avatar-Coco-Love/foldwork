import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, createLayer, getCell, topLayer, findCreature, cellIndex } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { CREATURE_DEFS, isEnemy } from '../src/core/creatures.js';
import { actingEnemies, reachField, planEnemy, enemiesInReach, scatterEnemies } from '../src/core/enemies.js';
import { createRng } from '../src/core/rng.js';
import { createFloorState, act, canUndo, playerOf, stepCreature, PLAYER_ID } from '../src/core/turn.js';
import { buildFoldPreview, EFFECT } from '../src/render/preview.js';

const pos = (s, id) => {
  const c = findCreature(s.board, id);
  return c && { col: c.col, row: c.row };
};
const types = (r) => r.events.map((e) => e.type);
const floor = (opts) => createFloorState({ board: createBoard(5, 5), ...opts });
const mite = (col, row, id) => ({ kind: 'mite', col, row, ...(id ? { id } : {}) });

test('Scrap Mite def: 1 HP enemy that chases and bumps for 1', () => {
  const def = CREATURE_DEFS.mite;
  assert.equal(def.team, 'enemy');
  assert.equal(def.hp, 1);
  assert.equal(def.attack, 1);
  assert.equal(def.ai, 'chase');
  assert.equal(isEnemy({ kind: 'mite' }), true);
  assert.equal(isEnemy({ kind: 'player' }), false);
  assert.equal(isEnemy({ kind: 'dummy' }), false);
});

test('floor state places enemies with default ids and rejects bad spots', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [mite(0, 0), mite(4, 0, 'm')] });
  assert.deepEqual(pos(s, 'mite-0'), { col: 0, row: 0 });
  assert.deepEqual(pos(s, 'm'), { col: 4, row: 0 });
  assert.throws(() => floor({ player: { col: 2, row: 4 }, enemies: [mite(2, 4)] }));
  const walls = createBoard(5, 5, (c, r) => (c === 0 && r === 0 ? TILE.WALL : TILE.FLOOR));
  assert.throws(() => createFloorState({ board: walls, enemies: [mite(0, 0)] }));
});

test('acting enemies: top-to-bottom, left-to-right; pinned ones excluded', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [mite(3, 1, 'c'), mite(4, 0, 'b'), mite(1, 1, 'a'), mite(0, 3, 'd')] });
  assert.deepEqual(actingEnemies(s.board), ['b', 'a', 'c', 'd']);
  getCell(s.board, 1, 1).layers.push(createLayer());
  assert.deepEqual(actingEnemies(s.board), ['b', 'c', 'd']);
});

test('reach field: walls and voids block, empty cells block, stacks climb', () => {
  const b = createBoard(5, 1, (c) => [TILE.FLOOR, TILE.WALL, TILE.FLOOR, TILE.FLOOR, TILE.VOID][c]);
  getCell(b, 3, 0).layers.push(createLayer(), createLayer());
  const f = reachField(b, { col: 2, row: 0 });
  assert.deepEqual([...f], [-1, -1, 0, 1, -1]);
  const open = createBoard(3, 3);
  getCell(open, 1, 1).layers = [];
  const g = reachField(open, { col: 0, row: 0 });
  assert.equal(g[cellIndex(open, 1, 1)], -1);
  assert.equal(g[cellIndex(open, 2, 2)], 4);
});

test('mite steps along a shortest path, closing the longer gap first', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [mite(0, 0, 'tall'), mite(4, 3, 'wide')] });
  const r = act(s, { type: 'wait' });
  assert.deepEqual(pos(r.state, 'tall'), { col: 0, row: 1 }); // dr 4 > dc 2: down
  assert.deepEqual(pos(r.state, 'wide'), { col: 3, row: 3 }); // dc 2 > dr 1: left
  assert.deepEqual(types(r), ['wait', 'move', 'move']);
  assert.deepEqual(r.events[1], { type: 'move', id: 'tall', from: { col: 0, row: 0 }, to: { col: 0, row: 1 } });
});

test('mite paths around walls', () => {
  // Wall across row 1 except col 4: the mite must go round.
  const b = createBoard(5, 5, (c, r) => (r === 1 && c < 4 ? TILE.WALL : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 0, row: 4 }, enemies: [mite(0, 0, 'm')] });
  const r = act(s, { type: 'wait' });
  assert.deepEqual(pos(r.state, 'm'), { col: 1, row: 0 });
});

test('mite bumps an adjacent player for 1 without moving', () => {
  const s = floor({ player: { col: 2, row: 2 }, enemies: [mite(2, 0, 'm')] });
  const r1 = act(s, { type: 'wait' });
  assert.deepEqual(pos(r1.state, 'm'), { col: 2, row: 1 });
  const r2 = act(r1.state, { type: 'wait' });
  assert.deepEqual(types(r2), ['wait', 'bump', 'damage']);
  assert.deepEqual(r2.events[1], { type: 'bump', id: 'm', target: PLAYER_ID, from: { col: 2, row: 1 }, to: { col: 2, row: 2 } });
  assert.equal(playerOf(r2.state).hp, 2);
  assert.deepEqual(pos(r2.state, 'm'), { col: 2, row: 1 });
});

test('player killed by a mite: defeat, later enemies skip, no undo', () => {
  const s = floor({ player: { col: 2, row: 2 }, hp: 1, enemies: [mite(2, 1, 'a'), mite(1, 2, 'b')] });
  const r = act(s, { type: 'wait' });
  assert.deepEqual(types(r), ['wait', 'bump', 'damage', 'death', 'defeat']);
  assert.equal(r.state.status, 'lost');
  assert.equal(r.state.outcome.cause, 'hp');
  assert.equal(canUndo(r.state), false);
});

test('player bump kills a 1 HP mite', () => {
  const s = floor({ player: { col: 2, row: 2 }, enemies: [mite(2, 1, 'm')] });
  const r = act(s, { type: 'move', dir: 'up' });
  assert.deepEqual(types(r), ['bump', 'damage', 'death']);
  assert.equal(pos(r.state, 'm'), null);
  assert.deepEqual(pos(r.state, PLAYER_ID), { col: 2, row: 2 });
});

test('mites never share a cell: blocked mites try another shortest step or wait', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [mite(2, 0, 'back'), mite(2, 1, 'front')] });
  const r = act(s, { type: 'wait' });
  // 'back' acts first (row 0); its only shortest step is taken, so it waits.
  assert.deepEqual(pos(r.state, 'back'), { col: 2, row: 0 });
  assert.deepEqual(pos(r.state, 'front'), { col: 2, row: 2 });
});

test('stranded mite (no path to the player) waits', () => {
  const b = createBoard(5, 5, (c, r) => (c === 1 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 3, row: 2 }, enemies: [mite(0, 2, 'm')] });
  assert.equal(enemiesInReach(s.board, PLAYER_ID).size, 0);
  const r = act(s, { type: 'wait' });
  assert.deepEqual(types(r), ['wait']);
  assert.deepEqual(pos(r.state, 'm'), { col: 0, row: 2 });
});

test('enemies stepping into an empty cell fall, like the player', () => {
  const s = floor({ player: { col: 4, row: 4 }, enemies: [mite(0, 0, 'm')] });
  const work = { ...s, board: structuredClone(s.board) };
  getCell(work.board, 1, 0).layers = [];
  const events = [];
  stepCreature(work, findCreature(work.board, 'm'), { col: 1, row: 0 }, (e) => events.push(e));
  assert.deepEqual(events.map((e) => e.type), ['move', 'fall']);
  assert.equal(findCreature(work.board, 'm'), null);
  assert.equal(work.status, 'playing');
});

test('fold pin: covered mite gets a pin event, does not act and cannot be bumped', () => {
  const s = floor({ player: { col: 3, row: 2 }, enemies: [mite(1, 2, 'm')] });
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['fold', 'pin']);
  assert.deepEqual(r.events[1], { type: 'pin', id: 'm', at: { col: 1, row: 2 } });
  assert.equal(findCreature(r.state.board, 'm').top, false);
  // The mite stays put while the player walks onto the stack above it.
  const r2 = act(act(r.state, { type: 'move', dir: 'left' }).state, { type: 'move', dir: 'left' });
  assert.deepEqual(types(r2), ['move']);
  assert.deepEqual(pos(r2.state, PLAYER_ID), { col: 1, row: 2 });
  assert.equal(findCreature(r2.state.board, 'm').creature.hp, 1);
});

test('a pinned player cannot be attacked', () => {
  const s = floor({ player: { col: 1, row: 2 }, enemies: [mite(2, 2, 'm')] });
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  assert.deepEqual(types(r), ['fold', 'pin']);
  assert.equal(r.events[1].id, PLAYER_ID);
  const r2 = act(r.state, { type: 'wait' });
  assert.deepEqual(types(r2), ['wait']);
  assert.equal(playerOf(r2.state).hp, 3);
});

test('void drop: a void sheet folded onto a mite kills it', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 4, row: 4 }, enemies: [mite(1, 2, 'm'), mite(1, 0, 'p')] });
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  assert.deepEqual(r.events.slice(0, 3).map((e) => [e.type, e.id]), [['fold', undefined], ['pin', 'p'], ['fall', 'm']]);
  assert.equal(findCreature(r.state.board, 'm'), null);
  assert.equal(r.state.status, 'playing');
});

test('void drop on the player is defeat and cannot be undone', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 1, row: 2 } });
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  assert.deepEqual(types(r), ['fold', 'fall', 'defeat']);
  assert.equal(r.state.status, 'lost');
  assert.equal(r.state.outcome.cause, 'fall');
  assert.equal(canUndo(r.state), false);
  assert.equal(act(r.state, { type: 'undo' }).reason, 'game-over');
});

test('strand: a fold that cuts a mite off from the player emits strand', () => {
  // The mite's corner (0,0) connects only through the bridge (1,0). Folding
  // col 4 onto col 1 drops the void at (4,0) over the bridge.
  const holes = new Set(['0,1', '1,1', '1,2', '1,3', '1,4', '4,0']);
  const b = createBoard(5, 5, (c, r) => (holes.has(`${c},${r}`) ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 3, row: 4 }, enemies: [mite(0, 0, 'm')] });
  assert.deepEqual([...enemiesInReach(s.board, PLAYER_ID)], ['m']);
  const r = act(s, { type: 'fold', fold: { axis: 'v', index: 3, side: 'after' } });
  assert.ok(r.ok);
  assert.deepEqual(types(r), ['fold', 'strand']);
  assert.deepEqual(r.events[1], { type: 'strand', id: 'm', at: { col: 0, row: 0 } });
  assert.deepEqual(pos(r.state, 'm'), { col: 0, row: 0 });
});

test('undo restores enemies to before the fold', () => {
  const s = floor({ player: { col: 4, row: 4 }, enemies: [mite(3, 0, 'm')] });
  const r = act(s, { type: 'fold', fold: { axis: 'h', index: 4, side: 'after' } });
  assert.deepEqual(types(r), ['fold', 'move']); // the player rides row 4 up
  const u = act(r.state, { type: 'undo' });
  assert.ok(u.ok);
  assert.deepEqual(u.state.board, s.board);
  assert.deepEqual(pos(u.state, 'm'), { col: 3, row: 0 });
});

test('enemy turns are deterministic', () => {
  const run = () => {
    let s = floor({ player: { col: 2, row: 4 }, enemies: [mite(0, 0), mite(4, 0), mite(2, 0)] });
    const log = [];
    for (let i = 0; i < 4 && s.status === 'playing'; i++) {
      const r = act(s, { type: 'wait' });
      log.push(...r.events.map((e) => `${e.type}:${e.id || ''}`));
      s = r.state;
    }
    return log.join(' ');
  };
  assert.equal(run(), run());
});

test('planEnemy: non-enemies and missing ids wait', () => {
  const s = floor({ player: { col: 2, row: 2 } });
  const ctx = { field: reachField(s.board, { col: 2, row: 2 }), player: findCreature(s.board, PLAYER_ID) };
  assert.deepEqual(planEnemy(s.board, PLAYER_ID, ctx), { type: 'wait' });
  assert.deepEqual(planEnemy(s.board, 'nobody', ctx), { type: 'wait' });
});

test('scatterEnemies: seeded, on free footing, away from the start', () => {
  const b = createBoard(6, 6, (c, r) => ((c + r) % 5 === 0 ? TILE.VOID : TILE.FLOOR));
  const avoid = { col: 3, row: 5 };
  const a = scatterEnemies(b, createRng('s1'), { kind: 'mite', count: 3, avoid });
  const again = scatterEnemies(b, createRng('s1'), { kind: 'mite', count: 3, avoid });
  assert.deepEqual(a, again);
  assert.equal(a.length, 3);
  for (const e of a) {
    assert.equal(e.kind, 'mite');
    assert.ok(Math.abs(e.col - avoid.col) + Math.abs(e.row - avoid.row) >= 3);
    assert.equal(topLayer(b, e.col, e.row).tile, TILE.FLOOR);
  }
  assert.equal(scatterEnemies(createBoard(5, 5), createRng('x'), { kind: 'mite', count: 99, avoid }).length, 25 - 4);
});

test('fold preview marks pins and void drops, and what happens to the player', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 1, row: 2 }, enemies: [mite(1, 0, 'm')] });
  const pv = buildFoldPreview(s.board, { axis: 'v', index: 1, side: 'before' });
  assert.equal(pv.effect[cellIndex(b, 1, 0)], EFFECT.PIN);
  assert.equal(pv.effect[cellIndex(b, 1, 2)], EFFECT.DROP);
  assert.equal(pv.effect[cellIndex(b, 1, 1)], EFFECT.NONE);
  assert.equal(pv.player, 'drop');
  const safe = buildFoldPreview(s.board, { axis: 'h', index: 4, side: 'after' });
  assert.equal(safe.player, null);
});
