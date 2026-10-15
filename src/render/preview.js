// Fold preview model: what the board overlay shows for a candidate crease.
// Pure (no DOM). Built once per crease change, not per frame, so the draw
// pass only reads typed arrays.

import { validateFold, applyFold, AXES } from '../core/fold.js';
import { cellIndex, topLayer, findCreature, DIRS } from '../core/board.js';
import { coverEffect, PLAYER_ID, act } from '../core/turn.js';
import { keyMeetsLock } from '../core/environment.js';
import { bossMarks, bossIds, bossFlaps } from '../core/boss.js';

export const CELL = Object.freeze({
  NONE: 0,
  LEAVING: 1, // on the folding side; its stack (or lifted flap) moves away
  LANDING: 2, // receives a stack
  OVERFLOW: 3, // receives a stack and exceeds max stack
  CLIPPED: 4, // on the folding side but mirrors off-board; stays put
  HEAVY: 5, // receives a stack but holds a creature too heavy to pin
});

/** What a landing does to the creature it covers (core/turn.js coverEffect). */
export const EFFECT = Object.freeze({
  NONE: 0,
  PIN: 1, // covered: can't act, can't be attacked
  DROP: 2, // a void sheet lands on it: it falls
});

/**
 * @returns {{ fold, ok, reasons, heights: number[], state: Uint8Array,
 *   source: Int16Array, moving: Uint8Array, effect: Uint8Array,
 *   unlock: Uint8Array, unlocks: number, player: 'pin'|'drop'|null, lift,
 *   line, slides }}
 *   `source[dest]` is the cell index whose stack lands on `dest` (or -1).
 *   `moving[src]` is how many top layers leave cell `src` (all of them,
 *   or a lifted flap's: `lift`, core/fold.js foldMoves).
 *   `effect[dest]` is an EFFECT; `unlock[dest]` is 1 where the landing
 *   stacks a key and a lock together (the lock opens), `unlocks` counts
 *   them. `player` says what the fold does to the player. `line` is
 *   creaseSegment(). Returns null for a malformed crease.
 */
export function buildFoldPreview(board, fold) {
  const check = validateFold(board, fold);
  if (!check.perCellHeights) return null;
  const n = board.w * board.h;
  const state = new Uint8Array(n);
  const source = new Int16Array(n).fill(-1);
  const moving = new Uint8Array(n);
  const effect = new Uint8Array(n);
  const unlock = new Uint8Array(n);
  let unlocks = 0;
  let player = null;
  for (const m of check.moves) {
    const from = cellIndex(board, m.from.col, m.from.row);
    if (check.lift && !m.count) continue; // no flap here: the cell stays
    if (m.clipped) {
      state[from] = CELL.CLIPPED;
      continue;
    }
    state[from] = CELL.LEAVING;
    if (!m.count) continue; // nothing actually moves
    moving[from] = m.count;
    const to = cellIndex(board, m.to.col, m.to.row);
    state[to] = CELL.LANDING;
    source[to] = from;
    if (keyMeetsLock(topLayer(board, m.to.col, m.to.row), topLayer(board, m.from.col, m.from.row))) {
      unlock[to] = 1;
      unlocks += 1;
    }
    const fx = coverEffect(board, m.from, m.to);
    if (!fx) continue;
    if (fx === 'heavy') continue; // the fold is refused (reason 'heavy')
    effect[to] = fx === 'drop' ? EFFECT.DROP : EFFECT.PIN;
    if (topLayer(board, m.to.col, m.to.row).creature.id === PLAYER_ID) player = fx;
  }
  for (const r of check.reasons) {
    if (r.code === 'stack-overflow') state[cellIndex(board, r.col, r.row)] = CELL.OVERFLOW;
    else if (r.code === 'heavy') state[cellIndex(board, r.col, r.row)] = CELL.HEAVY;
  }
  return {
    fold, ok: check.ok, reasons: check.reasons, heights: check.perCellHeights, state, source, moving, effect, unlock, unlocks, player, lift: check.lift,
    line: creaseSegment(board, fold),
    slides: [], // filled by the caller from slidePreview(), which needs the floor state
  };
}

