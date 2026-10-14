import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, findCreature } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createFloorState, act, canUndo, playerOf, PLAYER_ID, DEFAULT_RULES } from '../src/core/turn.js';
import { RELIC_DEFS, relicDef, rulesFor, applyRelics, runHooks } from '../src/core/relics.js';
import { createRun, addRelic, floorSetupFor, finishFloor, runLength, runTag, RUN_FLOORS, BOSS_FLOOR, CLEAN_HEAL } from '../src/core/run.js';
import { generateFloor, templateFloors, templateById } from '../src/core/floors.js';
import { decodeAction } from '../src/core/replay.js';
import { solve } from '../src/core/solver.js';

const types = (r) => r.events.map((e) => e.type);
const mite = (col, row, id) => ({ kind: 'mite', col, row, id });
const vBefore = (index) => ({ type: 'fold', fold: { axis: 'v', index, side: 'before' } });

// --- Rule hooks in the turn engine -----------------------------------------

test('rules: floors start with DEFAULT_RULES unless overridden', () => {
  const s = createFloorState({ board: createBoard(5, 5) });
  assert.deepEqual(s.rules, DEFAULT_RULES);
  assert.equal(createFloorState({ board: createBoard(5, 5), rules: { undoDepth: 2 } }).rules.undoDepth, 2);
});

test('rules: hp and maxHp carry separately; hp never exceeds max', () => {
  const s = createFloorState({ board: createBoard(5, 5), hp: 2, maxHp: 4 });
  assert.deepEqual([playerOf(s).hp, playerOf(s).maxHp], [2, 4]);
  const capped = createFloorState({ board: createBoard(5, 5), hp: 9, maxHp: 3 });
  assert.equal(playerOf(capped).hp, 3);
  const legacy = createFloorState({ board: createBoard(5, 5), hp: 5 });
  assert.deepEqual([playerOf(legacy).hp, playerOf(legacy).maxHp], [5, 5]);
});

test('undoDepth 2: two consecutive folds unwind one at a time', () => {
  const s0 = createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 }, rules: { undoDepth: 2 } });
  const s1 = act(s0, vBefore(1)).state;
  const s2 = act(s1, { type: 'fold', fold: { axis: 'v', index: 4, side: 'after' } }).state;
  assert.equal(s2.charges, 1);
  const u1 = act(s2, { type: 'undo' }).state;
  assert.deepEqual(u1.board, s1.board);
  assert.equal(u1.charges, 2);
  assert.ok(canUndo(u1), 'the first fold can still be undone');
  const u2 = act(u1, { type: 'undo' }).state;
  assert.deepEqual(u2, { ...s0, undo: null });
  assert.equal(canUndo(u2), false);
});

test('undoDepth 2: never more than two folds; a move ends the chain', () => {
  const s0 = createFloorState({ board: createBoard(6, 6, TILE.FLOOR, { maxStack: 9 }), player: { col: 3, row: 3 }, rules: { undoDepth: 2 } });
  let s = act(s0, vBefore(1)).state;
  s = act(s, { type: 'fold', fold: { axis: 'v', index: 5, side: 'after' } }).state;
  s = act(s, { type: 'fold', fold: { axis: 'h', index: 1, side: 'before' } }).state;
  assert.equal(s.charges, 0);
  s = act(s, { type: 'undo' }).state;
  s = act(s, { type: 'undo' }).state;
  assert.equal(canUndo(s), false, 'only the last two folds');
  assert.equal(s.charges, 2);
  const moved = act(act(s0, vBefore(1)).state, { type: 'move', dir: 'up' }).state;
  assert.equal(canUndo(moved), false);
});

