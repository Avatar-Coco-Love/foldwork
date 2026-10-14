// Run saves: the plain data that lets a run continue later (Menu mid-run,
// a closed tab, days away). Pure; no DOM. ui/saveStore.js keeps one save
// in localStorage.
//
//   Save = {
//     v,       SAVE_VERSION
//     logic,   LOGIC_VERSION the floor's actions were taken under
//     at,      when it was written (ms since epoch)
//     runId,   telemetry run id, so a resumed run reports as the same run
//     run,     RunState (core/run.js); run.offer set = resume on the offer
//     floor,   null, or the floor in progress:
//              { floor, templateId, variant, actions: [action codes],
//                hints }  hints = Hint button presses on this floor so
//                far (kept through Restart Floor)
//   }
//
// A floor is saved as how it was built plus its action log (core/replay.js),
// not as a board: the log stays small however long a floor runs, and the
// floor rebuilds from the run seed. Resuming replays the log; if the floor
// no longer matches (a template or rule change since it was saved) the
// floor starts over instead, with the run itself intact.

import { LOGIC_VERSION } from '../config.js';
import { RUN_VERSION } from './run.js';
import { replay } from './replay.js';
import { canTakeBack } from './turn.js';

export const SAVE_VERSION = 1;

/** A save of `run` (and the floor in progress, if any). */
export function createSave({ run, runId = null, floor = null, at = 0 }) {
  return {
    v: SAVE_VERSION,
    logic: LOGIC_VERSION,
    at,
    runId,
    run,
    floor: floor && {
      floor: floor.floor,
      templateId: floor.templateId,
      variant: floor.variant,
      actions: floor.actions.slice(),
      hints: floor.hints || 0,
    },
  };
}

/**
 * A save read back from storage, or null when it can't be continued:
 * another save or run version, a finished run, or broken data.
 */
export function parseSave(data) {
  if (!data || typeof data !== 'object' || data.v !== SAVE_VERSION) return null;
  const { run, floor } = data;
  if (!run || run.v !== RUN_VERSION || run.status !== 'playing') return null;
  if (typeof run.seed !== 'string' || !Number.isInteger(run.floor) || !Array.isArray(run.relics)) return null;
  if (floor != null) {
    if (typeof floor !== 'object' || !Array.isArray(floor.actions)) return null;
    if (!floor.actions.every((a) => typeof a === 'string')) return null;
  }
  return data;
}

/**
 * The floor state to continue from. `start` is the floor rebuilt from the
 * run seed; `info` is its description (core/floors.js generateFloor).
 * Replays the saved actions when they belong to this very floor under the
 * same rules and still leave it in play (or lost with a Rewind Charm use
 * to take that back: the floor screen offers it again); otherwise the
 * floor starts over.
 * Returns { state, actions, restarted }: actions is the log kept going.
 */
export function resumeFloor(save, start, info) {
  const saved = save && save.floor;
  if (!saved || !saved.actions.length) return { state: start, actions: [], restarted: false };
  const same = save.logic === LOGIC_VERSION
    && saved.floor === info.floor
    && saved.templateId === info.templateId
    && JSON.stringify(saved.variant) === JSON.stringify(info.variant);
  if (same) {
    const { state, refused } = replay(start, saved.actions);
    if (!refused.length && (state.status === 'playing' || canTakeBack(state))) return { state, actions: saved.actions.slice(), restarted: false };
  }
  return { state: start, actions: [], restarted: true };
}

/** Hint button presses saved for the floor `info` describes (0 if none). */
export function savedHints(save, info) {
  const saved = save && save.floor;
  if (!saved || saved.floor !== info.floor || !Number.isInteger(saved.hints) || saved.hints < 0) return 0;
  return saved.hints;
}

/** What the title screen says about a save. */
export function saveSummary(save) {
  const { run } = save;
  return {
    floor: run.floor,
    lastFloor: run.lastFloor,
    spirit: run.spirit,
    hp: run.hp,
    maxHp: run.maxHp,
    relics: run.relics.length,
    offer: !!run.offer,
    at: save.at,
  };
}
