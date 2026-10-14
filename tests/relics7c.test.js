import assert from 'node:assert/strict';
import { test } from './harness.js';
import { findCreature, getCell } from '../src/core/board.js';
import { parseMap } from '../src/core/maps.js';
import { createFloorState, act, canTakeBack, PLAYER_ID } from '../src/core/turn.js';
import { applyRelics, RELIC_DEFS } from '../src/core/relics.js';
import { creaseEdge, foldMapping } from '../src/core/fold.js';
import { createRun, floorSetupFor, finishFloor } from '../src/core/run.js';
import { encodeAction, decodeAction, replay } from '../src/core/replay.js';
import { encodeSaveCode, decodeSaveCode, CODE_RELICS } from '../src/core/saveCode.js';
import { runScraps } from '../src/core/scraps.js';

const types = (r) => r.events.map((e) => e.type);
const withRelics = (rows, relics, extra = {}) => createFloorState(applyRelics({ ...parseMap(rows), ...extra }, relics));
const wait = (s) => act(s, { type: 'wait' });
const fold = (s, f) => act(s, { type: 'fold', fold: f });
const pos = (s, id) => {
  const c = findCreature(s.board, id);
  return c && { col: c.col, row: c.row };
};

// Col 1 folds onto col 2, covering the mite at (2,0); col 0 is clipped.
const PIN_MAP = ['. . m', '. . .', '@ . .'];
const PIN_FOLD = { axis: 'v', index: 2, side: 'before' };

test('7c relics: 24 in all, rarities 12/8/4, 12 starters, every id has a code', () => {
  const defs = Object.values(RELIC_DEFS);
  assert.equal(defs.length, 24);
  const count = (r) => defs.filter((d) => d.rarity === r).length;
  assert.deepEqual([count('common'), count('uncommon'), count('rare')], [12, 8, 4]);
  assert.equal(defs.filter((d) => d.unlock === 'starter').length, 12);
  assert.equal(RELIC_DEFS['sharp-edge'].unlock, 'starter');
  assert.equal(RELIC_DEFS.compass.unlock, 'starter');
  for (const id of Object.keys(RELIC_DEFS)) assert.ok(CODE_RELICS.includes(id), id);
});

test('Sharp Edge: an enemy your fold pins takes 1 damage (a mite is crushed: a fold kill)', () => {
  const plain = fold(withRelics(PIN_MAP, []), PIN_FOLD);
  assert.ok(types(plain).includes('pin'));
  assert.ok(findCreature(plain.state.board, 'mite-0'), 'pinned, alive');
  const sharp = fold(withRelics(PIN_MAP, ['sharp-edge']), PIN_FOLD);
  assert.deepEqual(types(sharp).slice(0, 4), ['fold', 'pin', 'damage', 'death']);
  assert.equal(findCreature(sharp.state.board, 'mite-0'), null);
  assert.equal(sharp.state.foldKills, 1);
});

test('Sharp Edge: a 2 HP enemy survives the pin with 1 HP', () => {
  const r = fold(withRelics(['. . C', '. . .', '@ . .'], ['sharp-edge']), PIN_FOLD);
  assert.equal(findCreature(r.state.board, 'creaseling-0').creature.hp, 1);
});

test('Sticky Tape: undo leaves the enemies it pinned stuck 2 turns, the charge spent', () => {
  const start = withRelics(PIN_MAP, ['sticky-tape']);
  const undone = act(fold(start, PIN_FOLD).state, { type: 'undo' });
  assert.ok(undone.ok);
  assert.deepEqual(types(undone), ['unfold', 'tape']);
  assert.equal(undone.state.charges, start.charges - 1);
  assert.equal(findCreature(undone.state.board, 'mite-0').creature.stuck, 2);
  let s = undone.state;
  s = wait(s).state;
  s = wait(s).state;
  assert.deepEqual(pos(s, 'mite-0'), { col: 2, row: 0 }, 'stuck for 2 turns');
  s = wait(s).state;
  assert.notDeepEqual(pos(s, 'mite-0'), { col: 2, row: 0 }, 'then it moves');
  // Without the relic the undo is a plain, free unfold.
  const plain = act(fold(withRelics(PIN_MAP, []), PIN_FOLD).state, { type: 'undo' });
  assert.deepEqual(types(plain), ['unfold']);
  assert.equal(plain.state.charges, start.charges);
});

