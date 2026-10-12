import assert from 'node:assert/strict';
import { test } from './harness.js';
import { topLayer, findCreature } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { parseMap } from '../src/core/maps.js';
import { createFloorState, act, playerOf, PLAYER_ID } from '../src/core/turn.js';
import { RELIC_DEFS, RARITY_WEIGHTS, applyRelics, relicDef } from '../src/core/relics.js';
import {
  createRun, addRelic, floorSetupFor, finishFloor, rollOffer, takeOffer, OFFER_SIZE, REST_FLOORS, REST_HEAL,
} from '../src/core/run.js';
import { solve, stateKey } from '../src/core/solver.js';

const types = (r) => r.events.map((e) => e.type);
const floor = (rows, opts = {}, under = []) => createFloorState({ ...parseMap(rows, { under }), ...opts });
const withRelics = (rows, relics, extra = {}) => createFloorState(applyRelics({ ...parseMap(rows), ...extra }, relics));
const move = (s, dir) => act(s, { type: 'move', dir });
const wait = (s) => act(s, { type: 'wait' });
const at = (s) => {
  const p = findCreature(s.board, PLAYER_ID);
  return p && { col: p.col, row: p.row };
};
const hp = (s) => playerOf(s).hp;

// A one-step floor: the player wins by walking right.
const winFloor = (run) => {
  const s = createFloorState(floorSetupFor(run, parseMap(['@ E'])));
  return move(s, 'right').state;
};

// --- Relic table ------------------------------------------------------------

test('relics: 12+ defined, every rarity has an offer weight', () => {
  const ids = Object.keys(RELIC_DEFS);
  assert.ok(ids.length >= 12, `${ids.length} relics`);
  for (const id of ids) assert.ok(RARITY_WEIGHTS[relicDef(id).rarity] > 0, id);
  for (const group of ['fold', 'defense', 'utility']) {
    assert.ok(ids.some((id) => relicDef(id).group === group), group);
  }
});

// --- Offers ---------------------------------------------------------------

test('offer: seeded, no duplicates, nothing already owned', () => {
  const run = createRun({ seed: 'offers', relics: ['extra-crease', 'laminate'] });
  const a = rollOffer(run, 1);
  assert.deepEqual(rollOffer(run, 1), a, 'same seed and floor, same offer');
  assert.equal(a.relics.length, OFFER_SIZE);
  assert.equal(new Set(a.relics).size, a.relics.length);
  assert.ok(a.relics.every((id) => !run.relics.includes(id)));
  assert.equal(a.rest, false);
  // Other floors and seeds roll their own streams.
  const differs = [2, 3, 5, 6].some((f) => rollOffer(run, f).relics.join() !== a.relics.join())
    || rollOffer({ ...run, seed: 'other' }, 1).relics.join() !== a.relics.join();
  assert.ok(differs);
});

test('offer: rest on floors 4 and 7 only; Origami Luck shows 4', () => {
  const run = createRun({ seed: 'r' });
  for (let f = 1; f <= 8; f++) assert.equal(rollOffer(run, f).rest, REST_FLOORS.includes(f), `floor ${f}`);
  assert.equal(rollOffer(addRelic(run, 'origami-luck'), 1).relics.length, 4);
});

test('offer: the pool runs low, then empty', () => {
  const all = Object.keys(RELIC_DEFS);
  const run = createRun({ seed: 'p', relics: all.slice(2) });
  assert.deepEqual(rollOffer(run, 1).relics.slice().sort(), all.slice(0, 2).sort());
  assert.deepEqual(rollOffer(createRun({ seed: 'p', relics: all }), 1).relics, []);
});

test('offer: rarity weights show commons more often than rares', () => {
  const seen = { common: 0, uncommon: 0, rare: 0 };
  const count = { common: 0, uncommon: 0, rare: 0 };
  for (const def of Object.values(RELIC_DEFS)) count[def.rarity] += 1;
  for (let i = 0; i < 400; i++) {
    for (const id of rollOffer(createRun({ seed: `w${i}` }), 1).relics) seen[relicDef(id).rarity] += 1;
  }
  // Per relic, a common turns up more than an uncommon, which beats a rare.
  const per = (r) => seen[r] / count[r];
  assert.ok(per('common') > per('uncommon') && per('uncommon') > per('rare'), JSON.stringify(seen));
});

