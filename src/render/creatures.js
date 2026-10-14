// Creature painters: origami-style figures built from polygons, defined as
// data and drawn by one shared routine (docs/04: "Defined as data, drawn by a
// shared vector routine"). Each kind has its own silhouette so creatures are
// told apart by shape, not just color.
//
// Shape = { parts: [{ fill, stroke?, points: [[x, y], ...] }], poses? }
//   points are in cell units (0..1 across the tile face); fill/stroke are
//   palette token names. Parts are painted in order. `poses` holds other
//   parts lists for a creature's states (posesFor picks one), held to the
//   same guide below.
// New creature kinds add an entry to CREATURE_SHAPES.
//
// Size and alignment guide (docs/04; tests/creatures.test.js checks it), so
// every figure reads at the same scale on every board size:
// - Everything stays inside ART_BOUNDS of the face (the corners above it
//   hold HP pips, link marks and clips).
// - Figures are centred left to right (bounding box centre 0.5 ± 0.02).
// - Feet sit on the shared ground line: the lowest point is FOOT_LINE ±
//   0.04, just above the drop shadow (centre 0.88).
// - Height says weight class: small (Mite, Wasp) 0.45–0.65, medium (player,
//   Creaseling, Lockjaw, Spore Bloom) 0.65–0.85, large (Card Brute) up to the
//   full 0.9. Width follows the silhouette.

export const ART_BOUNDS = Object.freeze({ min: 0.05, max: 0.95 });
export const FOOT_LINE = 0.86;
export const SIZE_CLASSES = Object.freeze({
  small: [0.45, 0.65],
  medium: [0.65, 0.85],
  large: [0.85, 0.9],
});

