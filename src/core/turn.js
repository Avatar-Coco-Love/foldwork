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
//                       fold, while it can still be undone for free (that
//                       state's own undo chains back rules.undoDepth folds)
//     rules,            RULES values for this floor (relics and spirits set
//                       them, core/relics.js; plain data, constant per floor)
//     uses,             what's left of limited effects: { wards (hits to
//                       ignore this floor), freeLocks (locks that open
//                       without a key), landings (falls to survive; run-wide,
//                       carried by core/run.js), guard (the next hit this
//                       turn is negated) }
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
//   { type: 'shoot', id, target, from, to }      ranged hit (Paper Wasp)
//   { type: 'slide', id, from, to, path }        glided along a crease
//                                                (Creaseling; path: the
//                                                cells passed, `to` last)
//   { type: 'damage', id, amount, hp, at }
//   { type: 'death', id, creature, at }
//   { type: 'fall', id, creature, at }           into a void or empty cell,
//                                                or void-dropped by a fold
//   { type: 'pin', id, at }                      a fold covered it (docs/02)
//   { type: 'spawn', id, creature, at }          spawner `id` put `creature`
//                                                on `at` (Spore Bloom)
//   { type: 'drop', id, item, from, at }         a carrier that died or fell
//                                                on `from` left its item on `at`
//   { type: 'strand', id, at }                   a fold cut it off from the player
//   { type: 'wait', id }
//   { type: 'fold', fold }
//   { type: 'unfold', fold }
//   { type: 'pickup', id, item, at }             the player took an item
//   { type: 'unlock', at, by }                   by: 'walk' | 'fold' |
//                                                'master-key'
//   { type: 'gate', at, open, link }             environment phase
//   { type: 'defeat', cause }
//   { type: 'victory', cause }                   cause: 'exit'
//   { type: 'refund', amount, by }               a fold gave charges back
//                                                (rules.foldRefund; by: what
//                                                earned it: 'pin' | 'strand'
//                                                | 'fall')
//   { type: 'block', id, by, at }                a hit was negated (by: 'guard'
//                                                | 'ward' | 'wax')
//   { type: 'catch', id, at, from }              a fall into `at` was survived
//                                                (uses.landings); the
//                                                creature stays at `from`

import { DIRS, inBounds, getCell, topLayer, findCreature, cloneBoard, isFooting, cellIndex } from './board.js';
import { tileDef, itemDef, ITEM } from './tiles.js';
import { validateFold, applyFold, isDiagonal } from './fold.js';
import { createCreature, creatureDef, isHeavy } from './creatures.js';
import { actingEnemies, reachField, planEnemy, enemiesInReach } from './enemies.js';
import { syncGates, tickPlates, isLocked, unlockLayer, keyMeetsLock, spendKey } from './environment.js';

export { DIRS };

export const PLAYER_ID = 'player';
export const DEFAULT_FOLD_CHARGES = 3;
export const BUMP_DAMAGE = 1;

/**
 * Rule values the turn engine reads from FloorState.rules. These are the
 * hook points for relics and spirits (core/relics.js turns them into
 * values); a new rule-changing effect adds a field here, with a default
 * that keeps the base rules.
 *   undoDepth   consecutive folds the free undo can take back (docs/02: 1)
 *   foldRefund  charges a fold gives back when it pins, strands or drops an
 *               enemy (once per fold; never above maxCharges)
 *   wards       hits on the player ignored per floor (Laminate)
 *   foldGuard   after a fold, the next hit on the player that turn is
 *               negated (Folded Shield)
 *   freeLocks   locks per floor the player opens by walking in without a
 *               key (Master Key)
 *   stackBump   extra damage the player's bump deals to a creature on a
 *               stacked cell, 2+ layers (Paper Cut)
 *   plateHold   turns a plate stays pressed after its creature leaves
 *               (Heavy Stamp; core/environment.js)
 *   diagonal    diagonal creases can be played (Frog, Diagonal Crease;
 *               core/fold.js AXES)
 *   waxCoat     ranged hits on the player do nothing (Wax Coat)
 */
export const DEFAULT_RULES = Object.freeze({
  undoDepth: 1, foldRefund: 0, wards: 0, foldGuard: false, freeLocks: 0, stackBump: 0, plateHold: 0,
  diagonal: false, waxCoat: false,
});

/**
 * Start a floor: places the player on the top layer of `player` ({col,row},
 * default: defaultStart), then each of `enemies` ([{ kind, col, row, id?,
 * item? }], ids default to `${kind}-${n}`; `item` overrides what a carrier
 * holds, null for nothing). The input board is not mutated.
 * `hp` / `maxHp` carry the player's HP between floors (default: full);
 * `rules` overrides DEFAULT_RULES fields. `landings` is how many falls
 * the player survives (Soft Landing; run-wide, so the run passes it in).
 */
