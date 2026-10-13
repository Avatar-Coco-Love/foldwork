// The Great Crane (docs/03, floor 9). Pure, no DOM: like enemies.js this
// module only decides what the Crane does; core/turn.js applies it.
//
// Rules (docs/OPEN-QUESTIONS.md, settled before 6a):
//   - Every other enemy phase it marks a crease (`mark`); on the next one
//     it folds that crease, through the same applyFold + resolveFold as a
//     player fold. The player always gets one action between the two.
//   - The crease is aimed, not random, and folds a strip: straight creases
//     only, and only the smaller side (at most half the board's rows or
//     columns), so the arena shrinks from the edges instead of collapsing
//     in one fold. The Crane either rides the strip (it must not be
//     clipped, and never lands on the player's cell) or folds it from
//     elsewhere, but never onto itself. It prefers a crease whose landing
//     covers the player, then the one that leaves it closest to the
//     player, then the one that moves the fewest cells, then the first in
//     a fixed order (axis 'v' before 'h', index ascending, 'before' before
//     'after').
//   - Once marked, the crease is locked (line and side). If the board has
//     changed, it folds whatever is on that side now, which can pin the
//     Crane or drop a void on it. A fold that's invalid when due fizzles.
//   - Pinned, it can't act and its mark is cleared.
//   - A fold landing on the player swats instead of pinning: 1 damage and
//     the player is moved to the nearest free footing (turn.js).
//   - A void drop deals `boss.drop` damage instead of killing it; a bump
//     deals none (`boss.bump` 0), so only folds hurt it. Every bump or
//     drop startles it: it flies to the free footing
//     farthest from the player (walking distance), mark cleared. Its HP
//     is split into `phases` equal phases (phaseOf; 6b changes its
//     behaviour per phase).
//
// Creature field (a primitive, so cloneBoard and the solver's stateKey
// handle it): `mark` (the marked crease as a code, see markCode, or null).

import { AXES, SIDES, validateFold, mirrorCell } from './fold.js';
import { inBounds, isFooting, topLayer } from './board.js';
import { creatureDef, CREATURE_DEFS } from './creatures.js';

const WAIT = Object.freeze({ type: 'wait' });

/** Straight axes only (docs/OPEN-QUESTIONS.md): the Crane never folds diagonally. */
export const CRANE_AXES = Object.freeze(['v', 'h']);

/** A crease as a short code: 'h3a' = { axis: 'h', index: 3, side: 'after' }. */
export function markCode(fold) {
  return `${fold.axis}${fold.index}${fold.side === 'before' ? 'b' : 'a'}`;
}

/** The crease a mark code stands for, or null. */
export function markFold(code) {
  const m = typeof code === 'string' ? /^([a-z])(\d+)([ab])$/.exec(code) : null;
  return m ? { axis: m[1], index: Number(m[2]), side: m[3] === 'b' ? 'before' : 'after' } : null;
}

/** Whether a creature is a boss (def `boss`; unknown kinds are not). */
export function isBoss(creature) {
  const def = creature && CREATURE_DEFS[creature.kind];
  return !!def && !!def.boss;
}

/**
 * Every marked crease on the board, for the telegraph: [{ id, at, fold }]
 * (at = the boss's cell). A pinned boss has no mark, so only top layers
 * are read.
 */
export function bossMarks(board) {
  const out = [];
  for (let i = 0; i < board.cells.length; i++) {
    const layers = board.cells[i].layers;
    const c = layers.length ? layers[layers.length - 1].creature : null;
    const fold = c && c.mark ? markFold(c.mark) : null;
    if (!fold) continue;
    const col = i % board.w;
    out.push({ id: c.id, at: { col, row: (i - col) / board.w }, fold });
  }
  return out;
}

/** Ids of every boss on the board, pinned or not. */
export function bossIds(board) {
  const out = [];
  for (const cell of board.cells) for (const l of cell.layers) if (isBoss(l.creature)) out.push(l.creature.id);
  return out;
}

/** Which phase a boss is in, 1..phases, from the HP it has lost. */
export function phaseOf(creature) {
  const { phases } = creatureDef(creature.kind).boss;
  const per = creature.maxHp / phases;
  return Math.min(phases, 1 + Math.floor((creature.maxHp - creature.hp) / per));
}

/**
 * The Crane's plan (ENEMY_AI 'crane'): fold its marked crease, or mark a
 * new one. Plan = { type: 'crease', fold } | { type: 'mark', fold } | wait
 * (no crease it can use).
 */
export function planCrane(board, me, { player }) {
  const marked = markFold(me.creature.mark);
  if (marked) return { type: 'crease', fold: marked };
  const fold = chooseCrease(board, me, player);
  return fold ? { type: 'mark', fold } : WAIT;
}

/**
 * The crease the Crane at `me` ({col, row}) marks against `player`
 * (findCreature()'s result, or null), by the rules above. Null when no
 * crease qualifies.
 */
export function chooseCrease(board, me, player) {
  let best = null;
  let bestScore = null;
  for (const axis of CRANE_AXES) {
    const lines = AXES[axis].lineCount(board);
    const size = axis === 'v' ? board.w : board.h;
    const half = Math.floor(size / 2);
    for (let index = 1; index <= lines; index++) {
      for (const side of SIDES) {
        const fold = { axis, index, side };
        if ((side === 'before' ? index : size - index) > half) continue; // strips only
        const ride = mirrorCell(board, fold, me.col, me.row);
        if (ride && ride.clipped) continue;
        const dest = ride || { col: me.col, row: me.row };
        if (player && dest.col === player.col && dest.row === player.row) continue;
        const check = validateFold(board, fold);
        if (!check.ok) continue;
        let covers = 0;
        let moved = 0;
        let self = false;
        for (const m of check.moves) {
          if (m.clipped || !board.cells[m.from.row * board.w + m.from.col].layers.length) continue;
          moved += 1;
          if (player && player.top && m.to.col === player.col && m.to.row === player.row) covers = 1;
          if (m.to.col === me.col && m.to.row === me.row) self = true;
        }
        if (self) continue; // it never folds paper onto itself
        const dist = player ? Math.abs(dest.col - player.col) + Math.abs(dest.row - player.row) : 0;
        const score = [1 - covers, dist, moved];
        if (!bestScore || less(score, bestScore)) {
          best = fold;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

/**
 * Where a startled boss flies (docs/OPEN-QUESTIONS.md): the free footing
 * (no creature) farthest from the player by walking distance (`field`,
 * enemies.js reachField), ties row-major. With no reachable cell, the
 * nearest free footing to `from` (`nearest`, turn.js nearestFreeFooting).
 */
export function fleeSpot(board, field, from, nearest) {
  let best = null;
  let bestD = 0;
  for (let i = 0; i < board.cells.length; i++) {
    if (!(field[i] > bestD)) continue;
    const col = i % board.w;
    const row = (i - col) / board.w;
    const top = topLayer(board, col, row);
    if (!isFooting(top) || top.creature) continue;
    best = { col, row };
    bestD = field[i];
  }
  return best || (inBounds(board, from.col, from.row) ? nearest(board, from) : null);
}

function less(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