test('Crease Trap: the edge that stays is spiked for 2 enemy phases, once per enemy', () => {
  const MAP = ['@ . .', '. . .', '. . m'];
  const crease = { axis: 'v', index: 1, side: 'before' };
  const s0 = withRelics(MAP, ['crease-trap']);
  assert.deepEqual(creaseEdge(s0.board, crease), [{ col: 1, row: 0 }, { col: 1, row: 1 }, { col: 1, row: 2 }]);
  const r1 = fold(s0, crease);
  assert.ok(types(r1).includes('trap'));
  assert.equal(r1.state.traps.length, 1);
  assert.equal(r1.state.traps[0].turns, 1, 'one enemy phase left');
  assert.deepEqual(pos(r1.state, 'mite-0'), { col: 2, row: 1 });
  const r2 = wait(r1.state); // the mite steps onto (1,1): spiked
  assert.deepEqual(types(r2).slice(0, 4), ['wait', 'move', 'spike', 'damage']);
  assert.equal(findCreature(r2.state.board, 'mite-0'), null);
  assert.equal(r2.state.foldKills, 1);
  assert.equal(r2.state.traps.length, 0, 'gone after its second enemy phase');
  // Without the relic the mite gets there unharmed.
  const plain = wait(fold(withRelics(MAP, []), crease).state);
  assert.deepEqual(pos(plain.state, 'mite-0'), { col: 1, row: 1 });
});

test('Crease Trap: diagonal creases spike their hinge cells', () => {
  const s = withRelics(['. . .', '. . .', '. . .'], []);
  assert.deepEqual(creaseEdge(s.board, { axis: 'd', index: 2, side: 'before' }),
    [{ col: 0, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 2 }]);
});

test('Echo Fold: the first fold on each floor takes no turn', () => {
  const MAP = ['@ . . . .', '. . . . .', '. . . . m'];
  const s0 = withRelics(MAP, ['echo-fold']);
  const r1 = fold(s0, { axis: 'v', index: 1, side: 'before' });
  assert.ok(types(r1).includes('echo'));
  assert.equal(r1.state.turn, 0);
  assert.deepEqual(pos(r1.state, 'mite-0'), { col: 4, row: 2 }, 'enemies did not act');
  assert.equal(r1.state.uses.echo, 0);
  const r2 = fold(r1.state, { axis: 'v', index: 4, side: 'after' });
  assert.ok(!types(r2).includes('echo'));
  assert.equal(r2.state.turn, 1);
  // Undo gives the echo back with the fold.
  assert.equal(act(r1.state, { type: 'undo' }).state.uses.echo, 1);
  // Without it a fold is a turn.
  assert.equal(fold(withRelics(MAP, []), { axis: 'v', index: 1, side: 'before' }).state.turn, 1);
});

test('Pocket Fold: only the chosen lane folds; needs the relic', () => {
  const MAP = ['. . .', '. . .', '@ . .'];
  const pocket = { axis: 'v', index: 1, side: 'before', pocket: 1 };
  assert.equal(fold(withRelics(MAP, []), pocket).reason, 'no-pocket');
  const s0 = withRelics(MAP, ['pocket-fold']);
  assert.deepEqual(foldMapping(s0.board, pocket).map((m) => m.from), [{ col: 0, row: 1 }]);
  const r = fold(s0, pocket);
  assert.ok(r.ok);
  assert.equal(getCell(r.state.board, 0, 1).layers.length, 0);
  assert.equal(getCell(r.state.board, 1, 1).layers.length, 2);
  assert.equal(getCell(r.state.board, 0, 0).layers.length, 1, 'other rows stay');
  assert.deepEqual(creaseEdge(s0.board, pocket), [{ col: 1, row: 1 }]);
  // Straight creases only, lanes in range.
  assert.equal(fold(s0, { ...pocket, pocket: 3 }).reason, 'invalid-fold');
  const diag = withRelics(MAP, ['pocket-fold', 'diagonal-crease']);
  assert.equal(fold(diag, { axis: 'd', index: 2, side: 'before', pocket: 0 }).reason, 'invalid-fold');
});

