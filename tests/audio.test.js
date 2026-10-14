import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  SOUNDS, soundForEvent, soundLength, mixLevels, VOLUME_STEPS,
} from '../src/audio/sounds.js';
import {
  AMBIENT_MOODS, createAmbient, moodFor, scaleFreq,
} from '../src/audio/ambient.js';
import { createMusic } from '../src/audio/music.js';
import { buildClips, createPlayback } from '../src/render/playback.js';
import { createBoard, topLayer } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createFloorState, act } from '../src/core/turn.js';
import {
  normalizeSettings, DEFAULT_SETTINGS, SETTINGS_GROUPS, choicesFor,
} from '../src/ui/settings.js';

const normal = { speed: 1, reducedMotion: false };
const run = (s, action) => act(s, action, { snapshots: true });

test('every sound is well-formed: short, quiet enough, valid voices', () => {
  const waves = ['sine', 'triangle', 'square', 'sawtooth'];
  const filters = ['lowpass', 'highpass', 'bandpass'];
  for (const [id, voices] of Object.entries(SOUNDS)) {
    assert.ok(voices.length >= 1, id);
    assert.ok(soundLength(id) <= 1.5, `${id} is short`);
    for (const v of voices) {
      assert.ok(v.kind === 'tone' ? waves.includes(v.wave) : v.kind === 'noise' && filters.includes(v.filter), id);
      assert.ok(v.f0 > 20 && v.f0 < 20000 && (v.f1 == null || (v.f1 > 20 && v.f1 < 20000)), `${id} frequency`);
      assert.ok(v.t >= 0 && v.d > 0 && v.g > 0 && v.g <= 0.8, `${id} timing and gain`);
    }
  }
});

test('the docs/04 list has a sound, and every event sound exists', () => {
  for (const id of ['fold', 'bump', 'pin', 'door', 'key', 'fall', 'relic', 'telegraph', 'victory', 'defeat', 'tap']) {
    assert.ok(SOUNDS[id], id);
  }
  const events = ['fold', 'unfold', 'bump', 'swat', 'damage', 'block', 'pin', 'unlock', 'pickup', 'fall', 'death', 'mark', 'victory', 'defeat'];
  for (const type of events) assert.ok(SOUNDS[soundForEvent({ type })], type);
  assert.equal(soundForEvent({ type: 'gate', open: true }), 'door');
  assert.equal(soundForEvent({ type: 'gate', open: false }), 'latch');
  for (const type of ['move', 'wait', 'slide', 'strand', 'refund']) assert.equal(soundForEvent({ type }), null);
});

test('audio settings: defaults on, steps, mute, bad values reset', () => {
  assert.equal(DEFAULT_SETTINGS.mute, 'off');
  assert.deepEqual(mixLevels(DEFAULT_SETTINGS), { master: 0.5625, sfx: 0.5625, music: 0.25 });
  assert.equal(mixLevels({ ...DEFAULT_SETTINGS, mute: 'on' }).master, 0);
  assert.equal(mixLevels({ ...DEFAULT_SETTINGS, sfxVolume: '0' }).sfx, 0);
  assert.equal(mixLevels({ ...DEFAULT_SETTINGS, masterVolume: '100' }).master, 1);
  const s = normalizeSettings({ masterVolume: '25', musicVolume: 'loud', mute: 'on' });
  assert.deepEqual([s.masterVolume, s.musicVolume, s.mute], ['25', '50', 'on']);
  assert.equal(choicesFor('sfxVolume'), VOLUME_STEPS);
  const audio = SETTINGS_GROUPS.find((g) => g.id === 'audio');
  assert.deepEqual(audio.rows.filter((r) => r.key).map((r) => r.key), ['masterVolume', 'musicVolume', 'sfxVolume', 'mute']);
});

test('clip sounds: a bump and kill sound with their clips', () => {
  const b = createBoard(5, 5);
  topLayer(b, 2, 1).creature = { id: 'm1', kind: 'dummy', hp: 1, maxHp: 1 };
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const end = [];
  const clips = buildClips(s.board, run(s, { type: 'move', dir: 'up' }).events, normal, end);
  assert.deepEqual(clips.map((c) => c.sfx), [['bump'], ['hit'], ['tear']]);
  assert.deepEqual(end, []);
});

test('clip sounds: a fold sounds at its start; a later pin waits for the next clip or the end', () => {
  const b = createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({
    board: b, player: { col: 4, row: 4 },
    enemies: [{ kind: 'mite', col: 1, row: 2, id: 'drop' }, { kind: 'mite', col: 1, row: 0, id: 'pin' }],
  });
  const r = run(s, { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } });
  const end = [];
  const clips = buildClips(s.board, r.events, normal, end);
  assert.deepEqual(clips[0].sfx, ['fold']);
  const all = [...clips.flatMap((c) => c.sfx || []), ...end];
  assert.ok(all.includes('pin') && all.includes('fall'));
});