export function createFloorState({
  board, player = null, enemies = [], charges = DEFAULT_FOLD_CHARGES, hp, maxHp, rules = null, landings = 0,
} = {}) {
  const next = cloneBoard(board);
  const at = player || defaultStart(next);
  const layer = at && topLayer(next, at.col, at.row);
  if (!layer || !isFooting(layer) || layer.creature) throw new Error('No safe start cell for the player');
  layer.creature = createCreature('player', { id: PLAYER_ID, hp, maxHp });
  enemies.forEach((e, n) => {
    const spot = topLayer(next, e.col, e.row);
    if (!spot || !isFooting(spot) || spot.creature) throw new Error(`No room for ${e.kind} at ${e.col},${e.row}`);
    spot.creature = createCreature(e.kind, { id: e.id || `${e.kind}-${n}` });
    if (e.item !== undefined) {
      if (e.item) spot.creature.item = e.item;
      else delete spot.creature.item;
    }
  });
  syncGates(next); // a creature may start on a plate
  const floorRules = { ...DEFAULT_RULES, ...rules };
  return {
    board: next, turn: 0, charges, maxCharges: charges, keys: 0, status: 'playing', outcome: null, undo: null,
    rules: floorRules,
    uses: { wards: floorRules.wards, freeLocks: floorRules.freeLocks, landings, guard: false },
  };
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
 * Whether `fold` can be played now: the fold must be valid on the board, a
 * diagonal crease needs rules.diagonal, and a charge must be left. Returns
 * validateFold()'s result with any extra reasons ({ code: 'no-diagonal' },
 * { code: 'no-charges' }) folded in first.
 */
export function foldCheck(state, fold) {
  const check = validateFold(state.board, fold);
  const extra = [];
  if (isDiagonal(fold) && !(state.rules && state.rules.diagonal)) extra.push({ code: 'no-diagonal' });
  if (state.charges <= 0) extra.push({ code: 'no-charges' });
  if (!extra.length) return check;
  return { ...check, ok: false, reasons: [...extra, ...check.reasons] };
}

/**
 * What a landing stack does to the creature on the destination's top layer
 * (docs/02): 'drop' when the new top layer is a hole (void drop: it falls),
 * 'pin' otherwise (it is covered: can't act, can't be attacked), 'heavy'
 * when it can't be pinned (the fold is invalid: core/fold.js), or null
 * when nobody stands there. Pure; used by resolveFold and the fold preview.
 */
export function coverEffect(board, from, to) {
  const dest = topLayer(board, to.col, to.row);
  const src = topLayer(board, from.col, from.row);
  if (!dest || !dest.creature || !src) return null;
  if (tileDef(src.tile).hole) return 'drop';
  return isHeavy(dest.creature) ? 'heavy' : 'pin';
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
      spendKey(meet.key);
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
// the state unchanged and takes no turn. An optional check(state, action)
// rejects early, before the state is copied (the solver tries many folds
// that can't be played).

const ACTIONS = {
  move: { takesTurn: true, run: runMove },
  wait: { takesTurn: true, run: runWait },
  fold: { takesTurn: true, run: runFold, check: checkFold },
};

/**
 * Phases after a turn-taking player action, in order (docs/02 turn order).
 * Each run(state, emit, turn) mutates the working copy; `turn` = { action }
 * is the player's action this turn. They stop once the floor has ended.
 */
export const TURN_PHASES = [
  { id: 'enemies', run: runEnemies },
  { id: 'environment', run: runEnvironment },
  { id: 'outcome', run: runOutcome },
];

export function act(state, action, { snapshots = false } = {}) {
  const reject = (reason) => ({ ok: false, state, events: [], reason });
  if (!action || typeof action !== 'object') return reject('bad-action');
  if (state.status !== 'playing') return reject('game-over');
  if (action.type === 'undo') return runUndo(state, snapshots);

  const handler = ACTIONS[action.type];
  if (!handler) return reject('bad-action');
  const early = handler.check ? handler.check(state, action) : null;
  if (early) return reject(early);
  const next = { ...state, board: cloneBoard(state.board), undo: null, uses: { ...state.uses } };
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
      phase.run(next, emit, { action });
    }
    next.turn += 1;
    next.uses.guard = false; // Folded Shield lasts one turn cycle
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
    const stacked = getCell(s.board, to.col, to.row).layers.length >= 2;
    damageAt(s, to, BUMP_DAMAGE + (stacked ? s.rules.stackBump : 0), emit);
    return null;
  }
  if (isLocked(dest)) {
    let by = 'walk';
    if (s.keys > 0) s.keys -= 1;
    else if (s.uses.freeLocks > 0) {
      s.uses.freeLocks -= 1;
      by = 'master-key';
    } else return 'locked';
    unlockLayer(dest);
    emit({ type: 'unlock', at: { ...to }, by });
  }
  if (dest && !tileDef(dest.tile).walkable) return tileDef(dest.tile).powered ? 'gate-closed' : 'blocked';
  if (!stepCreature(s, me, to, emit) || s.status !== 'playing') return null; // fell, or caught
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

