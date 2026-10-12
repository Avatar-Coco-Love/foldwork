// Turn engine. Pure functions over plain-data floor state; no DOM access.
//
//   FloorState = {
//     board,            the board (creatures, the player included, live on layers)
//     turn,             completed turns
//     charges,          fold charges left this floor
//     maxCharges,
//     keys,             keys the player carries
//     status,           'playing' | 'won' | 'lost'
//     outcome,          null, or { cause } once the floor ends ('fall', 'hp',
//                       or 'exit' for a win)
//     undo,             null, or { state, fold }: the state before the latest
//                       fold, while it can still be undone for free
//   }
//
// States are values: act() works on a copy and never mutates its input. The
// undo snapshot shares the previous state, so nothing may mutate a state in
// place.
//
// act(state, action) runs one player action, then (if it took a turn) each
// phase in TURN_PHASES, and returns { ok, state, events, reason }. Logic is
// complete when act() returns; `events` only describe what happened, in
// order, for the renderer to play back (render/playback.js).
//
// Actions:
//   { type: 'move', dir }   dir in DIRS; walking into a creature bumps it,
//                           into a lock with a key opens it and steps in
//   { type: 'wait' }
//   { type: 'fold', fold }  a crease (core/fold.js); costs one charge
//   { type: 'undo' }        free unfold of the latest fold (refunds its
//                           charge, enemies don't act); only until the
//                           player's next action
//
// Events (all carry plain data; with { snapshots: true } each also carries
// `board`, a copy of the board right after it, for step-by-step playback):
//   { type: 'move', id, from, to }
//   { type: 'bump', id, target, from, to }       attacker stays put
//   { type: 'damage', id, amount, hp, at }
//   { type: 'death', id, creature, at }
//   { type: 'fall', id, creature, at }           into a void or empty cell,
//                                                or void-dropped by a fold
//   { type: 'pin', id, at }                      a fold covered it (docs/02)
//   { type: 'strand', id, at }                   a fold cut it off from the player
//   { type: 'wait', id }
//   { type: 'fold', fold }
//   { type: 'unfold', fold }
//   { type: 'pickup', id, item, at }             the player took an item
//   { type: 'unlock', at, by }                   by: 'walk' | 'fold'
//   { type: 'gate', at, open, link }             environment phase
//   { type: 'defeat', cause }
//   { type: 'victory', cause }                   cause: 'exit'

import { DIRS, inBounds, getCell, topLayer, findCreature, cloneBoard, isFooting } from './board.js';
import { tileDef, itemDef, ITEM } from './tiles.js';
import { validateFold, applyFold } from './fold.js';
import { createCreature, creatureDef } from './creatures.js';
import { actingEnemies, reachField, planEnemy, enemiesInReach } from './enemies.js';
import { syncGates, isLocked, unlockLayer, keyMeetsLock } from './environment.js';

export { DIRS };

export const PLAYER_ID = 'player';
export const DEFAULT_FOLD_CHARGES = 3;
export const BUMP_DAMAGE = 1;

/**
 * Start a floor: places the player on the top layer of `player` ({col,row},
 * default: defaultStart), then each of `enemies` ([{ kind, col, row, id? }],
 * ids default to `${kind}-${n}`). The input board is not mutated.
 */
export function createFloorState({ board, player = null, enemies = [], charges = DEFAULT_FOLD_CHARGES, hp } = {}) {
  const next = cloneBoard(board);
  const at = player || defaultStart(next);
  const layer = at && topLayer(next, at.col, at.row);
  if (!layer || !isFooting(layer) || layer.creature) throw new Error('No safe start cell for the player');
  layer.creature = createCreature('player', { id: PLAYER_ID, hp });
  enemies.forEach((e, n) => {
    const spot = topLayer(next, e.col, e.row);
    if (!spot || !isFooting(spot) || spot.creature) throw new Error(`No room for ${e.kind} at ${e.col},${e.row}`);
    spot.creature = createCreature(e.kind, { id: e.id || `${e.kind}-${n}` });
  });
  syncGates(next); // a creature may start on a plate
  return { board: next, turn: 0, charges, maxCharges: charges, keys: 0, status: 'playing', outcome: null, undo: null };
}

