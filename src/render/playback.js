// Turn playback: the event list from core/turn.js becomes clips that the fx
// player (render/fx.js) plays one after another.
//
//   - buildClips (pure, unit tested) maps events to clips. Each clip says
//     which board to show while it plays (the board before its event, from
//     the previous event's snapshot), so the steps of a turn read in order
//     even though logic already holds the final state.
//   - createPlayback sequences clips through the fx player and swaps the
//     shown board between them. It never touches game state.
//
// Clip = { board, duration, fold?, reverse?, actor? }
//   fold    buildFoldAnim() result (fold / unfold events)
//   actor   { kind, id, creature, from, to, fromLevel, toLevel, skip }
//           kind: 'move' | 'bump' | 'hit' | 'death' | 'fall'
//           from/to are cells (equal for in-place clips); levels are the
//           stack level the creature stands on (0 = one layer).
//           skip: the board pass leaves this creature out, because the actor
//           pass draws it (moving, lunging, dropping or fading).
//
// Events with no visual (wait, defeat) and zero-length clips (reduced
// motion) produce no clip, so the board simply jumps to its final state.

import { buildFoldAnim, foldDurationMs, clipDurationMs, ACTOR_MS } from './fx.js';
import { findCreature, stackHeight, topLayer } from '../core/board.js';

export function buildClips(startBoard, events, motion) {
  const clips = [];
  let board = startBoard;
  for (const ev of events) {
    const after = ev.board || board;
    const clip = clipFor(ev, board, after, motion);
    if (clip && clip.duration > 0) clips.push(clip);
    board = after;
  }
  return clips;
}

const level = (board, at) => Math.max(0, stackHeight(board, at.col, at.row) - 1);

function clipFor(ev, before, after, motion) {
  switch (ev.type) {
    case 'fold':
      return { board: before, fold: buildFoldAnim(before, ev.fold), reverse: false, duration: foldDurationMs(motion) };
    case 'unfold':
      // Reverse playback from the restored board: sheets lift off and go home.
      return { board: before, fold: buildFoldAnim(after, ev.fold), reverse: true, duration: foldDurationMs(motion) };
    case 'move':
      return actorClip(before, 'move', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(after, ev.to), true, motion);
    case 'bump':
      return actorClip(before, 'bump', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(before, ev.to), true, motion);
    case 'catch':
      // Soft Landing: a lunge toward the void and back.
      return actorClip(before, 'bump', ev.id, creatureIn(before, ev.id), ev.from, ev.at,
        level(before, ev.from), level(before, ev.from), true, motion);
    case 'damage': {
      const layer = topLayer(before, ev.at.col, ev.at.row);
      const creature = layer && layer.creature;
      return actorClip(before, 'hit', ev.id, creature, ev.at, ev.at, level(before, ev.at), level(before, ev.at), false, motion);
    }
    case 'death':
    case 'fall':
      return actorClip(before, ev.type, ev.id, ev.creature, ev.at, ev.at, level(before, ev.at), level(before, ev.at), true, motion);
    default:
      return null;
  }
}

function creatureIn(board, id) {
  const found = findCreature(board, id);
  return found ? found.creature : null;
}

function actorClip(board, kind, id, creature, from, to, fromLevel, toLevel, skip, motion) {
  if (!creature) return null;
  return {
    board,
    duration: clipDurationMs(ACTOR_MS[kind], motion),
    actor: { kind, id, creature, from: { ...from }, to: { ...to }, fromLevel, toLevel, skip },
  };
}

/**
 * createPlayback({ fx, show })
 *   fx     the fx player
 *   show   show(board): the owner puts this board in the renderer's scene
 *
 * play(clips, endBoard, done) plays the clips in order, shows endBoard, then
 * calls done(). finish() skips to the end.
 */
export function createPlayback({ fx, show }) {
  let run = null; // { clips, i, endBoard, done }

  function step() {
    const r = run;
    if (!r) return;
    if (r.i >= r.clips.length) {
      run = null;
      show(r.endBoard);
      if (r.done) r.done();
      return;
    }
    const clip = r.clips[r.i++];
    show(clip.board);
    if (clip.fold) fx.playFold(clip.fold, { duration: clip.duration, reverse: clip.reverse, done: step });
    else fx.playActor(clip.actor, { duration: clip.duration, done: step });
  }

  return {
    get busy() {
      return !!run;
    },
    play(clips, endBoard, done = null) {
      this.finish();
      run = { clips, i: 0, endBoard, done };
      step();
    },
    finish() {
      const r = run;
      if (!r) return;
      r.i = r.clips.length;
      fx.finish(); // calls the running clip's done → step() ends the run
      if (run === r) step();
    },
  };
}
