// Paper grain (docs/04 visual style, 8d): faint, low-contrast noise made
// once to an offscreen canvas and reused as a repeating pattern over tile
// faces and the board sheet.
//
//   - grainTexels (pure, unit tested) makes the RGBA pixels: soft noise
//     that wraps at the edges (so the pattern tiles without seams) plus a
//     few paper fibres. Light texels are white, dark ones black, both at a
//     low alpha, so the same texture works on every palette.
//   - grainPattern (DOM) turns them into a CanvasPattern, once per context.
//
// Seeded from a fixed string: the grain never changes between runs and
// never touches the game's RNG.

import { createRng, nextFloat } from '../core/rng.js';

export const GRAIN_SIZE = 96;
/** Peak alpha of a texel (0..1). "Faint": typical texels sit near 3%. */
export const GRAIN_ALPHA = 0.09;
const FIBRES = 14;

/** RGBA pixels for a size×size tileable grain texture. */
export function grainTexels(size = GRAIN_SIZE, seed = 'foldwork-grain') {
  const rng = createRng(seed);
  const n = size * size;
  let v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = nextFloat(rng) * 2 - 1;
  // Two wrapped box blurs: fine speckle turns into soft paper tooth.
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(n);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const row = ((y + dy + size) % size) * size;
          for (let dx = -1; dx <= 1; dx++) sum += v[row + ((x + dx + size) % size)];
        }
        out[y * size + x] = sum / 9;
      }
    }
    v = out;
  }
  // Blurring shrinks the range; stretch it back to about ±1.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v[i]));
  const k = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < n; i++) v[i] *= k;
  // Fibres: short, slightly darker strokes in random directions (wrapped).
  for (let f = 0; f < FIBRES; f++) {
    let x = nextFloat(rng) * size;
    let y = nextFloat(rng) * size;
    const a = nextFloat(rng) * Math.PI * 2;
    const len = 4 + Math.floor(nextFloat(rng) * 8);
    const dark = nextFloat(rng) < 0.7 ? -1 : 1;
    for (let s = 0; s < len; s++) {
      const i = (Math.floor(y + size) % size) * size + (Math.floor(x + size) % size);
      v[i] = Math.max(-1, Math.min(1, v[i] * 0.3 + dark * 0.8));
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = v[i] >= 0 ? 255 : 0;
    px[i * 4] = c;
    px[i * 4 + 1] = c;
    px[i * 4 + 2] = c;
    px[i * 4 + 3] = Math.round(Math.abs(v[i]) * GRAIN_ALPHA * 255);
  }
  return px;
}

let cache = null; // { ctx, pattern }

/** The grain pattern for this 2D context, made on first use (null if unsupported). */
export function grainPattern(ctx) {
  if (cache && cache.ctx === ctx) return cache.pattern;
  let pattern = null;
  try {
    const size = GRAIN_SIZE;
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d');
    const img = g.createImageData(size, size);
    img.data.set(grainTexels(size));
    g.putImageData(img, 0, 0);
    pattern = ctx.createPattern(canvas, 'repeat');
  } catch {
    pattern = null; // no grain beats no game
  }
  cache = { ctx, pattern };
  return pattern;
}
