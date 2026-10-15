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
//     is split into `phases` equal phases (phaseOf).
//   - Phase 2 on (def `boss.spawn`, 6b): every fold it carries out (not a
//     fizzle, not one that pins or hurts it) spawns a Scrap Mite on the
//     free footing of the landed strip closest to the player (Manhattan,
//     ties row-major), while fewer than `cap` of its spawns are alive.
//     A hit that takes it into a spawning phase also spawns one at once,
//     next to where it fled (the Spore Bloom's spot rule), so chained
//     drops can't skip the minions. Minions on a strip it folds ride
//     along like any creature.
//   - Phase 3 (def `boss.double`, 6b): it marks two creases at once. The
//     second is chosen on the board as the first will leave it (same
//     rules); both must move paper, and they fold in order on the next
//     beat. The player takes swat damage at most once per beat. The arena
//     shrinks from the strips alone (no fold-under rule).
//
// Creature field (a primitive, so cloneBoard and the solver's stateKey
// handle it): `mark` (the marked creases as a code, see marksCode, or null).

import { AXES, SIDES, validateFold, mirrorCell, applyFold, hingeKey } from './fold.js';
import { inBounds, isFooting, topLayer, findCreature } from './board.js';
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

/** Several creases as one mark code, in fold order: 'h3a+v2b'. */
export function marksCode(folds) {
  return folds.map(markCode).join('+');
}

/** The creases a mark code stands for, in fold order ([] for none or a bad code). */
export function markFolds(code) {
  if (typeof code !== 'string' || !code) return [];
  const out = [];
  for (const part of code.split('+')) {
    const fold = markFold(part);
    if (!fold) return [];
    out.push(fold);
  }
  return out;
}

/** Whether a creature is a boss (def `boss`; unknown kinds are not). */
export function isBoss(creature) {
  const def = creature && CREATURE_DEFS[creature.kind];
  return !!def && !!def.boss;
}

/**
 * Every marked crease on the board, for the telegraph: [{ id, at, fold, n,
 * of }] (at = the boss's cell; n = 1-based fold order among its `of`
 * marks). A pinned boss has no mark, so only top layers are read.
 */
export function bossMarks(board) {
  const out = [];
  for (let i = 0; i < board.cells.length; i++) {
    const layers = board.cells[i].layers;
    const c = layers.length ? layers[layers.length - 1].creature : null;
    const folds = c ? markFolds(c.mark) : [];
    const col = i % board.w;
    folds.forEach((fold, k) => out.push({ id: c.id, at: { col, row: (i - col) / board.w }, fold, n: k + 1, of: folds.length }));
  }
  return out;
}

/**
 * The boss's flaps still down, for the board's lift tags (the player can
 * fold each crease from the other side to lift it back, core/fold.js):
 * every crease some layer remembers (layer.hinge) that isn't one of the
 * player's `own` folds still in effect, in a fixed order. [] when no boss
 * is on the board.
 */
export function bossFlaps(board, own = []) {
  if (!bossIds(board).length) return [];
  const mine = new Set(own.map(hingeKey));
  const keys = new Set();
  for (const cell of board.cells) for (const l of cell.layers) if (l.hinge && !mine.has(l.hinge)) keys.add(l.hinge);
  return [...keys].sort().map(markFold).filter(Boolean);
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
 * The Crane's plan (ENEMY_AI 'crane'): fold its marked creases, or mark
 * new ones. Plan = { type: 'crease', folds } | { type: 'mark', folds } |
 * wait (no crease it can use).
 */
export function planCrane(board, me, { player }) {
  const marked = markFolds(me.creature.mark);
  if (marked.length) return { type: 'crease', folds: marked };
  const count = creaseCount(me.creature);
  const folds = chooseCreases(board, me, player, count, { needMoves: count > 1 });
  return folds.length ? { type: 'mark', folds } : WAIT;
}

/** How many creases a boss marks at once in its current phase (def `boss.double`). */
export function creaseCount(creature) {
  const { double } = creatureDef(creature.kind).boss;
  return double && phaseOf(creature) >= double ? 2 : 1;
}

/** Whether a boss spawns minions on its folds in its current phase (def `boss.spawn`). */
export function spawnsNow(creature) {
  const { spawn } = creatureDef(creature.kind).boss;
  return !!spawn && phaseOf(creature) >= spawn.phase;
}

/** Whether a hit from `hpBefore` took the boss into a new phase that spawns. */
export function enteredSpawnPhase(creature, hpBefore) {
  return spawnsNow(creature) && phaseOf(creature) > phaseOf({ ...creature, hp: hpBefore });
}

/**
 * Up to `count` creases, each chosen on the board the earlier ones leave
 * (applyFold alone: no pins or swats are simulated), with the Crane and
 * player where that board puts them. `needMoves`: each must move paper.
 */
export function chooseCreases(board, me, player, count = 1, { needMoves = false } = {}) {
  const out = [];
  let b = board;
  let at = me;
  let target = player;
  for (let k = 0; k < count; k++) {
    const fold = chooseCrease(b, at, target, { needMoves });
    if (!fold) break;
    out.push(fold);
    if (k + 1 === count) break;
    b = applyFold(b, fold);
    at = findCreature(b, me.creature.id);
    target = player && findCreature(b, player.creature.id);
    if (!at) break;
  }
  return out;
}

/**
 * The crease the Crane at `me` ({col, row}) marks against `player`
 * (findCreature()'s result, or null), by the rules above. Null when no
 * crease qualifies. `needMoves`: skip creases that move no paper.
 */
export function chooseCrease(board, me, player, { needMoves = false } = {}) {
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
          if (!m.count) continue;
          moved += 1;
          if (player && player.top && m.to.col === player.col && m.to.row === player.row) covers = 1;
          if (m.to.col === me.col && m.to.row === me.row) self = true;
        }
        if (self) continue; // it never folds paper onto itself
        if (needMoves && !moved) continue;
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

/**
 * Where a boss's fold puts its minion (def `boss.spawn`): the free footing
 * (no creature) among the fold's landing cells closest to `player` by
 * Manhattan distance, ties row-major. Null when none is free.
 */
export function minionSpot(board, landings, player) {
  let best = null;
  let bestKey = Infinity;
  for (const l of landings) {
    const top = topLayer(board, l.to.col, l.to.row);
    if (!isFooting(top) || top.creature) continue;
    const d = player ? Math.abs(l.to.col - player.col) + Math.abs(l.to.row - player.row) : 0;
    const key = d * board.cells.length + l.to.row * board.w + l.to.col;
    if (key < bestKey) {
      best = { col: l.to.col, row: l.to.row };
      bestKey = key;
    }
  }
  return best;
}

/** How many minions boss `id` has on the board (pinned ones too). */
export function minionCount(board, id) {
  const prefix = `${id}-m`;
  let n = 0;
  for (const cell of board.cells) for (const l of cell.layers) if (l.creature && l.creature.id.startsWith(prefix)) n += 1;
  return n;
}

function less(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
