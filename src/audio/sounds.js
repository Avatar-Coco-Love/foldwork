// Sound effects as data (docs/04 Audio), plus the pure rules around them:
// which game event makes which sound, and how the Settings > Audio rows
// become bus gains. No Web Audio here (audio/sfx.js plays these), so it is
// unit tested.
//
// A sound is a list of voices, all started together (`t` offsets them):
//   { kind: 'tone',  wave, f0, f1?, t, d, a?, g }
//   { kind: 'noise', filter, f0, f1?, q?, t, d, a?, g }
//     wave    oscillator type: 'sine' | 'triangle' | 'square' | 'sawtooth'
//     filter  biquad type for the noise: 'lowpass' | 'highpass' | 'bandpass'
//     f0, f1  start and end frequency in Hz (f1: an exponential glide)
//     q       filter Q (noise only; default 1)
//     t, d    start offset and length in seconds
//     a       attack in seconds (default 0.005); the rest is the decay
//     g       peak gain, 0..1, before the effects and master volume

// Note frequencies (Hz) for the motifs.
const N = Object.freeze({
  A3: 220, C4: 261.63, E4: 329.63, G4: 392, A4: 440,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5,
});

const tone = (wave, f0, t, d, g, extra = {}) => ({ kind: 'tone', wave, f0, t, d, g, ...extra });
const noise = (filter, f0, t, d, g, extra = {}) => ({ kind: 'noise', filter, f0, t, d, g, ...extra });

export const SOUNDS = Object.freeze({
  // Paper swish across the crease, then two crinkles as it settles.
  fold: [
    noise('bandpass', 500, 0, 0.3, 0.5, { f1: 2600, q: 0.8, a: 0.08 }),
    noise('highpass', 3200, 0.22, 0.05, 0.22),
    noise('highpass', 2600, 0.28, 0.06, 0.18),
  ],
  // The swish backwards, crinkle first.
  unfold: [
    noise('highpass', 3000, 0, 0.04, 0.18),
    noise('bandpass', 2600, 0.02, 0.26, 0.42, { f1: 600, q: 0.8, a: 0.04 }),
  ],
  bump: [
    tone('sine', 170, 0, 0.13, 0.7, { f1: 70 }),
    noise('lowpass', 900, 0, 0.06, 0.3),
  ],
  hit: [
    tone('square', 230, 0, 0.14, 0.18, { f1: 110 }),
    noise('bandpass', 1300, 0, 0.1, 0.45, { q: 1.2 }),
  ],
  block: [
    tone('triangle', 880, 0, 0.08, 0.3),
    tone('triangle', 1320, 0.03, 0.12, 0.2),
  ],
  // A sheet pressed down on a creature.
  pin: [
    tone('triangle', 520, 0, 0.1, 0.35, { f1: 260 }),
    noise('lowpass', 1500, 0, 0.09, 0.3),
  ],
  door: [
    noise('lowpass', 600, 0, 0.12, 0.3),
    tone('triangle', 330, 0, 0.15, 0.3, { f1: 440 }),
    tone('triangle', 440, 0.08, 0.22, 0.28, { f1: 660 }),
  ],
  // A gate shutting.
  latch: [
    tone('square', 190, 0, 0.08, 0.15, { f1: 120 }),
    noise('lowpass', 700, 0, 0.07, 0.3),
  ],
  key: [
    tone('sine', N.E5 * 2, 0, 0.12, 0.25),
    tone('sine', N.A5 * 2, 0.07, 0.18, 0.25),
    tone('sine', N.E5 * 4, 0.14, 0.22, 0.1),
  ],
  fall: [
    tone('sine', 620, 0, 0.6, 0.35, { f1: 80, a: 0.02 }),
    noise('lowpass', 1400, 0, 0.5, 0.18, { f1: 200 }),
  ],
  // An enemy torn up.
  tear: [
    noise('bandpass', 1900, 0, 0.18, 0.5, { f1: 600, q: 1.5 }),
    tone('triangle', 300, 0, 0.1, 0.18, { f1: 150 }),
  ],
  // The Great Crane marks the crease it folds next turn.
  telegraph: [
    tone('sawtooth', 110, 0, 0.55, 0.1, { a: 0.15 }),
    tone('sine', 220, 0, 0.55, 0.22, { f1: 233, a: 0.15 }),
    noise('highpass', 2400, 0.1, 0.3, 0.08, { a: 0.1 }),
  ],
  relic: [
    tone('triangle', N.C5, 0, 0.2, 0.25),
    tone('triangle', N.E5, 0.07, 0.2, 0.25),
    tone('triangle', N.G5, 0.14, 0.2, 0.25),
    tone('triangle', N.C6, 0.21, 0.4, 0.22),
  ],
  victory: [
    tone('triangle', N.G4, 0, 0.16, 0.28),
    tone('triangle', N.C5, 0.12, 0.16, 0.28),
    tone('triangle', N.E5, 0.24, 0.16, 0.28),
    tone('triangle', N.G5, 0.36, 0.7, 0.3),
    tone('sine', N.C5, 0.36, 0.7, 0.18),
  ],
  defeat: [
    tone('sine', N.E4, 0, 0.35, 0.3),
    tone('sine', N.C4, 0.25, 0.35, 0.3),
    tone('sine', N.A3, 0.5, 0.9, 0.32),
    tone('triangle', N.A3 / 2, 0.5, 0.9, 0.12),
  ],
  // Menu buttons and settings rows.
  tap: [
    tone('sine', 900, 0, 0.05, 0.14, { f1: 700 }),
    noise('highpass', 4000, 0, 0.02, 0.06),
  ],
});

