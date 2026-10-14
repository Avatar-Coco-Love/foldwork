// Layout and accessibility audit (Phase 8e): opens every screen at a set
// of device sizes in headless Chromium and reports what doesn't fit.
//
// Usage (needs Playwright, not a game dependency):
//   npm start &                      # the dev server on :8080
//   node tools/layout-audit.js [baseUrl] [--shots dir] [--only name]
//
// Checks, per device and screen:
//   - the page never scrolls sideways or down (scrollWidth/Height)
//   - every visible button is at least 44x44 CSS px
//   - every visible button is on screen, or inside a scroll box that can
//     bring it on screen
//   - floor: the HUD never overlaps the board (board rect from layout.js)
//   - text and controls don't spill out of their HUD bar
// Exits 1 when anything fails, so it can gate a PR by hand.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright from the project or, failing that, the global install.
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
const shotsAt = args.indexOf('--shots');
const shots = shotsAt >= 0 ? args[shotsAt + 1] : null;
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? args[onlyAt + 1] : null;

// CSS viewports as the browser reports them (address and nav bars already
// taken off on phones). The Galaxy S-Ultra rows come first: the user's
// main device (412 px wide at the default display size).
export const DEVICES = [
  { name: 's26-ultra', w: 412, h: 780, dpr: 3.5, touch: true },
  { name: 's26-ultra-fullscreen', w: 412, h: 915, dpr: 3.5, touch: true },
  { name: 's26-ultra-land', w: 915, h: 340, dpr: 3.5, touch: true },
  { name: 's26-ultra-large-display', w: 360, h: 690, dpr: 4, touch: true },
  { name: 'small-phone', w: 320, h: 568, dpr: 2, touch: true },
  { name: 'small-phone-land', w: 568, h: 280, dpr: 2, touch: true },
  { name: 'iphone', w: 390, h: 664, dpr: 3, touch: true },
  { name: 'iphone-land', w: 844, h: 340, dpr: 3, touch: true },
  { name: 'fold-inner', w: 690, h: 750, dpr: 2.6, touch: true },
  { name: 'tablet', w: 768, h: 1024, dpr: 2, touch: true },
  { name: 'tablet-land', w: 1024, h: 768, dpr: 2, touch: true },
  { name: 'tablet-big-land', w: 1366, h: 1024, dpr: 2, touch: true },
  { name: 'laptop', w: 1280, h: 650, dpr: 1, touch: false },
  { name: 'desktop', w: 1920, h: 960, dpr: 1, touch: false },
  { name: 'desktop-narrow', w: 600, h: 900, dpr: 1, touch: false },
];

// Screens to visit: a URL (dev params) plus optional steps once loaded.
const SCREENS = [
  { name: 'title', url: '' },
  { name: 'settings', url: '', steps: [['click', 'Settings']] },
  { name: 'howto', url: '', steps: [['click', 'How to Play']] },
  { name: 'stats', url: '', steps: [['click', 'Stats & History']] },
  { name: 'whats-new', url: '', steps: [['click', 'Settings'], ['click', 'Foldwork version']] },
  { name: 'unlocks', url: '?unlocks=all', steps: [['click', 'Unlocks']] },
  { name: 'spirit', url: '?unlocks=all', steps: [['click', 'New Run']] },
  { name: 'offer-rest', url: '?screen=offer&cleared=4&seed=7' },
  { name: 'floor-1-hint', url: '?screen=floor&floor=1&seed=7' },
  { name: 'floor-relics', url: '?screen=floor&floor=5&seed=7&relics=all' },
  { name: 'floor-boss', url: '?screen=floor&floor=9&seed=7&relics=all' },
  { name: 'pause', url: '?screen=floor&floor=5&seed=7', steps: [['click', 'Menu']] },
  { name: 'pause-settings', url: '?screen=floor&floor=5&seed=7', steps: [['click', 'Menu'], ['click', 'Settings']] },
];

const TEXT = [
  { name: 'normal', settings: {} },
  { name: 'large', settings: { textSize: 'large' } },
];

const HANDS = [
  { name: 'right', settings: {} },
  { name: 'left', settings: { hand: 'left' } },
];

