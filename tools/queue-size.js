// Telemetry queue sizing (9i): plays scripted runs through core/ and sends
// the events the game would send through a real telemetry client with no
// endpoint, then reports event counts and stored bytes per run, so
// TELEMETRY.maxQueue / maxBytes can hold a week of offline daily play.
//
// Usage: node tools/queue-size.js [runs=4] [--days 7] [--per-day 3]
//
// Each floor plays its proven winning line (stored line or the floor
// check's solution); its log is padded the way a person plays (a refused
// bump and a step taken back every few actions, cancelled fold previews),
// with hints on the early floors. Real logs will
// vary; the padding errs long. The last run is lost on floor 3 so a mix of
// short and full runs is measured.

import { createTelemetry, eventBytes, trimTier } from '../src/telemetry/telemetry.js';
import { createFloorRecorder } from '../src/telemetry/floorRecorder.js';
import { createRun, floorSetupFor, finishFloor, takeOffer, runTag } from '../src/core/run.js';
import { generateFloor, templateById, buildFloor, checkFloor } from '../src/core/floors.js';
import { createFloorState, act } from '../src/core/turn.js';
import { APP_VERSION, LOGIC_VERSION } from '../src/config.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? Number(args[at + 1]) : fallback;
};
const runs = Number(args.find((a) => /^\d+$/.test(a))) || 4;
const days = opt('--days', 7);
const perDay = opt('--per-day', 3);

