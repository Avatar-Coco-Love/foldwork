// Phase 6b: the Great Crane's phases 2 and 3 (docs/03, docs/OPEN-QUESTIONS.md
// "Great Crane phases 2-3"): Scrap Mites on its folds and on entering a
// phase, minions riding its strips, two creases at once, one swat per beat.
import assert from 'node:assert/strict';
import { test } from './harness.js';
import { findCreature, topLayer } from '../src/core/board.js';
import { createFloorState, act, playerOf } from '../src/core/turn.js';
import { parseMap } from '../src/core/maps.js';
import { creaseCount, spawnsNow, markFolds, marksCode, minionCount, bossMarks } from '../src/core/boss.js';
import { buildTelegraph, CELL } from '../src/render/preview.js';
import { hintsFor } from '../src/core/hints.js';

const types = (r) => r.events.map((e) => e.type);
const WAIT = { type: 'wait' };
const CRANE = 'crane-0';

const OPEN = [
  '. . . . . . .',
  '. . . . . . .',
  '. . . . . . .',
  '. . . G . . .',
  '. . . . . . .',
  '. . . @ . . .',
  '. . . . . . .',
];

// A floor with the Crane at `hp` (and its mark, if given).
function arena(rows = OPEN, { hp = 6, mark = null, charges = 3 } = {}) {
  const s = createFloorState({ ...parseMap(rows), charges });
  const c = findCreature(s.board, CRANE).creature;
  c.hp = hp;
  c.mark = mark;
  return s;
}

const crane = (s) => findCreature(s.board, CRANE);
const mites = (s) => s.board.cells.flatMap((c, i) => c.layers.filter((l) => l.creature && l.creature.kind === 'mite')
  .map((l) => ({ id: l.creature.id, col: i % s.board.w, row: Math.floor(i / s.board.w) })));

test('phases: one crease and no spawns in phase 1, spawns from phase 2, two creases in phase 3', () => {
  const c = crane(arena()).creature;
  assert.deepEqual([6, 5, 4, 3, 2, 1].map((hp) => [creaseCount({ ...c, hp }), spawnsNow({ ...c, hp })]),
    [[1, false], [1, false], [1, true], [1, true], [2, true], [2, true]]);
});

test('mark codes: several creases join with +, bad codes read as none', () => {
  const folds = [{ axis: 'h', index: 6, side: 'after' }, { axis: 'v', index: 2, side: 'before' }];
  assert.equal(marksCode(folds), 'h6a+v2b');
  assert.deepEqual(markFolds('h6a+v2b'), folds);
  assert.deepEqual(markFolds('h6a'), folds.slice(0, 1));
  for (const bad of [null, '', 'h6a+', 'x', 'h6a+zz']) assert.deepEqual(markFolds(bad), [], String(bad));
});

test('phase 2: its fold spawns a Mite on the landed strip, closest to the player', () => {
  // Row 6 folds onto row 5 (h6a); the player stands at (3,5).
  const r = act(arena(OPEN, { hp: 4, mark: 'h6a' }), WAIT);
  assert.deepEqual(types(r).slice(0, 5), ['wait', 'fold', 'swat', 'damage', 'spawn']);
  const spawn = r.events[4];
  assert.equal(spawn.id, CRANE);
  assert.equal(spawn.creature.kind, 'mite');
  // The swat moved the player off (3,5); the Mite takes the free landed
  // cell nearest to where the player now stands (row 5, Manhattan, ties row-major).
  const p = findCreature(r.state.board, 'player');
  assert.equal(spawn.at.row, 5);
  const d = (c) => Math.abs(c - p.col) + Math.abs(5 - p.row);
  for (let col = 0; col < 7; col++) {
    const top = topLayer(r.state.board, col, 5);
    if (!top.creature) assert.ok(d(col) >= d(spawn.at.col), `col ${col}`);
  }
  assert.deepEqual(mites(r.state).map((m) => m.id), [`${CRANE}-m0-0`]);
  // Phase 1: the same fold spawns nothing.
  assert.ok(!types(act(arena(OPEN, { hp: 6, mark: 'h6a' }), WAIT)).includes('spawn'));
});

test('phase 2: no spawn at the cap of 2 alive (pinned ones count)', () => {
  const s = arena(OPEN, { hp: 4, mark: 'h6a' });
  topLayer(s.board, 0, 0).creature = { id: `${CRANE}-m9-0`, kind: 'mite', hp: 1, maxHp: 1 };
  s.board.cells[6].layers.unshift({ tile: 'floor', creature: { id: `${CRANE}-m9-1`, kind: 'mite', hp: 1, maxHp: 1 }, item: null, flags: 0 });
  assert.equal(minionCount(s.board, CRANE), 2);
  assert.ok(!types(act(s, WAIT)).includes('spawn'));
});