test('foldRefund: pinning an enemy refunds the charge once per fold', () => {
  const opts = { board: createBoard(5, 5), player: { col: 3, row: 2 }, enemies: [mite(1, 2, 'm'), mite(1, 0, 'n')] };
  const plain = act(createFloorState(opts), vBefore(1));
  assert.equal(plain.state.charges, 2);
  const r = act(createFloorState({ ...opts, rules: { foldRefund: 1 } }), vBefore(1));
  assert.deepEqual(types(r), ['fold', 'pin', 'pin', 'refund']);
  assert.deepEqual(r.events[3], { type: 'refund', amount: 1, by: 'pin' });
  assert.equal(r.state.charges, 3);
  // Undo restores the pre-fold state exactly, refund included.
  assert.equal(act(r.state, { type: 'undo' }).state.charges, 3);
});

test('foldRefund: void drops and strands count, pinning yourself does not', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const drop = act(createFloorState({ board: b, player: { col: 4, row: 4 }, enemies: [mite(1, 2, 'm')], rules: { foldRefund: 1 } }), vBefore(1));
  assert.deepEqual(types(drop).slice(0, 3), ['fold', 'fall', 'refund']);
  assert.equal(drop.events[2].by, 'fall');

  const holes = new Set(['0,1', '1,1', '1,2', '1,3', '1,4', '4,0']);
  const sb = createBoard(5, 5, (c, r) => (holes.has(`${c},${r}`) ? TILE.VOID : TILE.FLOOR));
  const strand = act(createFloorState({ board: sb, player: { col: 3, row: 4 }, enemies: [mite(0, 0, 'm')], rules: { foldRefund: 1 } }),
    { type: 'fold', fold: { axis: 'v', index: 3, side: 'after' } });
  assert.deepEqual(types(strand), ['fold', 'strand', 'refund']);

  const self = act(createFloorState({ board: createBoard(5, 5), player: { col: 1, row: 2 }, rules: { foldRefund: 1 } }), vBefore(1));
  assert.deepEqual(types(self), ['fold', 'pin']);
  assert.equal(self.state.charges, 2);
});

// --- Relics ---------------------------------------------------------------

test('relic defs: complete data, ids match keys', () => {
  for (const [id, def] of Object.entries(RELIC_DEFS)) {
    assert.equal(def.id, id);
    for (const field of ['name', 'text', 'group', 'rarity', 'glyph']) assert.ok(def[field], `${id}.${field}`);
    assert.ok(['fold', 'defense', 'utility'].includes(def.group));
    assert.ok(['common', 'uncommon', 'rare'].includes(def.rarity));
    assert.ok(Object.keys(def.hooks).length > 0);
  }
  assert.throws(() => relicDef('nope'));
});

test('fold relics: Extra Crease, Thick Paper, Recycled and Spring Crease', () => {
  const setup = { board: createBoard(5, 5), charges: 2 };
  const all = ['extra-crease', 'thick-paper', 'recycled-crease', 'spring-crease'];
  const out = applyRelics(setup, all);
  assert.equal(out.charges, 3);
  assert.equal(out.board.maxStack, 4);
  assert.deepEqual(out.rules, { ...DEFAULT_RULES, undoDepth: 2, foldRefund: 1 });
  assert.equal(setup.charges, 2, 'hooks do not mutate');
  assert.equal(setup.board.maxStack, 3);
  assert.deepEqual(rulesFor([]), DEFAULT_RULES);
  assert.equal(runHooks(['extra-crease', 'extra-crease'], 'setup', setup).charges, 4, 'hooks stack in order');
});

test('Thick Paper allows a fourth layer in play', () => {
  const board = createBoard(5, 5);
  const extra = () => ({ tile: TILE.FLOOR, creature: null, item: null, flags: 0 });
  board.cells[0].layers.push(extra(), extra());
  // (0,0) is 3 high; folding columns 1–4 left lands column 1 on it (4 high).
  const fold = { type: 'fold', fold: { axis: 'v', index: 1, side: 'after' } };
  const base = { board, player: { col: 4, row: 4 }, charges: 3 };
  assert.equal(act(createFloorState(base), fold).reason, 'invalid-fold');
  assert.ok(act(createFloorState(applyRelics(base, ['thick-paper'])), fold).ok);
});