/**
 * Deterministic start cell: bottom-centre, else the nearest cell (by
 * distance, then row-major) whose top layer is walkable, solid and free.
 */
export function defaultStart(board) {
  const goal = { col: Math.floor(board.w / 2), row: board.h - 1 };
  let best = null;
  let bestD = Infinity;
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      const layer = topLayer(board, col, row);
      if (!isFooting(layer) || layer.creature) continue;
      const d = Math.abs(col - goal.col) + Math.abs(row - goal.row);
      if (d < bestD) {
        best = { col, row };
        bestD = d;
      }
    }
  }
  return best;
}

/** The player's creature data, or null once it has left the board. */
export function playerOf(state) {
  const p = findCreature(state.board, PLAYER_ID);
  return p ? p.creature : null;
}

export function canUndo(state) {
  return state.status === 'playing' && !!state.undo;
}

/**
 * Whether `fold` can be played now: the fold must be valid on the board and
 * a charge must be left. Returns validateFold()'s result with any extra
 * reasons ({ code: 'no-charges' }) folded in.
 */
export function foldCheck(state, fold) {
  const check = validateFold(state.board, fold);
  if (state.charges > 0) return check;
  return { ...check, ok: false, reasons: [{ code: 'no-charges' }, ...check.reasons] };
}

/**
 * What a landing stack does to the creature on the destination's top layer
 * (docs/02): 'drop' when the new top layer is a hole (void drop: it falls),
 * 'pin' otherwise (it is covered: can't act, can't be attacked), or null
 * when nobody stands there. Pure; used by resolveFold and the fold preview.
 */
export function coverEffect(board, from, to) {
  const dest = topLayer(board, to.col, to.row);
  const src = topLayer(board, from.col, from.row);
  if (!dest || !dest.creature || !src) return null;
  return tileDef(src.tile).hole ? 'drop' : 'pin';
}

/**
 * Creature effects of a fold that just landed (applyFold's `landings`, on
 * s.board): pin or void-drop whoever was covered. Strands are found by
 * runFold, which can compare reach before and after.
 */
export function resolveFold(s, landings, emit) {
  for (const l of landings) {
    const cell = getCell(s.board, l.to.col, l.to.row);
    const at = { col: l.to.col, row: l.to.row };
    const lower = l.baseHeight > 0 ? cell.layers[l.baseHeight - 1] : null;
    const meet = keyMeetsLock(lower, cell.layers[cell.layers.length - 1]);
    if (meet) {
      unlockLayer(meet.lock);
      meet.key.item = null;
      emit({ type: 'unlock', at, by: 'fold' });
    }
    const covered = lower ? lower.creature : null;
    if (!covered) continue;
    if (tileDef(cell.layers[cell.layers.length - 1].tile).hole) fall(s, covered, at, emit);
    else emit({ type: 'pin', id: covered.id, at });
  }
}

// ---------------------------------------------------------------------------
// Actions. Each run(state, action, emit) mutates the working copy and
// returns null on success or a rejection reason. A rejected action leaves
// the state unchanged and takes no turn.

const ACTIONS = {
  move: { takesTurn: true, run: runMove },
  wait: { takesTurn: true, run: runWait },
  fold: { takesTurn: true, run: runFold },
};

/**
 * Phases after a turn-taking player action, in order (docs/02 turn order).
 * Each run(state, emit) mutates the working copy. They stop once the floor
 * has ended.
 */
export const TURN_PHASES = [
  { id: 'enemies', run: runEnemies },
  { id: 'environment', run: (s, emit) => syncGates(s.board, emit) },
  { id: 'outcome', run: runOutcome },
];

