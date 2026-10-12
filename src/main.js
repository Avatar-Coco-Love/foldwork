// Bootstrap: wires renderer, viewport tracking, palette and screen router.
//
// Dev URL params (handy for testing viewports):
//   ?screen=floor   jump straight to a screen
//   ?size=7         board size for the floor screen (5–8)
//   ?seed=abc       run seed (default: random)
//   ?palette=night-ink
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
//   ?telemetry=console   log telemetry events (also: off, or a localhost
//                   collector URL, see tools/telemetry-collector.js)

import { createRenderer } from './render/renderer.js';
import { HUD_METRICS } from './render/layout.js';
import { getPalette, cssVarName } from './render/palette.js';
import { createRouter } from './ui/router.js';
import { titleScreen, floorScreen, howToScreen, offerScreen } from './ui/screens.js';
import { setupTelemetry, telemetryActive } from './telemetry/browser.js';
import { TELEMETRY } from './config.js';
import { createRun, runTag, rollOffer } from './core/run.js';
import { RELIC_DEFS, isRelic } from './core/relics.js';
import { loadSettings, saveSettings, normalizeSettings, resolveMotion } from './ui/settings.js';

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
  animSpeed: params.speed || saved.animSpeed,
  reducedMotion: params.motion || saved.reducedMotion,
});

const tele = setupTelemetry({ enabled: settingsOverride.telemetry === 'on', override: params.telemetry || '' });
const newSeed = () => params.seed || String(Math.floor(Math.random() * 2 ** 32));
const devRelics = params.relics === 'all'
  ? Object.keys(RELIC_DEFS)
  : String(params.relics || '').split(',').filter(isRelic);

const ctx = {
  seed: newSeed(),
  /** The run in progress (core/run.js), or null. Screens replace it as it advances. */
  run: null,
  telemetry: tele.telemetry,
  /** How the latest input was made: 'key', 'mouse', 'touch', 'pen'. */
  inputSource: tele.inputSource,
  /** Whether the "Share play data" toggle is offered (config TELEMETRY.collect). */
  telemetryOffered: TELEMETRY.collect,
  /** Start a new run: a fresh seed (unless ?seed= pins one) and run id. */
  startRun({ floor = 1 } = {}) {
    ctx.seed = newSeed();
    ctx.run = createRun({ seed: ctx.seed, relics: devRelics, floor });
    ctx.telemetry.setRun(`r_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`);
    ctx.telemetry.track('run.start', { ...runTag(ctx.run), daily: false, lastFloor: ctx.run.lastFloor });
  },
  /**
   * Record the run's end (won, lost, or abandoned when the player leaves
   * mid-run) and clear it. Safe to call more than once.
   */
  endRun(outcome) {
    const run = ctx.run;
    if (!run) return;
    ctx.run = null;
    ctx.telemetry.track('run.end', { ...runTag(run), outcome, cause: run.cause, cleared: run.cleared, lastFloor: run.lastFloor });
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
    applyMotionClass();
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
ctx.router = createRouter(uiRoot, ctx, {
  onGo: (name, p) => ctx.telemetry.track('screen.view', { name, floor: p.floor ?? null }),
});

// CSS honors the in-game reduced-motion setting too, not just the OS query.
function applyMotionClass() {
  document.documentElement.classList.toggle('reduce-motion', ctx.motion().reducedMotion);
}
reducedMotionQuery.addEventListener?.('change', applyMotionClass);
applyMotionClass();

ctx.router
  .register('title', titleScreen)
  .register('floor', floorScreen)
  .register('offer', offerScreen)
  .register('howto', howToScreen);

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

ctx.setPalette(params.palette);
onResize();
ctx.telemetry.track('session.start', {
  device: tele.deviceInfo(),
  settings: ctx.settings,
  palette: renderer.palette.id,
  entry: { screen: params.screen || 'title', dev: Object.keys(params).filter((k) => k !== 'telemetry') },
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
