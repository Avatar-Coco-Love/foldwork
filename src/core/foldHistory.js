// Fold history: the player's folds still in effect on a floor, read from
// its action log (core/replay.js codes or action objects). Pure; no DOM.
//
// A fold is in effect until an undo takes it back, so the log is walked as
// a stack: a fold pushes, an undo pops. Each entry is { fold, n, at }:
//   n   its number on the paper (1 = the oldest fold still in effect)
//   at  its index in the log (playtest P4b rewinds to it)
// Only accepted actions belong in the log (the floor screen logs no
// refused ones), so every undo here took a fold back.

import { decodeAction } from './replay.js';

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