function inPage() {
  const vw = innerWidth;
  const vh = innerHeight;
  const problems = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > vw + 1) problems.push(`page scrolls sideways (${doc.scrollWidth} > ${vw})`);
  if (doc.scrollHeight > vh + 1) problems.push(`page scrolls down (${doc.scrollHeight} > ${vh})`);

  const label = (b) => (b.getAttribute('aria-label') || b.textContent || b.className).trim().replace(/\s+/g, ' ').slice(0, 30);
  const visible = (b) => {
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
  };
  // A box that scrolls on its own (so its children can be scrolled to).
  const scroller = (node) => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) return p;
    }
    return null;
  };
  const buttons = [...document.querySelectorAll('#ui button, #ui a.btn, #ui input, #ui textarea, #ui [role="button"]')].filter(visible);
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) problems.push(`small target "${label(b)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    const off = r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5;
    if (off) {
      const box = scroller(b);
      if (!box) problems.push(`off screen "${label(b)}" at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // Text that spills out of its own box (clipped words, overlapping lines).
  for (const n of document.querySelectorAll('#ui .btn, #ui .hud-status, #ui .hud-actions, #ui .panel, #ui .offer-card')) {
    if (!visible(n)) continue;
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) continue;
    if (n.scrollWidth > n.clientWidth + 2) problems.push(`content wider than its box "${label(n)}" (${n.scrollWidth} > ${n.clientWidth})`);
  }
  return { problems, buttons: buttons.length };
}

async function floorChecks(page) {
  return page.evaluate(async () => {
    const problems = [];
    const hud = document.querySelector('.hud');
    if (!hud) return problems;
    const L = window.foldworkLayout && window.foldworkLayout();
    if (!L) return ['no board layout (?audit=1 missing?)'];
    const board = { left: L.boardX, top: L.boardY, right: L.boardX + L.boardW, bottom: L.boardY + L.boardH };
    if (L.cellSize < 32) problems.push(`board cells only ${L.cellSize}px`);
    const hit = (r) => r.left < board.right - 1 && r.right > board.left + 1 && r.top < board.bottom - 1 && r.bottom > board.top + 1;
    for (const node of hud.querySelectorAll('button, .hud-meters, .hud-fold, .hud-hint')) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (hit(r)) problems.push(`HUD over board: ${node.className || node.tagName} (${Math.round(r.top)}-${Math.round(r.bottom)} vs board ${board.top}-${board.bottom})`);
    }
    return problems;
  });
}

async function runStep(page, [kind, arg]) {
  if (kind === 'click') {
    // Labels can carry a count after the name ("Unlocks · 40 scraps").
    const name = new RegExp(`^${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    await page.getByRole('button', { name }).first().click({ timeout: 4000 });
  } else if (kind === 'key') {
    await page.keyboard.press(arg);
  }
  await page.waitForTimeout(150);
}

const browser = await chromium.launch();
let failures = 0;
let checks = 0;
for (const d of DEVICES) {
  if (only && !d.name.includes(only)) continue;
  const context = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    hasTouch: d.touch,
    isMobile: d.touch && Math.min(d.w, d.h) < 600,
  });
  for (const t of TEXT) {
    for (const hand of HANDS) {
      // Handedness only changes landscape layouts.
      if (hand.name === 'left' && d.w <= d.h) continue;
      for (const s of SCREENS) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript((settings) => {
          localStorage.setItem('foldwork.settings', JSON.stringify(settings));
          localStorage.setItem('foldwork.telemetry.asked', '1');
        }, { ...t.settings, ...hand.settings });
        const url = base + s.url + (s.url ? '&' : '?') + 'telemetry=off&audit=1';
        await page.goto(url);
        await page.waitForTimeout(250);
        let problems = [];
        try {
          for (const step of s.steps || []) await runStep(page, step);
          const res = await page.evaluate(inPage);
          problems = res.problems;
          if (s.name.startsWith('floor') || s.name === 'pause') problems.push(...await floorChecks(page));
        } catch (e) {
          problems.push(`step failed: ${e.message.split('\n')[0]}`);
        }
        problems.push(...errors.map((e) => `console error: ${e}`));
        checks++;
        const tag = `${d.name} ${d.w}x${d.h} text=${t.name}${hand.name === 'left' ? ' left' : ''} ${s.name}`;
        if (problems.length) {
          failures++;
          console.log(`FAIL ${tag}`);
          for (const p of [...new Set(problems)]) console.log(`     - ${p}`);
        }
        if (shots) await page.screenshot({ path: `${shots}/${d.name}-${t.name}${hand.name === 'left' ? '-left' : ''}-${s.name}.png` });
        await page.close();
      }
    }
  }
  await context.close();
}
await browser.close();
console.log(`\n${checks - failures}/${checks} screen checks clean.`);
process.exit(failures ? 1 : 0);
