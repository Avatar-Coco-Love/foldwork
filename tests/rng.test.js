import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  createRng, fork, cloneRng, nextU32, nextFloat, nextInt, pick, pickWeighted, shuffle,
  hashString, dailySeedString,
} from '../src/core/rng.js';

const draw = (rng, n) => Array.from({ length: n }, () => nextU32(rng));

test('same seed gives same sequence', () => {
  assert.deepEqual(draw(createRng(42), 20), draw(createRng(42), 20));
  assert.deepEqual(draw(createRng('daily'), 20), draw(createRng('daily'), 20));
});

test('different seeds diverge', () => {
  assert.notDeepEqual(draw(createRng(1), 5), draw(createRng(2), 5));
});

test('known sequence is stable across versions', () => {
  // Locks the algorithm: changing it would break saved runs and daily seeds.
  assert.deepEqual(draw(createRng('foldwork'), 3), [857926735, 1808898944, 693555755]);
});

test('fork is independent of parent consumption', () => {
  const a = createRng(7);
  const b = createRng(7);
  draw(b, 100);
  assert.deepEqual(draw(fork(a, 'enemies'), 10), draw(fork(b, 'enemies'), 10));
  assert.notDeepEqual(draw(fork(a, 'enemies'), 10), draw(fork(a, 'floors'), 10));
});

test('rng state is plain serializable data', () => {
  const rng = createRng(99);
  draw(rng, 5);
  const restored = JSON.parse(JSON.stringify(rng));
  assert.deepEqual(draw(restored, 10), draw(rng, 10));
});

test('clone continues identically without affecting original', () => {
  const rng = createRng(5);
  const copy = cloneRng(rng);
  assert.deepEqual(draw(copy, 10), draw(rng, 10));
});

test('nextFloat in [0,1) and nextInt in range', () => {
  const rng = createRng(3);
  for (let i = 0; i < 5000; i++) {
    const f = nextFloat(rng);
    assert.ok(f >= 0 && f < 1);
    const n = nextInt(rng, -2, 3);
    assert.ok(Number.isInteger(n) && n >= -2 && n < 3);
  }
  assert.throws(() => nextInt(rng, 3, 3), RangeError);
});

test('nextInt covers whole range', () => {
  const rng = createRng(11);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(nextInt(rng, 0, 6));
  assert.equal(seen.size, 6);
});

test('pick, pickWeighted, shuffle', () => {
  const rng = createRng(8);
  const list = [1, 2, 3, 4, 5];
  assert.ok(list.includes(pick(rng, list)));
  for (let i = 0; i < 100; i++) {
    assert.equal(pickWeighted(rng, ['a', 'b'], (x) => (x === 'a' ? 0 : 1)), 'b');
  }
  const shuffled = shuffle(rng, [...list]);
  assert.deepEqual([...shuffled].sort(), list);
  assert.throws(() => pick(rng, []), RangeError);
});

test('hashString and daily seed', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
  assert.equal(dailySeedString(new Date(Date.UTC(2026, 0, 5, 23, 59))), '2026-01-05');
});