export const CREATURE_SHAPES = Object.freeze({
  // A folded-paper figure: a tall rhombus body with one shaded facet and a
  // small diamond head.
  player: {
    size: 'medium',
    parts: [
      { fill: 'accent', stroke: 'ink', points: [[0.5, 0.245], [0.77, 0.552], [0.5, 0.86], [0.23, 0.552]] },
      { fill: 'shadow', points: [[0.5, 0.245], [0.5, 0.86], [0.23, 0.552]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.5, 0.1], [0.62, 0.227], [0.5, 0.353], [0.38, 0.227]] },
    ],
  },
  // Scrap Mite: a low, wide hexagonal scrap with spiky legs and two
  // feelers. Squat and horizontal where the player is tall and narrow.
  mite: {
    size: 'small',
    parts: [
      { fill: 'ink', points: [[0.22, 0.6], [0.06, 0.5], [0.26, 0.54]] },
      { fill: 'ink', points: [[0.24, 0.72], [0.06, 0.84], [0.3, 0.76]] },
      { fill: 'ink', points: [[0.78, 0.6], [0.94, 0.5], [0.74, 0.54]] },
      { fill: 'ink', points: [[0.76, 0.72], [0.94, 0.84], [0.7, 0.76]] },
      { fill: 'ink', points: [[0.38, 0.45], [0.3, 0.26], [0.45, 0.44]] },
      { fill: 'ink', points: [[0.62, 0.45], [0.7, 0.26], [0.55, 0.44]] },
      { fill: 'danger', stroke: 'ink', points: [[0.18, 0.63], [0.32, 0.44], [0.68, 0.44], [0.82, 0.63], [0.68, 0.82], [0.32, 0.82]] },
      { fill: 'shadow', points: [[0.5, 0.44], [0.68, 0.44], [0.82, 0.63], [0.68, 0.82], [0.5, 0.82]] },
    ],
  },
  // Paper Wasp: two pale triangle wings swept up and out, a striped
  // abdomen pointing down into a stinger. Small, with a wide V outline.
  wasp: {
    size: 'small',
    parts: [
      { fill: 'tileFace', stroke: 'ink', points: [[0.5, 0.5], [0.14, 0.31], [0.3, 0.6]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.5, 0.5], [0.86, 0.31], [0.7, 0.6]] },
      { fill: 'danger', stroke: 'ink', points: [[0.32, 0.5], [0.68, 0.5], [0.5, 0.86]] },
      { fill: 'shadow', points: [[0.5, 0.5], [0.68, 0.5], [0.5, 0.86]] },
      { fill: 'ink', points: [[0.37, 0.59], [0.63, 0.59], [0.59, 0.65], [0.41, 0.65]] },
      { fill: 'ink', points: [[0.5, 0.34], [0.58, 0.42], [0.5, 0.5], [0.42, 0.42]] },
    ],
  },
  // Card Brute: a boxy golem, the full tile tall. Square trunk with a
  // shaded facet, stub arms, a block head with an eye slit, thick legs.
  brute: {
    size: 'large',
    parts: [
      { fill: 'ink', points: [[0.28, 0.72], [0.44, 0.72], [0.44, 0.9], [0.26, 0.9]] },
      { fill: 'ink', points: [[0.56, 0.72], [0.72, 0.72], [0.74, 0.9], [0.56, 0.9]] },
      { fill: 'ink', points: [[0.2, 0.32], [0.08, 0.62], [0.22, 0.66]] },
      { fill: 'ink', points: [[0.8, 0.32], [0.92, 0.62], [0.78, 0.66]] },
      { fill: 'danger', stroke: 'ink', points: [[0.18, 0.3], [0.82, 0.3], [0.76, 0.76], [0.24, 0.76]] },
      { fill: 'shadow', points: [[0.5, 0.3], [0.82, 0.3], [0.76, 0.76], [0.5, 0.76]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.38, 0.05], [0.62, 0.05], [0.64, 0.3], [0.36, 0.3]] },
      { fill: 'ink', points: [[0.42, 0.15], [0.58, 0.15], [0.58, 0.19], [0.42, 0.19]] },
    ],
  },
  // Creaseling: an accordion-pleated body (zigzag sides, an ink crease
  // across the middle), a folded-up triangle tip for a head, and two
  // pointed feet. Medium height, pinched at the waist like folded paper.
  creaseling: {
    size: 'medium',
    parts: [
      { fill: 'ink', points: [[0.34, 0.74], [0.45, 0.74], [0.39, 0.86]] },
      { fill: 'ink', points: [[0.55, 0.74], [0.66, 0.74], [0.61, 0.86]] },
      { fill: 'danger', stroke: 'ink', points: [[0.24, 0.34], [0.5, 0.24], [0.76, 0.34], [0.66, 0.54], [0.76, 0.76], [0.5, 0.8], [0.24, 0.76], [0.34, 0.54]] },
      { fill: 'shadow', points: [[0.5, 0.24], [0.76, 0.34], [0.66, 0.54], [0.76, 0.76], [0.5, 0.8]] },
      { fill: 'ink', points: [[0.34, 0.52], [0.66, 0.52], [0.66, 0.56], [0.34, 0.56]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.5, 0.12], [0.61, 0.28], [0.39, 0.28]] },
    ],
  },
  // Lockjaw: a folded-paper jaw. A wide lower jaw and a peaked upper jaw
  // with a pale zigzag of teeth between them, one eye, two stub feet.
  // Medium and wide: a squat guard that doesn't go anywhere.
  lockjaw: {
    size: 'medium',
    parts: [
      { fill: 'ink', points: [[0.3, 0.74], [0.42, 0.74], [0.36, 0.86]] },
      { fill: 'ink', points: [[0.58, 0.74], [0.7, 0.74], [0.64, 0.86]] },
      { fill: 'danger', stroke: 'ink', points: [[0.16, 0.5], [0.84, 0.5], [0.74, 0.78], [0.26, 0.78]] },
      { fill: 'shadow', points: [[0.5, 0.5], [0.84, 0.5], [0.74, 0.78], [0.5, 0.78]] },
      { fill: 'danger', stroke: 'ink', points: [[0.2, 0.46], [0.32, 0.18], [0.68, 0.18], [0.8, 0.46]] },
      { fill: 'shadow', points: [[0.5, 0.18], [0.68, 0.18], [0.8, 0.46], [0.5, 0.46]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.22, 0.44], [0.78, 0.44], [0.72, 0.56], [0.64, 0.47], [0.57, 0.56], [0.5, 0.47], [0.43, 0.56], [0.36, 0.47], [0.28, 0.56]] },
      { fill: 'ink', points: [[0.5, 0.24], [0.55, 0.3], [0.5, 0.36], [0.45, 0.3]] },
    ],
    // Jaws open (core/creatures.js `jaws`: it bites next turn): the upper
    // jaw lifts off a dark mouth, teeth on both jaws.
    poses: {
      open: [
        { fill: 'ink', points: [[0.3, 0.74], [0.42, 0.74], [0.36, 0.86]] },
        { fill: 'ink', points: [[0.58, 0.74], [0.7, 0.74], [0.64, 0.86]] },
        { fill: 'ink', points: [[0.22, 0.38], [0.78, 0.38], [0.8, 0.58], [0.2, 0.58]] },
        { fill: 'danger', stroke: 'ink', points: [[0.16, 0.56], [0.84, 0.56], [0.74, 0.78], [0.26, 0.78]] },
        { fill: 'shadow', points: [[0.5, 0.56], [0.84, 0.56], [0.74, 0.78], [0.5, 0.78]] },
        { fill: 'tileFace', stroke: 'ink', points: [[0.22, 0.58], [0.28, 0.49], [0.36, 0.58], [0.43, 0.49], [0.5, 0.58], [0.57, 0.49], [0.64, 0.58], [0.72, 0.49], [0.78, 0.58]] },
        { fill: 'danger', stroke: 'ink', points: [[0.2, 0.38], [0.3, 0.15], [0.7, 0.15], [0.8, 0.38]] },
        { fill: 'shadow', points: [[0.5, 0.15], [0.7, 0.15], [0.8, 0.38], [0.5, 0.38]] },
        { fill: 'tileFace', stroke: 'ink', points: [[0.22, 0.36], [0.78, 0.36], [0.72, 0.46], [0.64, 0.37], [0.57, 0.46], [0.5, 0.37], [0.43, 0.46], [0.36, 0.37], [0.28, 0.46]] },
        { fill: 'ink', points: [[0.5, 0.19], [0.55, 0.25], [0.5, 0.31], [0.45, 0.25]] },
      ],
    },
  },
  // Spore Bloom: a four-petal paper flower on a short stem, with two
  // leaves, standing in a folded cup. The pale centre is where spores show.
  bloom: {
    size: 'medium',
    parts: [
      { fill: 'ink', points: [[0.48, 0.42], [0.52, 0.42], [0.52, 0.7], [0.48, 0.7]] },
      { fill: 'shadow', stroke: 'ink', points: [[0.48, 0.62], [0.3, 0.52], [0.36, 0.64]] },
      { fill: 'shadow', stroke: 'ink', points: [[0.52, 0.62], [0.7, 0.52], [0.64, 0.64]] },
      { fill: 'danger', stroke: 'ink', points: [[0.5, 0.14], [0.6, 0.28], [0.5, 0.36], [0.4, 0.28]] },
      { fill: 'danger', stroke: 'ink', points: [[0.24, 0.36], [0.38, 0.28], [0.46, 0.36], [0.38, 0.46]] },
      { fill: 'danger', stroke: 'ink', points: [[0.76, 0.36], [0.62, 0.28], [0.54, 0.36], [0.62, 0.46]] },
      { fill: 'tileFace', stroke: 'ink', points: polygon(8, 0.5, 0.36, 0.08) },
      { fill: 'danger', stroke: 'ink', points: [[0.32, 0.68], [0.68, 0.68], [0.62, 0.86], [0.38, 0.86]] },
      { fill: 'shadow', points: [[0.5, 0.68], [0.68, 0.68], [0.62, 0.86], [0.5, 0.86]] },
    ],
  },
  // Great Crane (boss): an origami crane in profile. A tall folded wing
  // pair rising from a diamond body, a thin neck to a beaked head on the
  // left, a tail spike on the right, two stilt legs. Large, and much
  // wider than anything else.
  crane: {
    size: 'large',
    parts: [
      { fill: 'ink', points: [[0.44, 0.7], [0.48, 0.7], [0.42, 0.9], [0.38, 0.9]] },
      { fill: 'ink', points: [[0.52, 0.7], [0.56, 0.7], [0.62, 0.9], [0.58, 0.9]] },
      { fill: 'danger', stroke: 'ink', points: [[0.32, 0.6], [0.12, 0.16], [0.4, 0.52]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.12, 0.16], [0.06, 0.24], [0.17, 0.2]] },
      { fill: 'danger', stroke: 'ink', points: [[0.68, 0.6], [0.94, 0.2], [0.6, 0.52]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.36, 0.5], [0.5, 0.05], [0.64, 0.5]] },
      { fill: 'shadow', points: [[0.5, 0.05], [0.64, 0.5], [0.5, 0.5]] },
      { fill: 'danger', stroke: 'ink', points: [[0.24, 0.6], [0.5, 0.46], [0.76, 0.6], [0.5, 0.74]] },
      { fill: 'shadow', points: [[0.5, 0.46], [0.76, 0.6], [0.5, 0.74]] },
    ],
  },
});

