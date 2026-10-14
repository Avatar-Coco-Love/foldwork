// Phase 5a enemies: Paper Wasp and Card Brute (docs/03), plus Wax Coat.
import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, createLayer, getCell, findCreature } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { CREATURE_DEFS, createCreature, isHeavy } from '../src/core/creatures.js';
import { sightLanes } from '../src/core/enemies.js';
import { validateFold } from '../src/core/fold.js';
import { createFloorState, act, playerOf, coverEffect } from '../src/core/turn.js';
import { stateKey } from '../src/core/solver.js';
import { buildFoldPreview, CELL, EFFECT } from '../src/render/preview.js';
import { buildClips } from '../src/render/playback.js';
import { RELIC_DEFS, rulesFor } from '../src/core/relics.js';
import { parseMap } from '../src/core/maps.js';

const pos = (s, id) => {
  const c = findCreature(s.board, id);
  return c && { col: c.col, row: c.row };
};
const types = (r) => r.events.map((e) => e.type);
const floor = (opts, board = createBoard(5, 5)) => createFloorState({ board, ...opts });
const at = (kind, col, row, id = kind) => ({ kind, col, row, id });
const WAIT = { type: 'wait' };
const FOLD_COL0 = { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } }; // column 0 onto column 1

test('defs: Wasp is a fixed 1 HP shooter; Brute is a slow, heavy 3 HP chaser', () => {
  assert.deepEqual(
    { hp: CREATURE_DEFS.wasp.hp, ai: CREATURE_DEFS.wasp.ai, range: CREATURE_DEFS.wasp.range, fixed: CREATURE_DEFS.wasp.fixed },
    { hp: 1, ai: 'sting', range: 4, fixed: true },
  );
  const brute = createCreature('brute');
  assert.equal(brute.hp, 3);
  assert.equal(brute.rest, 1, 'sits out its first turn');
  assert.equal(isHeavy(brute), true);
  assert.equal(isHeavy(createCreature('mite')), false);
  assert.equal('rest' in createCreature('mite'), false);
  const parsed = parseMap(['W . B', '. @ .', '. . .']);
  assert.deepEqual(parsed.enemies.map((e) => e.kind), ['wasp', 'brute']);
});

test('Brute moves every other turn, starting with a rest', () => {
  let s = floor({ player: { col: 2, row: 4 }, enemies: [at('brute', 2, 0)] });
  const trail = [];
  for (let i = 0; i < 4; i++) {
    s = act(s, WAIT).state;
    trail.push(pos(s, 'brute').row);
  }
  assert.deepEqual(trail, [0, 1, 1, 2]);
  // Adjacent: it hits on its active turns only.
  for (let i = 0; i < 2; i++) s = act(s, WAIT).state; // rest, then step to row 3
  assert.equal(pos(s, 'brute').row, 3);
  assert.equal(playerOf(s).hp, 3);
  s = act(s, WAIT).state; // rest
  assert.equal(playerOf(s).hp, 3);
  const r = act(s, WAIT);
  assert.ok(types(r).includes('bump'));
  assert.equal(playerOf(r.state).hp, 2);
  // The rest counter is part of the solver's state identity.
  const a = floor({ player: { col: 2, row: 4 }, enemies: [at('brute', 2, 0)] });
  const b = { ...a, board: { ...a.board, cells: a.board.cells.map((c) => ({ layers: c.layers.map((l) => (l.creature ? { ...l, creature: { ...l.creature, rest: 0 } } : l)) })) } };
  assert.notEqual(stateKey(a), stateKey(b));
});

