// Creature painters: origami-style figures built from polygons, defined as
// data and drawn by one shared routine (docs/04: "Defined as data, drawn by a
// shared vector routine"). Each kind has its own silhouette so creatures are
// told apart by shape, not just color.
//
// Shape = { parts: [{ fill, stroke?, points: [[x, y], ...] }] }
//   points are in cell units (0..1 across the tile face); fill/stroke are
//   palette token names. Parts are painted in order.
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
  for (const part of shape.parts) {
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