test('clip sounds: under reduced motion every sound plays at the end', () => {
  const b = createBoard(5, 5, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  const s = createFloorState({ board: b, player: { col: 2, row: 2 } });
  const end = [];
  const clips = buildClips(s.board, run(s, { type: 'move', dir: 'up' }).events, { speed: 1, reducedMotion: true }, end);
  assert.equal(clips.length, 0);
  assert.deepEqual(end, ['fall', 'defeat']);
});

test('playback plays clip sounds as clips start and end sounds last; skipped clips stay silent', () => {
  const log = [];
  let pending = null;
  const fx = {
    playActor(a, { done }) { log.push(a.kind); pending = done; },
    playFold(f, { done }) { log.push('fold'); pending = done; },
    finish() { const d = pending; pending = null; if (d) d(); },
  };
  const pb = createPlayback({ fx, show: () => {}, sound: (ids) => log.push(`sfx:${ids.join(',')}`) });
  pb.play([
    { board: 'a', actor: { kind: 'bump' }, duration: 1, sfx: ['bump'] },
    { board: 'b', actor: { kind: 'hit' }, duration: 1, sfx: ['hit'] },
  ], 'end', null, ['victory']);
  assert.deepEqual(log, ['sfx:bump', 'bump']);
  pb.finish();
  assert.deepEqual(log, ['sfx:bump', 'bump', 'sfx:victory']);
});

// --- Ambient loop (8b) -------------------------------------------------------

test('ambient: same seed same music; another seed or mood differs', () => {
  const phrases = (mood, seed) => {
    const a = createAmbient(mood, seed);
    return Array.from({ length: 6 }, () => a.next());
  };
  assert.deepEqual(phrases('calm', 'x:1'), phrases('calm', 'x:1'));
  assert.notDeepEqual(phrases('calm', 'x:1'), phrases('calm', 'x:2'));
  assert.notDeepEqual(phrases('calm', 'x:1'), phrases('boss', 'x:1'));
});

test('ambient: notes are on the mood\'s pentatonic scale, in a phone speaker\'s range, and phrases overlap', () => {
  for (const [id, mood] of Object.entries(AMBIENT_MOODS)) {
    assert.equal(mood.scale.length, 5, id);
    const amb = createAmbient(id, 'scale');
    for (let i = 0; i < 40; i++) {
      const { length, notes } = amb.next();
      assert.ok(length > 3 && length < 10, `${id} phrase length`);
      const pads = notes.filter((n) => n.kind === 'pad');
      assert.ok(pads.length >= 2 && pads.every((n) => n.t === 0 && n.d > length), `${id} pads overlap the next phrase`);
      assert.ok(notes.length <= 12, `${id} few voices`);
      for (const n of notes) {
        const semis = Math.round(12 * Math.log2(n.f / mood.root));
        assert.ok(mood.scale.includes(((semis % 12) + 12) % 12), `${id} ${n.f} Hz is on the scale`);
        // Phone speakers carry little below ~200 Hz (8f: the loop was inaudible there).
        assert.ok(n.f >= 200 && n.f < 2000 && n.g > 0 && n.g <= 0.4 && n.t >= 0 && n.t < length, `${id} note`);
      }
    }
  }
  assert.ok(AMBIENT_MOODS.boss.root < AMBIENT_MOODS.calm.root && AMBIENT_MOODS.boss.beat < AMBIENT_MOODS.calm.beat);
  const pitches = (m) => new Set(m.scale.map((x) => Math.round(12 * Math.log2(m.root / 32.703) + x) % 12));
  assert.notDeepEqual(pitches(AMBIENT_MOODS.boss), pitches(AMBIENT_MOODS.calm), 'the boss variant has other notes');
  assert.equal(moodFor({ boss: true }), 'boss');
  assert.equal(moodFor({}), 'calm');
  assert.ok(Math.abs(scaleFreq(AMBIENT_MOODS.calm, 5) - 2 * AMBIENT_MOODS.calm.root) < 1e-9);
});

// A Web Audio stand-in: just enough for audio/music.js.
function fakeAudioContext() {
  const param = (value = 0) => ({
    value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime(v) { this.target = v; }, cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const ac = {
    state: 'running', currentTime: 0, started: 0,
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createOscillator: () => node({
      frequency: param(), detune: param(), start() { ac.started++; }, stop() {},
    }),
  };
  return ac;
}

test('music: waits for unlock, schedules ahead, stays silent at volume Off, ducks', () => {
  const ac = fakeAudioContext();
  let audible = true;
  let unlocked = false;
  const audio = { music: () => (unlocked ? { context: ac, out: {}, audible } : null) };
  let tick = null;
  const music = createMusic(audio, { setTimer: (fn) => { tick = fn; return 1; } });
  music.start();
  assert.equal(music.started, false); // no context before a gesture
  unlocked = true;
  music.start();
  assert.ok(music.started);
  tick();
  assert.ok(ac.started > 0, 'a phrase is scheduled');
  const before = ac.started;
  tick(); // nothing new until the clock moves
  assert.equal(ac.started, before);
  audible = false;
  ac.currentTime = 30;
  tick();
  assert.equal(ac.started, before, 'no voices while the music is Off');
  music.duck(true);
  music.setMood('boss', 'seed:9');
  audible = true;
  ac.currentTime = 31;
  tick();
  assert.ok(ac.started > before, 'plays again when turned back up');
});