function checkFold(s, action) {
  const check = foldCheck(s, action.fold);
  if (check.ok) return null;
  const code = check.reasons[0]?.code;
  return code === 'no-charges' || code === 'no-diagonal' ? code : 'invalid-fold';
}

// checkFold already passed (act runs it first).
function runFold(s, action, outerEmit, before) {
  let landings = [];
  s.board = applyFold(s.board, action.fold, {
    resolve: (b, l) => {
      landings = l;
      return b;
    },
  });
  s.charges -= 1;
  if (s.rules.foldGuard) s.uses.guard = true;
  // The whole prior state, so undo also restores charges and anything the
  // enemy phase did after the fold. With undoDepth > 1 it keeps its own
  // undo, so consecutive folds unwind one at a time.
  const depth = (s.rules && s.rules.undoDepth) || 1;
  s.undo = { state: { ...before, undo: trimUndo(before.undo, depth - 1) }, fold: { ...action.fold } };
  const effects = [];
  const emit = (ev) => {
    effects.push(ev);
    return outerEmit(ev);
  };
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
  refundFold(s, effects, emit);
  return null;
}

/** An undo chain cut to at most `n` folds (n = 0: none). */
function trimUndo(undo, n) {
  if (!undo || n <= 0) return null;
  return { state: { ...undo.state, undo: trimUndo(undo.state.undo, n - 1) }, fold: undo.fold };
}