export function act(state, action, { snapshots = false } = {}) {
  const reject = (reason) => ({ ok: false, state, events: [], reason });
  if (!action || typeof action !== 'object') return reject('bad-action');
  if (state.status !== 'playing') return reject('game-over');
  if (action.type === 'undo') return runUndo(state, snapshots);

  const handler = ACTIONS[action.type];
  if (!handler) return reject('bad-action');
  const next = { ...state, board: cloneBoard(state.board), undo: null };
  const events = [];
  const emit = (ev) => {
    if (snapshots) ev.board = cloneBoard(next.board);
    events.push(ev);
    return ev;
  };

  const reason = handler.run(next, action, emit, state);
  if (reason) return reject(reason);
  if (handler.takesTurn) {
    for (const phase of TURN_PHASES) {
      if (next.status !== 'playing') break;
      phase.run(next, emit);
    }
    next.turn += 1;
  }
  return { ok: true, state: next, events, reason: null };
}

function runMove(s, action, emit) {
  const dir = DIRS[action.dir];
  if (!dir) return 'bad-action';
  const me = findCreature(s.board, PLAYER_ID);
  if (!me) return 'no-player';
  if (!me.top) return 'pinned'; // covered by a fold: can't walk out from under
  const from = { col: me.col, row: me.row };
  const to = { col: me.col + dir.dc, row: me.row + dir.dr };
  if (!inBounds(s.board, to.col, to.row)) return 'edge';

  const dest = topLayer(s.board, to.col, to.row);
  if (dest && dest.creature) {
    emit({ type: 'bump', id: PLAYER_ID, target: dest.creature.id, from, to });
    damageAt(s, to, BUMP_DAMAGE, emit);
    return null;
  }
  if (isLocked(dest)) {
    if (s.keys <= 0) return 'locked';
    s.keys -= 1;
    unlockLayer(dest);
    emit({ type: 'unlock', at: { ...to }, by: 'walk' });
  }
  if (dest && !tileDef(dest.tile).walkable) return tileDef(dest.tile).powered ? 'gate-closed' : 'blocked';
  stepCreature(s, me, to, emit);
  if (s.status !== 'playing') return null; // fell
  if (dest.item && itemDef(dest.item).pickup) {
    emit({ type: 'pickup', id: PLAYER_ID, item: dest.item, at: { ...to } });
    if (dest.item === ITEM.KEY) s.keys += 1;
    dest.item = null;
  }
  // Reaching the exit ends the floor at once: enemies don't get a last turn.
  if (tileDef(dest.tile).exit) win(s, 'exit', emit);
  return null;
}

function runWait(s, action, emit) {
  if (!findCreature(s.board, PLAYER_ID)) return 'no-player';
  emit({ type: 'wait', id: PLAYER_ID });
  return null;
}

function runFold(s, action, emit, before) {
  const check = foldCheck(s, action.fold);
  if (!check.ok) return check.reasons[0]?.code === 'no-charges' ? 'no-charges' : 'invalid-fold';
  let landings = [];
  s.board = applyFold(s.board, action.fold, {
    resolve: (b, l) => {
      landings = l;
      return b;
    },
  });
  s.charges -= 1;
  // The whole prior state, so undo also restores charges and anything the
  // enemy phase did after the fold.
  s.undo = { state: { ...before, undo: null }, fold: { ...action.fold } };
  emit({ type: 'fold', fold: { ...action.fold } });
  resolveFold(s, landings, emit);

  // Strand: an enemy that could reach the player before the fold, is still
  // free to act, and now has no path.
  const reachBefore = enemiesInReach(before.board, PLAYER_ID);
  const reachAfter = enemiesInReach(s.board, PLAYER_ID);
  for (const id of reachBefore) {
    const e = reachAfter.has(id) ? null : findCreature(s.board, id);
    if (e && e.top) emit({ type: 'strand', id, at: { col: e.col, row: e.row } });
  }
  return null;
}

