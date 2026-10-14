// Stats & History (docs/04 screen 9, Phase 7e): what the player has done
// over all their runs. Pure; no DOM. The record lives in the meta
// (core/meta.js) as `meta.stats`; the daily history is `meta.daily`
// (core/daily.js), read here for the list and the streaks.
//
//   Stats = {
//     runs,       runs ended (won, lost or given up)
//     won, lost,
//     abandoned,  given up (a new run started over it)
//     cleared,    floors cleared, over all runs
//     foldKills,  enemies killed by the player's folds
//     crane,      Great Crane wins
//     best,       null, or the run that cleared the most floors (the first
//                 to reach that many): RunRecord
//     spirits,    { [spirit id, or 'none']: { runs, won, best } }; best is
//                 the most floors that spirit cleared in one run
//     recent,     [RunRecord], newest first, at most RECENT_RUNS
//   }
//   RunRecord = {
//     at,         when it ended (ms since epoch)
//     spirit,     spirit id or null
//     outcome,    'won' | 'lost' | 'abandoned'
//     floor,      the floor it ended on
//     cleared,    floors cleared
//     lastFloor,  floors in the run
//     scraps,     paper scraps it banked
//     daily,      the daily's date, or null
//     practice,   a practice daily
//   }
//
// User's choices (7e): totals, best run, per spirit and recent runs; the
// daily history is a list of days with the current and best streaks.
// Stats were first kept in 7e, so an older meta's earlier runs (meta.runs)
// aren't in them; statsView says how many.

import { BOSS_FLOOR } from './run.js';
import { spiritDef, SPIRIT_DEFS } from './spirits.js';
import { dailyDate, dailyLabel, dailyResultText, dayNumber } from './daily.js';

/** How many runs the recent list keeps. */
export const RECENT_RUNS = 20;

export const RUN_OUTCOMES = Object.freeze(['won', 'lost', 'abandoned']);

/** The spirits table key for a run with no spirit. */
const NO_SPIRIT = 'none';

