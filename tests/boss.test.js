// Phase 6a: the Great Crane's core rules (docs/03, docs/OPEN-QUESTIONS.md):
// an aimed strip crease marked one turn and folded the next, the swat, void
// drops for 2, fleeing after every hit, and the boss win.
import assert from 'node:assert/strict';
import { test } from './harness.js';
import { findCreature, topLayer, stackHeight } from '../src/core/board.js';
import { CREATURE_DEFS, createCreature } from '../src/core/creatures.js';
import { createFloorState, act, playerOf } from '../src/core/turn.js';
import { parseMap } from '../src/core/maps.js';
import { mirrorCell, foldMapping } from '../src/core/fold.js';
import { chooseCrease, markCode, markFold, phaseOf, fleeSpot, bossMarks, bossFlaps } from '../src/core/boss.js';
import { buildTelegraph, bossForecast, CELL, buildCreaseMarks, LIFT_TAG } from '../src/render/preview.js';
import { hintsFor } from '../src/core/hints.js';
import { reachField } from '../src/core/enemies.js';
import { stateKey } from '../src/core/solver.js';
import { buildClips } from '../src/render/playback.js';

const types = (r) => r.events.map((e) => e.type);
const WAIT = { type: 'wait' };
const move = (dir) => ({ type: 'move', dir });
const MOTION = { speed: 1, reducedMotion: false };
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

function arena(rows = OPEN, opts = {}) {
  return createFloorState({ ...parseMap(rows), charges: 3, ...opts });
}

const crane = (s) => findCreature(s.board, CRANE);

test('defs: Great Crane 6 HP boss in 3 phases, drop 2, bump 0, fixed, not heavy; map symbol G', () => {
  const d = CREATURE_DEFS.crane;
  assert.deepEqual([d.hp, d.ai, d.fixed, d.heavy, d.boss], [6, 'crane', true, undefined, { phases: 3, drop: 2, bump: 0, spawn: { phase: 2, kind: 'mite', cap: 2 }, double: 3, sheet: true }]);
  assert.equal(createCreature('crane').mark, null);
  assert.deepEqual(parseMap(['G @']).enemies.map((e) => e.kind), ['crane']);
  const c = createCreature('crane');
  assert.deepEqual([6, 5, 4, 3, 2, 1].map((hp) => phaseOf({ ...c, hp })), [1, 1, 2, 2, 3, 3]);
});

test('mark codes round-trip', () => {
  for (const f of [{ axis: 'h', index: 3, side: 'after' }, { axis: 'v', index: 1, side: 'before' }]) {
    assert.deepEqual(markFold(markCode(f)), f);
  }
  assert.equal(markFold(null), null);
});

test('chooseCrease: straight strips only, never onto itself, aimed to cover the player', () => {
  const s = arena();
  const me = crane(s);
  const player = findCreature(s.board, 'player');
  const fold = chooseCrease(s.board, me, player);
  assert.ok(['v', 'h'].includes(fold.axis));
  const size = fold.axis === 'v' ? s.board.w : s.board.h;
  assert.ok((fold.side === 'before' ? fold.index : size - fold.index) <= 3, 'a strip, not half the board');
  const moves = foldMapping(s.board, fold).filter((m) => !m.clipped);
  assert.ok(moves.some((m) => m.to.col === player.col && m.to.row === player.row), 'it lands on the player');
  assert.ok(!moves.some((m) => m.to.col === me.col && m.to.row === me.row), 'not on the Crane');
  const ride = mirrorCell(s.board, fold, me.col, me.row);
  assert.ok(!ride || !(ride.col === player.col && ride.row === player.row));
});

