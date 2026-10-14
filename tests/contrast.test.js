// Palette contrast (Phase 8e accessibility checklist): every palette's DOM
// text and controls meet WCAG AA, so a new palette can't quietly fail.

import assert from 'node:assert/strict';
import { test } from './harness.js';
import { PALETTES } from '../src/render/palette.js';

function rgba(color) {
  if (color.startsWith('#')) return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).concat(1);
  const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
  return [r, g, b, a];
}

/** A translucent color over an opaque one, as the browser paints it. */
function over(top, bottom) {
  const [r, g, b, a] = rgba(top);
  const base = rgba(bottom);
  return [r, g, b].map((v, i) => v * a + base[i] * (1 - a));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('contrast: black on white is 21, equal colors are 1', () => {
  assert.equal(Math.round(contrast([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrast([90, 90, 90], [90, 90, 90]), 1);
});

for (const p of Object.values(PALETTES)) {
  test(`${p.id}: HUD and menu text reads at 4.5:1 (WCAG AA)`, () => {
    const bg = rgba(p.background).slice(0, 3);
    const surface = over(p.uiSurface, p.background);
    for (const token of ['ink', 'inkSoft', 'danger']) {
      const fg = rgba(p[token]).slice(0, 3);
      assert.ok(contrast(fg, bg) >= 4.5, `${token} on background: ${contrast(fg, bg).toFixed(2)}`);
      assert.ok(contrast(fg, surface) >= 4.5, `${token} on surface: ${contrast(fg, surface).toFixed(2)}`);
    }
  });

  test(`${p.id}: primary buttons and focus rings`, () => {
    const fill = rgba(p.accentUi).slice(0, 3);
    const text = rgba(p.onAccent).slice(0, 3);
    const bg = rgba(p.background).slice(0, 3);
    assert.ok(contrast(text, fill) >= 4.5, `onAccent on accentUi: ${contrast(text, fill).toFixed(2)}`);
    assert.ok(contrast(fill, bg) >= 3, `accentUi on background: ${contrast(fill, bg).toFixed(2)}`);
  });

  test(`${p.id}: tile symbols read on the tile face`, () => {
    const face = rgba(p.tileFace).slice(0, 3);
    const glyph = rgba(p.glyph).slice(0, 3);
    assert.ok(contrast(glyph, face) >= 4.5, `glyph on tileFace: ${contrast(glyph, face).toFixed(2)}`);
  });
}
