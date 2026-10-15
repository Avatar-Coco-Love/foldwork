// The home-screen icon, drawn in code (no image files): the favicon's
// design (index.html), a paper sheet with a folded corner and a dashed
// crease, on a 32-unit grid scaled to `size` pixels.
//
// `maskable`: the launcher crops the icon to its own shape (circle,
// squircle), so the background fills the whole square and the sheet is
// shrunk into the safe zone (a centred circle 80% of the icon wide).

/** Sheet outline, folded corner and crease on the 32-unit grid. */
const SHEET = [[7, 5], [19, 5], [25, 11], [25, 27], [7, 27]];
const CORNER = [[19, 5], [19, 11], [25, 11]];
const CREASE = [[7, 19], [25, 19]];
const GRID = 32;
const RADIUS = 7; // corner radius of the plain icon's background
const MASKABLE_SCALE = 0.75; // keeps the sheet inside the safe circle

/** Maps grid units to pixels, shrunk about the centre for maskable icons. */
function toPixels(size, maskable) {
  const unit = size / GRID;
  const scale = maskable ? MASKABLE_SCALE : 1;
  const mid = GRID / 2;
  return (x, y) => [(mid + (x - mid) * scale) * unit, (mid + (y - mid) * scale) * unit];
}

function polygon(ctx, points, map) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const [px, py] = map(x, y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
}

/**
 * Draws the icon into the square (0, 0)-(size, size) of a 2D context.
 * `palette`: render/palette.js tokens (background, tileFace, ink, accent).
 */
export function drawAppIcon(ctx, size, palette, { maskable = false } = {}) {
  const unit = size / GRID;
  const scale = maskable ? MASKABLE_SCALE : 1;
  const map = toPixels(size, maskable);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette.background;
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    const r = RADIUS * unit;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(size, 0, size, size, r);
    ctx.arcTo(size, size, 0, size, r);
    ctx.arcTo(0, size, 0, 0, r);
    ctx.arcTo(0, 0, size, 0, r);
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineWidth = 2 * unit * scale;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.ink;

  polygon(ctx, SHEET, map);
  ctx.closePath();
  ctx.fillStyle = palette.tileFace;
  ctx.fill();
  ctx.stroke();

  polygon(ctx, CORNER, map);
  ctx.closePath();
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.stroke();

  polygon(ctx, CREASE, map);
  ctx.strokeStyle = palette.accent;
  ctx.setLineDash([3 * unit * scale, 2 * unit * scale]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Every point the sheet uses, in pixels (tests check the safe zone). */
export function iconPoints(size, { maskable = false } = {}) {
  const map = toPixels(size, maskable);
  return [...SHEET, ...CORNER, ...CREASE].map(([x, y]) => map(x, y));
}
