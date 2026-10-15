import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createFrameStats, FRAME_BUDGET } from '../src/render/frameStats.js';

test('frameStats: empty summary is all zeros', () => {
  const s = createFrameStats(8).summary();
  assert.equal(s.fps, 0);
  assert.equal(s.missed, 0);
  assert.deepEqual(s.draw, { median: 0, p95: 0, worst: 0, mean: 0, count: 0 });
});

test('frameStats: fps from the median gap, missed frames over budget', () => {
  const st = createFrameStats(10);
  for (const g of [16.7, 16.6, 16.7, 16.7, 50, 16.7, 33.4]) st.recordGap(g);
  const s = st.summary();
  assert.equal(Math.round(s.fps), 60);
  assert.equal(s.missed, 2);
  assert.ok(Math.abs(s.gap.worst - 50) < 1e-3);
  assert.ok(FRAME_BUDGET > 16 && FRAME_BUDGET < 17);
});

test('frameStats: keeps only the newest samples', () => {
  const st = createFrameStats(4);
  for (const d of [100, 100, 1, 2, 3, 4]) st.recordDraw(d);
  const s = st.summary().draw;
  assert.equal(s.count, 4);
  assert.equal(s.worst, 4);
  assert.equal(s.mean, 2.5);
});

test('frameStats: reset clears both rings', () => {
  const st = createFrameStats(4);
  st.recordGap(20);
  st.recordDraw(3);
  st.reset();
  const s = st.summary();
  assert.equal(s.gap.count + s.draw.count, 0);
});
