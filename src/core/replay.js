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
//   'f<axis><index><side>'  fold, e.g. 'fh3a' = { axis: 'h', index: 3,
//                     side: 'after' } ('b' = before)
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
    case 'fold': {
      const f = action.fold;
      return f && SIDE_CODES[f.side] ? `f${f.axis}${f.index}${SIDE_CODES[f.side]}` : null;
    }
    default: return null;
  }
}

/** Code → action, or null if the code is not recognised. */
export function decodeAction(code) {
  if (typeof code !== 'string') return null;
  if (MOVES[code]) return { type: 'move', dir: MOVES[code] };
  if (code === 'w') return { type: 'wait' };
  if (code === 'z') return { type: 'undo' };
  const m = /^f([a-z])(\d+)([ab])$/.exec(code);
  return m ? { type: 'fold', fold: { axis: m[1], index: Number(m[2]), side: SIDES[m[3]] } } : null;
}

/**
 * Replay actions (objects or codes) from `start`. Refused actions are
 * skipped, as they were in play (they change nothing). Returns
 * { state, refused }: refused lists the indexes act() turned down.
 */
export function replay(start, actions) {
  let state = start;
  const refused = [];
  actions.forEach((a, i) => {
    const action = typeof a === 'string' ? decodeAction(a) : a;
    const result = act(state, action);
    if (result.ok) state = result.state;
    else refused.push(i);
  });
  return { state, refused };
}
