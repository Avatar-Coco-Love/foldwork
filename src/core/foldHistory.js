// Fold history: the player's folds still in effect on a floor, read from
// its action log (core/replay.js codes or action objects). Pure; no DOM.
//
// A fold is in effect until an undo takes it back, so the log is walked as
// a stack: a fold pushes, an undo pops. Each entry is { fold, n, at }:
//   n   its number on the paper (1 = the oldest fold still in effect)
//   at  its index in the log (playtest P4b rewinds to it)
// Only accepted actions belong in the log (the floor screen logs no
// refused ones), so every undo here took a fold back.

import { decodeAction, replay } from './replay.js';

export function foldsInEffect(actions) {
  const out = [];
  actions.forEach((a, at) => {
    const action = typeof a === 'string' ? decodeAction(a) : a;
    if (!action) return;
    if (action.type === 'fold') out.push({ fold: action.fold, n: out.length + 1, at });
    else if (action.type === 'undo') out.pop();
  });
  return out;
}

/**
 * Rewind to log index `at` (a fold's `at`: the floor as it was just before
 * that fold). Replays the first `at` actions from `start`, the floor as it
 * began. Returns { state, actions }, the log cut to match; null if `at` is
 * out of range or the replay no longer matches (an action refused).
 * Restart Floor plus the same actions gives the same state, so this adds
 * no power; it saves the replaying by hand.
 */
export function rewindTo(start, actions, at) {
  if (!Number.isInteger(at) || at < 0 || at > actions.length) return null;
  const kept = actions.slice(0, at);
  const { state, refused } = replay(start, kept);
  if (refused.length) return null;
  return { state, actions: kept };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Which part of the paper a fold moved, in words (the history list). By
// shape, never color: "left 2 columns", "lower-left corner".
const FOLD_TEXT = {
  v: (f, b) => (f.side === 'before'
    ? `Left ${plural(f.index, 'column')} folded over to the right`
    : `Right ${plural(b.w - f.index, 'column')} folded over to the left`),
  h: (f, b) => (f.side === 'before'
    ? `Top ${plural(f.index, 'row')} folded down`
    : `Bottom ${plural(b.h - f.index, 'row')} folded up`),
  d: (f) => (f.side === 'before'
    ? 'Lower-left corner folded up across a diagonal'
    : 'Upper-right corner folded down across a diagonal'),
  a: (f) => (f.side === 'before'
    ? 'Upper-left corner folded down across a diagonal'
    : 'Lower-right corner folded up across a diagonal'),
};

/** A short description of a fold on a board of `board`'s size. */
export function foldText(board, fold) {
  const text = FOLD_TEXT[fold.axis];
  return text ? text(fold, board) : 'A fold';
}
