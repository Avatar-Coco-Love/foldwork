// Performance audit (Phase 9f): plays scripted turns in headless Chromium
// with the CPU slowed to roughly a mid-range phone and reports frame times.
//
// Usage (needs Playwright, not a game dependency):
//   npm start &                      # the dev server on :8080
//   node tools/perf-audit.js [baseUrl] [--throttle 4] [--rounds 3] [--gpu]
//                            [--budget ms] [--only name]
//
// Per scenario it plays scripted input (keyboard fold mode sweeping the
// crease preview, folds confirmed and animated, moves, undo) and reports:
//   - draw: the game's own draw passes per frame (render/frameStats.js via
//     ?audit=1), median / 95th percentile / worst;
//   - frames: gaps between animation frames, and how many missed 60fps.
// CPU throttle 4 is DevTools' "mid-tier mobile". Headless Chromium has no
// GPU: it rasterizes the canvas in software, far slower than a phone, and
// a canvas-to-canvas copy (the board cache) rasterizes inside draw. So
// the numbers are for comparing a change against main on the same
// machine (run both), not absolute: check a real device with ?fps=1.
// --gpu uses Chromium's GPU canvas path on SwiftShader (a GPU emulated on
// the CPU): slower overall, but costs fall more like a phone's.
// Exits 1 on page errors, or with --budget ms when a scenario's 95th
// percentile draw is over it.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(root + '/')('playwright');
  }
}
const { chromium } = await loadPlaywright();

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:8080/').replace(/\/?$/, '/');
const opt = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const throttle = Number(opt('--throttle', 4));
const only = opt('--only', null);
const rounds = Number(opt('--rounds', 3)); // times each scenario's keys play
const budget = Number(opt('--budget', 0)); // ms, 0 = report only
const gpu = args.includes('--gpu');
const GPU_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas'];

const FRAME_60 = 1000 / 60;
const FRAME_30 = 1000 / 30;

// Phone first (the main target), then the biggest canvas the game draws.
const DEVICES = [
  { name: 'phone', w: 412, h: 780, dpr: 3.5, touch: true },
  { name: 'tablet-land', w: 1366, h: 1024, dpr: 2, touch: true },
];

// Keys pressed in order; 'wait:ms' pauses (lets fold animations play).
const FOLD_TURNS = [
  'f', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'f', 'ArrowRight', 'Enter', 'wait:700',
  'ArrowUp', 'wait:400', 'ArrowLeft', 'wait:400',
  'f', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'Enter', 'wait:700',
  'u', 'wait:500', 'ArrowRight', 'wait:400', ' ', 'wait:400',
];

const SCENARIOS = [
  { name: 'floor-1', url: '?screen=floor&floor=1&seed=7', keys: FOLD_TURNS },
  { name: 'floor-8-relics', url: '?screen=floor&floor=8&seed=7&relics=all&spirit=frog', keys: FOLD_TURNS },
  { name: 'boss', url: '?screen=floor&floor=9&seed=7&relics=all', keys: FOLD_TURNS },
  { name: 'night-ink-8x8', url: '?screen=floor&size=8&demo=1&palette=night-ink', keys: FOLD_TURNS },
];

// In the page: record each animation frame's gap from the last.
function startRecording() {
  const gaps = [];
  let last = 0;
  window.__perf = { gaps, run: true };
  const tick = (t) => {
    if (last) gaps.push(t - last);
    last = t;
    if (window.__perf.run) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function stats(gaps) {
  const sorted = [...gaps].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 0;
  return {
    frames: gaps.length,
    median: q(0.5),
    p95: q(0.95),
    worst: sorted[sorted.length - 1] || 0,
    over60: gaps.filter((g) => g > FRAME_60 + 1).length,
    over30: gaps.filter((g) => g > FRAME_30 + 1).length,
  };
}

const ms = (v) => v.toFixed(1).padStart(5);
const browser = await chromium.launch({ args: ['--no-sandbox', ...(gpu ? GPU_ARGS : [])] });
let failed = 0;
for (const d of DEVICES) {
  for (const s of SCENARIOS) {
    const name = `${d.name}/${s.name}`;
    if (only && !name.includes(only)) continue;
    const page = await browser.newPage({
      viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, hasTouch: d.touch, isMobile: d.touch,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Telemetry off: the audit must not send play data.
    await page.goto(`${base}${s.url}${s.url ? '&' : '?'}telemetry=off&audit=1`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.locator('#board').focus().catch(() => {});
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(() => window.foldworkFrames && window.foldworkFrames.reset());
    await page.evaluate(startRecording);
    for (const k of Array.from({ length: rounds }, () => s.keys).flat()) {
      if (k.startsWith('wait:')) await page.waitForTimeout(Number(k.slice(5)));
      else {
        await page.keyboard.press(k);
        await page.waitForTimeout(60);
      }
    }
    const { gaps, draw } = await page.evaluate(() => {
      window.__perf.run = false;
      // Builds before 9f have no draw timings: frame gaps only.
      return { gaps: window.__perf.gaps, draw: window.foldworkFrames ? window.foldworkFrames.summary().draw : { median: 0, p95: 0, worst: 0, count: 0 } };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const st = stats(gaps);
    const bad = (budget && draw.p95 > budget) || errors.length;
    if (bad) failed++;
    console.log(`${bad ? '✗' : '✓'} ${name.padEnd(28)} draw ×${String(draw.count).padStart(3)}  median ${ms(draw.median)}  p95 ${ms(draw.p95)}  worst ${ms(draw.worst)}   |  frames ${String(st.frames).padStart(4)}  p95 ${ms(st.p95)}  >60fps ${st.over60}  >30fps ${st.over30}`);
    for (const e of errors) console.log(`    page error: ${e}`);
    await page.close();
  }
}
await browser.close();
console.log(failed
  ? `\n${failed} scenario(s) with page errors${budget ? ` or over the ${budget}ms draw budget` : ''} (CPU ×${throttle}).`
  : `\nNo page errors${budget ? `; all within the ${budget}ms draw budget` : ''} (CPU ×${throttle}${gpu ? ', GPU path' : ''}). Compare against main; check a device with ?fps=1.`);
process.exit(failed ? 1 : 0);