// Unknown kinds: a plain token with the kind's initial, so tests and new
// content are visible before their shape is drawn.
const FALLBACK = {
  parts: [{ fill: 'danger', stroke: 'ink', points: polygon(8, 0.5, 0.52, 0.32) }],
  label: true,
};

function polygon(n, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** The parts to paint for `creature`'s current state (Shape `poses`). */
export function partsFor(shape, creature) {
  if (shape.poses && creature.jaws && shape.poses.open) return shape.poses.open;
  return shape.parts;
}

/**
 * Draw `creature` on a tile face at (x, y) with side `s` (CSS px).
 * opts: alpha (1), scale (1, around the centre), rot (radians), shadow (true).
 */
export function drawCreature(ctx, p, creature, x, y, s, opts) {
  const alpha = opts && opts.alpha != null ? opts.alpha : 1;
  const scale = opts && opts.scale != null ? opts.scale : 1;
  const rot = (opts && opts.rot) || 0;
  if (alpha <= 0.01 || scale <= 0.01) return;
  const shape = CREATURE_SHAPES[creature.kind] || FALLBACK;
  const parts = partsFor(shape, creature);

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x + s / 2, y + s / 2);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-s / 2, -s / 2);

  if (!opts || opts.shadow !== false) {
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.88, s * 0.26, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s * 0.035);
  for (const part of parts) {
    const pts = part.points;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
    ctx.closePath();
    ctx.fillStyle = p[part.fill];
    ctx.fill();
    if (part.stroke) {
      ctx.strokeStyle = p[part.stroke];
      ctx.stroke();
    }
  }
  if (shape.label) {
    ctx.fillStyle = p.tileFace;
    ctx.font = `700 ${Math.round(s * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(creature.kind || '?').charAt(0).toUpperCase(), s * 0.5, s * 0.54);
  }
  ctx.restore();

  if (creature.kind !== 'player' && creature.maxHp > 1) drawHpPips(ctx, p, creature, x, y, s, alpha);
  if (creature.rest > 0) drawRest(ctx, p, x, y, s, alpha);
  if (creature.sprout > 0) drawSprout(ctx, p, creature.sprout, x, y, s, alpha);
  if (creature.jaws) drawWarn(ctx, p, x, y, s, alpha);
}

// A Lockjaw with its jaws open (core/creatures.js `jaws`): a "!" in a
// triangle in the tile's top-left corner, besides the open-mouth pose, so
// the warning reads by shape: it bites if you're still next to it.
function drawWarn(ctx, p, x, y, s, alpha) {
  const cx = x + s * 0.15;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, y + s * 0.03);
  ctx.lineTo(cx + s * 0.13, y + s * 0.26);
  ctx.lineTo(cx - s * 0.13, y + s * 0.26);
  ctx.closePath();
  ctx.fillStyle = p.glyph;
  ctx.fill();
  ctx.fillStyle = p.tileFace;
  ctx.font = `700 ${Math.round(s * 0.16)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, y + s * 0.175);
  ctx.restore();
}

