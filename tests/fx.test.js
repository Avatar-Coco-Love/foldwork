import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  buildFoldAnim, foldFrame, foldDurationMs, shakeOffset, createFxPlayer, FOLD_MS, ROTATE_SHARE,
} from '../src/render/fx.js';
import { applyFold } from '../src/core/fold.js';
import { createBoard, createLayer, getCell, cellIndex } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('fold duration scales with speed and is instant under reduced motion', () => {
  assert.equal(foldDurationMs(), FOLD_MS);
  assert.ok(FOLD_MS >= 350 && FOLD_MS <= 450);
  assert.equal(foldDurationMs({ speed: 2 }), FOLD_MS / 2);
  assert.ok(foldDurationMs({ speed: 0.7 }) > FOLD_MS);
  assert.equal(foldDurationMs({ speed: 1, reducedMotion: true }), 0);
  assert.equal(foldDurationMs({ speed: 0 }), 0);
});

test('fold frame: flat at the start, mirrored and settled at the end', () => {
  const a = foldFrame(0);
  near(a.cos, 1);
  near(a.arc, 0);
  near(a.hover, 0);
  near(a.stack, 0);
  const mid = foldFrame(ROTATE_SHARE / 2);
  near(mid.cos, 0, 1e-9);
  near(mid.arc, 1);
  const turned = foldFrame(ROTATE_SHARE);
  near(turned.cos, -1);
  near(turned.hover, 1);
  near(turned.stack, 1);
  const z = foldFrame(1);
  near(z.cos, -1);
  near(z.hover, 0);
  near(z.arc, 0, 1e-9);
  // Clamped, and writes into the given object.
  const out = {};
  assert.equal(foldFrame(2, out), out);
  near(out.cos, -1);
});

test('fold frame angle is monotonic, so reverse playback mirrors forward', () => {
  let prev = 2;
  for (let i = 0; i <= 40; i++) {
    const { cos } = foldFrame(i / 40);
    assert.ok(cos <= prev + 1e-12);
    prev = cos;
  }
});

test('fold anim: base + landed sheets equals the applied fold', () => {
  const b = createBoard(5, 5);
  getCell(b, 1, 2).layers.push(createLayer(TILE.WALL));
  getCell(b, 3, 0).layers = []; // empty source: not a sheet
  const fold = { axis: 'v', index: 2, side: 'after' }; // cols 2..4 fold left; col 4 clipped
  const anim = buildFoldAnim(b, fold);
  assert.equal(anim.fold, fold);
  assert.equal(anim.sheets.length, 5 * 2 - 1); // cols 2,3 move; (3,0) is empty
  const s = anim.sheets.find((x) => x.col === 2 && x.row === 2);
  assert.equal(s.to, cellIndex(b, 1, 2));
  assert.equal(s.baseHeight, 2);
  // Moving cells are empty in base; clipped and receiving cells are untouched.
  assert.equal(anim.base.cells[cellIndex(b, 2, 2)].layers.length, 0);
  assert.equal(anim.base.cells[cellIndex(b, 4, 2)].layers.length, 1);
  assert.equal(anim.base.cells[cellIndex(b, 1, 2)].layers.length, 2);
  // Landing the sheets on base reproduces applyFold.
  const landed = structuredClone(anim.base);
  for (const sh of anim.sheets) landed.cells[sh.to].layers.push(...sh.layers);
  assert.deepEqual(landed, applyFold(b, fold));
  // The input board is not touched.
  assert.equal(getCell(b, 2, 2).layers.length, 1);
});

test('shake decays to rest', () => {
  near(shakeOffset(0), 0);
  near(shakeOffset(1), 0);
  assert.ok(Math.abs(shakeOffset(0.125)) > 1);
});

test('fx player runs a fold to completion and reverses on request', () => {
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => (frames.push(fn), frames.length);
  globalThis.cancelAnimationFrame = () => {};
  let t = 0;
  let changes = 0;
  const fx = createFxPlayer({ onChange: () => changes++, now: () => t });
  const anim = buildFoldAnim(createBoard(5, 5), { axis: 'h', index: 2, side: 'before' });
  let done = 0;
  fx.playFold(anim, { duration: 400, reverse: true, done: () => done++ });
  assert.equal(fx.busy, true);
  near(fx.foldAnim.u, 1);
  t = 100;
  frames.shift()();
  near(fx.foldAnim.u, 0.75);
  t = 400;
  frames.shift()();
  assert.equal(fx.busy, false);
  assert.equal(fx.foldAnim, null);
  assert.equal(done, 1);
  assert.ok(changes >= 3);
  // Zero duration finishes synchronously; finish() skips to the end.
  fx.playFold(anim, { duration: 0, done: () => done++ });
  assert.equal(done, 2);
  fx.playFold(anim, { duration: 400, done: () => done++ });
  fx.finish();
  assert.equal(done, 3);
  fx.destroy();
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});

test('fx player shake: offset while running, static flash under reduced motion', () => {
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => (frames.push(fn), frames.length);
  globalThis.cancelAnimationFrame = () => {};
  let t = 0;
  const fx = createFxPlayer({ onChange: () => {}, now: () => t });
  fx.playShake();
  t = 40;
  frames.shift()();
  assert.ok(Math.abs(fx.shake.x) > 0);
  t = 1000;
  frames.shift()();
  assert.equal(fx.shake, null);
  fx.playShake({ reducedMotion: true });
  t = 1100;
  frames.shift()();
  assert.equal(fx.shake.x, 0);
  assert.equal(fx.shake.flash, true);
  fx.destroy();
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});
