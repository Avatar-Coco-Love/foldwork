import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  encodeSaveCode, decodeSaveCode, isCodeSeed, CODE_RELICS, CODE_SPIRITS,
} from '../src/core/saveCode.js';
import { createRun, addRelic, finishFloor, floorSetupFor, takeOffer } from '../src/core/run.js';
import { RELIC_DEFS } from '../src/core/relics.js';
import { SPIRIT_DEFS } from '../src/core/spirits.js';
import { generateFloor } from '../src/core/floors.js';
import { createFloorState, act } from '../src/core/turn.js';
import { solve } from '../src/core/solver.js';

const CODE_CHARS = /^FW(-[0-9A-HJKMNP-TV-Z]{1,4})+$/;

/** A run as it is after `floors` floors won by the solver (offers left waiting). */
function playedRun(seed, spirit, floors) {
  let run = createRun({ seed, spirit });
  for (let i = 0; i < floors; i++) {
    if (run.offer) run = takeOffer(run, run.offer.relics[0] ?? (run.offer.rest ? 'rest' : null));
    const { setup } = generateFloor(run.floor, run.seed);
    let s = createFloorState(floorSetupFor(run, setup));
    for (const a of solve(s).actions) s = act(s, a).state;
    assert.equal(s.status, 'won');
    run = finishFloor(run, s);
  }
  return run;
}

test('save code: every spirit and relic has a code slot', () => {
  for (const id of Object.keys(SPIRIT_DEFS)) assert.ok(CODE_SPIRITS.includes(id), id);
  for (const id of Object.keys(RELIC_DEFS)) assert.ok(CODE_RELICS.includes(id), id);
  assert.equal(new Set(CODE_RELICS).size, CODE_RELICS.length);
});

test('save code: a new run round-trips, short and readable', () => {
  const run = createRun({ seed: '4294967295', spirit: 'turtle' });
  const code = encodeSaveCode(run);
  assert.match(code, CODE_CHARS);
  assert.ok(code.length <= 24, code);
  assert.deepEqual(decodeSaveCode(code), { ok: true, run });
});

test('save code: relics (in order), hints, landings and clean round-trip', () => {
  let run = createRun({ seed: '123456789', spirit: 'fox', lastFloor: 5 });
  for (const id of ['soft-landing', 'paper-heart', 'origami-luck', 'extra-crease', 'mender', 'wax-coat']) run = addRelic(run, id);
  run = { ...run, floor: 4, cleared: 3, hp: 2, clean: true, hints: { 1: 2, 3: 70 } };
  const code = encodeSaveCode(run);
  assert.ok(code.replace(/-/g, '').length <= 30, code);
  const back = decodeSaveCode(code);
  assert.ok(back.ok);
  assert.deepEqual(back.run, { ...run, hints: { 1: 2, 3: 63 } }, 'hint presses cap at 63');
  assert.deepEqual(back.run.relics, run.relics);
});

test('save code: a waiting relic offer is rolled again, the same', () => {
  const run = playedRun('2024', 'frog', 2);
  assert.ok(run.offer && run.offer.relics.length);
  const back = decodeSaveCode(encodeSaveCode(run));
  assert.ok(back.ok);
  assert.deepEqual(back.run, run);
});

test('save code: reading is forgiving about case, spaces, dashes and look-alikes', () => {
  const run = createRun({ seed: '777', spirit: 'fox' });
  const code = encodeSaveCode(run);
  const bare = code.slice(3).replace(/-/g, '');
  for (const typed of [code.toLowerCase(), ` ${bare.match(/.{1,3}/g).join(' ')} `, bare, `fw${bare}`]) {
    assert.deepEqual(decodeSaveCode(typed), { ok: true, run }, typed);
  }
  const loose = bare.replace(/0/g, 'o').replace(/1/g, 'l');
  assert.deepEqual(decodeSaveCode(loose), { ok: true, run }, 'o and l read as 0 and 1');
});

test('save code: typos are caught', () => {
  const run = addRelic(createRun({ seed: '987654321', spirit: 'turtle' }), 'laminate');
  const bare = encodeSaveCode(run).slice(3).replace(/-/g, '');
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (let i = 0; i < bare.length; i++) {
    for (const ch of ALPHA) {
      if (ch === bare[i]) continue;
      const typo = bare.slice(0, i) + ch + bare.slice(i + 1);
      assert.equal(decodeSaveCode(typo).ok, false, `char ${i} as ${ch}`);
    }
    if (i + 1 < bare.length && bare[i] !== bare[i + 1]) {
      const swap = bare.slice(0, i) + bare[i + 1] + bare[i] + bare.slice(i + 2);
      assert.equal(decodeSaveCode(swap).ok, false, `swap ${i}`);
    }
  }
});

test('save code: bad input gives a reason, not a run', () => {
  assert.equal(decodeSaveCode('').reason, 'empty');
  assert.equal(decodeSaveCode('   ').reason, 'empty');
  assert.equal(decodeSaveCode('FW-2U').reason, 'format', 'U is not a code character');
  assert.equal(decodeSaveCode('FW-2A').reason, 'format', 'too short');
  const code = encodeSaveCode(createRun({ seed: '5', spirit: 'fox' }));
  assert.equal(decodeSaveCode(code.slice(0, -1)).ok, false, 'a dropped character');
  assert.equal(decodeSaveCode(`${code}0`).ok, false, 'an extra character');
  assert.equal(decodeSaveCode('FW-Z').reason, 'version', 'a newer version');
});

test('save code: only playing runs on a plain number seed get one', () => {
  assert.equal(encodeSaveCode(null), null);
  assert.equal(encodeSaveCode(createRun({ seed: 'dev-seed' })), null);
  assert.equal(encodeSaveCode({ ...createRun({ seed: '9' }), status: 'lost' }), null);
  assert.equal(encodeSaveCode({ ...createRun({ seed: '9' }), relics: ['no-such-relic'] }), null);
  assert.ok(encodeSaveCode(createRun({ seed: '0' })), 'no spirit is fine');
  assert.ok(isCodeSeed('4294967295'));
  for (const s of ['4294967296', '01', '-1', '1.5', '', 'abc', 12]) assert.equal(isCodeSeed(s), false, String(s));
});

test('save code: a code for floors this game lacks is refused', () => {
  const run = createRun({ seed: '42', spirit: 'fox' });
  const code = encodeSaveCode({ ...run, floor: run.lastFloor });
  assert.ok(decodeSaveCode(code).ok);
  assert.equal(decodeSaveCode(code, { floors: [1, 2, 3] }).reason, 'data');
});