// rules.foldRefund (Recycled Crease): a fold that pins, strands or drops an
// enemy gives charges back, once per fold.
function refundFold(s, effects, emit) {
  const amount = Math.min((s.rules && s.rules.foldRefund) || 0, s.maxCharges - s.charges);
  if (amount <= 0) return;
  const hit = effects.find((ev) => (ev.type === 'pin' || ev.type === 'strand' || ev.type === 'fall')
    && ev.id !== PLAYER_ID);
  if (!hit) return;
  s.charges += amount;
  emit({ type: 'refund', amount, by: hit.type });
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
// so one field serves the whole phase. Slow enemies (def `pace`) sit out
// while their `rest` counts down. Fold-aware AI (Creaseling) gets the
// crease the player folded this turn. Spawners (def `spawn`) count down
// `sprout` while they have a path to the player and spawn when it reaches
// 1; with no free neighbour they stay ready. Spawns act from next turn.
function runEnemies(s, emit, { action } = {}) {
  const player = findCreature(s.board, PLAYER_ID);
  if (!player) return;
  const fold = action && action.type === 'fold' ? action.fold : null;
  const ctx = { field: reachField(s.board, player), player, fold };
  for (const id of actingEnemies(s.board)) {
    if (s.status !== 'playing') break;
    const me = findCreature(s.board, id);
    const def = creatureDef(me.creature.kind);
    if (def.pace > 1) {
      if (me.creature.rest > 0) {
        me.creature.rest -= 1;
        continue;
      }
      me.creature.rest = def.pace - 1;
    }
    if (def.spawn) {
      if (ctx.field[cellIndex(s.board, me.col, me.row)] <= 0) continue; // stranded: the count waits
      if (me.creature.sprout > 1) {
        me.creature.sprout -= 1;
        continue;
      }
    }
    const plan = planEnemy(s.board, id, ctx);
    if (plan.type === 'wait') continue;
    if (plan.type === 'bump' || plan.type === 'shoot') {
      const target = topLayer(s.board, plan.to.col, plan.to.row).creature;
      emit({ type: plan.type, id, target: target.id, from: { col: me.col, row: me.row }, to: { ...plan.to } });
      if (plan.type === 'shoot' && target.id === PLAYER_ID && s.rules.waxCoat) {
        emit({ type: 'block', id: target.id, by: 'wax', at: { ...plan.to } });
        continue;
      }
      damageAt(s, plan.to, def.attack ?? BUMP_DAMAGE, emit);
    } else if (plan.type === 'slide') {
      // slidePath only crosses free footing, so the slide never falls.
      getCell(s.board, me.col, me.row).layers[me.depth].creature = null;
      topLayer(s.board, plan.to.col, plan.to.row).creature = me.creature;
      emit({ type: 'slide', id, from: { col: me.col, row: me.row }, to: { ...plan.to }, path: plan.path.map((c) => ({ ...c })) });
    } else if (plan.type === 'spawn') {
      const spawn = createCreature(plan.kind, { id: `${id}-t${s.turn}` });
      topLayer(s.board, plan.to.col, plan.to.row).creature = spawn;
      me.creature.sprout = def.spawn.every;
      emit({ type: 'spawn', id, creature: { ...spawn }, at: { ...plan.to } });
    } else {
      stepCreature(s, me, plan.to, emit);
    }
  }
}

function runEnvironment(s, emit) {
  syncGates(s.board, emit);
  tickPlates(s.board, s.rules.plateHold);
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
export function damageAt(s, at, amount, emit, { blockable = true } = {}) {
  const layer = topLayer(s.board, at.col, at.row);
  const creature = layer && layer.creature;
  if (!creature) return;
  if (blockable && creature.id === PLAYER_ID && blockHit(s, creature, at, emit)) return;
  creature.hp = Math.max(0, creature.hp - amount);
  emit({ type: 'damage', id: creature.id, amount, hp: creature.hp, at: { ...at } });
  if (creature.hp > 0) return;
  layer.creature = null;
  emit({ type: 'death', id: creature.id, creature, at: { ...at } });
  if (creature.id === PLAYER_ID) lose(s, 'hp', emit);
  else dropItem(s, creature, at, emit);
}

/**
 * A carrier (def `carry`) that died or fell leaves its item on the nearest
 * free footing to `at` (docs/OPEN-QUESTIONS.md): `at` itself when its top
 * layer is free footing with no item, else the first such cell outward
 * (grid distance, ties in DIRS order). No room anywhere: the item is lost.
 */
function dropItem(s, creature, at, emit) {
  if (!creature.item) return;
  const spot = nearestFreeFooting(s.board, at);
  if (!spot) return;
  topLayer(s.board, spot.col, spot.row).item = creature.item;
  emit({ type: 'drop', id: creature.id, item: creature.item, from: { col: at.col, row: at.row }, at: spot });
}

/** Breadth-first over the grid from `at` (walls and holes don't block the search). */
export function nearestFreeFooting(board, at) {
  if (!inBounds(board, at.col, at.row)) return null;
  const seen = new Uint8Array(board.w * board.h);
  const queue = [{ col: at.col, row: at.row }];
  seen[cellIndex(board, at.col, at.row)] = 1;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const top = topLayer(board, c.col, c.row);
    if (isFooting(top) && !top.item && !top.creature) return c;
    for (const name in DIRS) {
      const col = c.col + DIRS[name].dc;
      const row = c.row + DIRS[name].dr;
      if (!inBounds(board, col, row) || seen[cellIndex(board, col, row)]) continue;
      seen[cellIndex(board, col, row)] = 1;
      queue.push({ col, row });
    }
  }
  return null;
}

// A hit on the player is negated by Folded Shield's guard (this turn only)
// first, then by Laminate's wards (per floor).
function blockHit(s, creature, at, emit) {
  const uses = s.uses;
  const by = uses.guard ? 'guard' : uses.wards > 0 ? 'ward' : null;
  if (!by) return false;
  if (by === 'guard') uses.guard = false;
  else uses.wards -= 1;
  emit({ type: 'block', id: creature.id, by, at: { ...at } });
  return true;
}

/**
 * Move the creature found at `me` (findCreature()'s result) onto `to`'s top
 * layer. Walls are the caller's check. An empty cell (vacated by a fold) has
 * no paper left, so like a void it makes the creature fall. Returns false
 * when the player didn't move: a Soft Landing caught the fall.
 */
export function stepCreature(s, me, to, emit) {
  const from = { col: me.col, row: me.row };
  const dest = topLayer(s.board, to.col, to.row);
  const hole = !dest || tileDef(dest.tile).hole;
  if (hole && me.creature.id === PLAYER_ID && s.uses && s.uses.landings > 0) {
    // Back to the tile it left, for 1 damage (a fall, not a hit: no block).
    s.uses.landings -= 1;
    emit({ type: 'catch', id: me.creature.id, at: { ...to }, from });
    damageAt(s, from, 1, emit, { blockable: false });
    return false;
  }
  getCell(s.board, me.col, me.row).layers[me.depth].creature = null;
  if (dest) dest.creature = me.creature;
  emit({ type: 'move', id: me.creature.id, from, to: { ...to } });
  if (hole) fall(s, me.creature, to, emit);
  return true;
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
  else dropItem(s, creature, at, emit);
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

