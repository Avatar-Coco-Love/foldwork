import assert from 'node:assert/strict';
import { test } from './harness.js';
import { buildClips, createPlayback, shakeFor } from '../src/render/playback.js';
import { ACTOR_MS, FOLD_MS, clipDurationMs } from '../src/render/fx.js';
import { createBoard, topLayer, getCell } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createFloorState, act, PLAYER_ID } from '../src/core/turn.js';

const normal = { speed: 1, reducedMotion: false };
const run = (s, action) => act(s, action, { snapshots: true });

test('clip durations scale with speed and vanish under reduced motion', () => {
  assert.equal(clipDurationMs(ACTOR_MS.move, normal), ACTOR_MS.move);
  assert.equal(clipDurationMs(100, { speed: 2 }), 50);
  assert.equal(clipDurationMs(100, { speed: 1, reducedMotion: true }), 0);
});

test('move: one clip showing the board before the move, creature skipped', () => {
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 } });
  const r = run(s, { type: 'move', dir: 'left' });
  const clips = buildClips(s.board, r.events, normal);
  assert.equal(clips.length, 1);
  const [c] = clips;
  assert.equal(c.board, s.board);
  assert.equal(c.duration, ACTOR_MS.move);
  assert.equal(c.actor.kind, 'move');
  assert.equal(c.actor.id, PLAYER_ID);
  assert.equal(c.actor.skip, true);
  assert.deepEqual([c.actor.from, c.actor.to], [{ col: 2, row: 2 }, { col: 1, row: 2 }]);
  assert.deepEqual([c.actor.fromLevel, c.actor.toLevel], [0, 0]);
});

test('move up a stack: the landing level comes from the board after', () => {
  const b = createBoard(5, 5);
  getCell(b, 2, 1).layers.push({ tile: TILE.FLOOR, creature: null, item: null, flags: 0 });
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const [c] = buildClips(s.board, run(s, { type: 'move', dir: 'up' }).events, normal);
  assert.equal(c.actor.toLevel, 1);
});

test('bump + kill: lunge, hit, death clips in order, each on the board before it', () => {
  const b = createBoard(5, 5);
  topLayer(b, 2, 1).creature = { id: 'm1', kind: 'dummy', hp: 1, maxHp: 1 };
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const r = run(s, { type: 'move', dir: 'up' });
  const clips = buildClips(s.board, r.events, normal);
  assert.deepEqual(clips.map((c) => c.actor.kind), ['bump', 'hit', 'death']);
  assert.equal(clips[0].board, s.board);
  assert.equal(clips[1].actor.skip, false); // the target stays drawn while hit
  assert.equal(clips[1].actor.creature.id, 'm1');
  assert.equal(topLayer(clips[2].board, 2, 1).creature.hp, 0); // still there to fade
  assert.equal(clips[2].actor.creature.id, 'm1');
});

test('fall: move then a fall clip; wait and defeat make no clips', () => {
  const b = createBoard(5, 5, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const r = run(s, { type: 'move', dir: 'up' });
  assert.deepEqual(buildClips(s.board, r.events, normal).map((c) => c.actor.kind), ['move', 'fall']);
  assert.equal(buildClips(s.board, run(s, { type: 'wait' }).events, normal).length, 0);
});

test('screen shake: a fall shakes when shake is on, never under reduced motion', () => {
  const b = createBoard(5, 5, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const r = run(s, { type: 'move', dir: 'up' });
  const shaky = buildClips(s.board, r.events, { ...normal, shake: true });
  assert.deepEqual(shaky.map((c) => c.shake || 0), [0, 0.8]);
  assert.ok(buildClips(s.board, r.events, normal).every((c) => !c.shake));
  assert.equal(shakeFor({ type: 'fall', id: 'm1' }, { shake: true, reducedMotion: true }), 0);
});

test('screen shake: the player hurt and a boss swat; an enemy hit does not', () => {
  const on = { ...normal, shake: true };
  assert.equal(shakeFor({ type: 'damage', id: PLAYER_ID }, on), 1);
  assert.equal(shakeFor({ type: 'damage', id: 'm1' }, on), 0);
  assert.ok(shakeFor({ type: 'swat', id: PLAYER_ID }, on) > 1);
  assert.equal(shakeFor({ type: 'move', id: PLAYER_ID }, on), 0);
  assert.equal(shakeFor({ type: 'swat', id: PLAYER_ID }, normal), 0);
});

test('fold and undo clips: forward from the old board, reverse from the restored one', () => {
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 } });
  const fold = { axis: 'v', index: 2, side: 'before' };
  const f = run(s, { type: 'fold', fold });
  const [fc] = buildClips(s.board, f.events, normal);
  assert.equal(fc.duration, FOLD_MS);
  assert.equal(fc.reverse, false);
  assert.equal(fc.fold.sheets.length, 10);
  const u = run(f.state, { type: 'undo' });
  const [uc] = buildClips(f.state.board, u.events, normal);
  assert.equal(uc.reverse, true);
  assert.equal(uc.board, f.state.board);
  assert.deepEqual(uc.fold.base.cells[0].layers, []); // sheets lifted out of the restored board
});

