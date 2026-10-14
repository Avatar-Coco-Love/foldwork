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
// Clip = { board, duration, fold?, reverse?, actor?, sfx?, shake? }
//   fold    buildFoldAnim() result (fold / unfold events)
//   actor   { kind, id, creature, from, to, fromLevel, toLevel, skip }
//           kind: 'move' | 'slide' | 'bump' | 'shoot' | 'hit' | 'death'
//           | 'fall' | 'spawn' | 'drop' | 'flee' | 'jaws' (drop: `item` instead of a creature)
//           from/to are cells (equal for in-place clips); levels are the
//           stack level the creature stands on (0 = one layer).
//           skip: the board pass leaves this creature out, because the actor
//           pass draws it (moving, lunging, dropping or fading).
//
// Events with no visual (wait, defeat) and zero-length clips (reduced
// motion) produce no clip, so the board simply jumps to its final state.
//
// Screen shake (8d): when motion.shake is set (ui/settings.js resolveMotion:
// on, and motion not reduced), a clip for the player being hurt, a boss
// swat or a fall into the void carries `shake`, a strength for the fx
// player's playImpact (SHAKE_FOR).
//
// Sounds (audio/sounds.js soundForEvent) ride the clips: `sfx` lists the
// sounds to start with a clip, its own and those of the silent-picture
// events just before it (a key picked up sounds as the next clip starts,
// i.e. when the step onto it ends). Sounds after the last clip go into
// `endSfx` and play when the turn has finished playing.

import { buildFoldAnim, foldDurationMs, clipDurationMs, ACTOR_MS } from './fx.js';
import { findCreature, stackHeight, topLayer } from '../core/board.js';
import { soundForEvent } from '../audio/sounds.js';
import { PLAYER_ID } from '../core/turn.js';

/** endSfx: an array to collect the sounds that follow the last clip. */
export function buildClips(startBoard, events, motion, endSfx = null) {
  const clips = [];
  let board = startBoard;
  let sfx = [];
  for (const ev of events) {
    const after = ev.board || board;
    const sound = soundForEvent(ev);
    if (sound) sfx.push(sound);
    const clip = clipFor(ev, board, after, motion);
    if (clip && clip.duration > 0) {
      if (sfx.length) clip.sfx = sfx;
      const shake = shakeFor(ev, motion);
      if (shake) clip.shake = shake;
      sfx = [];
      clips.push(clip);
    }
    board = after;
  }
  if (endSfx) endSfx.push(...sfx);
  return clips;
}

/** Impact strength per event; `player` events only shake for the player. */
export const SHAKE_FOR = Object.freeze({ damage: { strength: 1, player: true }, swat: { strength: 1.4 }, fall: { strength: 0.8 } });

/** The impact strength an event shakes the screen with, or 0. */
export function shakeFor(ev, motion) {
  if (!motion || !motion.shake || motion.reducedMotion) return 0;
  const rule = SHAKE_FOR[ev.type];
  if (!rule || (rule.player && ev.id !== PLAYER_ID)) return 0;
  return rule.strength;
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
    case 'slide':
      // A Creaseling glides along the crease: one smooth move, no hop.
      return actorClip(before, 'slide', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(after, ev.to), true, motion);
    case 'bump':
      return actorClip(before, 'bump', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(before, ev.to), true, motion);
    case 'shoot':
      // A dart flies from the shooter to its target; the shooter stays drawn.
      return actorClip(before, 'shoot', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(before, ev.to), false, motion);
    case 'catch':
      // Soft Landing: a lunge toward the void and back.
      return actorClip(before, 'bump', ev.id, creatureIn(before, ev.id), ev.from, ev.at,
        level(before, ev.from), level(before, ev.from), true, motion);
    case 'damage': {
      const layer = topLayer(before, ev.at.col, ev.at.row);
      const creature = layer && layer.creature;
      return actorClip(before, 'hit', ev.id, creature, ev.at, ev.at, level(before, ev.at), level(before, ev.at), false, motion);
    }
    case 'spawn':
      // The new creature pops out of its spawner onto its cell.
      return actorClip(before, 'spawn', ev.creature.id, ev.creature, spawnerAt(before, ev.id, ev.at), ev.at,
        level(before, ev.at), level(after, ev.at), false, motion);
    case 'drop': {
      // The carried item hops from where its carrier went down.
      const duration = clipDurationMs(ACTOR_MS.drop, motion);
      return {
        board: before,
        duration,
        actor: { kind: 'drop', id: null, item: ev.item, from: { ...ev.from }, to: { ...ev.at },
          fromLevel: level(before, ev.from), toLevel: level(after, ev.at), skip: false },
      };
    }
    case 'swat':
      // A boss fold knocked the player out from under it.
      return actorClip(before, 'move', ev.id, creatureIn(before, ev.id), ev.from, ev.to,
        level(before, ev.from), level(after, ev.to), true, motion);
    case 'flee':
      // A hit boss flies off (it may already be off the board after a fall).
      return actorClip(before, 'flee', ev.id, ev.creature, ev.from, ev.to,
        level(before, ev.from), level(after, ev.to), true, motion);
    case 'jaws':
      // A Lockjaw opens (or shuts) its jaws: a quick pulse in its new pose.
      return actorClip(before, 'jaws', ev.id, creatureIn(after, ev.id), ev.at, ev.at,
        level(before, ev.at), level(before, ev.at), true, motion);
    case 'death':
    case 'fall':
      return actorClip(before, ev.type, ev.id, ev.creature, ev.at, ev.at, level(before, ev.at), level(before, ev.at), true, motion);
    default:
      return null;
  }
}

function spawnerAt(board, id, fallback) {
  const found = findCreature(board, id);
  return found ? { col: found.col, row: found.row } : fallback;
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
 * createPlayback({ fx, show, sound })
 *   fx     the fx player
 *   show   show(board): the owner puts this board in the renderer's scene
 *   sound  sound(ids): play these sounds now (optional)
 *
 * play(clips, endBoard, done, endSfx) plays the clips in order, shows
 * endBoard, plays endSfx, then calls done(). finish() skips to the end
 * (skipped clips stay silent; endSfx still plays).
 */
export function createPlayback({ fx, show, sound = null }) {
  let run = null; // { clips, i, endBoard, done, endSfx }

  function step() {
    const r = run;
    if (!r) return;
    if (r.i >= r.clips.length) {
      run = null;
      show(r.endBoard);
      if (sound && r.endSfx.length) sound(r.endSfx);
      if (r.done) r.done();
      return;
    }
    const clip = r.clips[r.i++];
    show(clip.board);
    if (sound && clip.sfx) sound(clip.sfx);
    if (clip.shake) fx.playImpact(clip.shake);
    if (clip.fold) fx.playFold(clip.fold, { duration: clip.duration, reverse: clip.reverse, done: step });
    else fx.playActor(clip.actor, { duration: clip.duration, done: step });
  }

  return {
    get busy() {
      return !!run;
    },
    play(clips, endBoard, done = null, endSfx = []) {
      this.finish();
      run = { clips, i: 0, endBoard, done, endSfx };
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
