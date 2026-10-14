import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createFloorState, act } from '../src/core/turn.js';
import { createRun, finishFloor, BOSS_FLOOR } from '../src/core/run.js';
import { runScraps, SCRAP_RATES } from '../src/core/scraps.js';
import { createMeta, parseMeta, bankScraps, META_VERSION } from '../src/core/meta.js';
import { createMetaStore, META_KEY } from '../src/ui/metaStore.js';
import { encodeSaveCode, decodeSaveCode } from '../src/core/saveCode.js';
import { runSummary } from '../src/core/summary.js';

const mite = (col, row, id) => ({ kind: 'mite', col, row, id });
// A void at (0,2): folding col 0 over col 1 drops it on (1,2).
const dropFloor = (enemies) => createFloorState({
  board: createBoard(5, 5, (c, r) => (c === 0 && r === 2 ? TILE.VOID : TILE.FLOOR)),
  player: { col: 4, row: 4 },
  enemies,
});
const DROP = { type: 'fold', fold: { axis: 'v', index: 1, side: 'before' } };

test('scraps: rates are 5 per floor, 2 per fold kill, 25 for the Crane', () => {
  assert.deepEqual({ ...SCRAP_RATES }, { floor: 5, foldKill: 2, boss: 25 });
});

test('fold kills: a void dropped on an enemy counts; a pin does not; undo takes it back', () => {
  const s = dropFloor([mite(1, 2, 'm'), mite(1, 0, 'p')]);
  assert.equal(s.foldKills, 0);
  const r = act(s, DROP);
  assert.equal(r.state.foldKills, 1, 'the dropped mite, not the pinned one');
  assert.equal(act(r.state, { type: 'undo' }).state.foldKills, 0);
});

test('fold kills: a bump kill is not a fold kill', () => {
  const s = createFloorState({ board: createBoard(5, 5), player: { col: 2, row: 4 }, enemies: [mite(2, 3, 'm')] });
  const r = act(s, { type: 'move', dir: 'up' });
  assert.ok(r.events.some((e) => e.type === 'death' && e.id === 'm'));
  assert.equal(r.state.foldKills, 0);
});

test('fold kills: capped at 63 in a save code', () => {
  const run = { ...createRun({ seed: '7' }), foldKills: 80 };
  assert.equal(decodeSaveCode(encodeSaveCode(run)).run.foldKills, 63);
});

test('fold kills: finishFloor adds them to the run, won or lost', () => {
  const run = createRun({ seed: 's', lastFloor: BOSS_FLOOR });
  assert.equal(run.foldKills, 0);
  const won = finishFloor(run, { ...dropFloor([]), status: 'won', foldKills: 2 });
  assert.equal(won.foldKills, 2);
  const lost = finishFloor(won, { status: 'lost', outcome: { cause: 'hp' }, foldKills: 1 });
  assert.equal(lost.foldKills, 3);
  assert.equal(finishFloor({ ...run, foldKills: undefined }, { status: 'lost', foldKills: 0 }).foldKills, 0, 'older saves');
});

test('scraps: a lost run keeps floors and fold kills; no boss bonus', () => {
  const run = { ...createRun({ seed: 's', lastFloor: BOSS_FLOOR }), status: 'lost', cleared: 4, foldKills: 3 };
  const e = runScraps(run);
  assert.deepEqual(e.lines.map((l) => [l.id, l.amount]), [['floors', 20], ['foldKills', 6]]);
  assert.equal(e.total, 26);
});

test('scraps: a boss win adds the Crane bonus; a short won run does not; nothing earned is empty', () => {
  const win = { ...createRun({ seed: 's', lastFloor: BOSS_FLOOR }), status: 'won', cleared: BOSS_FLOOR, foldKills: 5 };
  assert.equal(runScraps(win).total, BOSS_FLOOR * 5 + 10 + 25);
  const short = { ...createRun({ seed: 's', lastFloor: 3 }), status: 'won', cleared: 3 };
  assert.equal(runScraps(short).total, 15);
  const none = runScraps({ ...createRun({ seed: 's' }), status: 'lost' });
  assert.deepEqual(none, { lines: [], total: 0 });
});

test('meta: banking adds to scraps and earned; broken data starts fresh', () => {
  const m = bankScraps(bankScraps(createMeta(), 26), 0);
  assert.deepEqual(m, { v: META_VERSION, scraps: 26, earned: 26, runs: 2 });
  assert.deepEqual(parseMeta(m), m);
  assert.deepEqual(parseMeta(null), createMeta());
  assert.deepEqual(parseMeta({ v: 99, scraps: 5 }), createMeta());
  assert.deepEqual(parseMeta({ v: META_VERSION, scraps: -3, earned: 1.5 }), createMeta());
});

test('meta store: round-trips, survives broken JSON and blocked storage', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createMetaStore(storage);
  assert.deepEqual(store.load(), createMeta());
  const m = bankScraps(createMeta(), 12);
  assert.equal(store.write(m), true);
  assert.deepEqual(createMetaStore(storage).load(), m);
  data.set(META_KEY, '{oops');
  assert.deepEqual(createMetaStore(storage).load(), createMeta());
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const mem = createMetaStore(blocked);
  assert.equal(mem.write(m), false);
  assert.deepEqual(mem.load(), m, 'kept in memory for the session');
});

test('save code: fold kills round-trip (v2); a v1 code reads with none', () => {
  const run = { ...createRun({ seed: '1234', spirit: 'frog' }), floor: 3, cleared: 2, foldKills: 4 };
  assert.equal(decodeSaveCode(encodeSaveCode(run)).run.foldKills, 4);
  // Made by the version 1 encoder from the same run.
  const v1 = decodeSaveCode('FW-2000-0K94-E920-G02S-R');
  assert.ok(v1.ok);
  assert.equal(v1.run.foldKills, 0);
  assert.equal(v1.run.floor, 3);
  assert.equal(v1.run.spirit, 'frog');
});

test('summary: the scraps row shows how they were earned and the bank', () => {
  const run = { ...createRun({ seed: 's', lastFloor: BOSS_FLOOR }), status: 'lost', floor: 4, cleared: 3, foldKills: 1 };
  const earned = runScraps(run);
  const s = runSummary(run, { earned, total: 40, banked: true });
  assert.deepEqual(s.rows.map((r) => r.id), ['spirit', 'floors', 'hp', 'relics', 'scraps', 'seed']);
  const row = s.rows.find((r) => r.id === 'scraps');
  assert.equal(row.value, '+17 (40 saved)');
  assert.deepEqual(row.items, ['Floors cleared: 3 × 5 = 15', 'Fold kills: 2', 'Total: +17 (40 saved)']);
  const dev = runSummary(run, { earned, total: 0, banked: false }).rows.find((r) => r.id === 'scraps');
  assert.match(dev.value, /not saved/);
  assert.ok(!runSummary(run).rows.some((r) => r.id === 'scraps'), 'no scraps passed: no row');
});
