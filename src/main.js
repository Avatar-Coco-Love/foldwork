// Bootstrap: wires renderer, viewport tracking, palette and screen router.
//
// Dev URL params (handy for testing viewports):
//   ?screen=floor   jump straight to a screen
//   ?size=7         board size for the floor screen (5–8)
//   ?seed=abc       run seed (default: random)
//   ?palette=night-ink   palette for this session (else the saved setting)
//   ?demo=1         seeded demo board with walls, voids and stacks
//   ?speed=slow     animation speed for this session (slow|normal|fast)
//   ?motion=on      reduced motion for this session (system|on|off)
//   ?charges=1      fold charges for the floor (default 3)
//   ?mites=0        Scrap Mites on the floor (default: the map's, or 2 scattered)
//   ?map=sandbox    hand-made dev floor (core/maps.js DEV_MAPS) instead of
//                   the floor's seeded template; ?size= or ?demo=1 gives an
//                   open dev board
//   ?floor=2        start the floor screen on this floor (with ?screen=floor)
//   ?screen=offer&cleared=4   the relic offer after clearing that floor
//   ?relics=extra-crease,spring-crease   start runs with these relics
//                   (core/relics.js ids, or 'all')
//   ?spirit=frog    spirit for runs started without the select screen
//                   (?screen=floor, ?screen=offer); default none
//   ?unlocks=all    own every unlock this session (shop, spirits, relic
//                   pool, palettes); nothing is bought or saved
//   ?challenge=123  a friend's challenge link (not a dev param): the title
//                   offers a run on that seed (ui/share.js)
//   ?telemetry=console   log telemetry events (also: off, or a localhost
//                   collector URL, see tools/telemetry-collector.js)

import { createRenderer } from './render/renderer.js';
import { HUD_METRICS } from './render/layout.js';
import { getPalette, cssVarName, DEFAULT_PALETTE_ID } from './render/palette.js';
import { createRouter } from './ui/router.js';
import { createBackButton } from './ui/backButton.js';
import {
  titleScreen, floorScreen, howToScreen, offerScreen, spiritScreen,
  summaryScreen, settingsScreen, saveCodeScreen,
} from './ui/screens.js';
import { unlocksScreen } from './ui/unlocks.js';
import { challengeSeed, CHALLENGE_PARAM } from './ui/share.js';
import { setupTelemetry, telemetryActive } from './telemetry/browser.js';
import { TELEMETRY } from './config.js';
import { createRun, runTag, rollOffer, RELIC_POOL_ALL } from './core/run.js';
import { RELIC_DEFS, isRelic } from './core/relics.js';
import { isSpirit } from './core/spirits.js';
import {
  loadSettings, saveSettings, normalizeSettings, resolveMotion, textScale,
} from './ui/settings.js';
import { createSave } from './core/save.js';
import { createSaveStore } from './ui/saveStore.js';
import { createMetaStore } from './ui/metaStore.js';
import { bankScraps } from './core/meta.js';
import {
  owns, buyUnlock, relicPool, newlyAffordable,
} from './core/unlocks.js';
import { runScraps } from './core/scraps.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const canvas = document.getElementById('board');
const uiRoot = document.getElementById('ui');
const rootStyle = document.documentElement.style;

// HUD sizes come from one place (layout.js) so the canvas board and the DOM
// HUD never disagree about how much space the HUD takes.
rootStyle.setProperty('--hud-top', HUD_METRICS.top + 'px');
rootStyle.setProperty('--hud-bottom', HUD_METRICS.bottom + 'px');
rootStyle.setProperty('--hud-side', HUD_METRICS.side + 'px');

const renderer = createRenderer(canvas);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

// Saved settings, with dev URL overrides applied for this session only.
const saved = loadSettings();
const settingsOverride = normalizeSettings({
  ...saved,
  palette: params.palette || saved.palette,
  animSpeed: params.speed || saved.animSpeed,
  reducedMotion: params.motion || saved.reducedMotion,
});

const tele = setupTelemetry({ enabled: settingsOverride.telemetry === 'on', override: params.telemetry || '' });
const newSeed = () => params.seed || String(Math.floor(Math.random() * 2 ** 32));
const devRelics = params.relics === 'all'
  ? Object.keys(RELIC_DEFS)
  : String(params.relics || '').split(',').filter(isRelic);