test('cycle: marks on turn 1, folds the marked crease on turn 2 and swats the player', () => {
  let r = act(arena(), WAIT);
  assert.deepEqual(types(r), ['wait', 'mark']);
  const mark = r.events[1].fold;
  assert.equal(crane(r.state).creature.mark, markCode(mark));
  r = act(r.state, WAIT);
  assert.deepEqual(types(r).slice(0, 4), ['wait', 'fold', 'swat', 'damage']);
  assert.deepEqual(r.events[1], { type: 'fold', fold: mark, by: CRANE });
  assert.equal(playerOf(r.state).hp, 2);
  const p = findCreature(r.state.board, 'player');
  assert.ok(p.top, 'swatted, not pinned');
  assert.equal(crane(r.state).creature.mark, null);
  assert.equal(r.state.charges, 3, 'the Crane\'s fold costs the player nothing');
  // Next turn it marks again.
  assert.ok(types(act(r.state, WAIT)).includes('mark'));
});

test('a marked crease is locked: invalid when due, it fizzles', () => {
  let s = act(arena(), WAIT).state;
  const fold = markFold(crane(s).creature.mark);
  // Make the fold overflow: stack the landing cells 3 high.
  s = { ...s, board: { ...s.board, cells: s.board.cells.map((c) => ({ layers: c.layers.map((l) => ({ ...l, creature: l.creature && { ...l.creature } })) })) } };
  for (const m of foldMapping(s.board, fold)) {
    if (m.clipped) continue;
    const cell = s.board.cells[m.to.row * s.board.w + m.to.col];
    while (cell.layers.length < 3) cell.layers.unshift({ tile: 'floor', creature: null, item: null, flags: 0 });
  }
  const r = act(s, WAIT);
  assert.deepEqual(types(r), ['wait', 'fizzle']);
  assert.equal(crane(r.state).creature.mark, null);
});

test('pinned by the player\'s fold, the Crane loses its mark and can\'t act', () => {
  // Fold rows 0-2 down: row 2 lands on the Crane's row 3.
  let s = act(arena(), WAIT).state;
  const r = act(s, { type: 'fold', fold: { axis: 'h', index: 3, side: 'before' } });
  assert.ok(types(r).includes('pin'));
  const c = crane(r.state);
  assert.equal(c.top, false);
  assert.equal(c.creature.mark, null);
  assert.ok(!types(act(r.state, WAIT)).some((t) => t === 'mark' || t === 'fold'));
});

