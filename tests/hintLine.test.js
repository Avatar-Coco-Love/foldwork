import assert from 'node:assert/strict';
import { test } from './harness.js';
import { findLine, lineKeys, nextStep } from '../src/core/hintLine.js';
import { solve } from '../src/core/solver.js';
import { FLOOR_TEMPLATES, buildFloor, generateFloor, templateById } from '../src/core/floors.js';
import { createFloorState, act, playerOf } from '../src/core/turn.js';
import { parseMap } from '../src/core/maps.js';
import { replay } from '../src/core/replay.js';
import { buildHintMark } from '../src/render/preview.js';
import { createSave, parseSave, savedHints } from '../src/core/save.js';
import { createRun, addHints, finishFloor } from '../src/core/run.js';

const floor = (rows, opts = {}) => createFloorState({ ...parseMap(rows), ...opts });
const start = (id) => createFloorState(buildFloor(templateById(id)));

test('hint tips: every template has one; the floor info carries it', () => {
  for (const t of FLOOR_TEMPLATES) assert.ok(typeof t.tip === 'string' && t.tip.length > 20, `${t.id} tip`);
  // F2 teaches riding the fold across the void.
  for (const t of FLOOR_TEMPLATES.filter((x) => x.floor === 2)) assert.match(t.tip, /ride|riding/i);
  const { info } = generateFloor(1, 'tip-seed');
  assert.equal(info.tip, templateById(info.templateId).tip);
  assert.equal(info.search, true);
  // The boss is too big to search: tip only.
  assert.equal(generateFloor(9, 'tip-seed').info.search, false);
});

test('solver noDamage: the line never costs HP', () => {
  for (const id of ['f1-bridge', 'f2-plate', 'f2-wasp', 'f3-vault']) {
    const s = start(id);
    const r = solve(s, { noDamage: true });
    assert.equal(r.solvable, true, id);
    const end = replay(s, r.actions).state;
    assert.equal(end.status, 'won', id);
    // Won floors keep the player; HP never dropped along the way.
    let cur = s;
    for (const a of r.actions) {
      cur = act(cur, a).state;
      if (cur.status === 'playing') assert.equal(playerOf(cur).hp, playerOf(s).hp, id);
    }
  }
});

test('findLine: a clean line first, stuck when no line exists, unknown when capped', () => {
  const s = start('f2-plate');
  const r = findLine(s);
  assert.equal(r.status, 'line');
  assert.equal(r.clean, true);
  assert.equal(replay(s, r.actions).state.status, 'won');
  const walled = floor(['E # .', '# # .', '. . @'], { charges: 0 });
  assert.deepEqual(findLine(walled), { status: 'stuck' });
  assert.equal(findLine(s, { maxStates: 2, maxTurns: 40 }).status, 'unknown');
});

test('findLine: falls back to a line that costs HP when no clean one exists', () => {
  // The Lockjaw guards the only lane to the exit: it bites before it dies.
  const s = floor(['E', 'J', '.', '@'], { charges: 0, hp: 3 });
  const r = findLine(s);
  assert.equal(r.status, 'line');
  assert.equal(r.clean, false);
  assert.equal(replay(s, r.actions).state.status, 'won');
});

test('findLine: with diagonal creases, straight lines are tried first (playtest: F8 with the Frog)', () => {
  // f8-crossing after the Mite is bumped and the key taken, no folds yet.
  // Diagonals alone run out of states at the hint caps before any line.
  const b = buildFloor(templateById('f8-crossing'));
  const cells = b.board.cells.map((c) => ({ layers: c.layers.map((l) => (l.item ? { ...l, item: null } : l)) }));
  const s = createFloorState({
    board: { ...b.board, cells }, player: { col: 2, row: 4 }, enemies: b.enemies.filter((e) => e.kind !== 'mite'),
    charges: 3, hp: 2, rules: { diagonal: true },
  });
  s.keys = 1;
  const r = findLine(s);
  assert.equal(r.status, 'line');
  assert.equal(r.clean, true);
  assert.equal(replay(s, r.actions).state.status, 'won');
  assert.equal(solve(s, { maxStates: 2000, maxTurns: 40, noDiagonal: true, noDamage: true }).solvable, true);
});

test('nextStep: walks the line, off it is null, undo back onto it resumes', () => {
  const s = start('f1-bridge');
  const { actions } = findLine(s);
  const line = { keys: lineKeys(s, actions), actions };
  assert.deepEqual(nextStep(line, s), actions[0]);
  const after = act(s, actions[0]).state;
  if (actions.length > 1) assert.deepEqual(nextStep(line, after), actions[1]);
  // A step the line doesn't take (one that changes the board) leaves it.
  const other = ['left', 'right', 'up', 'down'].map((dir) => act(s, { type: 'move', dir }))
    .find((r) => r.ok && r.state.status === 'playing' && JSON.stringify(r.state.board) !== JSON.stringify(after.board));
  assert.equal(nextStep(line, other.state), null);
  const back = act(after, { type: 'undo' }).state;
  assert.deepEqual(nextStep(line, back), actions[0]);
  assert.equal(nextStep(null, s), null);
});

test('buildHintMark: a fold arrow starts on the player when they ride it; moves and waits', () => {
  const s = floor(['. E .', 'o o o', '. @ .'], { charges: 1 });
  // Fold the bottom row up over the void: the player rides it.
  const mark = buildHintMark(s.board, { type: 'fold', fold: { axis: 'h', index: 2, side: 'after' } });
  assert.equal(mark.kind, 'fold');
  assert.deepEqual(mark.from, { col: 1, row: 2 });
  assert.deepEqual(mark.to, { col: 1, row: 1 });
  assert.deepEqual(buildHintMark(s.board, { type: 'move', dir: 'left' }), {
    kind: 'move', from: { col: 1, row: 2 }, to: { col: 0, row: 2 },
  });
  assert.deepEqual(buildHintMark(s.board, { type: 'wait' }), { kind: 'wait', at: { col: 1, row: 2 } });
  assert.equal(buildHintMark(s.board, null), null);
});

test('hint counts: saved per floor, kept on the run', () => {
  const run = createRun({ seed: 'hint-count' });
  const save = createSave({ run, floor: { floor: 1, templateId: 'f1-bridge', variant: {}, actions: ['u'], hints: 2 } });
  const back = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(savedHints(back, { floor: 1 }), 2);
  assert.equal(savedHints(back, { floor: 2 }), 0);
  assert.equal(savedHints(createSave({ run }), { floor: 1 }), 0);
  const counted = addHints(addHints(run, 1, 2), 1, 1);
  assert.deepEqual(counted.hints, { 1: 3 });
  assert.equal(addHints(run, 1, 0), run);
  // Clearing a floor keeps the count.
  const won = { ...createFloorState(buildFloor(templateById('f1-bridge'))), status: 'won' };
  assert.deepEqual(finishFloor(counted, won).hints, { 1: 3 });
});