test('finishFloor: a win rolls the offer, except after the last floor', () => {
  let run = createRun({ seed: 'f', lastFloor: 2 });
  run = finishFloor(run, winFloor(run));
  assert.deepEqual(run.offer, rollOffer(run, 1));
  assert.equal(run.floor, 2);
  run = takeOffer(run, run.offer.relics[0]);
  run = finishFloor(run, winFloor(run));
  assert.equal(run.status, 'won');
  assert.equal(run.offer, null);
});

test('takeOffer: a relic, rest, or nothing when nothing is offered', () => {
  const run = { ...createRun({ seed: 't' }), hp: 1, offer: { floor: 4, relics: ['paper-heart', 'mender'], rest: true } };
  const took = takeOffer(run, 'paper-heart');
  assert.deepEqual([took.relics, took.offer, took.hp, took.maxHp], [['paper-heart'], null, 2, 4]);
  const rested = takeOffer(run, 'rest');
  assert.deepEqual([rested.hp, rested.relics, rested.offer], [1 + REST_HEAL, [], null]);
  assert.equal(takeOffer({ ...run, hp: 3 }, 'rest').hp, 3, 'rest never heals over max');
  assert.equal(takeOffer(run, 'laminate'), run, 'not offered');
  const noRest = { ...run, offer: { ...run.offer, rest: false } };
  assert.equal(takeOffer(noRest, 'rest'), noRest, 'no rest on this floor');
  assert.equal(takeOffer(run, null), run, 'a choice is required');
  const empty = { ...run, offer: { floor: 1, relics: [], rest: false } };
  assert.equal(takeOffer(empty, null).offer, null);
});

// --- Defense relics -------------------------------------------------------

test('Paper Heart: +1 max HP and heal 1', () => {
  const run = addRelic({ ...createRun({ seed: 'h' }), hp: 1 }, 'paper-heart');
  assert.deepEqual([run.hp, run.maxHp], [2, 4]);
  const s = createFloorState(floorSetupFor(run, parseMap(['@ E'])));
  assert.deepEqual([playerOf(s).hp, playerOf(s).maxHp], [2, 4]);
});

test('Laminate: the first hit on each floor is ignored', () => {
  const rows = ['. m .', '. @ .'];
  const s = withRelics(rows, ['laminate']);
  const r1 = wait(s);
  assert.deepEqual(types(r1), ['wait', 'bump', 'block']);
  assert.equal(r1.events[2].by, 'ward');
  assert.equal(hp(r1.state), 3);
  const r2 = wait(r1.state);
  assert.deepEqual(types(r2), ['wait', 'bump', 'damage']);
  assert.equal(hp(r2.state), 2);
  assert.equal(withRelics(rows, ['laminate']).uses.wards, 1, 'every floor starts with a fresh ward');
  assert.deepEqual(types(wait(floor(rows))), ['wait', 'bump', 'damage']);
});

test('Folded Shield: after a fold, the next hit that turn is negated', () => {
  const rows = ['. m . . .', '. @ . . .', '. . . . .', '. . . . .', '. . . . .'];
  const fold = { type: 'fold', fold: { axis: 'h', index: 4, side: 'after' } };
  const s = withRelics(rows, ['folded-shield']);
  const r = act(s, fold);
  assert.deepEqual(types(r), ['fold', 'bump', 'block']);
  assert.equal(r.events[2].by, 'guard');
  assert.equal(r.state.uses.guard, false, 'spent');
  assert.deepEqual(types(wait(r.state)), ['wait', 'bump', 'damage'], 'only the turn of the fold');
  // Unused, it still ends with the turn.
  const far = withRelics(['m . . . .', '. . . . .', '. . . . .', '. . . . .', '. . . . @'], ['folded-shield']);
  assert.equal(act(far, { type: 'fold', fold: { axis: 'h', index: 1, side: 'before' } }).state.uses.guard, false);
});

test('Soft Landing: once per run, a step into a void is caught for 1 damage', () => {
  const rows = ['. o .', '. @ .'];
  const s = floor(rows, { landings: 1 });
  const r = move(s, 'up');
  assert.deepEqual(types(r), ['catch', 'damage']);
  assert.deepEqual(r.events[0], { type: 'catch', id: PLAYER_ID, at: { col: 1, row: 0 }, from: { col: 1, row: 1 } });
  assert.deepEqual([at(r.state), hp(r.state), r.state.uses.landings, r.state.status], [{ col: 1, row: 1 }, 2, 0, 'playing']);
  assert.equal(move(r.state, 'up').state.status, 'lost', 'only once');
  // At 1 HP the catch's damage still tears you.
  const low = move(floor(rows, { landings: 1, hp: 1, maxHp: 3 }), 'up');
  assert.deepEqual([low.state.status, low.state.outcome.cause], ['lost', 'hp']);
});

