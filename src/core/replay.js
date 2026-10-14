// Compact action codes and replay. Pure; no DOM.
//
// Game logic is deterministic, so a floor is fully described by how it
// was built (seed, floor, template, variant) plus the list of actions the
// player took. That makes an action log the most useful thing to record:
// saves (Phase 7) and telemetry can store it, and any question asked later
// (where did players die, which fold did they try first) can be answered
// by replaying it, without the game having recorded that fact up front.
//
// Codes are short strings:
//   'u' 'd' 'l' 'r'   move up / down / left / right
//   'w'               wait
//   'z'               undo
//   'k'               take back the last turn (Rewind Charm)
//   'f<axis><index><side>'  fold, e.g. 'fh3a' = { axis: 'h', index: 3,
//                     side: 'after' } ('b' = before); a pocket fold adds
//                     'p<lane>', e.g. 'fv2bp4' = { ..., pocket: 4 }
//   'x<n>'            rewind (fold history, playtest P4b): the floor goes
//                     back to how it was after its first n accepted
//                     actions, e.g. 'x4' = { type: 'rewind', to: 4 }. Only
//                     telemetry logs carry it; a saved log is cut instead.
// New action types add a case to both functions.

import { act } from './turn.js';

const MOVES = { u: 'up', d: 'down', l: 'left', r: 'right' };
const MOVE_CODES = Object.fromEntries(Object.entries(MOVES).map(([c, dir]) => [dir, c]));
const SIDE_CODES = { before: 'b', after: 'a' };
const SIDES = { b: 'before', a: 'after' };

/** Action → code, or null for an action with no code. */
export function encodeAction(action) {
  if (!action) return null;
  switch (action.type) {
    case 'move': return MOVE_CODES[action.dir] || null;
    case 'wait': return 'w';
    case 'undo': return 'z';
    case 'takeback': return 'k';
    case 'fold': {
      const f = action.fold;
      if (!f || !SIDE_CODES[f.side]) return null;
      return `f${f.axis}${f.index}${SIDE_CODES[f.side]}${f.pocket != null ? `p${f.pocket}` : ''}`;
    }
    case 'rewind': return Number.isInteger(action.to) && action.to >= 0 ? `x${action.to}` : null;
    default: return null;
  }
}

/** Code → action, or null if the code is not recognised. */
export function decodeAction(code) {
  if (typeof code !== 'string') return null;
  if (MOVES[code]) return { type: 'move', dir: MOVES[code] };
  if (code === 'w') return { type: 'wait' };
  if (code === 'z') return { type: 'undo' };
  if (code === 'k') return { type: 'takeback' };
  const x = /^x(\d+)$/.exec(code);
  if (x) return { type: 'rewind', to: Number(x[1]) };
  const m = /^f([a-z])(\d+)([ab])(?:p(\d+))?$/.exec(code);
  if (!m) return null;
  const fold = { axis: m[1], index: Number(m[2]), side: SIDES[m[3]] };
  if (m[4] !== undefined) fold.pocket = Number(m[4]);
  return { type: 'fold', fold };
}

/**
 * Replay actions (objects or codes) from `start`. Refused actions are
 * skipped, as they were in play (they change nothing). A rewind replays
 * the accepted actions before it, up to its `to`. Returns
 * { state, refused }: refused lists the indexes turned down.
 */
export function replay(start, actions) {
  let state = start;
  const refused = [];
  const accepted = [];
  actions.forEach((a, i) => {
    const action = typeof a === 'string' ? decodeAction(a) : a;
    if (action && action.type === 'rewind') {
      if (!(action.to <= accepted.length) || state.status !== 'playing') {
        refused.push(i);
        return;
      }
      accepted.length = action.to;
      state = replay(start, accepted).state;
      return;
    }
    const result = act(state, action);
    if (result.ok) {
      state = result.state;
      accepted.push(action);
    } else refused.push(i);
  });
  return { state, refused };
}