/**
 * Where fold-aware enemies (Creaselings) will slide if `fold` is played
 * from floor state `state`: [{ id, from, to, path }], from the slide
 * events of the real turn (core/turn.js), so the preview is exact even
 * when other enemies move first. Empty when the fold can't be played.
 */
export function slidePreview(state, fold) {
  const result = act(state, { type: 'fold', fold });
  if (!result.ok) return [];
  return result.events.filter((ev) => ev.type === 'slide')
    .map(({ id, from, to, path }) => ({ id, from, to, path }));
}

/** Enemy events Scout's Eye draws, and the mark each becomes. */
const SCOUT_KINDS = { move: 'move', bump: 'attack', shoot: 'attack', spawn: 'spawn', jaws: 'jaws' };

/**
 * Scout's Eye (rules.scout): what each enemy does in the turn after `fold`
 * from floor state `state`, from the real turn like slidePreview:
 * [{ kind: 'move' | 'attack' | 'spawn' | 'jaws', id, from, to }]. Slides
 * are left out (pv.slides already shows them); a jaws mark is only an
 * opening one. Empty when the fold can't be played or takes no turn (Echo
 * Fold).
 */
export function scoutPreview(state, fold) {
  const result = act(state, { type: 'fold', fold });
  if (!result.ok) return [];
  const out = [];
  for (const ev of result.events) {
    const kind = SCOUT_KINDS[ev.type];
    if (!kind || ev.id === PLAYER_ID) continue;
    if (kind === 'jaws') {
      if (ev.open) out.push({ kind, id: ev.id, from: { ...ev.at }, to: { ...ev.at } });
    } else if (kind === 'spawn') out.push({ kind, id: ev.id, from: { ...ev.at }, to: { ...ev.at } });
    else out.push({ kind, id: ev.id, from: { ...ev.from }, to: { ...ev.to } });
  }
  return out;
}

/**
 * The telegraph (docs/03 Great Crane): each boss's marked crease as it
 * would fold on this board, [{ id, at, fold, pv, fizzle, hits }]. `pv` is
 * buildFoldPreview() of the mark; `fizzle` is true when it's invalid now;
 * `hits` is true when it lands on the player (a swat). Built once per
 * board, not per frame.
 */
export function buildTelegraph(board) {
  const out = [];
  let b = board;
  for (const m of bossMarks(board)) {
    if (m.n === 1) b = board;
    const pv = buildFoldPreview(b, m.fold);
    if (!pv) continue;
    let hits = false;
    for (let i = 0; i < pv.state.length && pv.ok; i++) {
      if (pv.state[i] !== CELL.LANDING) continue;
      const top = b.cells[i].layers.at(-1);
      if (top && top.creature && top.creature.id === PLAYER_ID) hits = true;
    }
    out.push({ ...m, pv, fizzle: !pv.ok, hits });
    if (pv.ok && m.n < m.of) b = applyFold(b, m.fold);
  }
  return out;
}

/**
 * What a boss's marked fold will do if the player takes `action` now, from
 * the real turn (like slidePreview): 'dropped' (the action void-drops the
 * boss), 'pinned' (it pins the boss: no fold), 'swat' (its fold lands on
 * the player), 'fizzle' (invalid when due), 'miss' (it folds, missing the
 * player), or null (no boss fold due this turn, or the action is refused).
 * The name is the boss's def name.
 */
export function bossForecast(state, action) {
  const ids = bossIds(state.board);
  if (!ids.length) return null;
  const result = act(state, action);
  if (!result.ok) return null;
  const ofBoss = (type, key = 'id') => result.events.some((ev) => ev.type === type && ids.includes(ev[key]));
  if (ofBoss('fall')) return 'dropped';
  if (ofBoss('pin')) return 'pinned';
  if (ofBoss('swat', 'by')) return 'swat';
  if (ofBoss('fizzle')) return 'fizzle';
  if (ofBoss('fold', 'by')) return 'miss';
  return null;
}

/** The tag on a boss flap's crease: fold it from the other side to lift it. */
export const LIFT_TAG = '↺';

