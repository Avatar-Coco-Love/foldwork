// The Great Crane (docs/03, floor 9). Pure, no DOM: like enemies.js this
// module only decides what the Crane does; core/turn.js applies it.
//
// Rules (docs/OPEN-QUESTIONS.md, settled before 6a):
//   - Every other enemy phase it marks a crease (`mark`); on the next one
//     it folds that crease, through the same applyFold + resolveFold as a
//     player fold. The player always gets one action between the two.
//   - The crease is aimed, not random: straight creases only, the Crane
//     always on the half that folds (it rides its own fold), never landing
//     on the player's cell. It prefers a crease whose landing covers the
//     player, then the one that lands it closest to the player, then the
//     one that moves the fewest cells, then the first in a fixed order
//     (axis 'v' before 'h', index ascending, 'before' before 'after').
//   - Once marked, the crease is locked (line and side). If the board has
//     changed, it folds whatever is on that side now, which can pin the
//     Crane or drop a void on it. A fold that's invalid when due fizzles.
//   - Pinned, it can't act and its mark is cleared.
//   - A fold landing on the player swats instead of pinning: 1 damage and
//     the player is moved to the nearest free footing (turn.js).
//   - A void drop deals `boss.drop` damage instead of killing it. Losing a
//     phase (every maxHp / phases HP) sends it back to its perch (the cell
//     it started on, or the nearest free footing to it), mark cleared.
//
// Creature fields (primitives, so cloneBoard and the solver's stateKey
// handle them): `mark` (the marked crease as a code, see markCode, or
// null), `homeCol` / `homeRow` (its perch; set by createFloorState).

import { AXES, SIDES, validateFold, mirrorCell } from './fold.js';
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
    for (let index = 1; index <= lines; index++) {
      for (const side of SIDES) {
        const fold = { axis, index, side };
        const dest = mirrorCell(board, fold, me.col, me.row);
        if (!dest || dest.clipped) continue; // it must ride the fold
        if (player && dest.col === player.col && dest.row === player.row) continue;
        const check = validateFold(board, fold);
        if (!check.ok) continue;
        let covers = 0;
        let moved = 0;
        for (const m of check.moves) {
          if (m.clipped || !board.cells[m.from.row * board.w + m.from.col].layers.length) continue;
          moved += 1;
          if (player && player.top && m.to.col === player.col && m.to.row === player.row) covers = 1;
        }
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

function less(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