// --- Run state ------------------------------------------------------------

test('run: length follows the floors that have templates, up to the first gap, ending on the boss', () => {
  const floors = templateFloors();
  let n = 0;
  while (floors.includes(n + 1)) n += 1;
  assert.equal(runLength(), Math.min(n, BOSS_FLOOR));
  assert.equal(runLength(), BOSS_FLOOR, 'every floor has a template: the run ends on the boss');
  assert.equal(runLength([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), BOSS_FLOOR);
  assert.equal(runLength([1, 2, 3, 4, 5, 6, 7, 8]), RUN_FLOORS);
  assert.equal(runLength([1, 2, 3, 4, 6, 7]), 4, 'a missing floor 5 ends the run after 4');
  assert.equal(runLength([2, 3]), 0);
  const run = createRun({ seed: 'abc' });
  assert.deepEqual([run.floor, run.hp, run.maxHp, run.status, run.relics], [1, 3, 3, 'playing', []]);
  assert.equal(run.lastFloor, runLength());
});

test('run: relics are taken once, in order', () => {
  let run = createRun({ seed: 1, relics: ['spring-crease', 'extra-crease', 'spring-crease'] });
  assert.deepEqual(run.relics, ['spring-crease', 'extra-crease']);
  run = addRelic(run, 'thick-paper');
  assert.deepEqual(run.relics, ['spring-crease', 'extra-crease', 'thick-paper']);
  assert.throws(() => addRelic(run, 'nope'));
  assert.deepEqual(runTag(run).relics, run.relics);
});

test('run: floor setup applies relics and carried HP', () => {
  const run = { ...createRun({ seed: 's', relics: ['extra-crease', 'spring-crease'] }), hp: 2 };
  const { setup } = generateFloor(1, run.seed);
  const s = createFloorState(floorSetupFor(run, setup));
  assert.equal(s.maxCharges, setup.charges + 1);
  assert.equal(s.rules.undoDepth, 2);
  assert.deepEqual([playerOf(s).hp, playerOf(s).maxHp], [2, 3]);
});

test('run: winning floors carries HP forward and wins after the last floor', () => {
  let run = createRun({ seed: 'carry' });
  for (let floor = 1; floor <= run.lastFloor; floor++) {
    assert.equal(run.floor, floor);
    const { setup, info } = generateFloor(floor, run.seed);
    let s = createFloorState(floorSetupFor(run, setup));
    // The boss arena is too big to search: it carries its winning line.
    const stored = templateById(info.templateId).line;
    const line = stored ? stored.map(decodeAction) : solve(s).actions;
    for (const a of line) s = act(s, a).state;
    assert.equal(s.status, 'won');
    const before = run.hp;
    run = finishFloor(run, s);
    const clean = playerOf(s).hp >= before;
    assert.equal(run.clean, clean);
    assert.equal(run.hp, Math.min(run.maxHp, playerOf(s).hp + (clean ? CLEAN_HEAL : 0)));
  }
  assert.equal(run.status, 'won');
  assert.equal(run.cleared, run.lastFloor);
  assert.equal(run.lastFloor, BOSS_FLOOR, 'the run ends on the boss');
  assert.equal(finishFloor(run, { status: 'lost' }), run, 'a finished run stays finished');
});

test('run: a lost floor ends the run; an unfinished floor changes nothing', () => {
  const run = createRun({ seed: 'x' });
  const b = createBoard(5, 5, (c, r) => (r === 1 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  assert.equal(finishFloor(run, s), run);
  const lost = act(s, { type: 'move', dir: 'up' }).state;
  assert.equal(lost.status, 'lost');
  const over = finishFloor(run, lost);
  assert.deepEqual([over.status, over.cause, over.hp], ['lost', 'fall', 0]);
  assert.equal(findCreature(lost.board, PLAYER_ID), null);
});