/** A new player's stats. */
export function createStats() {
  return {
    runs: 0, won: 0, lost: 0, abandoned: 0, cleared: 0, foldKills: 0, crane: 0, best: null, spirits: {}, recent: [],
  };
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** A RunRecord read back, or null when it isn't one. */
function parseRecord(r) {
  if (!r || typeof r !== 'object' || !RUN_OUTCOMES.includes(r.outcome)) return null;
  return {
    ...r,
    at: Number.isFinite(r.at) ? r.at : 0,
    spirit: typeof r.spirit === 'string' ? r.spirit : null,
    floor: count(r.floor),
    cleared: count(r.cleared),
    lastFloor: count(r.lastFloor),
    scraps: count(r.scraps),
    daily: typeof r.daily === 'string' ? r.daily : null,
    practice: !!r.practice,
  };
}

/** meta.stats read back: missing or broken fields start at zero; others kept. */
export function parseStats(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return createStats();
  const spirits = {};
  if (data.spirits && typeof data.spirits === 'object' && !Array.isArray(data.spirits)) {
    for (const [id, s] of Object.entries(data.spirits)) {
      if (s && typeof s === 'object') spirits[id] = { ...s, runs: count(s.runs), won: count(s.won), best: count(s.best) };
    }
  }
  return {
    ...data,
    runs: count(data.runs),
    won: count(data.won),
    lost: count(data.lost),
    abandoned: count(data.abandoned),
    cleared: count(data.cleared),
    foldKills: count(data.foldKills),
    crane: count(data.crane),
    best: parseRecord(data.best),
    spirits,
    recent: Array.isArray(data.recent) ? data.recent.map(parseRecord).filter(Boolean).slice(0, RECENT_RUNS) : [],
  };
}

/** The RunRecord for `run` ending as `outcome` at `at`, having banked `scraps`. */
export function runRecord(run, outcome, scraps = 0, at = 0) {
  return {
    at,
    spirit: run.spirit ?? null,
    outcome,
    floor: run.floor,
    cleared: run.cleared,
    lastFloor: run.lastFloor,
    scraps: count(scraps),
    daily: run.daily || null,
    practice: !!run.practice,
  };
}

/**
 * The meta after a run ends (`outcome`: 'won', 'lost' or 'abandoned'),
 * having banked `scraps`, at `at` (ms since epoch).
 */
export function recordRun(meta, run, outcome, scraps = 0, at = 0) {
  if (!run || !RUN_OUTCOMES.includes(outcome)) return meta;
  const s = parseStats(meta.stats);
  const rec = runRecord(run, outcome, scraps, at);
  const key = rec.spirit || NO_SPIRIT;
  const sp = s.spirits[key] || { runs: 0, won: 0, best: 0 };
  const won = outcome === 'won';
  const stats = {
    ...s,
    runs: s.runs + 1,
    won: s.won + (won ? 1 : 0),
    lost: s.lost + (outcome === 'lost' ? 1 : 0),
    abandoned: s.abandoned + (outcome === 'abandoned' ? 1 : 0),
    cleared: s.cleared + rec.cleared,
    foldKills: s.foldKills + count(run.foldKills),
    crane: s.crane + (won && run.lastFloor === BOSS_FLOOR ? 1 : 0),
    best: !s.best || rec.cleared > s.best.cleared ? rec : s.best,
    spirits: {
      ...s.spirits,
      [key]: {
        ...sp, runs: sp.runs + 1, won: sp.won + (won ? 1 : 0), best: Math.max(sp.best, rec.cleared),
      },
    },
    recent: [rec, ...s.recent].slice(0, RECENT_RUNS),
  };
  return { ...meta, stats };
}

/**
 * Daily streaks from meta.daily: { current, best, days }. A day counts
 * when its scored run was played (any result). The current streak runs
 * back from today, or from yesterday while today isn't played yet.
 */
export function dailyStreaks(daily, now = Date.now()) {
  const days = Object.keys(daily || {}).map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const have = new Set(days);
  let day = dayNumber(dailyDate(now));
  if (!have.has(day)) day -= 1;
  let current = 0;
  while (have.has(day)) {
    current += 1;
    day -= 1;
  }
  return { current, best, days: days.length };
}

/** "Fox" (with its glyph), or "No spirit". */
function spiritName(id) {
  if (!id || !SPIRIT_DEFS[id]) return id ? id : 'No spirit';
  const def = spiritDef(id);
  return `${def.glyph} ${def.name}`;
}

const percent = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Oct 14" for a run's end time (UTC, like the daily). */
function dateText(at) {
  return at ? dailyLabel(dailyDate(at)) : '';
}

/**
 * What the Stats & History screen shows: { empty, note, sections: [{ id,
 * title, rows: [{ label, value }] } | { id, title, items: [{ title, text }],
 * empty }] }. Every value is words, so nothing relies on color.
 */
export function statsView(meta, now = Date.now()) {
  const s = parseStats(meta.stats);
  const older = Math.max(0, count(meta.runs) - (s.won + s.lost));
  const streaks = dailyStreaks(meta.daily, now);
  const sections = [];

  sections.push({
    id: 'totals',
    title: 'Totals',
    rows: [
      { label: 'Runs', value: String(s.runs) },
      { label: 'Won', value: `${s.won} (${percent(s.won, s.runs)})` },
      { label: 'Torn', value: String(s.lost) },
      { label: 'Given up', value: String(s.abandoned) },
      { label: 'Floors cleared', value: String(s.cleared) },
      { label: 'Fold kills', value: String(s.foldKills) },
      { label: 'Great Crane beaten', value: String(s.crane) },
      { label: 'Paper scraps earned', value: String(count(meta.earned)) },
    ],
  });

  sections.push({
    id: 'best',
    title: 'Best run',
    rows: s.best
      ? [
        { label: 'Floors cleared', value: `${s.best.cleared} / ${s.best.lastFloor}` },
        { label: 'Result', value: dailyResultText(s.best) },
        { label: 'Spirit', value: spiritName(s.best.spirit) },
        ...(s.best.at ? [{ label: 'Date', value: dateText(s.best.at) }] : []),
      ]
      : [],
    empty: 'No runs yet.',
  });

  const spiritIds = [...Object.keys(SPIRIT_DEFS), NO_SPIRIT, ...Object.keys(s.spirits)]
    .filter((id, i, all) => all.indexOf(id) === i && s.spirits[id] && s.spirits[id].runs);
  sections.push({
    id: 'spirits',
    title: 'By spirit',
    rows: spiritIds.map((id) => {
      const sp = s.spirits[id];
      return {
        label: spiritName(id === NO_SPIRIT ? null : id),
        value: `${plural(sp.runs, 'run')} · ${sp.won} won · best ${sp.best} ${sp.best === 1 ? 'floor' : 'floors'}`,
      };
    }),
    empty: 'No runs yet.',
  });

  sections.push({
    id: 'recent',
    title: 'Recent runs',
    items: s.recent.map((r) => ({
      title: `${r.daily ? `Daily · ${dailyLabel(r.daily)}${r.practice ? ' (practice)' : ''}` : dateText(r.at)} · ${spiritName(r.spirit)}`,
      text: `${dailyResultText(r)} · ${r.cleared} / ${r.lastFloor} floors · ${r.practice ? 'no scraps' : plural(r.scraps, 'scrap')}`,
    })),
    empty: 'No runs yet.',
  });

  const days = Object.keys(meta.daily || {}).sort().reverse();
  sections.push({
    id: 'daily',
    title: 'Daily history',
    rows: days.length
      ? [
        { label: 'Days played', value: String(streaks.days) },
        { label: 'Current streak', value: plural(streaks.current, 'day') },
        { label: 'Best streak', value: plural(streaks.best, 'day') },
      ]
      : [],
    items: days.map((date) => {
      const rec = meta.daily[date];
      const done = rec.outcome !== 'playing';
      return {
        title: `${dailyLabel(date)} ${date.slice(0, 4)} · ${spiritName(rec.spirit)}`,
        text: `${dailyResultText(rec)} · ${rec.cleared} / ${rec.lastFloor} floors${done ? ` · ${plural(rec.scraps, 'scrap')}` : ''}`,
      };
    }),
    empty: 'No daily seeds played yet.',
  });

  return {
    empty: !s.runs && !days.length,
    note: older ? `${plural(older, 'earlier run')} from before stats were kept ${older === 1 ? 'isn\'t' : 'aren\'t'} counted here.` : null,
    sections,
  };
}

/** A short summary of the meta for telemetry (session.start, progress.reset). */
export function metaSummary(meta, now = Date.now()) {
  const s = parseStats(meta.stats);
  const streaks = dailyStreaks(meta.daily, now);
  return {
    scraps: count(meta.scraps),
    earned: count(meta.earned),
    runs: s.runs,
    won: s.won,
    unlocks: Object.fromEntries(Object.entries(meta.unlocks || {}).map(([k, ids]) => [k, Array.isArray(ids) ? ids.length : 0])),
    dailyDays: streaks.days,
    dailyStreak: streaks.current,
  };
}
