// Daily seed (docs/01 modes, docs/05, Phase 7d): one run a day, the same on
// every device. Pure; no DOM.
//
// The day is the UTC date, 'YYYY-MM-DD' (core/rng.js dailySeedString), and
// it is also the run's seed, so everyone playing it gets the same floors
// and relic offers. Daily runs offer every relic and every spirit
// (OPEN-QUESTIONS "Daily seed"), so no one is behind on unlocks.
//
// Attempts (user's choice, 7d): the first daily run started on a day is
// the scored one; its result (won, lost, or abandoned when the player
// starts another run over it) is the day's. Later runs on that day are
// practice: they play the same but earn no paper scraps. The meta keeps
// one record per day played:
//
//   meta.daily = { ['YYYY-MM-DD']: DailyRecord }
//   DailyRecord = {
//     outcome,    'playing' (the scored run hasn't ended) | 'won' | 'lost'
//                 | 'abandoned'
//     spirit,     the spirit it was played with (or null)
//     floor,      the floor it reached (ended on)
//     cleared,    floors cleared
//     lastFloor,  floors in the run
//     scraps,     paper scraps it earned (0 until it ends)
//   }
//
// A run's own fields say it is a daily: run.daily (the date) and
// run.practice (core/run.js createRun).

import { dailySeedString } from './rng.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAILY_OUTCOMES = Object.freeze(['playing', 'won', 'lost', 'abandoned']);

/** Today's daily date (UTC) at `now` (ms since epoch). */
export function dailyDate(now = Date.now()) {
  return dailySeedString(new Date(now));
}

/** Whether `s` is a real date written 'YYYY-MM-DD'. */
export function isDailyDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) && dailySeedString(new Date(ms)) === s;
}

/** Days since 1970-01-01 for a daily date (save codes store this). */
export function dayNumber(date) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** The daily date for a day number. */
export function dateOfDay(n) {
  return dailySeedString(new Date(n * DAY_MS));
}

/** "Oct 14": the date as the game shows it (same words on every device). */
export function dailyLabel(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Daily · Oct 14": a daily run's name. */
export function dailyName(date) {
  return `Daily · ${dailyLabel(date)}`;
}

/** Milliseconds from `now` until the next daily (UTC midnight). */
export function msUntilNextDaily(now = Date.now()) {
  return DAY_MS - (((now % DAY_MS) + DAY_MS) % DAY_MS);
}

/** "New daily in 3h 12m" (or "in 12m" under an hour). */
export function nextDailyText(now = Date.now()) {
  const mins = Math.max(1, Math.ceil(msUntilNextDaily(now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `New daily in ${h ? `${h}h ` : ''}${m}m`;
}

/** The day's record in `meta`, or null when it hasn't been played. */
export function dailyRecord(meta, date) {
  const rec = meta && meta.daily && meta.daily[date];
  return rec && typeof rec === 'object' ? rec : null;
}

/** Whether a run started on `date` now would be practice (the day is played). */
export function isPractice(meta, date) {
  return !!dailyRecord(meta, date);
}

/**
 * A daily run about to be played (started, or loaded from a save code):
 * the scored run if the day has no record yet, which `meta` then gets
 * (outcome 'playing'), else practice. Returns { meta, run }. A run that
 * is not a daily, or already practice, comes back as it is.
 */
export function claimDaily(meta, run) {
  if (!run.daily || run.practice) return { meta, run };
  if (isPractice(meta, run.daily)) return { meta, run: { ...run, practice: true } };
  const rec = {
    outcome: 'playing', spirit: run.spirit ?? null, floor: run.floor, cleared: run.cleared, lastFloor: run.lastFloor, scraps: 0,
  };
  return { meta: { ...meta, daily: { ...(meta.daily || {}), [run.daily]: rec } }, run };
}

/**
 * The meta after a daily run ends (`outcome`: 'won', 'lost' or
 * 'abandoned') having earned `scraps`: the scored run fills in its day's
 * record. Practice runs, other runs and a record already ended change
 * nothing.
 */
export function finishDaily(meta, run, outcome, scraps = 0) {
  if (!run || !run.daily || run.practice) return meta;
  const rec = dailyRecord(meta, run.daily);
  if (!rec || rec.outcome !== 'playing') return meta;
  const done = {
    ...rec, outcome, floor: run.floor, cleared: run.cleared, lastFloor: run.lastFloor, scraps,
  };
  return { ...meta, daily: { ...meta.daily, [run.daily]: done } };
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** meta.daily read back: valid dates and outcomes only; other fields kept. */
export function parseDaily(data) {
  const out = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [date, rec] of Object.entries(data)) {
    if (!isDailyDate(date) || !rec || typeof rec !== 'object' || !DAILY_OUTCOMES.includes(rec.outcome)) continue;
    out[date] = {
      ...rec,
      spirit: typeof rec.spirit === 'string' ? rec.spirit : null,
      floor: count(rec.floor),
      cleared: count(rec.cleared),
      lastFloor: count(rec.lastFloor),
      scraps: count(rec.scraps),
    };
  }
  return out;
}

/** How a day's record reads: "Won", "Torn on floor 5", "Given up on floor 3". */
export function dailyResultText(rec) {
  if (rec.outcome === 'won') return 'Won';
  if (rec.outcome === 'lost') return `Torn on floor ${rec.floor}`;
  if (rec.outcome === 'abandoned') return `Given up on floor ${rec.floor}`;
  return 'Not finished';
}

/**
 * The title's Daily Seed row for the player at `now`: { date, label,
 * note, resume }. `save` is the saved run (core/save.js) or null;
 * `resume` is true when that save is today's scored daily, so the row
 * continues it.
 */
export function dailyTitle(meta, save, now = Date.now()) {
  const date = dailyDate(now);
  const label = dailyName(date);
  const rec = dailyRecord(meta, date);
  const saved = save && save.run;
  const resume = !!(saved && saved.daily === date && !saved.practice && rec && rec.outcome === 'playing');
  let note;
  if (!rec) note = `${label} · the same run for everyone today`;
  else if (resume) note = `${label} · in progress, floor ${saved.floor}`;
  else note = `${label} · ${dailyResultText(rec)} · practice only · ${nextDailyText(now)}`;
  return { date, label, note, resume };
}