/**
 * Crease marks for the renderer (drawCreaseMarks), from
 * core/foldHistory.js foldsInEffect(): [{ n, line, slot }], where `slot`
 * counts earlier marks on the same line. On a boss floor the boss's flaps
 * still down follow, tagged LIFT_TAG instead of a number (core/boss.js
 * bossFlaps). Folds whose line misses the board are left out. Built once
 * per action, not per frame.
 */
export function buildCreaseMarks(board, folds) {
  const out = [];
  const flaps = bossFlaps(board, folds.map((f) => f.fold)).map((fold) => ({ fold, n: LIFT_TAG }));
  for (const f of [...folds, ...flaps]) {
    const line = creaseSegment(board, f.fold);
    if (!line) continue;
    const slot = out.filter((m) => m.axis === f.fold.axis && m.index === f.fold.index).length;
    out.push({ n: f.n, line, slot, axis: f.fold.axis, index: f.fold.index });
  }
  return out;
}

/**
 * Where a crease line crosses the board, in cell units (cell (c,r) spans
 * c..c+1): the segment { x0, y0, x1, y1 }, plus the unit normal { nx, ny }
 * pointing from the 'before' half to the 'after' half and `offset` (n·p on
 * the line, unit n). Works for every axis in AXES; null if the line misses
 * the board. A pocket fold's segment spans its one lane.
 */
export function creaseSegment(board, fold) {
  const geo = AXES[fold.axis];
  if (!geo) return null;
  const len = Math.hypot(geo.normal[0], geo.normal[1]);
  const nx = geo.normal[0] / len;
  const ny = geo.normal[1] / len;
  const offset = geo.offset(board, fold.index) / len;
  // Walk the line p0 + t·(-ny, nx) and clip t to the board rectangle.
  const px = nx * offset;
  const py = ny * offset;
  const dx = -ny;
  const dy = nx;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [p, d, max] of [[px, dx, board.w], [py, dy, board.h]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < 0 || p > max) return null;
      continue;
    }
    const a = (0 - p) / d;
    const b = (max - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t1 > t0)) return null;
  if (fold.pocket != null) {
    // The lane runs along the line: rows for 'v' (t = y), columns for 'h' (t = -x).
    if (fold.axis === 'v') [t0, t1] = [fold.pocket, fold.pocket + 1];
    else if (fold.axis === 'h') [t0, t1] = [-(fold.pocket + 1), -fold.pocket];
  }
  return { x0: px + dx * t0, y0: py + dy * t0, x1: px + dx * t1, y1: py + dy * t1, nx, ny, offset };
}

/**
 * The Hint button's next step, as a board mark (renderer drawHintStep):
 *   { kind: 'fold', pv, from, to }  pv = buildFoldPreview(); the arrow
 *                                   runs from a moving cell to where it
 *                                   lands: the player's own cell when it
 *                                   rides the fold, else the one nearest it
 *   { kind: 'move', from, to }      the player's step
 *   { kind: 'wait', at }            the player's cell
 * Null when the player isn't on the board or the step doesn't apply.
 */
export function buildHintMark(board, action) {
  const me = findCreature(board, PLAYER_ID);
  if (!me || !action) return null;
  const at = { col: me.col, row: me.row };
  if (action.type === 'wait') return { kind: 'wait', at };
  if (action.type === 'move') {
    const d = DIRS[action.dir];
    return d ? { kind: 'move', from: at, to: { col: at.col + d.dc, row: at.row + d.dr } } : null;
  }
  if (action.type !== 'fold') return null;
  const pv = buildFoldPreview(board, action.fold);
  if (!pv) return null;
  let best = null;
  let bestD = Infinity;
  for (let to = 0; to < pv.source.length; to++) {
    const from = pv.source[to];
    if (from < 0) continue;
    const fc = from % board.w;
    const fr = (from - fc) / board.w;
    const d = Math.abs(fc - at.col) + Math.abs(fr - at.row);
    if (d < bestD) {
      bestD = d;
      const tc = to % board.w;
      best = { from: { col: fc, row: fr }, to: { col: tc, row: (to - tc) / board.w } };
    }
  }
  return best ? { kind: 'fold', pv, ...best } : null;
}