test('Rewind Charm: once per run, take back the last turn, even the one that lost the floor', () => {
  const run = createRun({ seed: '5', relics: ['rewind-charm'] });
  assert.equal(run.rewinds, 1);
  const s0 = createFloorState(floorSetupFor(run, parseMap(['o @ . E'])));
  assert.equal(canTakeBack(s0), false, 'nothing to take back yet');
  const lost = act(s0, { type: 'move', dir: 'left' }).state;
  assert.equal(lost.status, 'lost');
  assert.ok(canTakeBack(lost));
  const back = act(lost, { type: 'takeback' });
  assert.ok(back.ok);
  assert.deepEqual(types(back), ['takeback']);
  assert.equal(back.state.status, 'playing');
  assert.deepEqual(pos(back.state, PLAYER_ID), { col: 1, row: 0 });
  assert.equal(back.state.uses.rewinds, 0);
  const again = act(act(back.state, { type: 'move', dir: 'right' }).state, { type: 'takeback' });
  assert.equal(again.reason, 'no-rewind');
  // The run carries what is left.
  const won = act(act(back.state, { type: 'move', dir: 'right' }).state, { type: 'move', dir: 'right' }).state;
  assert.equal(won.status, 'won');
  assert.equal(finishFloor(run, won).rewinds, 0);
  assert.equal(finishFloor(run, s0.board && { ...s0, status: 'won', outcome: { cause: 'exit' } }).rewinds, 1);
});

test('Rewind Charm: the take-back drops the free undo, so no use comes back', () => {
  const run = createRun({ seed: '5', relics: ['rewind-charm'] });
  const s0 = createFloorState(floorSetupFor(run, parseMap(['. . .', '. . .', '@ . E'])));
  const folded = fold(s0, { axis: 'h', index: 1, side: 'before' }).state;
  const moved = act(folded, { type: 'move', dir: 'right' }).state;
  const back = act(moved, { type: 'takeback' }).state;
  assert.equal(back.undo, null);
  assert.equal(act(back, { type: 'undo' }).reason, 'no-undo');
});

test('7c codes: pocket folds and take-backs replay; save codes carry rewinds', () => {
  const pocket = { type: 'fold', fold: { axis: 'h', index: 2, side: 'after', pocket: 3 } };
  assert.equal(encodeAction(pocket), 'fh2ap3');
  assert.deepEqual(decodeAction('fh2ap3'), pocket);
  assert.equal(encodeAction({ type: 'takeback' }), 'k');
  assert.deepEqual(decodeAction('k'), { type: 'takeback' });
  assert.deepEqual(decodeAction('fh2a'), { type: 'fold', fold: { axis: 'h', index: 2, side: 'after' } });

  const run = createRun({ seed: '5', relics: ['rewind-charm'] });
  const s0 = createFloorState(floorSetupFor(run, parseMap(['o @ . E'])));
  const { state, refused } = replay(s0, ['l', 'k', 'r']);
  assert.deepEqual(refused, []);
  assert.deepEqual(pos(state, PLAYER_ID), { col: 2, row: 0 });

  const code = encodeSaveCode(run);
  const back = decodeSaveCode(code);
  assert.ok(back.ok);
  assert.equal(back.run.rewinds, 1);
  assert.deepEqual(back.run.relics, ['rewind-charm']);
  const spent = decodeSaveCode(encodeSaveCode({ ...run, rewinds: 0 }));
  assert.equal(spent.run.rewinds, 0);
});

test('Lucky Scrap: +50% scraps, rounded down, as its own line', () => {
  const run = { ...createRun({ seed: '5', relics: ['lucky-scrap'] }), status: 'lost', cleared: 3, foldKills: 0 };
  const earned = runScraps(run);
  assert.equal(earned.total, 22);
  assert.deepEqual(earned.lines.at(-1), { id: 'lucky', label: 'Lucky Scrap (+50%)', count: 1, each: 7, amount: 7 });
  assert.equal(runScraps({ ...run, cleared: 0 }).lines.length, 0, 'nothing earned, no line');
});
