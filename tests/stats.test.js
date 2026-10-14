import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  createStats, parseStats, recordRun, dailyStreaks, statsView, metaSummary, RECENT_RUNS,
} from '../src/core/stats.js';
import { createMeta, parseMeta, bankScraps } from '../src/core/meta.js';
import { createRun, BOSS_FLOOR } from '../src/core/run.js';
import { claimDaily, finishDaily } from '../src/core/daily.js';
import { buyUnlock } from '../src/core/unlocks.js';
import { SETTINGS_GROUPS } from '../src/ui/settings.js';

const at = (iso) => Date.parse(iso);
const NOW = at('2026-10-14T12:00:00Z');

/** A run that ended on `floor` having cleared `cleared`. */
function ended({
  spirit = 'fox', floor = 3, cleared = 2, foldKills = 1, status = 'lost', daily = null,
} = {}) {
  return {
    ...createRun({ seed: 'S', spirit, daily }), floor, cleared, foldKills, status,
  };
}

/** The meta after ending `run` the way main.js endRun does. */
function end(meta, run, outcome, scraps = 0, when = NOW) {
  const banked = outcome === 'abandoned' ? meta : bankScraps(meta, scraps);
  return recordRun(finishDaily(banked, run, outcome, scraps), run, outcome, scraps, when);
}

test('stats: a new meta has empty stats; old and broken ones read back', () => {
  assert.deepEqual(createMeta().stats, createStats());
  // A 7d meta (no stats) keeps its other fields and gets empty stats.
  const old = parseMeta({ v: 1, scraps: 9, earned: 40, runs: 3, unlocks: {}, daily: {} });
  assert.deepEqual(old.stats, createStats());
  assert.equal(old.runs, 3);
  const broken = parseStats({
    runs: -2, won: 'x', best: { outcome: 'nope' }, spirits: { fox: { runs: 2, won: 1.5 } }, recent: [null, { outcome: 'won', cleared: 9 }], later: 1,
  });
  assert.equal(broken.runs, 0);
  assert.equal(broken.won, 0);
  assert.equal(broken.best, null);
  assert.deepEqual(broken.spirits.fox, { runs: 2, won: 0, best: 0 });
  assert.equal(broken.recent.length, 1);
  assert.equal(broken.later, 1, 'fields from a newer build are kept');
  // Through JSON and back.
  const meta = end(createMeta(), ended(), 'lost', 12);
  assert.deepEqual(parseMeta(JSON.parse(JSON.stringify(meta))).stats, meta.stats);
});

test('stats: totals, best run and spirits over won, lost and given-up runs', () => {
  let meta = createMeta();
  meta = end(meta, ended({ floor: 3, cleared: 2, foldKills: 2 }), 'lost', 14);
  meta = end(meta, ended({
    spirit: 'frog', floor: BOSS_FLOOR, cleared: BOSS_FLOOR, foldKills: 5, status: 'won',
  }), 'won', 85, NOW + 1);
  meta = end(meta, ended({ floor: 2, cleared: 1, foldKills: 0 }), 'abandoned', 0, NOW + 2);
  const s = meta.stats;
  assert.equal(s.runs, 3);
  assert.equal(s.won, 1);
  assert.equal(s.lost, 1);
  assert.equal(s.abandoned, 1);
  assert.equal(s.cleared, 2 + BOSS_FLOOR + 1);
  assert.equal(s.foldKills, 7);
  assert.equal(s.crane, 1);
  assert.equal(s.best.spirit, 'frog');
  assert.equal(s.best.outcome, 'won');
  assert.deepEqual(s.spirits.fox, { runs: 2, won: 0, best: 2 });
  assert.deepEqual(s.spirits.frog, { runs: 1, won: 1, best: BOSS_FLOOR });
  assert.deepEqual(s.recent.map((r) => r.outcome), ['abandoned', 'won', 'lost'], 'newest first');
  assert.equal(s.recent[1].scraps, 85);
  // An equal best later doesn't replace the first.
  const tie = end(meta, ended({ spirit: 'turtle', cleared: BOSS_FLOOR, status: 'won' }), 'won', 85).stats;
  assert.equal(tie.best.spirit, 'frog');
  // A run with no spirit is filed under 'none'.
  assert.equal(end(createMeta(), ended({ spirit: null }), 'lost').stats.spirits.none.runs, 1);
});

test('stats: the recent list keeps the last RECENT_RUNS runs', () => {
  let meta = createMeta();
  for (let i = 0; i < RECENT_RUNS + 5; i++) meta = end(meta, ended({ cleared: i % 9 }), 'lost', 0, NOW + i);
  assert.equal(meta.stats.recent.length, RECENT_RUNS);
  assert.equal(meta.stats.recent[0].at, NOW + RECENT_RUNS + 4);
  assert.equal(meta.stats.runs, RECENT_RUNS + 5);
});