test('reduced motion: no clips at all', () => {
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 2 } });
  const r = run(s, { type: 'fold', fold: { axis: 'h', index: 1, side: 'before' } });
  assert.equal(buildClips(s.board, r.events, { speed: 1, reducedMotion: true }).length, 0);
});

// Fake fx player: clips finish only when the test says so.
function fakeFx() {
  const fx = {
    running: null,
    log: [],
    playFold(anim, { done }) {
      fx.log.push('fold');
      fx.running = done;
    },
    playActor(actor, { done }) {
      fx.log.push(actor.kind);
      fx.running = done;
    },
    playImpact(strength) {
      fx.log.push(`shake ${strength}`);
    },
    finish() {
      const d = fx.running;
      fx.running = null;
      if (d) d();
    },
  };
  return fx;
}

test('playback sequences clips, swaps the shown board, then shows the end board', () => {
  const fx = fakeFx();
  const shown = [];
  const pb = createPlayback({ fx, show: (b) => shown.push(b) });
  let done = 0;
  const clips = [
    { board: 'b0', actor: { kind: 'bump' }, duration: 1 },
    { board: 'b1', actor: { kind: 'hit' }, duration: 1 },
  ];
  pb.play(clips, 'end', () => done++);
  assert.ok(pb.busy);
  assert.deepEqual(shown, ['b0']);
  fx.finish();
  assert.deepEqual(shown, ['b0', 'b1']);
  assert.equal(done, 0);
  fx.finish();
  assert.deepEqual(shown, ['b0', 'b1', 'end']);
  assert.equal(done, 1);
  assert.ok(!pb.busy);
  assert.deepEqual(fx.log, ['bump', 'hit']);
});

test('playback starts a clip\'s impact shake with the clip', () => {
  const fx = fakeFx();
  const pb = createPlayback({ fx, show: () => {} });
  pb.play([{ board: 'b0', actor: { kind: 'hit' }, duration: 1, shake: 1 }], 'end');
  assert.deepEqual(fx.log, ['shake 1', 'hit']);
  fx.finish();
});

test('playback with no clips ends at once; finish() skips the rest', () => {
  const fx = fakeFx();
  const shown = [];
  const pb = createPlayback({ fx, show: (b) => shown.push(b) });
  let done = 0;
  pb.play([], 'end', () => done++);
  assert.equal(done, 1);
  assert.ok(!pb.busy);
  pb.play([{ board: 'a', fold: {}, duration: 1 }, { board: 'b', actor: { kind: 'hit' }, duration: 1 }], 'end2', () => done++);
  pb.finish();
  assert.equal(done, 2);
  assert.equal(shown[shown.length - 1], 'end2');
  assert.deepEqual(fx.log, ['fold']);
});

test('enemy turn: mite move and bump play as actor clips', () => {
  const s = createFloorState({
    board: createBoard(5, 5), player: { col: 2, row: 2 }, enemies: [{ kind: 'mite', col: 2, row: 0, id: 'm' }],
  });
  const r1 = run(s, { type: 'wait' });
  const c1 = buildClips(s.board, r1.events, normal);
  assert.deepEqual(c1.map((c) => [c.actor.kind, c.actor.id]), [['move', 'm']]);
  const r2 = run(r1.state, { type: 'wait' });
  const c2 = buildClips(r1.state.board, r2.events, normal);
  assert.deepEqual(c2.map((c) => [c.actor.kind, c.actor.id]), [['bump', 'm'], ['hit', PLAYER_ID]]);
});

test('fold effects: void drop plays a fall after the fold; pin and strand have no clip', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({
    board: b, player: { col: 4, row: 4 },
    enemies: [{ kind: 'mite', col: 1, row: 2, id: 'drop' }, { kind: 'mite', col: 1, row: 0, id: 'pin' }],
  });
  const r = run(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  const clips = buildClips(s.board, r.events, normal);
  assert.ok(clips[0].fold);
  assert.equal(clips[1].actor.kind, 'fall');
  assert.equal(clips[1].actor.id, 'drop');
  // The fall clip shows the folded board, with the mite still under the void.
  assert.equal(getCell(clips[1].board, 1, 2).layers[0].creature.id, 'drop');
});
