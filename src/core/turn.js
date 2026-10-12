// Turn engine. Pure functions over plain-data floor state; no DOM access.
//
//   FloorState = {
//     board,            the board (creatures, the player included, live on layers)
//     turn,             completed turns
//     charges,          fold charges left this floor
//     maxCharges,
//     status,           'playing' | 'won' | 'lost'
//     outcome,          null, or { cause } once the floor ends ('fall', 'hp')
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
//   { type: 'move', dir }   dir in DIRS; walking into a creature bumps it
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
//   { type: 'fall', id, creature, at }           into a void or empty cell
//   { type: 'wait', id }
//   { type: 'fold', fold }
//   { type: 'unfold', fold }
//   { type: 'defeat', cause }

import { inBounds, getCell, topLayer, findCreature, cloneBoard } from './board.js';
import { tileDef } from './tiles.js';
import { validateFold, applyFold } from './fold.js';
import { createCreature } from './creatures.js';

export const PLAYER_ID = 'player';
export const DEFAULT_FOLD_CHARGES = 3;
export const BUMP_DAMAGE = 1;

export const DIRS = Object.freeze({
  up: Object.freeze({ dc: 0, dr: -1 }),
  down: Object.freeze({ dc: 0, dr: 1 }),
  left: Object.freeze({ dc: -1, dr: 0 }),
  right: Object.freeze({ dc: 1, dr: 0 }),
});

/**
 * Start a floor: places the player on the top layer of `player` ({col,row},
 * default: defaultStart). The input board is not mutated.
 */
export function createFloorState({ board, player = null, charges = DEFAULT_FOLD_CHARGES, hp } = {}) {
  const next = cloneBoard(board);
  const at = player || defaultStart(next);
  const layer = at && topLayer(next, at.col, at.row);
  if (!layer || !isSafeFooting(layer)) throw new Error('No safe start cell for the player');
  layer.creature = createCreature('player', { id: PLAYER_ID, hp });
  return { board: next, turn: 0, charges, maxCharges: charges, status: 'playing', outcome: null, undo: null };
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
      if (!layer || !isSafeFooting(layer) || layer.creature) continue;
      const d = Math.abs(col - goal.col) + Math.abs(row - goal.row);
      if (d < bestD) {
        best = { col, row };
        bestD = d;
      }
    }
  }
  return best;
}

function isSafeFooting(layer) {
  const def = tileDef(layer.tile);
  return def.walkable && !def.hole;
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
 * Hook for creature effects when a fold lands stacks (pin, strand, void drop:
 * Phase 2b). Receives the folded board and applyFold's landings.
 */
export function resolveFold(board /* , landings */) {
  return board;
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
  { id: 'enemies', run: () => {} }, // Phase 2b: fixed order, top-to-bottom, left-to-right
  { id: 'environment', run: () => {} }, // Phase 3a: plates, doors, hazards
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
  if (dest && !tileDef(dest.tile).walkable) return 'blocked';

  const src = getCell(s.board, me.col, me.row).layers[me.depth];
  src.creature = null;
  if (dest) dest.creature = me.creature;
  emit({ type: 'move', id: PLAYER_ID, from, to });
  // An empty cell (vacated by a fold) has no paper left: it plays as a void.
  if (!dest || tileDef(dest.tile).hole) fall(s, me.creature, to, emit);
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
  s.board = applyFold(s.board, action.fold, { resolve: resolveFold });
  s.charges -= 1;
  // The whole prior state, so undo also restores charges and anything the
  // enemy phase did after the fold.
  s.undo = { state: { ...before, undo: null }, fold: { ...action.fold } };
  emit({ type: 'fold', fold: { ...action.fold } });
  return null;
}

function runUndo(state, snapshots) {
  if (!state.undo) return { ok: false, state, events: [], reason: 'no-undo' };
  const restored = state.undo.state;
  const ev = { type: 'unfold', fold: { ...state.undo.fold } };
  if (snapshots) ev.board = cloneBoard(restored.board);
  return { ok: true, state: restored, events: [ev], reason: null };
}

function runOutcome(s, emit) {
  const me = findCreature(s.board, PLAYER_ID);
  if (!me || me.creature.hp <= 0) lose(s, me ? 'hp' : 'fall', emit);
}

// ---------------------------------------------------------------------------
// Shared rules (enemy AI reuses these in Phase 2b).

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

/** A creature drops into a void / empty cell at `at` and leaves the board. */
export function fall(s, creature, at, emit) {
  const layer = topLayer(s.board, at.col, at.row);
  if (layer && layer.creature === creature) layer.creature = null;
  emit({ type: 'fall', id: creature.id, creature, at: { ...at } });
  if (creature.id === PLAYER_ID) lose(s, 'fall', emit);
}

function lose(s, cause, emit) {
  if (s.status !== 'playing') return;
  s.status = 'lost';
  s.outcome = { cause };
  emit({ type: 'defeat', cause });
}

