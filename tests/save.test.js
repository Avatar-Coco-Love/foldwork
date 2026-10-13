import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createSave, parseSave, resumeFloor, saveSummary, SAVE_VERSION } from '../src/core/save.js';
import { createSaveStore, SAVE_KEY } from '../src/ui/saveStore.js';
import { shareGame } from '../src/ui/share.js';
import { createRun, floorSetupFor } from '../src/core/run.js';
import { generateFloor } from '../src/core/floors.js';
import { createFloorState, act, playerOf } from '../src/core/turn.js';
import { encodeAction } from '../src/core/replay.js';
import { solve } from '../src/core/solver.js';
import { LOGIC_VERSION } from '../src/config.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

/** Floor 1 of a seeded run, as the floor screen builds it. */
function floorOne(seed = 'save-seed') {
  const run = createRun({ seed, spirit: 'fox' });
  const { setup, info } = generateFloor(run.floor, run.seed);
  return { run, info, start: () => createFloorState(floorSetupFor(run, setup)) };
}

const floorOf = (info, actions) => ({ floor: info.floor, templateId: info.templateId, variant: info.variant, actions });

test('save: created saves parse back; finished runs and bad data do not', () => {
  const { run, info } = floorOne();
  const save = createSave({ run, runId: 'r_1', floor: floorOf(info, ['u', 'w']), at: 5 });
  assert.equal(save.v, SAVE_VERSION);
  assert.equal(save.logic, LOGIC_VERSION);
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save);
  assert.equal(parseSave(createSave({ run })).floor, null);
  assert.equal(parseSave(null), null);
  assert.equal(parseSave({ ...save, v: SAVE_VERSION + 1 }), null);
  assert.equal(parseSave({ ...save, run: { ...run, status: 'lost' } }), null);
  assert.equal(parseSave({ ...save, run: { ...run, v: 0 } }), null);
  assert.equal(parseSave({ ...save, floor: { ...save.floor, actions: [1] } }), null);
});

test('save: the floor log is copied, not shared with the screen', () => {
  const { run, info } = floorOne();
  const log = ['u'];
  const save = createSave({ run, floor: floorOf(info, log) });
  log.push('d');
  assert.deepEqual(save.floor.actions, ['u']);
});

test('save: resumeFloor replays the saved actions to the same state', () => {
  const { run, info, start } = floorOne();
  const line = solve(start()).actions;
  assert.ok(line && line.length >= 2);
  // Stop one action short of winning, then save as the screen would.
  let state = start();
  const codes = [];
  for (const action of line.slice(0, -1)) {
    state = act(state, action).state;
    codes.push(encodeAction(action));
  }
  const save = parseSave(JSON.parse(JSON.stringify(createSave({ run, floor: floorOf(info, codes) }))));
  const resumed = resumeFloor(save, start(), info);
  assert.equal(resumed.restarted, false);
  assert.deepEqual(resumed.actions, codes);
  assert.deepEqual(resumed.state, state);
  // ...and the run plays on to the win.
  assert.equal(act(resumed.state, line[line.length - 1]).state.status, 'won');
});

test('save: undo in the log replays (refunded charge)', () => {
  const { run, info, start } = floorOne();
  const fold = solve(start()).actions.find((a) => a.type === 'fold');
  const codes = [encodeAction(fold), 'z'];
  const resumed = resumeFloor(createSave({ run, floor: floorOf(info, codes) }), start(), info);
  assert.equal(resumed.restarted, false);
  assert.equal(resumed.state.charges, start().charges);
});

test('save: a floor that no longer matches starts over, run intact', () => {
  const { run, info, start } = floorOne();
  const codes = [encodeAction(solve(start()).actions[0])];
  const fresh = start();
  const cases = [
    createSave({ run, floor: { ...floorOf(info, codes), templateId: 'gone' } }),
    createSave({ run, floor: { ...floorOf(info, codes), variant: { ...info.variant, transform: 'other' } } }),
    createSave({ run, floor: { ...floorOf(info, codes), floor: info.floor + 1 } }),
    { ...createSave({ run, floor: floorOf(info, codes) }), logic: LOGIC_VERSION - 1 },
    // An action the floor refuses (walking into the top edge forever).
    createSave({ run, floor: floorOf(info, Array(12).fill('u')) }),
  ];
  for (const save of cases) {
    const r = resumeFloor(save, fresh, info);
    assert.equal(r.restarted, true);
    assert.equal(r.state, fresh);
    assert.deepEqual(r.actions, []);
  }
  const none = resumeFloor(createSave({ run }), fresh, info);
  assert.deepEqual([none.restarted, none.state === fresh], [false, true]);
});

test('save: a log that ends the floor is not resumed into a finished floor', () => {
  const { run, info, start } = floorOne();
  const codes = solve(start()).actions.map(encodeAction);
  const r = resumeFloor(createSave({ run, floor: floorOf(info, codes) }), start(), info);
  assert.equal(r.restarted, true);
  assert.equal(r.state.status, 'playing');
});

test('save: summary for the title screen', () => {
  const { run } = floorOne();
  const sum = saveSummary(createSave({ run: { ...run, relics: ['extra-crease'], hp: 2 }, at: 9 }));
  assert.deepEqual(sum, {
    floor: 1, lastFloor: run.lastFloor, spirit: 'fox', hp: 2, maxHp: playerOf(floorOne().start()).maxHp, relics: 1, offer: false, at: 9,
  });
});

test('saveStore: round trip, clear, broken data', () => {
  const st = memoryStorage();
  const store = createSaveStore(st);
  assert.equal(store.load(), null);
  const save = createSave({ run: floorOne().run, at: 1 });
  assert.equal(store.write(save), true);
  assert.deepEqual(store.load(), save);
  assert.deepEqual(createSaveStore(st).load(), save); // a new session reads it
  store.clear();
  assert.equal(store.load(), null);
  st.m.set(SAVE_KEY, '{not json');
  assert.equal(createSaveStore(st).load(), null);
});

test('saveStore: blocked storage keeps the save for this session', () => {
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('blocked'); },
  };
  for (const storage of [throwing, null]) {
    const store = createSaveStore(storage);
    const save = createSave({ run: floorOne().run });
    assert.equal(store.write(save), false);
    assert.deepEqual(store.load(), save);
    store.clear();
    assert.equal(store.load(), null);
  }
});

test('share: share sheet, cancelled, clipboard fallback, manual', async () => {
  const shared = [];
  assert.equal(await shareGame('https://x/', { share: async (d) => shared.push(d) }), 'shared');
  assert.equal(shared[0].url, 'https://x/');
  const abort = Object.assign(new Error('no'), { name: 'AbortError' });
  assert.equal(await shareGame('u', { share: async () => { throw abort; } }), 'cancelled');
  const copied = [];
  const clipboard = { writeText: async (t) => copied.push(t) };
  assert.equal(await shareGame('u', { share: async () => { throw new Error('denied'); }, clipboard }), 'copied');
  assert.equal(await shareGame('v', { canShare: () => false, share: async () => {}, clipboard }), 'copied');
  assert.deepEqual(copied, ['u', 'v']);
  assert.equal(await shareGame('u', {}), 'manual');
  assert.equal(await shareGame('u', { clipboard: { writeText: async () => { throw new Error('blocked'); } } }), 'manual');
});