test('phase 2: minions on its strip ride the fold', () => {
  const rows = OPEN.slice();
  rows[6] = '. m . . . . .';
  const r = act(arena(rows, { hp: 4, mark: 'h6a' }), WAIT);
  const m = findCreature(r.state.board, 'mite-1');
  assert.deepEqual([m.col, m.row, m.top], [1, 5, true], 'carried from row 6 to row 5');
});

test('entering phase 2: a Mite next to where it fled, idle until next turn', () => {
  const rows = OPEN.slice();
  rows[0] = '. . . o . . .';
  // Row 0 lands on row 3: the void drops the Crane 6 -> 4.
  const r = act(arena(rows), { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  assert.deepEqual(types(r).slice(0, 6), ['fold', 'fall', 'damage', 'sheet', 'flee', 'spawn']);
  const c = crane(r.state);
  const spawn = r.events[5];
  assert.equal(Math.abs(spawn.at.col - c.col) + Math.abs(spawn.at.row - c.row), 1, 'next to the Crane');
  assert.equal(spawn.creature.id, `${CRANE}-m0-p`);
  assert.ok(!r.events.some((e) => e.id === spawn.creature.id && e.type !== 'spawn'), 'it does not act this turn');
  const next = act(r.state, WAIT);
  assert.ok(next.events.some((e) => e.id === spawn.creature.id && e.type === 'move'), 'it acts next turn');
  // Entering phase 3 (4 -> 2) spawns one too.
  const again = act(arena(rows, { hp: 4 }), { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  assert.ok(types(again).includes('spawn'));
});

test('phase 3: marks two creases, both moving paper, the second on the board the first leaves', () => {
  const r = act(arena(OPEN, { hp: 2 }), WAIT);
  const marks = r.events.filter((e) => e.type === 'mark');
  assert.deepEqual(marks.map((e) => e.n), [1, 2]);
  assert.equal(crane(r.state).creature.mark, marksCode(marks.map((e) => e.fold)));
  const list = bossMarks(r.state.board);
  assert.deepEqual(list.map((m) => [m.n, m.of]), [[1, 2], [2, 2]]);
  const tele = buildTelegraph(r.state.board);
  assert.equal(tele.length, 2);
  for (const t of tele) assert.ok(t.pv.state.some((st) => st === CELL.LANDING), 'moves paper');
  // Next beat: both fold, in order.
  const due = act(r.state, WAIT);
  const folds = due.events.filter((e) => e.type === 'fold' && e.by === CRANE).map((e) => e.fold);
  assert.deepEqual(folds, marks.map((e) => e.fold));
  assert.equal(crane(due.state).creature.mark, null);
});

test('phase 3: the player takes swat damage once per beat', () => {
  // Both folds land on the player: h6a (row 6 onto row 5, the swat leaves
  // them on its new top), then h5b (row 4 onto row 5 again).
  const rows = OPEN.slice();
  rows[0] = 'G . . . . . .';
  rows[3] = '. . . . . . .';
  const s = arena(rows, { hp: 2, mark: 'h6a+h5b' });
  const r = act(s, WAIT);
  assert.equal(r.events.filter((e) => e.type === 'swat').length, 2);
  assert.equal(r.events.filter((e) => e.type === 'damage' && e.id === 'player').length, 1);
  assert.equal(playerOf(r.state).hp, playerOf(s).hp - 1);
});

test('a pinned or dropped minion does not act after the boss fold that covered it', () => {
  // The Crane (row 3) acts before the Mite (row 5); h6a lands row 6 on it.
  const rows = [
    '@ . . . . . .',
    '. . . . . . .',
    '. . . . . . .',
    '. . . G . . .',
    '. . . . . . .',
    'm . . . . . .',
    '. . . . . . .',
  ];
  const r = act(arena(rows, { mark: 'h6a' }), WAIT);
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'mite-1'));
  assert.ok(!r.events.some((e) => e.id === 'mite-1' && e.type === 'move'));
  rows[6] = 'o . . . . . .';
  const d = act(arena(rows, { mark: 'h6a' }), WAIT);
  assert.ok(d.events.some((e) => e.type === 'fall' && e.id === 'mite-1'), 'dropped, and no crash');
});

test('hints: minions on the first spawn, two creases only on a second mark', () => {
  const ids = ['crane-minions', 'crane-double'];
  const shown = (s, action) => hintsFor(ids, { type: 'events', events: act(s, action).events }, new Set());
  assert.deepEqual(shown(arena(OPEN, { hp: 6 }), WAIT), [], 'phase 1: one mark, no spawn');
  assert.deepEqual(shown(arena(OPEN, { hp: 2 }), WAIT), ['crane-double']);
  assert.deepEqual(shown(arena(OPEN, { hp: 4, mark: 'h6a' }), WAIT), ['crane-minions']);
});
