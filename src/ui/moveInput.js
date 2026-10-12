// Move / wait input mapping. Pure (no DOM), so it is unit tested; ui/input.js
// feeds it key presses and taps.

import { MIN_DRAG_CELLS } from './foldGesture.js';

const KEY_DIRS = Object.freeze({
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
});

/** Direction for a movement key (arrows / WASD), or null. */
export function dirForKey(key) {
  return KEY_DIRS[key] || null;
}

/** A press-and-release that moved less than a fold drag is a tap. */
export function isTap(layout, start, end) {
  const d = Math.hypot(end.x - start.x, end.y - start.y) / layout.cellSize;
  return d < MIN_DRAG_CELLS;
}

/** Direction from `from` to an orthogonally adjacent `to`, else null. */
export function dirToward(from, to) {
  if (!from || !to) return null;
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  if (Math.abs(dc) + Math.abs(dr) !== 1) return null;
  return dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up';
}
