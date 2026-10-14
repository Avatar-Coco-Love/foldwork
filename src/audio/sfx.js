// Web Audio player for the synthesized sounds in audio/sounds.js (docs/04
// Audio; hard rule 1: no audio files).
//
// Graph: voices → sfx bus ┐
//                music bus ┴→ master → destination
// The music bus carries the ambient loop (audio/music.js).
//
// Browsers only allow audio after a user gesture, so nothing is created
// until unlock() runs from one (main.js listens for the first pointer or
// key press). Before that, and whenever the effects are silent, play() does
// nothing. The context suspends while the page is hidden.

import { SOUNDS } from './sounds.js';
import { createRng, nextFloat } from '../core/rng.js';

const MAX_VOICES = 24; // voices playing at once; more are dropped
const REPEAT_S = 0.03; // the same sound again within this is dropped
const RAMP_S = 0.03; // volume changes glide this long (no clicks)

export function createAudio({ AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ac = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuffer = null;
  let levels = { master: 0, sfx: 0, music: 0 };
  let voices = 0;
  const lastAt = new Map();

  function build() {
    ac = new AudioContextCtor();
    master = ac.createGain();
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ac.destination);
    // One second of white noise, shared by every noise voice.
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    const rng = createRng('foldwork-noise');
    for (let i = 0; i < data.length; i++) data[i] = nextFloat(rng) * 2 - 1;
    applyLevels(true);
  }

  function applyLevels(now = false) {
    if (!ac) return;
    const t = ac.currentTime;
    for (const [node, value] of [[master, levels.master], [sfxBus, levels.sfx], [musicBus, levels.music]]) {
      node.gain.cancelScheduledValues(t);
      if (now) node.gain.setValueAtTime(value, t);
      else {
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.linearRampToValueAtTime(value, t + RAMP_S);
      }
    }
  }

  function resume() {
    if (ac && ac.state === 'suspended' && !(globalThis.document && document.hidden)) ac.resume().catch(() => {});
  }

  function voice(v, start) {
    const t0 = start + v.t;
    const end = t0 + v.d;
    const attack = Math.min(v.a ?? 0.005, v.d / 2);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(v.g, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(sfxBus);

    let src;
    let freqParam;
    if (v.kind === 'noise') {
      src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = v.filter;
      filter.Q.value = v.q ?? 1;
      freqParam = filter.frequency;
      src.connect(filter);
      filter.connect(env);
    } else {
      src = ac.createOscillator();
      src.type = v.wave;
      freqParam = src.frequency;
      src.connect(env);
    }
    freqParam.setValueAtTime(v.f0, t0);
    if (v.f1) freqParam.exponentialRampToValueAtTime(v.f1, end);
    voices++;
    src.onended = () => {
      voices--;
      env.disconnect();
    };
    src.start(t0);
    src.stop(end + 0.02);
  }

  const audio = {
    /** Call from a user gesture: creates or wakes the audio context. */
    unlock() {
      if (!AudioContextCtor) return;
      if (!ac) {
        try {
          build();
        } catch {
          ac = null; // no audio on this device; the game plays silent
          return;
        }
      }
      resume();
    },
    /** Bus gains from audio/sounds.js mixLevels. */
    setLevels(next) {
      levels = { ...next };
      applyLevels();
    },
    /** Play a sound by id (audio/sounds.js SOUNDS). */
    play(id) {
      const recipe = SOUNDS[id];
      if (!ac || ac.state !== 'running' || !recipe || !levels.master || !levels.sfx) return;
      const now = ac.currentTime;
      if (now - (lastAt.get(id) ?? -1) < REPEAT_S || voices + recipe.length > MAX_VOICES) return;
      lastAt.set(id, now);
      try {
        for (const v of recipe) voice(v, now);
      } catch {
        // A browser without some node type: this sound is skipped.
      }
    },
    /** Play several sounds at once (each id once). */
    playAll(ids) {
      for (const id of new Set(ids)) audio.play(id);
    },
    /**
     * The music bus and its context, for the ambient loop (audio/music.js),
     * and whether it can be heard; null before unlock.
     */
    music() {
      return ac ? { context: ac, out: musicBus, audible: levels.master > 0 && levels.music > 0 } : null;
    },
  };

  if (globalThis.document) {
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend().catch(() => {});
      else resume();
    });
  }
  return audio;
}
