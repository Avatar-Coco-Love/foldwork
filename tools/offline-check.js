// Offline play check (9i) in headless Chromium. Needs Playwright (not a
// game dependency). Starts its own dev server (:8080) and telemetry
// collector (:8787, data in a temp folder), then:
//   1. loads the game online with ?sw=1 and waits for the service worker
//      to cache the shell and the session's events to reach the collector;
//   2. goes offline and stops the dev server (Playwright's offline mode
//      doesn't reach service worker fetches, so a cache miss must fail for
//      real), reloads: the title must start;
//   3. opens floor 1 (?screen=floor, params served the cached page), plays
//      moves and a fold, and leaves (Save & Quit): floor.end must be queued
//      and nothing sent (page hide included: no beacon offline);
//   4. goes back online: the queue must empty and every queued event
//      reach the collector, without duplicates.
// Then checks plain localhost removes the worker again (dev default).
//
// Usage: node tools/offline-check.js   (exits 1 on any failure)

import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { swShell } from './shell-files.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(root + '/')('playwright');
  }
}
const { chromium } = await loadPlaywright();

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = mkdtempSync(join(tmpdir(), 'foldwork-offline-'));
const COLLECT = 'http://localhost:8787/collect';
const BASE = `http://localhost:8080/?sw=1&telemetry=${encodeURIComponent(COLLECT)}`;
const SHELL = swShell().length;

const start = (args) => spawn('node', args, { cwd: ROOT, stdio: 'ignore' });
let server = start(['dev-server.js', '8080']);
const collector = start(['tools/telemetry-collector.js', '8787', DATA]);
await new Promise((r) => setTimeout(r, 600));

const collected = () => readdirSync(DATA)
  .flatMap((f) => readFileSync(join(DATA, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// waitForFunction doesn't await promises, so poll.
const until = async (fn, arg, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(200)) {
    if (await page.evaluate(fn, arg)) return true;
  }
  return false;
};
const queued = () => page.evaluate(() => {
  const text = localStorage.getItem('foldwork.telemetry');
  return text ? JSON.parse(text).queue : [];
});

try {
  // 1. Online.
  await page.goto(BASE);
  check(await until(async (files) => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    return !!(reg && reg.active && navigator.serviceWorker.controller) && keys.length === 1
      && (await (await caches.open(keys[0])).keys()).length === files;
  }, SHELL), `online: service worker controls the page, shell cached (${SHELL} files)`);
  check(await until(() => !localStorage.getItem('foldwork.telemetry')), 'online: events sent');
  const before = collected().length;

  // 2. Offline reload.
  await context.setOffline(true);
  server.kill();
  server = null;
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#ui button', { timeout: 10000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ui button')].map((b) => b.textContent.trim()));
  check(rows.includes('New Run'), 'offline: the title screen starts');

  // 3. A floor, offline.
  await page.goto(`${BASE}&screen=floor&floor=1&seed=offline1`);
  await page.waitForSelector('#ui [aria-label^="Floor"]', { timeout: 10000 });
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'w', 'f', 'Enter']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);
  if (!(await page.$('.hud-outcome'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find((b) => b.offsetParent && b.textContent.trim() === 'Save & Quit to Title').click());
    await page.waitForTimeout(500);
  }
  const queue = await queued();
  const end = queue.filter((e) => e.type === 'floor.end').pop();
  check(!!end && end.data.turns > 0 && end.data.log.length > 0,
    `offline: a floor plays (floor.end ${end ? `${end.data.outcome}, ${end.data.turns} turns, ${end.data.folds} folds` : 'missing'})`);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  check(collected().length === before, `offline: nothing sent, ${queue.length} events queued`);

  // 4. Back online.
  await context.setOffline(false);
  check(await until(() => !localStorage.getItem('foldwork.telemetry')), 'online again: the queue empties');
  const fresh = collected().slice(before);
  const ids = new Set(fresh.map((e) => e.id));
  check(queue.every((e) => ids.has(e.id)), `online again: all ${queue.length} queued events reached the collector`);
  check(ids.size === fresh.length, 'online again: no duplicates');

  // Dev default: plain localhost removes the worker.
  server = start(['dev-server.js', '8080']);
  await page.waitForTimeout(600);
  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(800);
  check(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0),
    'localhost without ?sw=1: no service worker');
  check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (err) {
  check(false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
  if (server) server.kill();
  collector.kill();
}
process.exit(failures.length ? 1 : 0);