test('void drop: 2 damage, then it flees to the free tile farthest from the player', () => {
  const rows = OPEN.slice();
  rows[0] = '. . . o . . .';
  const r = act(arena(rows), { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  // Row 0 lands on row 3, so the void covers the Crane. The hit starts
  // phase 2, so the arena is laid flat before it flees.
  assert.deepEqual(types(r).slice(0, 5), ['fold', 'fall', 'damage', 'sheet', 'flee']);
  const c = crane(r.state);
  assert.equal(c.creature.hp, 4);
  assert.deepEqual(r.events[4].to, { col: c.col, row: c.row });
  const field = reachField(r.state.board, findCreature(r.state.board, 'player'));
  const d = field[c.row * 7 + c.col];
  assert.ok(field.every((v, i) => v <= d || topLayer(r.state.board, i % 7, Math.floor(i / 7)).creature));
});

test('bump: no damage, it only flees; a killing void drop wins the floor', () => {
  const rows = ['. . .', '. G .', '. @ .', '. . .', '. . .'];
  let r = act(arena(rows), move('up'));
  assert.deepEqual(types(r).slice(0, 2), ['bump', 'flee']);
  const c = crane(r.state);
  assert.equal(c.creature.hp, 6);
  assert.notDeepEqual([c.col, c.row], [1, 1]);
  // Flee clip: the Crane flies (and the board pass skips it meanwhile).
  const clips = buildClips(arena(rows).board, act(arena(rows), move('up'), { snapshots: true }).events, MOTION);
  assert.ok(clips.some((k) => k.actor && k.actor.kind === 'flee' && k.actor.skip));

  // At 2 HP, a void dropped on it kills it: the floor is won.
  const drop = OPEN.slice();
  drop[0] = '. . . o . . .';
  const last = arena(drop);
  const cr = crane(last);
  last.board.cells[cr.row * last.board.w + cr.col].layers.at(-1).creature.hp = 2;
  r = act(last, { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  assert.deepEqual(types(r).slice(-3), ['damage', 'death', 'victory']);
  assert.equal(r.state.status, 'won');
  assert.deepEqual(r.state.outcome, { cause: 'boss' });
});

test('a fold that wins the floor stops resolving: the player is not dropped after the boss dies', () => {
  // Rows 0-1 fold down onto rows 3-2: the void at (3,0) lands on the
  // Crane at (3,3); the void at (5,1) on the player at (5,2).
  const rows = ['. . . o . . .', '. . . . . o .', '. . . . . @ .', '. . . G . . .', '. . . . . . .'];
  const s = arena(rows);
  const cr = crane(s);
  s.board.cells[cr.row * s.board.w + cr.col].layers.at(-1).creature.hp = 2;
  const r = act(s, { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  assert.equal(r.state.status, 'won');
  assert.ok(findCreature(r.state.board, 'player'), 'the player is still on the board');
  assert.ok(!r.events.some((e) => e.type === 'fall' && e.id === 'player'));
});

test('fleeSpot: farthest by walking distance, ties row-major; none reachable → nearest', () => {
  const s = arena(['. . .', '. G .', '. @ .']);
  const field = reachField(s.board, findCreature(s.board, 'player'));
  assert.deepEqual(fleeSpot(s.board, field, { col: 1, row: 1 }, () => null), { col: 0, row: 0 });
  const none = new Int16Array(9).fill(-1);
  assert.deepEqual(fleeSpot(s.board, none, { col: 1, row: 1 }, () => ({ col: 2, row: 2 })), { col: 2, row: 2 });
});

test('stateKey tells a marked Crane from an unmarked one', () => {
  const s = arena();
  const marked = act(s, WAIT).state;
  const waitedNoCrane = { ...marked, board: s.board };
  assert.notEqual(stateKey(marked), stateKey(waitedNoCrane));
  assert.equal(stackHeight(s.board, 3, 3), 1);
});

test('telegraph: the marked crease, its landing cells, and whether it hits the player', () => {
  const s = act(arena(), WAIT).state;
  const marks = bossMarks(s.board);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].id, CRANE);
  assert.equal(markCode(marks[0].fold), crane(s).creature.mark);
  const [t] = buildTelegraph(s.board);
  assert.equal(t.fizzle, false);
  assert.equal(t.hits, true, 'aimed at the player');
  assert.ok(t.pv.state.some((st) => st === CELL.LANDING));
  assert.deepEqual(buildTelegraph(arena().board), [], 'no mark yet, nothing to draw');
});

test('forecast: what the Crane\'s fold will do after the player\'s action', () => {
  const s = act(arena(), WAIT).state; // marked, aimed at the player
  assert.equal(bossForecast(s, WAIT), 'swat');
  assert.equal(bossForecast(arena(), WAIT), null, 'nothing due: it only marks');
  // Folding rows 0-2 down pins the Crane: no fold.
  assert.equal(bossForecast(s, { type: 'fold', fold: { axis: 'h', index: 3, side: 'before' } }), 'pinned');
  // A void dropped on it.
  const rows = OPEN.slice();
  rows[0] = '. . . o . . .';
  assert.equal(bossForecast(arena(rows), { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } }), 'dropped');
  assert.equal(bossForecast(s, { type: 'move', dir: 'nowhere' }), null, 'refused');
});

test('fresh sheet: a hit into a new phase lays the arena flat; creatures keep their cells', () => {
  // A Mite at (1,5) (listed after the Crane, so it is mite-1), the
  // player at (3,4).
  const rows = OPEN.slice();
  rows[0] = '. . . o . . .';
  rows[4] = '. . . @ . . .';
  rows[5] = '. m . . . . .';
  const start = arena(rows);
  // Pin the Mite first (row 6 over row 5), then drop the void.
  let r = act(start, { type: 'fold', fold: { axis: 'h', index: 6, side: 'after' } });
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'mite-1'));
  r = act(r.state, { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } }, { snapshots: true });
  const sheetAt = types(r).indexOf('sheet');
  assert.ok(sheetAt > 0, types(r).join());
  const b = r.events[sheetAt].board; // as the sheet left it, before anyone moved
  // The floor as it began: one layer everywhere, the void back on (3,0).
  for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
    assert.equal(stackHeight(b, col, row), 1, `${col},${row}`);
    assert.equal(topLayer(b, col, row).tile, start.board.cells[row * 7 + col].layers[0].tile);
    assert.ok(!topLayer(b, col, row).hinge);
  }
  // The Mite was pinned; now it stands on its own cell again (free to act).
  const m = findCreature(b, 'mite-1');
  assert.deepEqual([m.col, m.row, m.top], [1, 5, true]);
  assert.equal(findCreature(b, 'player').top, true);
  // The state's sheet is untouched (later hits start from the same floor).
  assert.deepEqual(r.state.sheet, start.sheet);
  assert.ok(!r.state.pendingSheet);
});

