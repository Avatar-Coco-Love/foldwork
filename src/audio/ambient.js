// The ambient loop as data (docs/04 Audio): slow pentatonic pads and gentle
// plucks, chosen by a seeded RNG one phrase at a time. No Web Audio here
// (audio/music.js plays the phrases), so it is unit tested.
//
// A mood is a scale and a pace. A phrase is one chord's worth of music:
//   { length, notes: [{ kind: 'pad' | 'pluck', f, t, d, g }] }
//     f     frequency in Hz
//     t, d  start offset and length in seconds (pads ring past `length`,
//           so phrases overlap and the loop never gaps)
//     g     peak gain, 0..1, before the music and master volume
//
// User's choices (8b): the loop plays from the title on and through every
// screen; the boss floor gets a darker variant; menus over a floor duck it.

import { createRng, nextFloat, nextInt, chance, pick } from '../core/rng.js';

/** Equal-tempered frequency `semis` semitones from `root` Hz. */
const step = (root, semis) => root * 2 ** (semis / 12);

export const AMBIENT_MOODS = Object.freeze({
  // C major pentatonic, slow: the floors, title and menus.
  calm: {
    root: 130.81, // C3
    scale: [0, 2, 4, 7, 9],
    chords: [[0, 2, 4], [0, 3, 5], [1, 3, 5], [2, 4, 6], [4, 6, 8]], // scale-step stacks
    beat: 1.6, // seconds
    beats: 4, // per phrase
    pluck: 0.4, // chance of a pluck on each beat
    offbeat: 0.12, // and on each half beat between
    padGain: 0.16,
    pluckGain: 0.2,
  },
  // The Japanese in scale on A (A B♭ D E F), lower and a little quicker:
  // the Great Crane. A pentatonic too, but a dark one with half steps (A
  // minor pentatonic would be the calm notes again).
  boss: {
    root: 110, // A2
    scale: [0, 1, 5, 7, 8],
    chords: [[0, 2, 4], [0, 2, 3], [2, 4, 6], [3, 5, 7]],
    beat: 1.25,
    beats: 4,
    pluck: 0.55,
    offbeat: 0.2,
    padGain: 0.17,
    pluckGain: 0.2,
  },
});

/** The mood for a floor: the boss floor's or the calm one. */
export function moodFor({ boss = false } = {}) {
  return boss ? 'boss' : 'calm';
}

/** The frequency of scale step `i` (past the top wraps up an octave). */
export function scaleFreq(mood, i, octave = 0) {
  const { root, scale } = mood;
  const n = scale.length;
  const oct = Math.floor(i / n) + octave;
  return step(root, scale[((i % n) + n) % n] + 12 * oct);
}

/**
 * An endless stream of phrases for one mood and seed. Same seed, same
 * music. `next()` returns the next phrase.
 */
export function createAmbient(moodId, seed) {
  const mood = AMBIENT_MOODS[moodId] || AMBIENT_MOODS.calm;
  const rng = createRng(`ambient:${moodId}:${seed}`);
  let chord = 0;
  let lastPluck = 5;
  return {
    mood: moodId,
    seed: String(seed),
    next() {
      // A new chord in most phrases (a change is always to a different one).
      if (chance(rng, 0.75)) chord = (chord + nextInt(rng, 1, mood.chords.length)) % mood.chords.length;
      const length = mood.beat * mood.beats;
      const notes = [];
      for (const s of mood.chords[chord]) {
        notes.push({ kind: 'pad', f: scaleFreq(mood, s), t: 0, d: length + 2.5, g: mood.padGain });
      }
      // Plucks: a slow wandering line an octave or two up, mostly by step.
      const top = mood.scale.length * 2;
      for (let half = 0; half < mood.beats * 2; half++) {
        if (!chance(rng, half % 2 ? mood.offbeat : mood.pluck)) continue;
        lastPluck = Math.max(0, Math.min(top - 1, lastPluck + pick(rng, [-2, -1, -1, 1, 1, 2])));
        notes.push({
          kind: 'pluck',
          f: scaleFreq(mood, lastPluck, 2),
          t: half * mood.beat / 2 + nextFloat(rng) * 0.04, // a little human
          d: 1.6,
          g: mood.pluckGain * (0.6 + 0.4 * nextFloat(rng)),
        });
      }
      return { length, notes };
    },
  };
}
