import assert from 'node:assert/strict';
import { test } from './harness.js';
import { CREATURE_SHAPES, ART_BOUNDS, FOOT_LINE, SIZE_CLASSES, drawCreature } from '../src/render/creatures.js';
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
    assert.ok(Math.abs(b.y1 - FOOT_LINE) <= 0.04 + 1e-9, `${kind} feet on the foot line (${b.y1})`);
    const [lo, hi] = SIZE_CLASSES[shape.size] || [];
    const h = b.y1 - b.y0;
    assert.ok(h >= lo - 1e-9 && h <= hi + 1e-9, `${kind} height ${h.toFixed(2)} fits '${shape.size}'`);
  }
});

// A canvas stand-in: every method is a no-op, every property settable.
function stubCanvas() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { ctx, calls };
}

test('creature art: every kind paints, with its rest, carried key and spawn markers', () => {
  const palette = new Proxy({}, { get: () => '#000' });
  for (const [kind, def] of Object.entries(CREATURE_DEFS)) {
    const { ctx, calls } = stubCanvas();
    const creature = { id: kind, kind, hp: def.hp, maxHp: def.hp, rest: 1, sprout: 2, item: def.carry || null };
    drawCreature(ctx, palette, creature, 0, 0, 48, {});
    assert.ok(calls.length > 0, kind);
  }
  // The rest marker is the "z" (regression: its painter went missing).
  const { ctx, calls } = stubCanvas();
  drawCreature(ctx, palette, { id: 'b', kind: 'brute', hp: 3, maxHp: 3, rest: 1 }, 0, 0, 48, {});
  assert.ok(calls.some(([k, text]) => k === 'fillText' && text === 'z'));
});