const devSpirit = isSpirit(params.spirit) ? params.spirit : null;
// Dev params that change how runs start or play. Such runs are never
// saved, so testing with them can't overwrite the player's run.
const DEV_RUN_PARAMS = ['screen', 'floor', 'seed', 'relics', 'spirit', 'charges', 'mites', 'map', 'size', 'demo', 'unlocks'];
const devRun = DEV_RUN_PARAMS.some((k) => k in params);
// core/unlocks.js options: dev ?unlocks=all owns everything.
const unlockOpts = { all: params.unlocks === 'all' };
const saves = createSaveStore();
const metaStore = createMetaStore();
const newRunId = () => `r_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const ctx = {
  seed: newSeed(),
  /** The seed a friend's challenge link offers (title screen), or null. */
  challenge: challengeSeed(params),
  /** The run in progress (core/run.js), or null. Screens replace it as it advances. */
  run: null,
  /** The run that just ended, won or lost (run summary screen), or null. */
  lastRun: null,
  /**
   * Paper scraps for ctx.lastRun: { earned (core/scraps.js), total (the
   * bank after it), banked (false for dev runs, which never bank) }.
   */
  lastScraps: null,
  /** Meta-progression (core/meta.js): paper scraps and unlocks. */
  meta: metaStore.load(),
  /** core/unlocks.js options for this session (dev ?unlocks=all). */
  unlockOpts,
  /** Whether the player has `kind`/`id` (core/unlocks.js). */
  owns(kind, id) {
    return owns(ctx.meta, kind, id, unlockOpts);
  },
  /**
   * Buy `kind`/`id` with paper scraps (unlocks shop) and save the meta.
   * Returns core/unlocks.js buyUnlock's result. Dev ?unlocks=all buys
   * nothing.
   */
  buy(kind, id) {
    if (unlockOpts.all) return { ok: false, reason: 'owned', meta: ctx.meta };
    const result = buyUnlock(ctx.meta, kind, id);
    if (result.ok) {
      ctx.meta = result.meta;
      metaStore.write(ctx.meta);
    }
    return result;
  },
  /** The relics a run on the player's own unlocks may offer. */
  relicPool() {
    return relicPool(ctx.meta, unlockOpts);
  },
  /** Telemetry id of the run in progress (kept in its save). */
  runId: null,
  telemetry: tele.telemetry,
  /** How the latest input was made: 'key', 'mouse', 'touch', 'pen'. */
  inputSource: tele.inputSource,
  /** Whether the "Share play data" toggle is offered (config TELEMETRY.collect). */
  telemetryOffered: TELEMETRY.collect,
  /**
   * Start a new run as `spirit` (spirit select; dev runs use ?spirit=): a
   * fresh seed (unless ?seed= pins one, or `seed` is a challenge's, or
   * the last run's for `retry`) and run id. Its relic pool is the
   * player's unlocks, or every relic for `openPool` (challenge runs, and
   * a retry of one), so everyone on that seed draws from the same pool.
   */
  startRun({
    floor = 1, spirit = devSpirit, seed = null, retry = false, openPool = false,
  } = {}) {
    ctx.seed = seed || newSeed();
    const pool = openPool ? RELIC_POOL_ALL : ctx.relicPool();
    ctx.run = createRun({
      seed: ctx.seed, relics: devRelics, floor, spirit, pool,
    });
    ctx.runId = newRunId();
    ctx.telemetry.setRun(ctx.runId);
    ctx.telemetry.track('run.start', {
      ...runTag(ctx.run), daily: false, challenge: !!seed && !retry, retry, lastFloor: ctx.run.lastFloor,
    });
    ctx.saveRun();
  },
  /** Drop the challenge (taken, or Not now), and its link from the address bar. */
  clearChallenge() {
    ctx.challenge = null;
    try {
      const url = new URL(location.href);
      url.searchParams.delete(CHALLENGE_PARAM);
      history.replaceState(history.state, '', url.href);
    } catch {
      // The address keeps the link; the title just won't offer it again.
    }
  },
  /**
   * Play a run loaded from a save code (Settings > Data, title screen; the
   * panel already asked before replacing a saved run): any run in
   * progress ends as abandoned, and the loaded one carries on as a new
   * run id, at the start of its floor or on its relic offer.
   */
  loadRun(run) {
    ctx.abandonRun();
    ctx.run = run;
    ctx.seed = run.seed;
    ctx.runId = newRunId();
    ctx.telemetry.setRun(ctx.runId);
    ctx.telemetry.track('run.load', {
      ok: true, ...runTag(run), cleared: run.cleared, lastFloor: run.lastFloor, offer: !!run.offer,
    });
    ctx.saveRun();
    if (run.offer) ctx.router.go('offer', { floor: run.floor });
    else ctx.router.go('floor', { floor: run.floor });
  },
  /**
   * Save the run in progress (core/save.js), with the floor being played:
   * { floor, templateId, variant, actions } or null between floors. A run
   * that is over clears the save. Dev runs are never saved.
   */
  saveRun(floor = null) {
    if (devRun) return;
    if (!ctx.run || ctx.run.status !== 'playing') {
      saves.clear();
      return;
    }
    saves.write(createSave({ run: ctx.run, runId: ctx.runId, floor, at: Date.now() }));
  },
  /** The saved run to continue (title screen), or null. */
  savedRun() {
    return devRun ? null : saves.load();
  },
  /**
   * Continue the saved run: on its relic offer if one is waiting, else on
   * its floor, replaying the floor's saved actions (floor screen).
   */
  continueRun() {
    const save = ctx.savedRun();
    if (!save) return false;
    ctx.run = save.run;
    ctx.seed = save.run.seed;
    ctx.runId = save.runId || newRunId();
    ctx.telemetry.setRun(ctx.runId);
    ctx.telemetry.track('run.resume', {
      ...runTag(ctx.run), cleared: ctx.run.cleared, lastFloor: ctx.run.lastFloor, offer: !!ctx.run.offer, savedMs: Date.now() - save.at,
    });
    if (ctx.run.offer) ctx.router.go('offer', { floor: ctx.run.floor });
    else ctx.router.go('floor', { floor: ctx.run.floor, resume: save });
    return true;
  },
  /**
   * Give up the run in progress, or the saved one, to start a new run:
   * reported as abandoned, save cleared.
   */
  abandonRun() {
    const save = !ctx.run && ctx.savedRun();
    if (save) {
      ctx.run = save.run;
      ctx.runId = save.runId;
      ctx.telemetry.setRun(save.runId);
    }
    ctx.endRun('abandoned');
  },
  /**
   * Record the run's end (won, lost, or abandoned when the player starts a
   * new run over it), clear it and its save. A won or lost run banks its
   * paper scraps (an abandoned one earns none). Safe to call more than once.
   */
  endRun(outcome) {
    if (!devRun) saves.clear();
    const run = ctx.run;
    if (!run) return;
    ctx.run = null;
    ctx.runId = null;
    let scraps = 0;
    if (outcome !== 'abandoned') {
      const earned = runScraps(run);
      scraps = earned.total;
      let unlocks = [];
      if (!devRun) {
        const before = ctx.meta;
        ctx.meta = bankScraps(ctx.meta, scraps);
        metaStore.write(ctx.meta);
        unlocks = newlyAffordable(before, ctx.meta);
      }
      ctx.lastRun = run;
      ctx.lastScraps = {
        earned, total: ctx.meta.scraps, banked: !devRun, affordable: unlocks,
      };
    }
    ctx.telemetry.track('run.end', {
      ...runTag(run), outcome, cause: run.cause, cleared: run.cleared, lastFloor: run.lastFloor, foldKills: run.foldKills || 0, scraps,
    });
    ctx.telemetry.flush();
    ctx.telemetry.setRun(null);
  },
  renderer,
  router: null,
  settings: settingsOverride,
  updateSettings(patch) {
    const before = ctx.settings;
    ctx.settings = normalizeSettings({ ...ctx.settings, ...patch });
    saveSettings(ctx.settings);
    applySettings();
    // Opting out drops anything unsent and records nothing more.
    if (before.telemetry !== ctx.settings.telemetry) {
      ctx.telemetry.setEnabled(telemetryActive(ctx.settings.telemetry === 'on', params.telemetry || ''));
    }
    ctx.telemetry.track('settings.change', { patch, settings: ctx.settings });
  },
  /** Effective { speed, reducedMotion } for render/fx.js. */
  motion() {
    return resolveMotion(ctx.settings, reducedMotionQuery.matches);
  },
  setPalette(id) {
    const palette = getPalette(id);
    renderer.setPalette(palette.id);
    for (const [token, value] of Object.entries(palette)) {
      if (typeof value === 'string') rootStyle.setProperty(cssVarName(token), value);
    }
    rootStyle.colorScheme = palette.scheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
  },
};
const backButton = createBackButton();
ctx.router = createRouter(uiRoot, ctx, {
  onGo: (name, p) => {
    backButton.screenChanged(name);
    ctx.telemetry.track('screen.view', { name, floor: p.floor ?? null });
  },
});

// CSS honors the in-game reduced-motion setting too, not just the OS query.
function applyMotionClass() {
  document.documentElement.classList.toggle('reduce-motion', ctx.motion().reducedMotion);
}
reducedMotionQuery.addEventListener?.('change', applyMotionClass);

/**
 * The palette to show: the setting's, or the default when the player
 * doesn't own it (progress reset, a save from elsewhere). Dev ?palette=
 * shows any.
 */
function shownPalette() {
  const id = ctx.settings.palette;
  return params.palette || ctx.owns('palette', id) ? id : DEFAULT_PALETTE_ID;
}

/** Everything the settings change outside the game screens. */
function applySettings() {
  const s = ctx.settings;
  if (renderer.palette.id !== shownPalette()) ctx.setPalette(shownPalette());
  const left = s.hand === 'left';
  document.documentElement.toggleAttribute('data-left-handed', left);
  renderer.setLeftHanded(left);
  rootStyle.setProperty('--text-scale', String(textScale(s)));
  applyMotionClass();
}

ctx.router
  .register('title', titleScreen)
  .register('floor', floorScreen)
  .register('savecode', saveCodeScreen)
  .register('offer', offerScreen)
  .register('spirit', spiritScreen)
  .register('howto', howToScreen)
  .register('settings', settingsScreen)
  .register('summary', summaryScreen)
  .register('unlocks', unlocksScreen);

// --- Viewport tracking -----------------------------------------------------

function readSafeInsets() {
  const cs = getComputedStyle(document.documentElement);
  const px = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
  return {
    top: px('--safe-top'),
    right: px('--safe-right'),
    bottom: px('--safe-bottom'),
    left: px('--safe-left'),
  };
}

function onResize() {
  const vv = window.visualViewport;
  const w = Math.round(vv ? vv.width : window.innerWidth);
  const h = Math.round(vv ? vv.height : window.innerHeight);
  renderer.resize(w, h, readSafeInsets());
}

let resizeQueued = false;
function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    onResize();
  });
}

window.addEventListener('resize', queueResize);
window.visualViewport?.addEventListener('resize', queueResize);
window.matchMedia('(orientation: landscape)').addEventListener?.('change', queueResize);
// Block pinch zoom / double-tap zoom gestures that slip past the viewport meta.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// --- Start -----------------------------------------------------------------

ctx.setPalette(shownPalette());
applySettings();
onResize();
ctx.telemetry.track('session.start', {
  device: tele.deviceInfo(),
  settings: ctx.settings,
  palette: renderer.palette.id,
  entry: {
    screen: params.screen || 'title',
    dev: Object.keys(params).filter((k) => k !== 'telemetry' && k !== CHALLENGE_PARAM),
    challenge: !!ctx.challenge,
  },
});
ctx.telemetry.flush(); // anything left from an offline session
if (params.screen === 'floor') ctx.startRun({ floor: Number(params.floor) || 1 });
// Dev: the relic offer after clearing floor ?cleared= (4 or 7 shows rest).
if (params.screen === 'offer') {
  const cleared = Number(params.cleared) || 1;
  ctx.startRun({ floor: cleared + 1 });
  ctx.run = { ...ctx.run, cleared, offer: rollOffer(ctx.run, cleared) };
}
const startScreen = ctx.router.has(params.screen) ? params.screen : 'title';
ctx.router.go(startScreen, {
  floor: Number(params.floor) || 1,
  size: params.size,
  map: params.map,
  demo: params.demo === '1',
  charges: params.charges != null ? Number(params.charges) : undefined,
  mites: params.mites != null ? Number(params.mites) : undefined,
});
