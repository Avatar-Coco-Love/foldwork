// Presentational effects: fold animation, creature clips and board shake.
//
// Two layers, like preview.js:
//   - Pure model + timing (no DOM): buildFoldAnim, foldFrame, shakeOffset,
//     clipDurationMs / foldDurationMs. Unit tested.
//   - createFxPlayer: a tiny requestAnimationFrame driver that advances one
//     clip at a time and asks the renderer to redraw. The renderer paints
//     fx.foldAnim / fx.actor / fx.shake; it never times anything itself.
//
// Game logic never waits on this: the board is already folded when the
// animation starts. The animation only shows how it got there.

import { validateFold } from '../core/fold.js';
import { creaseSegment } from './preview.js';
import { cellIndex, cloneBoard } from '../core/board.js';

/** Base fold duration at speed 1 (spec: 350–450ms). */
export const FOLD_MS = 400;
/** Share of the fold spent rotating; the rest settles onto the stacks. */
export const ROTATE_SHARE = 0.75;
export const SHAKE_MS = 320;
/** Impact screen shake (8d): short, subtle, never under reduced motion. */
export const IMPACT_MS = 260;
export const IMPACT_PX = 3;
/** Under reduced motion the invalid cue is a static flash, not a shake. */
export const FLASH_MS = 300;

/**
 * Creature clip durations at speed 1 (render/playback.js). Kept short so a
 * turn reads instantly; the fold is the showpiece.
 */
export const ACTOR_MS = Object.freeze({ move: 130, slide: 240, bump: 170, shoot: 200, hit: 220, death: 260, fall: 380, spawn: 260, drop: 240, flee: 420, jaws: 220 });

/**
 * A clip's duration in ms. `speed` is a multiplier (2 = twice as fast).
 * Reduced motion makes it instant (0).
 */
export function clipDurationMs(baseMs, { speed = 1, reducedMotion = false } = {}) {
  if (reducedMotion || !(speed > 0)) return 0;
  return Math.round(baseMs / speed);
}

/** Fold animation duration in ms (see clipDurationMs). */
export function foldDurationMs(motion) {
  return clipDurationMs(FOLD_MS, motion);
}

/**
 * What a fold animation draws, built once per fold from the board *before*
 * the fold:
 *   fold    the crease
 *   line    creaseSegment(): where it crosses the board, and its normal
 *   base    the board minus the moving layers (what stays put)
 *   sheets  [{ index, col, row, to, layers, keep, baseHeight }] one per
 *           moving stack: `layers` lift off (col,row) from above the `keep`
 *           layers that stay there (a lifted flap: core/fold.js) and land
 *           on cell index `to` above `baseHeight` layers already there.
 * Clipped and empty source cells don't move, so they are not sheets.
 */