function runUndo(state, snapshots) {
  if (!state.undo) return { ok: false, state, events: [], reason: 'no-undo' };
  const restored = state.undo.state;
  const ev = { type: 'unfold', fold: { ...state.undo.fold } };
  if (snapshots) ev.board = cloneBoard(restored.board);
  return { ok: true, state: restored, events: [ev], reason: null };
}

// Enemies act once each, in actingEnemies() order (docs/02). The player
// doesn't move during this phase and creatures don't block the reach field,
// so one field serves the whole phase.
function runEnemies(s, emit) {
  const player = findCreature(s.board, PLAYER_ID);
  if (!player) return;
  const ctx = { field: reachField(s.board, player), player };
  for (const id of actingEnemies(s.board)) {
    if (s.status !== 'playing') break;
    const plan = planEnemy(s.board, id, ctx);
    if (plan.type === 'wait') continue;
    const me = findCreature(s.board, id);
    if (plan.type === 'bump') {
      const target = topLayer(s.board, plan.to.col, plan.to.row).creature;
      emit({ type: 'bump', id, target: target.id, from: { col: me.col, row: me.row }, to: { ...plan.to } });
      damageAt(s, plan.to, creatureDef(me.creature.kind).attack ?? BUMP_DAMAGE, emit);
    } else {
      stepCreature(s, me, plan.to, emit);
    }
  }
}

function runOutcome(s, emit) {
  const me = findCreature(s.board, PLAYER_ID);
  if (!me || me.creature.hp <= 0) lose(s, me ? 'hp' : 'fall', emit);
  else if (me.top && tileDef(topLayer(s.board, me.col, me.row).tile).exit) win(s, 'exit', emit);
}

// ---------------------------------------------------------------------------
// Shared rules, used by player actions and the enemy phase alike.

/**
 * Deal `amount` damage to the creature on the top layer at `at`. Creatures
 * at 0 HP are removed (the player losing all HP ends the floor).
 */
export function damageAt(s, at, amount, emit) {
  const layer = topLayer(s.board, at.col, at.row);
  const creature = layer && layer.creature;
  if (!creature) return;
  creature.hp = Math.max(0, creature.hp - amount);
  emit({ type: 'damage', id: creature.id, amount, hp: creature.hp, at: { ...at } });
  if (creature.hp > 0) return;
  layer.creature = null;
  emit({ type: 'death', id: creature.id, creature, at: { ...at } });
  if (creature.id === PLAYER_ID) lose(s, 'hp', emit);
}

/**
 * Move the creature found at `me` (findCreature()'s result) onto `to`'s top
 * layer. Walls are the caller's check. An empty cell (vacated by a fold) has
 * no paper left, so like a void it makes the creature fall.
 */
export function stepCreature(s, me, to, emit) {
  const from = { col: me.col, row: me.row };
  getCell(s.board, me.col, me.row).layers[me.depth].creature = null;
  const dest = topLayer(s.board, to.col, to.row);
  if (dest) dest.creature = me.creature;
  emit({ type: 'move', id: me.creature.id, from, to: { ...to } });
  if (!dest || tileDef(dest.tile).hole) fall(s, me.creature, to, emit);
}

/**
 * A creature drops through the cell at `at` (a void, an empty cell, or a
 * void sheet folded over it) and leaves the board.
 */
export function fall(s, creature, at, emit) {
  const cell = getCell(s.board, at.col, at.row);
  for (const layer of cell ? cell.layers : []) {
    if (layer.creature === creature) layer.creature = null;
  }
  emit({ type: 'fall', id: creature.id, creature, at: { ...at } });
  if (creature.id === PLAYER_ID) lose(s, 'fall', emit);
}

function win(s, cause, emit) {
  if (s.status !== 'playing') return;
  s.status = 'won';
  s.outcome = { cause };
  emit({ type: 'victory', cause });
}

function lose(s, cause, emit) {
  if (s.status !== 'playing') return;
  s.status = 'lost';
  s.outcome = { cause };
  emit({ type: 'defeat', cause });
}

