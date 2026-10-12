// Presentational effects: fold animation and board shake.
//
// Two layers, like preview.js:
//   - Pure model + timing (no DOM): buildFoldAnim, foldFrame, shakeOffset,
//     foldDurationMs. Unit tested.
//   - createFxPlayer: a tiny requestAnimationFrame driver that advances one
//     effect at a time and asks the renderer to redraw. The renderer paints
//     scene.foldAnim / scene.shake; it never times anything itself.
//
// Game logic never waits on this: the board is already folded when the
// animation starts. The animation only shows how it got there.

import { foldMapping } from '../core/fold.js';
import { cellIndex, cloneBoard } from '../core/board.js';

/** Base fold duration at speed 1 (spec: 350–450ms). */
export const FOLD_MS = 400;
/** Share of the fold spent rotating; the rest settles onto the stacks. */
export const ROTATE_SHARE = 0.75;
export const SHAKE_MS = 320;
/** Under reduced motion the invalid cue is a static flash, not a shake. */
export const FLASH_MS = 300;

/**
 * Fold animation duration in ms. `speed` is a multiplier (2 = twice as fast).
 * Reduced motion makes it instant (0).
 */
export function foldDurationMs({ speed = 1, reducedMotion = false } = {}) {
  if (reducedMotion || !(speed > 0)) return 0;
  return Math.round(FOLD_MS / speed);
}

/**
 * What a fold animation draws, built once per fold from the board *before*
 * the fold:
 *   fold    the crease
 *   base    the board minus the moving stacks (what stays put)
 *   sheets  [{ index, col, row, to, layers, baseHeight }] one per moving
 *           stack: `layers` lift off (col,row) and land on cell index `to`
 *           above `baseHeight` layers already there.
 * Clipped and empty source cells don't move, so they are not sheets.
 */
export function buildFoldAnim(boardBefore, fold) {
  const base = cloneBoard(boardBefore);
  const sheets = [];
  for (const m of foldMapping(boardBefore, fold)) {
    if (m.clipped) continue;
    const index = cellIndex(boardBefore, m.from.col, m.from.row);
    const layers = boardBefore.cells[index].layers;
    if (!layers.length) continue;
    const to = cellIndex(boardBefore, m.to.col, m.to.row);
    sheets.push({
      index,
      col: m.from.col,
      row: m.from.row,
      to,
      layers,
      baseHeight: boardBefore.cells[to].layers.length,
    });
    base.cells[index].layers = [];
  }
  return { fold, base, sheets };
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

// ---------------------------------------------------------------------------
// Player (DOM: requestAnimationFrame + performance.now)

/**
 * createFxPlayer({ invalidate, onChange })
 *   invalidate()        request a redraw (renderer.invalidate)
 *   onChange()          the scene's fx state changed (owner pushes it to the
 *                       renderer). Called every frame while something plays.
 *
 * State the renderer reads (via the owner's scene):
 *   player.foldAnim  { ...buildFoldAnim(), u } or null
 *   player.shake     { x, flash } or null
 */
export function createFxPlayer({ onChange, now = () => performance.now() }) {
  let fold = null; // { anim, start, duration, reverse, done }
  let shake = null; // { start, duration, flash }
  let rafId = 0;
  const frameOut = {};

  const player = {
    foldAnim: null,
    shake: null,
    get busy() {
      return !!fold;
    },
    /**
     * Play a fold. `reverse` plays it backwards (undo). Calls done() when it
     * finishes or is skipped; a duration of 0 finishes synchronously.
     */
    playFold(anim, { duration, reverse = false, done = null }) {
      finishFold();
      if (!(duration > 0)) {
        if (done) done();
        return;
      }
      fold = { anim, start: now(), duration, reverse, done };
      player.foldAnim = { ...anim, u: reverse ? 1 : 0, frame: foldFrame(reverse ? 1 : 0, frameOut) };
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
    /** Jump any running fold to its end (calls its done()). */
    finish() {
      finishFold();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      fold = null;
      shake = null;
      player.foldAnim = null;
      player.shake = null;
    },
  };

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function finishFold() {
    if (!fold) return;
    const { done } = fold;
    fold = null;
    player.foldAnim = null;
    onChange();
    if (done) done();
  }

  function tick() {
    rafId = 0;
    const t = now();
    if (fold) {
      const p = Math.min(1, (t - fold.start) / fold.duration);
      if (p >= 1) {
        finishFold();
      } else {
        const u = fold.reverse ? 1 - p : p;
        player.foldAnim.u = u;
        foldFrame(u, player.foldAnim.frame);
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
    onChange();
    if (fold || shake) schedule();
  }

  return player;
}