export function buildFoldAnim(boardBefore, fold) {
  const base = cloneBoard(boardBefore);
  const sheets = [];
  const moves = validateFold(boardBefore, fold).moves || [];
  for (const m of moves) {
    if (!m.count) continue;
    const index = cellIndex(boardBefore, m.from.col, m.from.row);
    const all = boardBefore.cells[index].layers;
    const keep = all.length - m.count;
    const to = cellIndex(boardBefore, m.to.col, m.to.row);
    sheets.push({
      index,
      col: m.from.col,
      row: m.from.row,
      to,
      layers: keep ? all.slice(keep) : all,
      keep,
      baseHeight: boardBefore.cells[to].layers.length,
    });
    base.cells[index].layers.length = keep;
  }
  return { fold, base, sheets, line: creaseSegment(boardBefore, fold) };
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Pose of the folding sheet at progress u ∈ [0,1] (0 = flat at the source,
 * 1 = landed on the stacks). Writes into `out` to avoid per-frame garbage.
 *   cos, sin   of the fold angle (0 → π). Positions scale by `cos` around the
 *              crease (cos = -1 is the mirror image), the cosine "perspective".
 *   arc        0..1 height of the rotation arc (sin of the angle)
 *   hover      0..1 extra float that drops to 0 while settling
 *   stack      0..1 how far the sheet has risen to its landing stack height
 */
export function foldFrame(u, out = {}) {
  u = clamp01(u);
  const r = clamp01(u / ROTATE_SHARE);
  const angle = Math.PI * easeInOut(r);
  out.cos = Math.cos(angle);
  out.sin = Math.sin(angle);
  out.arc = out.sin;
  if (u <= ROTATE_SHARE) {
    out.hover = r * r * (3 - 2 * r); // smoothstep up while rotating
  } else {
    const s = (u - ROTATE_SHARE) / (1 - ROTATE_SHARE);
    out.hover = 1 - s * s; // falls like paper settling
  }
  out.stack = easeInOut(r);
  return out;
}

/**
 * Horizontal shake offset in px at progress t ∈ [0,1]: two decaying swings.
 */
export function shakeOffset(t, amplitude = 6) {
  t = clamp01(t);
  return amplitude * Math.sin(t * Math.PI * 4) * (1 - t);
}

/**
 * Impact shake offset at progress t ∈ [0,1] (player hurt, boss swat, void
 * drop): a small two-axis wobble that dies off quickly. No randomness, so
 * the same hit always shakes the same way. Writes into `out`.
 */
export function impactOffset(t, amplitude = IMPACT_PX, out = {}) {
  t = clamp01(t);
  const fade = (1 - t) * (1 - t);
  out.x = amplitude * Math.sin(t * Math.PI * 5) * fade;
  out.y = amplitude * 0.6 * Math.sin(t * Math.PI * 7 + 1) * fade * (t > 0 ? 1 : 0);
  return out;
}

// ---------------------------------------------------------------------------
// Player (DOM: requestAnimationFrame + performance.now)

/**
 * createFxPlayer({ onChange })
 *   onChange()   the fx state changed (owner asks the renderer to redraw).
 *                Called every frame while something plays.
 *
 * One clip plays at a time (a fold or a creature actor); the shake runs
 * alongside, and so does an impact. State the renderer reads:
 *   player.foldAnim  { ...buildFoldAnim(), u, frame } or null
 *   player.actor     { ...actor, u } or null (see render/playback.js)
 *   player.shake     { x, flash } or null (the invalid-action cue)
 *   player.impact    { x, y } or null (screen shake on a hit)
 */
export function createFxPlayer({ onChange, now = () => performance.now() }) {
  let clip = null; // { start, duration, reverse, done }
  let shake = null; // { start, duration, flash }
  let impact = null; // { start, duration, amplitude }
  let rafId = 0;
  const frameOut = {};

  const player = {
    foldAnim: null,
    actor: null,
    shake: null,
    impact: null,
    get busy() {
      return !!clip;
    },
    /**
     * Play a fold. `reverse` plays it backwards (undo). Calls done() when it
     * finishes or is skipped; a duration of 0 finishes synchronously.
     */
    playFold(anim, { duration, reverse = false, done = null }) {
      finishClip();
      if (!(duration > 0)) {
        if (done) done();
        return;
      }
      clip = { start: now(), duration, reverse, done };
      player.foldAnim = { ...anim, u: reverse ? 1 : 0, frame: foldFrame(reverse ? 1 : 0, frameOut) };
      onChange();
      schedule();
    },
    /** Play a creature clip (move, bump, shoot, hit, death, fall). Same contract. */
    playActor(actor, { duration, done = null }) {
      finishClip();
      if (!(duration > 0)) {
        if (done) done();
        return;
      }
      clip = { start: now(), duration, reverse: false, done };
      player.actor = { ...actor, u: 0 };
      onChange();
      schedule();
    },
    /** Invalid-action cue. reducedMotion → a short static flash instead. */
    playShake({ reducedMotion = false } = {}) {
      shake = { start: now(), duration: reducedMotion ? FLASH_MS : SHAKE_MS, flash: reducedMotion };
      player.shake = { x: 0, flash: reducedMotion };
      onChange();
      schedule();
    },
    /**
     * Impact screen shake; `strength` scales IMPACT_PX. The caller only
     * asks when shake is on and motion isn't reduced (render/playback.js).
     */
    playImpact(strength = 1) {
      if (!(strength > 0)) return;
      impact = { start: now(), duration: IMPACT_MS, amplitude: IMPACT_PX * strength };
      player.impact = { x: 0, y: 0 };
      onChange();
      schedule();
    },
    /** Jump the running clip to its end (calls its done()). */
    finish() {
      finishClip();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      clip = null;
      shake = null;
      impact = null;
      player.foldAnim = null;
      player.actor = null;
      player.shake = null;
      player.impact = null;
    },
  };

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function finishClip() {
    if (!clip) return;
    const { done } = clip;
    clip = null;
    player.foldAnim = null;
    player.actor = null;
    onChange();
    if (done) done();
  }

  function tick() {
    rafId = 0;
    const t = now();
    if (clip) {
      const p = Math.min(1, (t - clip.start) / clip.duration);
      if (p >= 1) {
        finishClip();
      } else if (player.foldAnim) {
        const u = clip.reverse ? 1 - p : p;
        player.foldAnim.u = u;
        foldFrame(u, player.foldAnim.frame);
      } else if (player.actor) {
        player.actor.u = p;
      }
    }
    if (shake) {
      const p = (t - shake.start) / shake.duration;
      if (p >= 1) {
        shake = null;
        player.shake = null;
      } else {
        player.shake.x = shake.flash ? 0 : shakeOffset(p);
      }
    }
    if (impact) {
      const p = (t - impact.start) / impact.duration;
      if (p >= 1) {
        impact = null;
        player.impact = null;
      } else {
        impactOffset(p, impact.amplitude, player.impact);
      }
    }
    onChange();
    if (clip || shake || impact) schedule();
  }

  return player;
}