test('Soft Landing: the run carries it until used', () => {
  let run = createRun({ seed: 'sl', relics: ['soft-landing'], lastFloor: 3 });
  assert.equal(run.landings, 1);
  const s = createFloorState(floorSetupFor(run, parseMap(['. o .', '. @ E'])));
  const caught = move(s, 'up').state;
  const won = move(caught, 'right').state;
  assert.equal(won.status, 'won');
  run = finishFloor(run, won);
  assert.equal(run.landings, 0);
  assert.equal(createFloorState(floorSetupFor(run, parseMap(['@ E']))).uses.landings, 0);
});

test('Mender: heal 1 after every second floor cleared', () => {
  let run = { ...createRun({ seed: 'm', relics: ['mender'], lastFloor: 3 }), hp: 1 };
  run = finishFloor(run, winFloor(run));
  assert.equal(run.hp, 1);
  run = finishFloor(takeOffer(run, run.offer.relics[0]), winFloor(run));
  assert.deepEqual([run.cleared, run.hp], [2, 2]);
});

// --- Utility relics -------------------------------------------------------

test('Master Key: the first lock walked into each floor opens without a key', () => {
  const rows = ['. L L', '. @ .'];
  const s = withRelics(rows, ['master-key']);
  const r = move(s, 'up');
  assert.deepEqual(types(r), ['unlock', 'move']);
  assert.equal(r.events[0].by, 'master-key');
  assert.equal(move(r.state, 'right').reason, 'locked', 'only the first');
  // A carried key is used first, saving the Master Key.
  const keyed = move({ ...s, keys: 1 }, 'up').state;
  assert.deepEqual([keyed.keys, keyed.uses.freeLocks], [0, 1]);
  assert.equal(move(floor(rows), 'up').reason, 'locked');
});

test('Paper Cut: +1 bump damage against an enemy on a stacked tile', () => {
  const rows = ['. m .', '. @ .'];
  const under = [['_ . _', '_ _ _']];
  const cut = act(createFloorState(applyRelics(parseMap(rows, { under }), ['paper-cut'])), { type: 'move', dir: 'up' });
  assert.equal(cut.events.find((e) => e.type === 'damage').amount, 2);
  const flat = move(withRelics(rows, ['paper-cut']), 'up');
  assert.equal(flat.events.find((e) => e.type === 'damage').amount, 1, 'flat tile: no bonus');
  const plain = move(floor(rows, {}, under), 'up');
  assert.equal(plain.events.find((e) => e.type === 'damage').amount, 1);
});

test('Heavy Stamp: a plate stays pressed for 3 turns after you step off', () => {
  const rows = ['a @ .', '1 . .'];
  const gate = (s) => topLayer(s.board, 0, 0).tile;
  const run = (relics) => {
    let s = withRelics(rows, relics);
    s = move(s, 'down').state;
    s = move(s, 'left').state;
    assert.equal(gate(s), TILE.GATE_OPEN);
    s = move(s, 'right').state; // off the plate
    const seen = [gate(s)];
    for (let i = 0; i < 3; i++) {
      s = wait(s).state;
      seen.push(gate(s));
    }
    return seen;
  };
  const O = TILE.GATE_OPEN;
  const C = TILE.GATE;
  assert.deepEqual(run(['heavy-stamp']), [O, O, O, C]);
  assert.deepEqual(run([]), [C, C, C, C]);
});

test('solver: limited uses and plate holds are part of the state key', () => {
  const s = floor(['. @ .'], { landings: 1 });
  assert.notEqual(stateKey(s), stateKey({ ...s, uses: { ...s.uses, landings: 0 } }));
  const t = withRelics(['1 @ .'], ['heavy-stamp']);
  const held = move(t, 'left').state;
  const left = move(held, 'right').state;
  assert.notEqual(stateKey(left), stateKey(move(move(t, 'right').state, 'left').state));
  // Relics never make a floor unsolvable: the solver still finds a line.
  assert.ok(solve(withRelics(['@ . E'], Object.keys(RELIC_DEFS))).solvable);
});
