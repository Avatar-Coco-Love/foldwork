// Web Audio player for the ambient loop (audio/ambient.js; docs/04 Audio).
//
// Graph: pad and pluck voices → soft lowpass → duck → music bus (audio/sfx.js)
//
// A timer looks a second ahead and schedules whole phrases on the audio
// clock, so timer jitter never shows. While the music or master volume is
// off, phrases are skipped (no nodes made) but the clock keeps moving.
// While the context is suspended (page hidden) its clock stops, and so
// does the music.

import { createAmbient } from './ambient.js';

const TICK_MS = 500;
const LOOKAHEAD_S = 1.2;
const FADE_IN_S = 3; // the loop fades in when it starts
const DUCK_LEVEL = 0.45; // menus over a floor (user's choice, 8b)
const DUCK_S = 0.25; // time constant of a duck or unduck
const PAD_ATTACK_S = 1.8;
const PAD_RELEASE_S = 2.5;
const MAX_VOICES = 24;

export function createMusic(audio, { setTimer = setInterval } = {}) {
  let ac = null;
  let duck = null;
  let timer = null;
  let ambient = createAmbient('calm', 'title');
  let pending = null; // the mood and seed the next phrase switches to
  let nextAt = 0;
  let ducked = false;
  let voices = 0;

  function attach() {
    const bus = audio.music();
    if (!bus) return false;
    ac = bus.context;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.5;
    duck = ac.createGain();
    duck.gain.setValueAtTime(0, ac.currentTime);
    duck.gain.linearRampToValueAtTime(ducked ? DUCK_LEVEL : 1, ac.currentTime + FADE_IN_S);
    filter.connect(duck);
    duck.connect(bus.out);
    duck.input = filter;
    nextAt = ac.currentTime + 0.2;
    timer = setTimer(tick, TICK_MS);
    return true;
  }

  function tick() {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (nextAt < now) nextAt = now + 0.05; // fell behind (a throttled timer)
    while (nextAt < now + LOOKAHEAD_S) {
      if (pending) {
        ambient = createAmbient(pending.mood, pending.seed);
        pending = null;
      }
      const phrase = ambient.next();
      if (audio.music().audible) {
        try {
          for (const n of phrase.notes) if (voices < MAX_VOICES) note(n, nextAt);
        } catch {
          // A browser without some node type: the loop stays quiet.
        }
      }
      nextAt += phrase.length;
    }
  }

  function note(n, start) {
    const t0 = start + n.t;
    const end = t0 + n.d;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t0);
    const oscs = [];
    if (n.kind === 'pad') {
      // Two gently detuned oscillators, a slow swell and a long release.
      env.gain.linearRampToValueAtTime(n.g, t0 + PAD_ATTACK_S);
      env.gain.setValueAtTime(n.g, end - PAD_RELEASE_S);
      env.gain.linearRampToValueAtTime(0, end);
      for (const [wave, cents, g] of [['sine', -4, 1], ['triangle', 4, 0.5]]) {
        const o = ac.createOscillator();
        o.type = wave;
        o.frequency.value = n.f;
        o.detune.value = cents;
        const mix = ac.createGain();
        mix.gain.value = g;
        o.connect(mix);
        mix.connect(env);
        oscs.push(o);
      }
    } else {
      env.gain.linearRampToValueAtTime(n.g, t0 + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = n.f;
      o.connect(env);
      oscs.push(o);
    }
    env.connect(duck.input);
    voices++;
    oscs[0].onended = () => {
      voices--;
      env.disconnect();
    };
    for (const o of oscs) {
      o.start(t0);
      o.stop(end + 0.05);
    }
  }

  return {
    /** Call after audio.unlock() from a gesture: starts the loop once. */
    start() {
      if (!ac) attach();
    },
    /**
     * The mood ('calm' | 'boss', audio/ambient.js) and seed the music
     * follows from its next phrase. The same pair again changes nothing.
     */
    setMood(mood, seed = 'title') {
      const want = pending || { mood: ambient.mood, seed: ambient.seed };
      if (want.mood === mood && want.seed === String(seed)) return;
      pending = { mood, seed: String(seed) };
      // A new mood starts soon, not after the rest of a long phrase.
      if (mood !== ambient.mood && ac) nextAt = Math.min(nextAt, ac.currentTime + 0.3);
    },
    /** Lower the loop while a menu is over the floor (true), or bring it back. */
    duck(on) {
      if (ducked === !!on) return;
      ducked = !!on;
      if (!duck) return;
      const t = ac.currentTime;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(duck.gain.value, t);
      duck.gain.setTargetAtTime(ducked ? DUCK_LEVEL : 1, t, DUCK_S);
    },
    /** For tests: whether the loop has started. */
    get started() {
      return !!timer;
    },
  };
}
