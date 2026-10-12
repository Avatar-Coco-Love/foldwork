// Per-floor play record for telemetry. Pure; no DOM.
//
// The heart of it is the action log: with the floor's seed, template and
// variant, replaying the log (core/replay.js) rebuilds every turn exactly,
// so most future questions are answered offline instead of by adding new
// events. Each entry is [ms since floor start, action code, input source,
// refusal reason (only when refused)]. Refused actions are kept: they cost
// no turn but show where players got stuck.

import { encodeAction } from '../core/replay.js';

export function createFloorRecorder(now = () => Date.now()) {
  const start = now();
  const log = [];
  const counts = { turns: 0, folds: 0, undos: 0, refused: 0, previews: 0, foldAttempts: 0, hints: 0 };
  const inputs = {};
  let previewing = false;

  return {
    /** An action was dispatched. `src`: input source ('key', 'mouse', 'touch', 'pen', ...). */
    action(action, src, { ok, reason = null, tookTurn = false }) {
      const entry = [now() - start, encodeAction(action) || String(action && action.type), src || '?'];
      if (!ok) entry.push(reason || 'refused');
      log.push(entry);
      inputs[src || '?'] = (inputs[src || '?'] || 0) + 1;
      if (!ok) {
        counts.refused += 1;
        return;
      }
      if (tookTurn) counts.turns += 1;
      if (action.type === 'fold') counts.folds += 1;
      if (action.type === 'undo') counts.undos += 1;
    },
    /** The fold preview changed: a crease (object) or none (null). */
    preview(crease) {
      if (crease && !previewing) counts.previews += 1;
      previewing = !!crease;
    },
    /** A previewed fold was released / confirmed (valid or not). */
    foldAttempt() {
      counts.foldAttempts += 1;
    },
    hintShown() {
      counts.hints += 1;
    },
    elapsed() {
      return now() - start;
    },
    /** Plain data for the 'floor.end' event. */
    summary() {
      // Previews that ended without a release / Enter were cancelled:
      // the player looked at a fold and backed out.
      const previewsCancelled = Math.max(0, counts.previews - counts.foldAttempts);
      return { ms: now() - start, ...counts, previewsCancelled, inputs: { ...inputs }, log: log.map((e) => e.slice()) };
    },
  };
}
