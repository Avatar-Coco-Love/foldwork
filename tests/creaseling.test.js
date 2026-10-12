// Phase 5b: the Creaseling (docs/03), fold-aware: after a fold it slides
// along the crease toward the player instead of stepping.
import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, findCreature } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { CREATURE_DEFS, createCreature } from '../src/core/creatures.js';
import { slidePath } from '../src/core/enemies.js';
import { createFloorState, act, playerOf } from '../src/core/turn.js';
import { parseMap } from '../src/core/maps.js';
import { buildFoldPreview, slidePreview } from '../src/render/preview.js';
import { buildClips } from '../src/render/playback.js';

const pos = (s, id) => {
  const c = findCreature(s.board, id);
  return c && { col: c.col, row: c.row, top: c.top };
};
const types = (r) => r.events.map((e) => e.type);
const C = 'creaseling';
const floor = (opts, board = createBoard(5, 5)) => createFloorState({ board, ...opts });
const crease = (col, row) => ({ kind: C, col, row, id: C });
const fold = (axis, index, side) => ({ type: 'fold', fold: { axis, index, side } });
const FOLD_COL0 = fold('v', 1, 'before'); // column 0 onto column 1
const FOLD_ROW0 = fold('h', 1, 'before'); // row 0 onto row 1

test('defs: Creaseling has 2 HP, slides 3, map symbol C', () => {
  const def = CREATURE_DEFS[C];
  assert.deepEqual({ hp: def.hp, ai: def.ai, slide: def.slide, team: def.team }, { hp: 2, ai: 'creep', slide: 3, team: 'enemy' });
  assert.equal(createCreature(C).hp, 2);
  assert.deepEqual(parseMap(['C .', '. @']).enemies.map((e) => e.kind), [C]);
});

test('vertical crease: slides up to 3 tiles down its column toward the player, no hit', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 0)] });
  const r = act(s, FOLD_COL0);
  assert.ok(r.ok);
  const ev = r.events.find((e) => e.type === 'slide');
  assert.deepEqual(ev.from, { col: 4, row: 0 });
  assert.deepEqual(ev.to, { col: 4, row: 3 });
  assert.deepEqual(ev.path, [{ col: 4, row: 1 }, { col: 4, row: 2 }, { col: 4, row: 3 }]);
  assert.deepEqual(pos(r.state, C), { col: 4, row: 3, top: true });
  assert.ok(!types(r).includes('move'), 'the slide replaces its step');
});

test('horizontal crease: slides along its row; diagonal crease: along the diagonal', () => {
  let s = floor({ player: { col: 0, row: 4 }, enemies: [crease(4, 2)] });
  let r = act(s, FOLD_ROW0);
  assert.deepEqual(pos(r.state, C), { col: 1, row: 2, top: true });

  s = floor({ player: { col: 4, row: 4 }, enemies: [crease(0, 0)], rules: { diagonal: true } });
  r = act(s, fold('d', 4, 'before')); // "\" through both of them: they are on the hinge
  assert.ok(r.ok);
  assert.deepEqual(r.events.find((e) => e.type === 'slide').path,
    [{ col: 1, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 3 }]);
  assert.deepEqual(slidePath(createBoard(5, 5), { col: 0, row: 4 }, { axis: 'a', index: 4 }, { col: 4, row: 0 }, 2),
    [{ col: 1, row: 3 }, { col: 2, row: 2 }]);
});

test('level with the player along the crease: no slide, it steps like a Mite', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 4)] });
  const r = act(s, FOLD_COL0); // vertical crease, same row: nothing to slide toward
  assert.ok(!types(r).includes('slide'));
  assert.deepEqual(pos(r.state, C), { col: 3, row: 4, top: true });
  // On a turn without a fold it chases like a Mite too.
  const w = act(floor({ player: { col: 2, row: 4 }, enemies: [crease(2, 0)] }), { type: 'wait' });
  assert.deepEqual(pos(w.state, C), { col: 2, row: 1, top: true });
});

test('a slide stops before walls, voids, creatures and the player (never bumps)', () => {
  const board = createBoard(5, 5, (col, row) => (col === 4 && row === 2 ? TILE.WALL : col === 3 && row === 2 ? TILE.VOID : TILE.FLOOR));
  let r = act(floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 0)] }, board), FOLD_COL0);
  assert.deepEqual(pos(r.state, C), { col: 4, row: 1, top: true }, 'wall');
  r = act(floor({ player: { col: 2, row: 4 }, enemies: [crease(3, 0)] }, board), FOLD_COL0);
  assert.deepEqual(pos(r.state, C), { col: 3, row: 1, top: true }, 'void');
  const s = floor({ player: { col: 2, row: 4 }, enemies: [crease(2, 1), { kind: 'wasp', col: 4, row: 3, id: 'w' }] });
  r = act(s, FOLD_COL0);
  assert.deepEqual(pos(r.state, C), { col: 2, row: 3, top: true }, 'player');
  assert.equal(playerOf(r.state).hp, 3);
  const blocker = floor({ player: { col: 2, row: 4 }, enemies: [crease(3, 0), { kind: 'wasp', col: 3, row: 2, id: 'w' }] });
  assert.deepEqual(pos(act(blocker, FOLD_COL0).state, C), { col: 3, row: 1, top: true }, 'creature');
});

test('riding the fold: it slides from where it lands, over stacks', () => {
  const s = floor({ player: { col: 3, row: 4 }, enemies: [crease(0, 1)] });
  const r = act(s, FOLD_COL0); // lands on (1,1), then slides down column 1
  assert.deepEqual(r.events.find((e) => e.type === 'slide').from, { col: 1, row: 1 });
  assert.deepEqual(pos(r.state, C), { col: 1, row: 4, top: true });
});

test('pinned, it does not slide; undo takes the slide back', () => {
  const s = floor({ player: { col: 3, row: 4 }, enemies: [crease(1, 0)] });
  const r = act(s, FOLD_COL0);
  assert.ok(types(r).includes('pin'));
  assert.ok(!types(r).includes('slide'));
  assert.deepEqual(pos(r.state, C), { col: 1, row: 0, top: false });

  const t = floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 0)] });
  const u = act(act(t, FOLD_COL0).state, { type: 'undo' });
  assert.deepEqual(pos(u.state, C), { col: 4, row: 0, top: true });
});

test('preview: slidePreview matches the real turn, empty when the fold is refused', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 0)] });
  const slides = slidePreview(s, FOLD_COL0.fold);
  assert.deepEqual(slides.map(({ id, from, to }) => ({ id, from, to })), [{ id: C, from: { col: 4, row: 0 }, to: { col: 4, row: 3 } }]);
  assert.deepEqual(slidePreview({ ...s, charges: 0 }, FOLD_COL0.fold), []);
  assert.deepEqual(buildFoldPreview(s.board, FOLD_COL0.fold).slides, []);
});

test('playback: a slide is one glide clip from start to end', () => {
  const s = floor({ player: { col: 2, row: 4 }, enemies: [crease(4, 0)] });
  const r = act(s, FOLD_COL0, { snapshots: true });
  const clips = buildClips(s.board, r.events, { speed: 1, reducedMotion: false });
  const glide = clips.find((c) => c.actor && c.actor.kind === 'slide');
  assert.ok(glide);
  assert.deepEqual([glide.actor.from, glide.actor.to], [{ col: 4, row: 0 }, { col: 4, row: 3 }]);
});
