import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  dailyDate, isDailyDate, dayNumber, dateOfDay, dailyLabel, dailyName, msUntilNextDaily, nextDailyText,
  claimDaily, finishDaily, parseDaily, dailyRecord, isPractice, dailyTitle, dailyResultText,
} from '../src/core/daily.js';
import { createRun, rollOffer, RELIC_POOL_ALL } from '../src/core/run.js';
import { createMeta, parseMeta } from '../src/core/meta.js';
import { encodeSaveCode, decodeSaveCode } from '../src/core/saveCode.js';
import { generateFloor } from '../src/core/floors.js';
import { runSummary } from '../src/core/summary.js';
import { createSave } from '../src/core/save.js';

const at = (iso) => Date.parse(iso);

test('daily: the day is the UTC date, named the same everywhere', () => {
  assert.equal(dailyDate(at('2026-10-14T23:59:59Z')), '2026-10-14');
  assert.equal(dailyDate(at('2026-10-15T00:00:00Z')), '2026-10-15');
  // Same instant, any time zone: the UTC date (a +14h offset is still the 14th in UTC).
  assert.equal(dailyDate(at('2026-10-15T09:00:00+14:00')), '2026-10-14');
  assert.equal(dailyLabel('2026-10-14'), 'Oct 14');
  assert.equal(dailyLabel('2027-01-05'), 'Jan 5');
  assert.equal(dailyName('2026-10-14'), 'Daily · Oct 14');
});

test('daily: dates are checked, and day numbers round-trip', () => {
  for (const ok of ['2026-10-14', '2024-02-29', '1970-01-01']) assert.ok(isDailyDate(ok), ok);
  for (const bad of ['2026-02-30', '2025-02-29', '2026-1-4', '20261014', '', null, 5, '2026-10-14T00:00']) {
    assert.equal(isDailyDate(bad), false, String(bad));
  }
  assert.equal(dayNumber('1970-01-02'), 1);
  for (const d of ['2026-10-14', '2024-02-29', '2099-12-31']) assert.equal(dateOfDay(dayNumber(d)), d);
});

test('daily: time to the next daily', () => {
  assert.equal(msUntilNextDaily(at('2026-10-14T23:00:00Z')), 60 * 60 * 1000);
  assert.equal(nextDailyText(at('2026-10-14T20:48:00Z')), 'New daily in 3h 12m');
  assert.equal(nextDailyText(at('2026-10-14T23:59:30Z')), 'New daily in 1m');
  assert.equal(nextDailyText(at('2026-10-14T00:00:00Z')), 'New daily in 24h 0m');
});

test('daily: a daily run is seeded by its date and offers every relic', () => {
  const run = createRun({ seed: '999', spirit: 'fox', pool: ['extra-crease'], daily: '2026-10-14' });
  assert.equal(run.seed, '2026-10-14');
  assert.equal(run.pool, RELIC_POOL_ALL);
  assert.equal(run.daily, '2026-10-14');
  assert.equal(run.practice, false);
  assert.ok(!('daily' in createRun({ seed: '1' })), 'plain runs carry no daily fields');
});

test('daily: the same run on every device (floors and offers depend only on the date)', () => {
  const a = createRun({ daily: '2026-10-14', spirit: 'fox', pool: [] });
  const b = createRun({ daily: '2026-10-14', spirit: 'fox', pool: ['laminate', 'mender'] });
  for (let floor = 1; floor <= a.lastFloor; floor++) {
    const fa = generateFloor(floor, a.seed);
    const fb = generateFloor(floor, b.seed);
    assert.deepEqual([fa.templateId, fa.variant], [fb.templateId, fb.variant], `floor ${floor}`);
    assert.deepEqual(rollOffer(a, floor), rollOffer(b, floor), `offer ${floor}`);
  }
  const other = createRun({ daily: '2026-10-15', spirit: 'fox' });
  const differs = [1, 2, 3, 4, 5, 6, 7, 8].some((f) => JSON.stringify(rollOffer(a, f)) !== JSON.stringify(rollOffer(other, f)));
  assert.ok(differs, 'another day is another run');
});

test('daily: the first run of a day is scored; later ones are practice', () => {
  const date = '2026-10-14';
  let meta = createMeta();
  assert.equal(isPractice(meta, date), false);
  const first = claimDaily(meta, createRun({ daily: date, spirit: 'frog' }));
  assert.equal(first.run.practice, false);
  meta = first.meta;
  assert.deepEqual(dailyRecord(meta, date), {
    outcome: 'playing', spirit: 'frog', floor: 1, cleared: 0, lastFloor: first.run.lastFloor, scraps: 0,
  });
  const second = claimDaily(meta, createRun({ daily: date, spirit: 'fox' }));
  assert.equal(second.run.practice, true);
  assert.equal(second.meta, meta, 'practice records nothing');
  const plain = createRun({ seed: '5' });
  assert.deepEqual(claimDaily(meta, plain), { meta, run: plain });
});

