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

import { createRenderer } from './render/renderer.js';
import { HUD_METRICS } from './render/layout.js';
import { getPalette, cssVarName } from './render/palette.js';
import { createRouter } from './ui/router.js';
import { titleScreen, floorScreen } from './ui/screens.js';
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

const ctx = {
  seed: params.seed || String(Math.floor(Math.random() * 2 ** 32)),
  renderer,
  router: null,
  settings: settingsOverride,
  updateSettings(patch) {
    ctx.settings = normalizeSettings({ ...ctx.settings, ...patch });
    saveSettings(ctx.settings);
    applyMotionClass();
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
ctx.router = createRouter(uiRoot, ctx);

// CSS honors the in-game reduced-motion setting too, not just the OS query.
function applyMotionClass() {
  document.documentElement.classList.toggle('reduce-motion', ctx.motion().reducedMotion);
}
reducedMotionQuery.addEventListener?.('change', applyMotionClass);
applyMotionClass();

ctx.router.register('title', titleScreen).register('floor', floorScreen);

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
const startScreen = ctx.router.has(params.screen) ? params.screen : 'title';
ctx.router.go(startScreen, {
  floor: 1,
  size: params.size,
  demo: params.demo === '1',
  charges: params.charges != null ? Number(params.charges) : undefined,
});