test('Heavy: a fold can\'t land on a Brute (refused, nothing changes)', () => {
  const s = floor({ player: { col: 3, row: 4 }, enemies: [at('brute', 1, 2)] });
  const check = validateFold(s.board, FOLD_COL0.fold);
  assert.equal(check.ok, false);
  assert.deepEqual(check.reasons, [{ code: 'heavy', col: 1, row: 2, kind: 'brute' }]);
  const r = act(s, FOLD_COL0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-fold');
  assert.equal(r.state, s);
  // Preview: the cell is marked HEAVY, with no pin cue.
  const pv = buildFoldPreview(s.board, FOLD_COL0.fold);
  assert.equal(pv.ok, false);
  assert.equal(pv.state[2 * 5 + 1], CELL.HEAVY);
  assert.equal(pv.effect[2 * 5 + 1], EFFECT.NONE);
  assert.equal(coverEffect(s.board, { col: 0, row: 2 }, { col: 1, row: 2 }), 'heavy');
});

test('Heavy: a void sheet still drops a Brute', () => {
  const board = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = floor({ player: { col: 3, row: 4 }, enemies: [at('brute', 1, 2)] }, board);
  assert.equal(validateFold(s.board, FOLD_COL0.fold).ok, true);
  const pv = buildFoldPreview(s.board, FOLD_COL0.fold);
  assert.equal(pv.effect[2 * 5 + 1], EFFECT.DROP);
  const r = act(s, FOLD_COL0);
  assert.ok(r.ok);
  assert.ok(r.events.some((e) => e.type === 'fall' && e.id === 'brute'));
  assert.equal(findCreature(r.state.board, 'brute'), null);
});

test('Heavy: a Brute riding a fold lands on top and pins what it covers', () => {
  const s = floor({ player: { col: 3, row: 4 }, enemies: [at('brute', 0, 2), at('mite', 1, 2)] });
  const r = act(s, FOLD_COL0);
  assert.ok(r.ok);
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'mite'));
  const brute = findCreature(r.state.board, 'brute');
  assert.deepEqual({ col: brute.col, row: brute.row, top: brute.top }, { col: 1, row: 2, top: true });
});

test('Wasp stings along a clear row or column within 4, every turn', () => {
  let s = floor({ player: { col: 2, row: 4 }, enemies: [at('wasp', 2, 0)] });
  const r = act(s, WAIT);
  assert.deepEqual(types(r), ['wait', 'shoot', 'damage']);
  assert.deepEqual(r.events[1].to, { col: 2, row: 4 });
  assert.equal(playerOf(r.state).hp, 2);
  s = act(r.state, WAIT).state;
  assert.equal(playerOf(s).hp, 1);
  // Out of line, or beyond range: no sting.
  assert.deepEqual(types(act(floor({ player: { col: 3, row: 4 }, enemies: [at('wasp', 2, 0)] }), WAIT)), ['wait']);
  const far = createFloorState({ board: createBoard(6, 6), player: { col: 0, row: 5 }, enemies: [at('wasp', 0, 0)] });
  assert.deepEqual(types(act(far, WAIT)), ['wait']);
  // A Wasp never moves.
  assert.deepEqual(pos(act(floor({ player: { col: 3, row: 4 }, enemies: [at('wasp', 2, 0)] }), WAIT).state, 'wasp'), { col: 2, row: 0 });
});

test('Wasp: walls, creatures and taller stacks block the shot; holes don\'t', () => {
  const lane = (board, extra = []) => {
    const s = floor({ player: { col: 2, row: 4 }, enemies: [at('wasp', 2, 0), ...extra] }, board);
    return types(act(s, WAIT)).includes('shoot');
  };
  assert.equal(lane(createBoard(5, 5, (c, r) => (c === 2 && r === 2 ? TILE.WALL : TILE.FLOOR))), false);
  assert.equal(lane(createBoard(5, 5, (c, r) => (c === 2 && r === 2 ? TILE.VOID : TILE.FLOOR))), true);
  assert.equal(lane(createBoard(5, 5), [at('mite', 4, 2, 'm')]), true);
  const stacked = createBoard(5, 5);
  getCell(stacked, 2, 2).layers.push(createLayer(TILE.FLOOR));
  assert.equal(lane(stacked), false);
  // From a taller stack it shoots over a lower one.
  getCell(stacked, 2, 0).layers.push(createLayer(TILE.FLOOR));
  assert.equal(lane(stacked), true);
  // A creature in the lane stops it (no friendly fire, no hit).
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('wasp', 2, 0), at('brute', 2, 2)] });
  const lanes = sightLanes(s.board, { col: 2, row: 0 }, 4);
  assert.deepEqual(lanes[1], [{ col: 2, row: 1 }, { col: 2, row: 2 }]); // down, ends on the Brute
});