// A slow creature sitting out its next turn (core/creatures.js `rest`):
// a small "z" in the tile's top-left corner, so its rhythm can be read.
function drawRest(ctx, p, x, y, s, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${Math.round(s * 0.22)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('z', x + s * 0.06, y + s * 0.02);
  ctx.restore();
}

// A spawner's countdown (core/creatures.js `sprout`): turns until its next
// spawn, as a number in a ring in the tile's top-left corner. At 1 the
// ring is solid: it spawns at the end of this turn.
function drawSprout(ctx, p, n, x, y, s, alpha) {
  const r = s * 0.13;
  const cx = x + s * 0.15;
  const cy = y + s * 0.15;
  const ready = n <= 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ready ? p.glyph : p.tileFace;
  ctx.fill();
  ctx.strokeStyle = p.glyph;
  ctx.stroke();
  ctx.fillStyle = ready ? p.tileFace : p.glyph;
  ctx.font = `700 ${Math.round(s * 0.18)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), cx, cy + s * 0.01);
  ctx.restore();
}

// Small HP pips along the tile's top edge: filled = HP left, hollow = lost
// (shape, not just color). The player's HP lives in the HUD instead.
function drawHpPips(ctx, p, c, x, y, s, alpha) {
  const r = Math.max(2, s * 0.05);
  const gap = r * 2.6;
  const x0 = x + s / 2 - ((c.maxHp - 1) * gap) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = Math.max(1, r * 0.5);
  ctx.strokeStyle = p.ink;
  ctx.fillStyle = p.ink;
  for (let i = 0; i < c.maxHp; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y + r * 1.6, r, 0, Math.PI * 2);
    if (i < c.hp) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}