test('fresh sheet: a creature whose cell is a void on the sheet moves to the nearest free footing', () => {
  // The player stands on paper folded over the void at (3,6): after the
  // sheet, that cell is a void again, so the player is moved off it.
  const rows = OPEN.slice();
  rows[0] = '. . . o . . .';
  rows[6] = '. . . o . . .';
  rows[5] = '. . . @ . . .';
  // Row 5 folds onto row 6: the player rides onto the paper over (3,6).
  let r = act(arena(rows), { type: 'fold', fold: { axis: 'h', index: 6, side: 'before' } });
  let p = findCreature(r.state.board, 'player');
  assert.deepEqual([p.col, p.row], [3, 6]);
  // Row 0's void onto the Crane on row 3: a new phase, a fresh sheet.
  r = act(r.state, { type: 'fold', fold: { axis: 'h', index: 2, side: 'before' } });
  assert.ok(types(r).includes('sheet'), types(r).join());
  p = findCreature(r.state.board, 'player');
  assert.equal(topLayer(r.state.board, 3, 6).tile, 'void');
  assert.deepEqual([p.col, p.row, p.top], [3, 5, true], 'the nearest free footing');
  assert.equal(r.state.status, 'playing');
});

test('lift tags: the Crane\'s flaps still down are tagged; lifting one clears its tag', () => {
  let s = arena();
  s = act(s, WAIT).state; // it marks
  const r = act(s, WAIT); // it folds
  const fold = r.events.find((e) => e.type === 'fold' && e.by).fold;
  s = r.state;
  assert.deepEqual(bossFlaps(s.board), [fold]);
  const marks = buildCreaseMarks(s.board, []);
  assert.deepEqual(marks.map((m) => m.n), [LIFT_TAG]);
  // The player's own fold in effect on that crease is not the Crane's.
  assert.deepEqual(bossFlaps(s.board, [fold]), []);
  // Folding the same line from the other side lifts it: the floor is flat
  // again and the tag goes (the lifted layers now remember the player's fold).
  const lift = { ...fold, side: fold.side === 'before' ? 'after' : 'before' };
  const after = act(s, { type: 'fold', fold: lift });
  assert.ok(after.ok);
  assert.deepEqual(bossFlaps(after.state.board, [lift]), []);
  for (let i = 0; i < 49; i++) assert.equal(after.state.board.cells[i].layers.length, 1);
  // No boss, no tags.
  assert.deepEqual(bossFlaps(arena(['. . .', '. @ .']).board), []);
});

test('hints: lift after the Crane\'s first fold (not the player\'s); fresh sheet on a sheet event', () => {
  const ids = ['crane-lift', 'crane-sheet'];
  const seen = new Set();
  const on = (events) => hintsFor(ids, { type: 'events', events }, seen);
  assert.deepEqual(on([{ type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } }]), []);
  assert.deepEqual(on([{ type: 'fold', fold: { axis: 'v', index: 1, side: 'before' }, by: CRANE }]), ['crane-lift']);
  assert.deepEqual(on([{ type: 'sheet', id: CRANE }]), ['crane-sheet']);
});
