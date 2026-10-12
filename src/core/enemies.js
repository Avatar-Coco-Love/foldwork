// Enemy AI. Pure, no DOM: this module only decides what each enemy wants to
// do. turn.js applies the plan with the shared rules (stepCreature,
// damageAt), so AI code never mutates state and is easy to test.
//
//   Plan = { type: 'wait' }
//        | { type: 'move', to }   step onto `to`'s top layer
//        | { type: 'bump', to }   attack the player standing on `to`
//
// Pathing works on a reach field: BFS distance from the player over cells
// whose top layer is footing (walkable, not a hole). Creatures don't block
// the field, and climbing onto or off stacks is free, as for the player. An
// enemy with no path is stranded (docs/02) and waits. Enemies never step
// into a void or an empty cell on their own.
//
// New behaviors: add an entry to ENEMY_AI and name it in the creature's def
// (`ai` in core/creatures.js).

import { DIRS, inBounds, cellIndex, topLayer, findCreature, isFooting } from './board.js';
import { creatureDef, isEnemy } from './creatures.js';
import { shuffle } from './rng.js';

const WAIT = Object.freeze({ type: 'wait' });

export const ENEMY_AI = {
  chase: planChase,
};

/**
 * Ids of the enemies that act this turn, in docs/02 order: top-to-bottom,
 * left-to-right. Pinned enemies (under another layer) can't act.
 */
export function actingEnemies(board) {
  const ids = [];
  for (const cell of board.cells) {
    const top = cell.layers[cell.layers.length - 1];
    if (top && isEnemy(top.creature)) ids.push(top.creature.id);
  }
  return ids;
}

/**
 * BFS distance (in steps) from `target` ({col, row}) to every cell, through
 * cells whose top layer is footing. -1 = unreachable. The target cell is 0
 * even if it is not footing itself.
 */
export function reachField(board, target) {
  const field = new Int16Array(board.w * board.h).fill(-1);
  if (!target || !inBounds(board, target.col, target.row)) return field;
  const queue = [cellIndex(board, target.col, target.row)];
  field[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const col = i % board.w;
    const row = (i - col) / board.w;
    for (const name in DIRS) {
      const c = col + DIRS[name].dc;
      const r = row + DIRS[name].dr;
      if (!inBounds(board, c, r)) continue;
      const j = cellIndex(board, c, r);
      if (field[j] !== -1 || !isFooting(topLayer(board, c, r))) continue;
      field[j] = field[i] + 1;
      queue.push(j);
    }
  }
  return field;
}

/**
 * Ids of enemies on a top layer that have a path to the player (`playerId`).
 * A fold that removes an id from this set strands that enemy.
 */
export function enemiesInReach(board, playerId) {
  const player = findCreature(board, playerId);
  const reach = new Set();
  if (!player) return reach;
  const field = reachField(board, player);
  board.cells.forEach((cell, i) => {
    const top = cell.layers[cell.layers.length - 1];
    if (top && isEnemy(top.creature) && field[i] > 0) reach.add(top.creature.id);
  });
  return reach;
}

/**
 * What enemy `id` does this turn. ctx = { field, player }: the reach field
 * toward the player and findCreature()'s result for the player (or null).
 */
export function planEnemy(board, id, ctx) {
  const me = findCreature(board, id);
  if (!me || !me.top || !isEnemy(me.creature)) return WAIT;
  const ai = ENEMY_AI[creatureDef(me.creature.kind).ai];
  return ai ? ai(board, me, ctx) : WAIT;
}

// Scrap Mite (docs/03): one step along a shortest path to the player, or a
// bump when adjacent. Ties prefer closing the longer axis gap first, then
// the shorter one, so mites approach on a natural diagonal. A pinned player
// can't be attacked, and its cell is never stepped onto.
function planChase(board, me, { field, player }) {
  if (!player || !field) return WAIT;
  const d = field[cellIndex(board, me.col, me.row)];
  if (d <= 0) return WAIT; // stranded
  for (const name of stepOrder(player.col - me.col, player.row - me.row)) {
    const to = { col: me.col + DIRS[name].dc, row: me.row + DIRS[name].dr };
    if (!inBounds(board, to.col, to.row) || field[cellIndex(board, to.col, to.row)] !== d - 1) continue;
    if (to.col === player.col && to.row === player.row) {
      if (player.top) return { type: 'bump', to };
      continue;
    }
    if (topLayer(board, to.col, to.row).creature) continue; // occupied: try another shortest step
    return { type: 'move', to };
  }
  return WAIT;
}

function stepOrder(dc, dr) {
  const h = dc < 0 ? 'left' : 'right';
  const v = dr < 0 ? 'up' : 'down';
  const hBack = h === 'left' ? 'right' : 'left';
  const vBack = v === 'up' ? 'down' : 'up';
  return Math.abs(dc) >= Math.abs(dr) ? [h, v, vBack, hBack] : [v, h, hBack, vBack];
}

/**
 * Seeded enemy placement for boards without a template (dev floors until
 * the Phase 3b floor templates): `count` enemies of `kind` on free footing
 * cells at least `minDist` steps (Manhattan) from `avoid`. Returns
 * createFloorState()'s `enemies` list; fewer if the board runs out of room.
 */
export function scatterEnemies(board, rng, { kind, count, avoid, minDist = 3 }) {
  const spots = [];
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      const top = topLayer(board, col, row);
      if (!isFooting(top) || top.creature) continue;
      if (avoid && Math.abs(col - avoid.col) + Math.abs(row - avoid.row) < minDist) continue;
      spots.push({ col, row });
    }
  }
  return shuffle(rng, spots).slice(0, count).map((at) => ({ kind, ...at }));
}
