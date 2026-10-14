import assert from 'node:assert/strict';
import { test } from './harness.js';
import { grainTexels, GRAIN_SIZE, GRAIN_ALPHA } from '../src/render/grain.js';

test('grain: deterministic, faint, black or white texels', () => {
  const a = grainTexels();
  assert.equal(a.length, GRAIN_SIZE * GRAIN_SIZE * 4);
  assert.deepEqual(a, grainTexels());
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    assert.ok(a[i] === 0 || a[i] === 255);
    assert.ok(a[i] === a[i + 1] && a[i] === a[i + 2]);
    sum += a[i + 3];
    max = Math.max(max, a[i + 3]);
  }
  const mean = sum / (a.length / 4) / 255;
  assert.ok(max <= Math.ceil(GRAIN_ALPHA * 255), String(max));
  assert.ok(mean > 0.01 && mean < 0.05, `mean alpha ${mean}`); // faint: about 3%
});

test('grain tiles without a seam: opposite edges are as alike as neighbours', () => {
  const n = 64;
  const a = grainTexels(n, 'seam');
  const alpha = (x, y) => (a[(y * n + x) * 4] ? 1 : -1) * a[(y * n + x) * 4 + 3];
  let edge = 0;
  let inner = 0;
  for (let y = 0; y < n; y++) {
    edge += Math.abs(alpha(n - 1, y) - alpha(0, y));
    inner += Math.abs(alpha(n / 2, y) - alpha(n / 2 + 1, y));
  }
  assert.ok(edge < inner * 2, `${edge} vs ${inner}`);
});