// A realistic session.start device block (the largest fixed payload).
const DEVICE = {
  viewport: { w: 390, h: 844 }, screen: { w: 390, h: 844 }, dpr: 3, orientation: 'portrait',
  pointer: 'coarse', hover: false, touchPoints: 5, reducedMotion: false, colorScheme: 'light',
  lang: 'en-US', tzOffset: 300, standalone: true,
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
const SETTINGS = {
  speed: 'normal', motion: 'system', palette: 'paper', leftHanded: false, tapConfirm: false,
  telemetry: 'on', volume: 0.8, sfx: 0.8, music: 0.5, textSize: 'normal',
};

let clock = Date.UTC(2026, 9, 15);
const tick = (ms) => (clock += ms);

function solutionFor(info) {
  const built = buildFloor(templateById(info.templateId), info.variant);
  const check = checkFloor(built, { maxStates: 20000, maxTurns: 40 }, { needs: false });
  return check.solution.actions || [];
}

/** One run's events through `tel`. `loseOn`: floor number to lose on. */
function playRun(tel, n, { loseOn = 0 } = {}) {
  const seed = `size-${n}`;
  let run = createRun({ seed, spirit: n % 2 ? 'fox' : null });
  tel.setRun(`r_${n}`);
  tel.track('screen.view', { name: 'spirit', floor: null });
  tel.track('spirit.pick', { ...runTag(run), index: 0, offered: ['fox', 'frog', 'turtle'] });
  tel.track('run.start', { ...runTag(run), daily: null, practice: false, challenge: false, retry: false, lastFloor: run.lastFloor });
  while (run.status === 'playing') {
    const { setup, info } = generateFloor(run.floor, seed);
    const floorTag = {
      floor: run.floor, seed, source: 'template', templateId: info.templateId, variant: info.variant,
      loadout: { spirit: run.spirit, relics: run.relics.slice(), hp: run.hp, maxHp: run.maxHp, landings: run.landings, rewinds: run.rewinds },
    };
    let state = createFloorState(floorSetupFor(run, setup));
    tel.track('screen.view', { name: 'floor', floor: run.floor });
    tel.track('floor.start', {
      ...floorTag, map: null, attempt: info.attempt, checked: info.checked, size: state.board.w,
      charges: state.maxCharges, enemies: setup.enemies.map((e) => ({ kind: e.kind, col: e.col, row: e.row })),
    });
    const rec = createFloorRecorder(() => clock);
    if (run.floor <= 3) {
      tel.track('hint.show', { ...floorTag, id: `tip-${run.floor}`, turn: 0 });
      tick(4000);
      tel.track('hint.dismiss', { ...floorTag, id: `tip-${run.floor}`, by: 'player', ms: 4000 });
      rec.hintShown();
    }
    const line = run.floor === loseOn ? [] : solutionFor(info);
    let i = 0;
    for (const action of line) {
      // Person-like padding: a refused bump into the edge, a step taken back.
      if (i % 4 === 1) rec.action({ type: 'move', dir: 'up' }, 'touch', { ok: false, reason: 'blocked' });
      // (Padding is logged only; the floor itself plays the proven line.)
      if (i % 5 === 2 && action.type !== 'fold') {
        rec.action(action, 'touch', { ok: true, tookTurn: true });
        rec.action({ type: 'undo' }, 'touch', { ok: true });
      }
      if (action.type === 'fold') {
        rec.preview(action.crease);
        rec.preview(null);
        rec.preview(action.crease);
        rec.foldAttempt();
      }
      tick(1800);
      const r = act(state, action);
      rec.action(action, 'touch', { ok: r.ok, reason: r.reason, tookTurn: r.ok });
      if (r.ok) state = r.state;
      i++;
    }
    if (run.floor === loseOn) {
      tel.track('hint.ask', { ...floorTag, level: 1, count: 1, turn: state.turn });
      state = { ...state, status: 'lost', outcome: { cause: 'scrap-mite' } };
    }
    const won = state.status === 'won';
    tel.track('floor.end', {
      ...floorTag, outcome: won ? 'won' : 'lost', cause: (state.outcome && state.outcome.cause) || null,
      turn: state.turn, chargesLeft: state.charges, keys: state.keys, hp: run.hp, ...rec.summary(),
    });
    if (!won) state = { ...state, status: 'lost' };
    run = finishFloor(run, state);
    if (run.offer) {
      tel.track('screen.view', { name: 'offer', floor: run.floor });
      tel.track('relic.offer', { ...runTag(run), cleared: run.offer.floor, offered: run.offer.relics.slice(), rest: run.offer.rest });
      const pick = run.offer.relics[0] || (run.offer.rest ? 'rest' : null);
      const offered = run.offer.relics.slice();
      const cleared = run.offer.floor;
      run = takeOffer(run, pick);
      tel.track('relic.pick', { ...runTag(run), cleared, pick, index: 0, offered });
    }
  }
  tel.track('run.end', {
    ...runTag(run), outcome: run.status, cause: run.cause, cleared: run.cleared, lastFloor: run.lastFloor,
    foldKills: run.foldKills, scraps: 12, daily: null, practice: false,
  });
  tel.track('screen.view', { name: 'summary', floor: null });
  tel.setRun(null);
  return run;
}

function session(tel) {
  tel.track('session.start', {
    device: DEVICE, settings: SETTINGS, palette: 'paper',
    meta: { scraps: 40, earned: 120, runs: 9, won: 2, unlocks: { relic: 3, spirit: 1 }, dailyDays: 4, dailyStreak: 2 },
    entry: { screen: 'title', dev: [], challenge: false },
  });
  tel.track('screen.view', { name: 'title', floor: null });
}

let ids = 0;
const tel = createTelemetry({
  endpoint: '', app: APP_VERSION, logic: LOGIC_VERSION, storage: null, now: () => clock,
  newId: (p) => `${p}_${String(ids++).padStart(20, '0')}`, maxQueue: Infinity,
});
const perRun = [];
for (let n = 0; n < runs; n++) {
  const before = tel.queue.length;
  const lost = n === runs - 1;
  session(tel);
  const end = playRun(tel, n, { loseOn: lost ? 3 : 0 });
  tel.track('session.hide', { ms: 900000 });
  const events = tel.queue.slice(before);
  perRun.push({ lost, end, count: events.length, bytes: events.reduce((s, e) => s + eventBytes(e), 0), events });
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
console.log('Per session (one run each):');
for (const [i, r] of perRun.entries()) {
  const big = r.events.filter((e) => e.type === 'floor.end').reduce((s, e) => s + eventBytes(e), 0);
  console.log(`  run ${i}${r.lost ? ' (lost on F3)' : ` (${r.end.status}, ${r.end.cleared} cleared)`}: ${r.count} events, ${kb(r.bytes)} (floor.end ${kb(big)})`);
}
const full = perRun.filter((r) => r.end.status === 'won');
const avg = (k) => full.reduce((s, r) => s + r[k], 0) / full.length;
console.log(`Full run average: ${avg('count').toFixed(0)} events, ${kb(avg('bytes'))}`);
const byTier = {};
for (const r of full) for (const e of r.events) {
  const t = trimTier(e.type);
  byTier[t] = byTier[t] || { n: 0, b: 0 };
  byTier[t].n += 1;
  byTier[t].b += eventBytes(e);
}
console.log('By trim tier (full runs):', Object.entries(byTier).map(([t, v]) => `${t}: ${v.n} ev ${kb(v.b)}`).join(', '));
const week = days * perDay;
console.log(`${days} days x ${perDay} full runs: ${(avg('count') * week).toFixed(0)} events, ${kb(avg('bytes') * week)}`);