test('Wasp: a player on a taller stack is still in sight (playtest round 2)', () => {
  const sting = (board) => types(act(floor({ player: { col: 2, row: 3 }, enemies: [at('wasp', 2, 0)] }, board), WAIT)).includes('shoot');
  const up = createBoard(5, 5);
  getCell(up, 2, 3).layers.push(createLayer(TILE.FLOOR)); // one higher than the Wasp
  assert.equal(sting(up), true);
  getCell(up, 2, 3).layers.push(createLayer(TILE.FLOOR)); // two higher
  assert.equal(sting(up), true);
  // Right beside it, one higher: still stung.
  const near = createBoard(5, 5);
  getCell(near, 2, 1).layers.push(createLayer(TILE.FLOOR));
  assert.equal(types(act(floor({ player: { col: 2, row: 1 }, enemies: [at('wasp', 2, 0)] }, near), WAIT)).includes('shoot'), true);
  // A taller stack in between still blocks, however high the player stands.
  getCell(up, 2, 2).layers.push(createLayer(TILE.FLOOR));
  assert.equal(sting(up), false);
});

test('Wasp: pinned, it can\'t sting; it is never stranded', () => {
  const s = floor({ player: { col: 1, row: 4 }, enemies: [at('wasp', 1, 0), at('mite', 0, 0, 'm')] });
  // Column 0 folds onto column 1: the Wasp is pinned under the Mite's sheet.
  const r = act(s, FOLD_COL0);
  assert.ok(r.events.some((e) => e.type === 'pin' && e.id === 'wasp'));
  assert.ok(!types(r).includes('shoot'));
  // Folding a Wasp across a void cuts its path, but it doesn't walk: no strand.
  const board = createBoard(5, 5, (c, r2) => (r2 === 2 ? TILE.VOID : TILE.FLOOR));
  const t = floor({ player: { col: 3, row: 4 }, enemies: [at('wasp', 0, 3)] }, board);
  const f = act(t, FOLD_COL0);
  assert.ok(!types(f).includes('strand'));
});

test('Wax Coat: stings do nothing, other hits still land', () => {
  assert.equal(RELIC_DEFS['wax-coat'].group, 'defense');
  const rules = rulesFor(['wax-coat']);
  assert.equal(rules.waxCoat, true);
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('wasp', 2, 0), at('mite', 1, 4)], rules });
  const r = act(s, WAIT);
  assert.ok(r.events.some((e) => e.type === 'block' && e.by === 'wax'));
  assert.equal(playerOf(r.state).hp, 2, 'the Mite bite still counts');
});

test('playback: a sting plays as a dart clip from the Wasp to its target', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [at('wasp', 2, 0)] });
  const r = act(s, WAIT, { snapshots: true });
  const clips = buildClips(s.board, r.events, { speed: 1, reducedMotion: false });
  const dart = clips.find((c) => c.actor && c.actor.kind === 'shoot');
  assert.ok(dart);
  assert.deepEqual([dart.actor.from, dart.actor.to, dart.actor.skip], [{ col: 2, row: 0 }, { col: 2, row: 4 }, false]);
});

test('lift: folding back the fold that pinned the player frees it in place (playtest round 2)', () => {
  const s = floor({ player: { col: 1, row: 2 }, enemies: [at('mite', 0, 2, 'm')], charges: 3 });
  const pinned = act(s, FOLD_COL0); // column 0 onto column 1: the Mite lands on the player
  assert.ok(pinned.events.some((e) => e.type === 'pin' && e.id === 'player'));
  const back = { type: 'fold', fold: { axis: 'v', index: 1, side: 'after' } };
  const pv = buildFoldPreview(pinned.state.board, back.fold);
  assert.equal(pv.lift, true);
  // Only column 1 leaves (one layer each); columns 2..4 hold no flap and stay.
  for (let row = 0; row < 5; row++) {
    assert.equal(pv.state[row * 5 + 1], CELL.LEAVING);
    assert.equal(pv.moving[row * 5 + 1], 1);
    assert.equal(pv.state[row * 5 + 2], CELL.NONE);
  }
  const r = act(pinned.state, back);
  assert.ok(r.ok);
  assert.deepEqual(pos(r.state, 'player'), { col: 1, row: 2 });
  assert.equal(findCreature(r.state.board, 'player').top, true);
  assert.deepEqual(pos(r.state, 'm'), { col: 0, row: 2 });
  for (let row = 0; row < 5; row++) {
    assert.equal(r.state.board.cells[row * 5].layers.length, 1);
    assert.equal(r.state.board.cells[row * 5 + 1].layers.length, 1);
  }
});
