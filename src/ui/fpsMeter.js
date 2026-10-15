// Frame meter (9f, dev param ?fps=1): a small readout in the corner with
// frames per second and the slowest recent frame, then how many recent
// frames missed 60fps ("slow") and the game's own draw time in ms
// (median / worst). For checking a real phone or tablet,
// where the browser's raster cost (which tools/perf-audit.js can't see in
// headless Chromium) shows up in the frame gaps.
//
// It keeps one animation frame loop running while shown, so it measures
// frame pacing even when the game has nothing to redraw.

import { el } from './dom.js';

const REFRESH_MS = 500;

export function createFpsMeter(stats, root = document.body) {
  const node = el('div', { class: 'fps-meter', 'aria-hidden': 'true' });
  root.append(node);
  let last = 0;
  let shown = 0;
  function tick(t) {
    if (last) stats.recordGap(t - last);
    last = t;
    if (t - shown >= REFRESH_MS) {
      shown = t;
      const s = stats.summary();
      node.textContent = `${Math.round(s.fps)} fps · worst ${s.gap.worst.toFixed(0)}ms\n`
        + `slow ${s.missed}/${s.gap.count} · draw ${s.draw.median.toFixed(1)}/${s.draw.worst.toFixed(1)}`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return node;
}
