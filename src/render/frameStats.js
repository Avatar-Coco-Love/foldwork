// Frame timing (9f): a fixed ring of recent samples, so measuring never
// allocates per frame. Two kinds of sample:
//   - gap: ms between animation frames (what the player sees; includes the
//     browser's raster and compositing, so only meaningful on a device);
//   - draw: ms the renderer's draw passes took (the game's own work).
// Pure (no DOM): ui/fpsMeter.js shows it, tools/perf-audit.js reads it.

export const FRAME_BUDGET = 1000 / 60;

function ring(size) {
  return { values: new Float32Array(size), count: 0, next: 0 };
}

function push(r, v) {
  r.values[r.next] = v;
  r.next = (r.next + 1) % r.values.length;
  if (r.count < r.values.length) r.count++;
}

/** Median, 95th percentile, worst and mean of a ring's samples. */
function summarize(r) {
  if (!r.count) return { median: 0, p95: 0, worst: 0, mean: 0, count: 0 };
  const sorted = Array.from(r.values.subarray(0, r.count)).sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(r.count - 1, Math.floor(q * r.count))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return { median: at(0.5), p95: at(0.95), worst: sorted[r.count - 1], mean: sum / r.count, count: r.count };
}

export function createFrameStats(size = 240) {
  const gaps = ring(size);
  const draws = ring(size);
  return {
    recordGap(ms) {
      push(gaps, ms);
    },
    recordDraw(ms) {
      push(draws, ms);
    },
    /** { gap, draw, fps, missed }: fps from the median gap; missed = gaps over budget. */
    summary() {
      const gap = summarize(gaps);
      const draw = summarize(draws);
      let missed = 0;
      for (let i = 0; i < gaps.count; i++) if (gaps.values[i] > FRAME_BUDGET + 1) missed++;
      return { gap, draw, fps: gap.median > 0 ? 1000 / gap.median : 0, missed };
    },
    reset() {
      gaps.count = gaps.next = 0;
      draws.count = draws.next = 0;
    },
  };
}