test('daily: the scored run fills in its day; practice and replays change nothing', () => {
  const date = '2026-10-14';
  const { meta, run } = claimDaily(createMeta(), createRun({ daily: date, spirit: 'fox' }));
  const lost = { ...run, floor: 5, cleared: 4, status: 'lost' };
  const done = finishDaily(meta, lost, 'lost', 20);
  assert.deepEqual(dailyRecord(done, date), {
    outcome: 'lost', spirit: 'fox', floor: 5, cleared: 4, lastFloor: run.lastFloor, scraps: 20,
  });
  assert.equal(dailyResultText(dailyRecord(done, date)), 'Torn on floor 5');
  assert.equal(finishDaily(done, { ...lost, status: 'won' }, 'won', 99), done, 'the day is already decided');
  assert.equal(finishDaily(meta, { ...lost, practice: true }, 'won', 9), meta, 'practice never scores');
  const quit = finishDaily(meta, { ...run, floor: 3 }, 'abandoned');
  assert.equal(dailyResultText(dailyRecord(quit, date)), 'Given up on floor 3');
});

test('daily: meta records survive a reload; junk is dropped, unknown fields kept', () => {
  const rec = {
    outcome: 'won', spirit: 'turtle', floor: 9, cleared: 9, lastFloor: 9, scraps: 90, extra: 1,
  };
  const meta = parseMeta(JSON.parse(JSON.stringify({ ...createMeta(), daily: { '2026-10-14': rec } })));
  assert.deepEqual(meta.daily, { '2026-10-14': rec });
  assert.deepEqual(parseDaily({
    '2026-13-01': rec, '2026-10-15': { outcome: 'odd' }, '2026-10-16': null, '2026-10-17': { outcome: 'lost', floor: -2 },
  }), {
    '2026-10-17': {
      outcome: 'lost', spirit: null, floor: 0, cleared: 0, lastFloor: 0, scraps: 0,
    },
  });
  assert.deepEqual(parseMeta({ v: 1, scraps: 3 }).daily, {}, 'an older meta has no days yet');
});

test('daily: the title row says what today holds', () => {
  const now = at('2026-10-14T20:48:00Z');
  const fresh = dailyTitle(createMeta(), null, now);
  assert.deepEqual(fresh, {
    date: '2026-10-14', label: 'Daily · Oct 14', note: 'Daily · Oct 14 · the same run for everyone today', resume: false,
  });
  const { meta, run } = claimDaily(createMeta(), createRun({ daily: '2026-10-14', spirit: 'fox' }));
  const saved = createSave({ run: { ...run, floor: 3 } });
  const going = dailyTitle(meta, saved, now);
  assert.equal(going.resume, true);
  assert.equal(going.note, 'Daily · Oct 14 · in progress, floor 3');
  const won = finishDaily(meta, { ...run, floor: 9 }, 'won', 50);
  assert.deepEqual(dailyTitle(won, null, now).note, 'Daily · Oct 14 · Won · practice only · New daily in 3h 12m');
  const practiceSave = createSave({ run: { ...run, practice: true } });
  assert.equal(dailyTitle(won, practiceSave, now).resume, false, 'a practice save is not today\'s scored run');
  assert.equal(dailyTitle(meta, saved, at('2026-10-15T01:00:00Z')).date, '2026-10-15', 'a new day');
});

test('daily: save codes carry the day and practice (version 5)', () => {
  for (const practice of [false, true]) {
    const run = { ...createRun({ daily: '2026-10-14', spirit: 'turtle' }), practice };
    const code = encodeSaveCode(run);
    assert.ok(code, 'a daily run has a code');
    assert.deepEqual(decodeSaveCode(code, { pool: ['extra-crease'] }), { ok: true, run });
  }
});

test('daily: version 4 codes still read', () => {
  const back = decodeSaveCode('FW-8001-W904-6920-00GN-J48D-28');
  assert.ok(back.ok);
  assert.equal(back.run.seed, '123456');
  assert.deepEqual(back.run.relics, ['compass']);
  assert.equal(back.run.rewinds, 1);
  assert.deepEqual(back.run.hints, { 1: 3 });
  assert.ok(!('daily' in back.run));
});

test('daily: the run summary names the day and a practice run earns nothing', () => {
  const run = { ...createRun({ daily: '2026-10-14', spirit: 'fox' }), status: 'lost', cause: 'hp' };
  const scored = runSummary(run);
  assert.deepEqual(scored.rows.find((r) => r.id === 'daily'), { id: 'daily', label: 'Daily', value: 'Oct 14 · scored run' });
  const practice = runSummary({ ...run, practice: true }, {
    earned: { lines: [], total: 0 }, total: 10, banked: true, practice: true,
  });
  assert.equal(practice.rows.find((r) => r.id === 'daily').value, 'Oct 14 · practice');
  assert.equal(practice.rows.find((r) => r.id === 'scraps').value, 'None: practice run');
  assert.equal(runSummary({ ...createRun({ seed: '3' }), status: 'lost' }).rows.some((r) => r.id === 'daily'), false);
});
