import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, findCreature, cellIndex } from '../src/core/board.js';
import { createFloorState, act, canUndo, playerOf, PLAYER_ID } from '../src/core/turn.js';
import { SPIRIT_DEFS, spiritDef, isSpirit } from '../src/core/spirits.js';
import { RELIC_DEFS } from '../src/core/relics.js';
import { createRun, floorSetupFor, rollOffer, runTag } from '../src/core/run.js';
import { generateFloor, templateFloors, templateById } from '../src/core/floors.js';
import { solve, candidateActions } from '../src/core/solver.js';
import { encodeAction, decodeAction, replay } from '../src/core/replay.js';

const HOOKS = ['gain', 'setup', 'rules'];
const diag = { type: 'fold', fold: { axis: 'd', index: 4, side: 'before' } }; // 5x5 main diagonal

test('spirits: defs are well-formed data', () => {
  assert.deepEqual(Object.keys(SPIRIT_DEFS), ['fox', 'frog', 'turtle']);
  for (const [id, def] of Object.entries(SPIRIT_DEFS)) {
    assert.equal(def.id, id);
    assert.ok(def.name && def.perk && def.glyph, id);
    assert.ok(Number.isInteger(def.hp) && def.hp > 0, id);
    for (const hook of Object.keys(def.hooks)) assert.ok(HOOKS.includes(hook), `${id}.${hook}`);
    for (const relic of def.covers) assert.ok(RELIC_DEFS[relic], `${id} covers ${relic}`);
  }
  assert.equal(isSpirit('frog'), true);
  assert.equal(isSpirit('toString'), false);
  assert.throws(() => spiritDef('owl'));
});

test('spirits: a run starts with the spirit\'s HP; no spirit keeps 3', () => {
  for (const [id, hp] of [['fox', 3], ['frog', 2], ['turtle', 4]]) {
    const run = createRun({ seed: 's', spirit: id });
    assert.deepEqual([run.spirit, run.hp, run.maxHp], [id, hp, hp]);
    assert.equal(runTag(run).spirit, id);
  }
  assert.deepEqual([createRun({ seed: 's' }).hp, createRun({ seed: 's' }).spirit], [3, null]);
  // Relics still stack on top (Paper Heart: +1 max, heal 1).
  const frog = createRun({ seed: 's', spirit: 'frog', relics: ['paper-heart'] });
  assert.deepEqual([frog.hp, frog.maxHp], [3, 3]);
});

test('spirits: perks reach the floor through floorSetupFor', () => {
  const { setup } = generateFloor(1, 'perks');
  const floor = (spirit, relics = []) => createFloorState(floorSetupFor(createRun({ seed: 'perks', spirit, relics }), setup));
  assert.equal(floor('fox').maxCharges, setup.charges + 1);
  assert.equal(floor('fox', ['extra-crease']).maxCharges, setup.charges + 2);
  assert.equal(floor('frog').rules.diagonal, true);
  assert.equal(floor('frog').maxCharges, setup.charges);
  assert.equal(floor('turtle').rules.undoDepth, 2);
  assert.equal(floor('turtle', ['spring-crease']).rules.undoDepth, 2);
  assert.deepEqual([playerOf(floor('turtle')).hp, playerOf(floor('frog')).maxHp], [4, 2]);
  assert.equal(floor(null).rules.diagonal, false);
  // A telemetry loadout rebuilds the same floor (tools/replay-check.js).
  const loadout = { spirit: 'frog', relics: [], hp: 2, maxHp: 2 };
  assert.equal(createFloorState(floorSetupFor(loadout, setup)).rules.diagonal, true);
});

test('diagonal folds need rules.diagonal; refused ones take no turn', () => {
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 0, row: 1 } });
  const refused = act(s, diag);
  assert.deepEqual([refused.ok, refused.reason], [false, 'no-diagonal']);
  assert.equal(refused.state, s);

  const frog = createFloorState({ board: createBoard(5, 5), player: { col: 0, row: 1 }, rules: { diagonal: true } });
  const r = act(frog, diag);
  assert.equal(r.ok, true);
  assert.equal(r.state.charges, frog.charges - 1);
  const me = findCreature(r.state.board, PLAYER_ID);
  assert.deepEqual([me.col, me.row], [1, 0]); // rode the sheet across the line
  assert.equal(r.state.board.cells[cellIndex(r.state.board, 2, 2)].layers.length, 1, 'hinge stays put');
  assert.equal(r.state.board.cells[cellIndex(r.state.board, 0, 4)].layers.length, 0, 'source emptied');
  assert.ok(canUndo(r.state));
  assert.deepEqual(act(r.state, { type: 'undo' }).state.board, frog.board);
});

test('diagonal folds have replay codes', () => {
  for (const axis of ['d', 'a']) {
    const a = { type: 'fold', fold: { axis, index: 7, side: 'after' } };
    assert.deepEqual(decodeAction(encodeAction(a)), a);
  }
  assert.equal(encodeAction(diag), 'fd4b');
});

test('solver: diagonal candidates only with rules.diagonal; Frog floors stay winnable', () => {
  const b = createBoard(5, 5);
  assert.equal(candidateActions(b).length, 5 + 4 * 2 * 2);
  assert.equal(candidateActions(b, { diagonal: true }).length, 5 + 4 * 2 * 2 + 7 * 2 * 2);
  for (const floor of templateFloors()) {
    const run = createRun({ seed: 'frog-proof', spirit: 'frog', floor });
    const { setup, info } = generateFloor(floor, run.seed);
    const state = createFloorState(floorSetupFor(run, setup));
    const stored = templateById(info.templateId).line;
    if (stored) { // the boss arena carries its line (too big to search)
      assert.equal(replay(state, stored).state.status, 'won', `floor ${floor}`);
      continue;
    }
    // Straight folds are a subset of the Frog's moves, so a straight line
    // at its lower HP proves the floor; diagonals widen the search a lot
    // on 7x7 floors, so they only get searched on floor 1.
    const searched = floor === 1 ? state : { ...state, rules: { ...state.rules, diagonal: false } };
    const result = solve(searched, { maxStates: 40000 });
    assert.equal(result.solvable, true, `floor ${floor}`);
  }
});

test('offers skip relics the spirit already covers', () => {
  for (const [spirit, covered] of [['frog', 'diagonal-crease'], ['turtle', 'spring-crease']]) {
    for (let n = 0; n < 40; n++) {
      const run = createRun({ seed: `cover-${n}`, spirit });
      assert.ok(!rollOffer(run, 1).relics.includes(covered), `${spirit} seed ${n}`);
    }
  }
  const seen = new Set();
  for (let n = 0; n < 40; n++) for (const id of rollOffer(createRun({ seed: `cover-${n}`, spirit: 'fox' }), 1).relics) seen.add(id);
  assert.ok(seen.has('diagonal-crease') || seen.has('spring-crease'), 'other spirits still see them');
});