/** Seconds from a sound's start to its last voice's end. */
export function soundLength(id) {
  const voices = SOUNDS[id];
  return voices ? Math.max(...voices.map((v) => v.t + v.d)) : 0;
}

/**
 * The sound for one turn event (core/turn.js), or null. Moves, waits and
 * the like stay silent so a turn never turns into a clatter.
 */
export function soundForEvent(ev) {
  switch (ev.type) {
    case 'fold': return 'fold';
    case 'unfold':
    case 'sheet': return 'unfold';
    case 'bump':
    case 'swat': return 'bump';
    case 'damage': return 'hit';
    case 'block': return 'block';
    case 'pin': return 'pin';
    case 'unlock': return 'door';
    case 'gate': return ev.open ? 'door' : 'latch';
    case 'pickup': return 'key';
    case 'fall': return 'fall';
    case 'death': return 'tear';
    case 'mark': return 'telegraph';
    case 'victory': return 'victory';
    case 'defeat': return 'defeat';
    default: return null;
  }
}

// --- Volume (Settings > Audio) ---------------------------------------------

/** Volume rows step through these (user's choice, 8a). */
export const VOLUME_STEPS = Object.freeze([
  { id: '0', name: 'Off', level: 0 },
  { id: '25', name: '25%', level: 0.25 },
  { id: '50', name: '50%', level: 0.5 },
  { id: '75', name: '75%', level: 0.75 },
  { id: '100', name: '100%', level: 1 },
]);

export const MUTE_MODES = Object.freeze([
  { id: 'off', name: 'Off' },
  { id: 'on', name: 'On' },
]);

const stepLevel = (id) => (VOLUME_STEPS.find((o) => o.id === id) || VOLUME_STEPS[0]).level;

/**
 * Bus gains for the settings: { master, sfx, music }, each 0..1. The
 * steps are squared, so each one sounds about evenly louder than the last.
 * Mute zeroes the master.
 */
export function mixLevels(settings) {
  const curve = (id) => stepLevel(id) ** 2;
  return {
    master: settings.mute === 'on' ? 0 : curve(settings.masterVolume),
    sfx: curve(settings.sfxVolume),
    music: curve(settings.musicVolume),
  };
}
