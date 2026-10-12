// Creature painters: origami-style figures built from polygons, defined as
// data and drawn by one shared routine (docs/04: "Defined as data, drawn by a
// shared vector routine"). Each kind has its own silhouette so creatures are
// told apart by shape, not just color.
//
// Shape = { parts: [{ fill, stroke?, points: [[x, y], ...] }] }
//   points are in cell units (0..1 across the tile face); fill/stroke are
//   palette token names. Parts are painted in order.
// New creature kinds (Phase 2b+) add an entry to CREATURE_SHAPES.

export const CREATURE_SHAPES = Object.freeze({
  // A folded-paper figure: a tall rhombus body with one shaded facet and a
  // small diamond head.
  player: {
    parts: [
      { fill: 'accent', stroke: 'ink', points: [[0.5, 0.22], [0.8, 0.56], [0.5, 0.9], [0.2, 0.56]] },
      { fill: 'shadow', points: [[0.5, 0.22], [0.5, 0.9], [0.2, 0.56]] },
      { fill: 'tileFace', stroke: 'ink', points: [[0.5, 0.06], [0.63, 0.2], [0.5, 0.34], [0.37, 0.2]] },
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