test('stats: daily streaks (a day counts once its scored run is played)', () => {
  const days = (...dates) => Object.fromEntries(dates.map((d) => [d, { outcome: 'lost' }]));
  assert.deepEqual(dailyStreaks({}, NOW), { current: 0, best: 0, days: 0 });
  // Today not played yet: the streak runs from yesterday.
  assert.deepEqual(dailyStreaks(days('2026-10-11', '2026-10-12', '2026-10-13'), NOW), { current: 3, best: 3, days: 3 });
  assert.deepEqual(dailyStreaks(days('2026-10-12', '2026-10-13', '2026-10-14'), NOW).current, 3);
  // A gap breaks it; the best is kept.
  assert.deepEqual(dailyStreaks(days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-12'), NOW), { current: 0, best: 4, days: 5 });
  // Across a month and a year.
  assert.equal(dailyStreaks(days('2026-12-31', '2027-01-01'), at('2027-01-01T05:00:00Z')).current, 2);
});

test('stats: the screen view, in words', () => {
  const empty = statsView(createMeta(), NOW);
  assert.equal(empty.empty, true);
  assert.equal(empty.note, null);
  assert.deepEqual(empty.sections.map((s) => s.id), ['totals', 'best', 'spirits', 'recent', 'daily']);
  for (const s of empty.sections.slice(1)) assert.ok(s.empty, `${s.id} says it is empty`);

  let meta = createMeta();
  const daily = claimDaily(meta, createRun({ seed: 'x', spirit: 'fox', daily: '2026-10-13' }));
  meta = end(daily.meta, { ...daily.run, floor: 5, cleared: 4, status: 'lost' }, 'lost', 20, at('2026-10-13T10:00:00Z'));
  meta = end(meta, ended({ cleared: 2 }), 'won', 30, NOW);
  const view = statsView({ ...meta, runs: meta.runs + 3 }, NOW);
  assert.equal(view.empty, false);
  assert.equal(view.note, '3 earlier runs from before stats were kept aren\'t counted here.');
  const sec = Object.fromEntries(view.sections.map((s) => [s.id, s]));
  const row = (id, label) => sec[id].rows.find((r) => r.label === label)?.value;
  assert.equal(row('totals', 'Runs'), '2');
  assert.equal(row('totals', 'Won'), '1 (50%)');
  assert.equal(row('totals', 'Paper scraps earned'), '50');
  assert.equal(row('best', 'Floors cleared'), `4 / ${BOSS_FLOOR}`);
  assert.equal(row('best', 'Result'), 'Torn on floor 5');
  assert.equal(row('spirits', '△ Fox'), '2 runs · 1 won · best 4 floors');
  assert.equal(sec.recent.items[1].title, 'Daily · Oct 13 · △ Fox');
  assert.equal(sec.recent.items[1].text, `Torn on floor 5 · 4 / ${BOSS_FLOOR} floors · 20 scraps`);
  assert.equal(sec.recent.items[0].title, 'Oct 14 · △ Fox');
  assert.equal(row('daily', 'Current streak'), '1 day');
  assert.deepEqual(sec.daily.items, [{ title: 'Oct 13 2026 · △ Fox', text: `Torn on floor 5 · 4 / ${BOSS_FLOOR} floors · 20 scraps` }]);
});

test('stats: practice dailies are listed with no scraps; telemetry summary', () => {
  let meta = createMeta();
  const first = claimDaily(meta, createRun({ seed: 'x', spirit: 'fox', daily: '2026-10-14' }));
  meta = end(first.meta, { ...first.run, status: 'won', cleared: 3 }, 'won', 30);
  const again = claimDaily(meta, createRun({ seed: 'x', spirit: 'fox', daily: '2026-10-14' }));
  assert.equal(again.run.practice, true);
  meta = end(again.meta, { ...again.run, status: 'lost', cleared: 1, floor: 2 }, 'lost', 0);
  const recent = statsView(meta, NOW).sections.find((s) => s.id === 'recent').items;
  assert.equal(recent[0].title, 'Daily · Oct 14 (practice) · △ Fox');
  assert.match(recent[0].text, /no scraps$/);
  meta = { ...meta, scraps: 200 };
  meta = buyUnlock(meta, 'spirit', 'frog').meta;
  assert.deepEqual(metaSummary(meta, NOW), {
    scraps: 170, earned: 30, runs: 2, won: 1, unlocks: { spirit: 1, relic: 0, palette: 0 }, dailyDays: 1, dailyStreak: 1,
  });
});

test('stats: Settings > Data has Reset progress (title only, by its action)', () => {
  const data = SETTINGS_GROUPS.find((g) => g.id === 'data');
  const row = data.rows.find((r) => r.id === 'reset-progress');
  assert.ok(row);
  assert.equal(row.action, 'resetProgress');
  // What the reset leaves: a fresh meta, the same as a new player's.
  assert.deepEqual(parseMeta(createMeta()), createMeta());
});
