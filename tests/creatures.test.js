import assert from 'node:assert/strict';
import { test } from './harness.js';
import { CREATURE_SHAPES, ART_BOUNDS, FOOT_LINE, SIZE_CLASSES } from '../src/render/creatures.js';
import { CREATURE_DEFS } from '../src/core/creatures.js';

function bounds(shape) {
  const pts = shape.parts.flatMap((p) => p.points);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

test('creature art: every kind has a shape', () => {
  for (const kind of Object.keys(CREATURE_DEFS)) assert.ok(CREATURE_SHAPES[kind], kind);
});

// The size and alignment guide in render/creatures.js (docs/04).
test('creature art: inside the art bounds, centred, on the foot line, sized by class', () => {
  for (const [kind, shape] of Object.entries(CREATURE_SHAPES)) {
    const b = bounds(shape);
    for (const v of [b.x0, b.x1, b.y0, b.y1]) {
      assert.ok(v >= ART_BOUNDS.min && v <= ART_BOUNDS.max, `${kind} stays in bounds (${v})`);
    }
    assert.ok(Math.abs((b.x0 + b.x1) / 2 - 0.5) <= 0.02, `${kind} centred (${(b.x0 + b.x1) / 2})`);
    assert.ok(Math.abs(b.y1 - FOOT_LINE) <= 0.04, `${kind} feet on the foot line (${b.y1})`);
    const [lo, hi] = SIZE_CLASSES[shape.size] || [];
    const h = b.y1 - b.y0;
    assert.ok(h >= lo - 1e-9 && h <= hi + 1e-9, `${kind} height ${h.toFixed(2)} fits '${shape.size}'`);
  }
});
