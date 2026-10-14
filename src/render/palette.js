// Color palettes. Each palette defines the same token set; renderers and CSS
// read tokens by name, never raw colors. Tile types also get distinct symbols
// (drawn by the renderer), so color is never the only cue. `glyph` is ink
// that reads on a tile face in every palette (tile symbols, keys).
// `grain` scales the paper grain (lower where contrast matters most).
// Contrast (tests/contrast.test.js, WCAG): ink, inkSoft and danger read
// at 4.5:1 on the background and UI surface; `accentUi` (a deeper accent
// where needed) fills primary buttons and rings focus at 3:1 on the
// background, with `onAccent` text on it at 4.5:1.
//
// `unlock` (core/unlocks.js): 'starter' palettes are free; the rest are
// bought in the unlocks shop (PALETTE_COST, or a `cost` here). A new
// palette is a new object below with the same tokens, added to PALETTES.

const PAPER = {
  id: 'paper',
  name: 'Paper',
  unlock: 'starter',
  scheme: 'light',
  background: '#e9e2d3',
  backgroundAccent: '#ded5c2',
  boardEdge: '#c9bea8',
  shadow: 'rgba(60, 45, 25, 0.22)',
  grain: 1, // paper grain strength (render/grain.js)
  tileFace: '#fbf8f1',
  tileEdge: '#d8cfbd',
  gridLine: 'rgba(90, 75, 55, 0.12)',
  wallFace: '#8c8070',
  glyph: '#3a3229',
  voidFace: '#2e2a33',
  ink: '#3a3229',
  inkSoft: '#6d6253',
  accent: '#d9734e',
  danger: '#a93226',
  uiSurface: 'rgba(251, 248, 241, 0.92)',
  uiBorder: '#cfc4ae',
  accentUi: '#a94e2a', // primary buttons, focus rings (3:1 on background)
  onAccent: '#ffffff', // text on accentUi (4.5:1)
};

const NIGHT_INK = {
  id: 'night-ink',
  name: 'Night Ink',
  unlock: 'starter',
  scheme: 'dark',
  background: '#1b1d26',
  backgroundAccent: '#22252f',
  boardEdge: '#0f1016',
  shadow: 'rgba(0, 0, 0, 0.45)',
  grain: 0.8, // paper grain strength (render/grain.js)
  tileFace: '#d9d4c7',
  tileEdge: '#9f998b',
  gridLine: 'rgba(20, 20, 30, 0.18)',
  wallFace: '#5a5866',
  glyph: '#2a2833',
  voidFace: '#07070b',
  ink: '#ebe6da',
  inkSoft: '#a9a49a',
  accent: '#e8a15a',
  danger: '#ff6b5b',
  uiSurface: 'rgba(34, 37, 47, 0.92)',
  uiBorder: '#3a3e4c',
  accentUi: '#e8a15a', // primary buttons, focus rings (3:1 on background)
  onAccent: '#1b1d26', // text on accentUi (4.5:1)
};

const HIGH_CONTRAST = {
  id: 'high-contrast',
  name: 'High Contrast',
  unlock: 'starter',
  scheme: 'light',
  background: '#ffffff',
  backgroundAccent: '#f0f0f0',
  boardEdge: '#000000',
  shadow: 'rgba(0, 0, 0, 0.35)',
  grain: 0.5, // paper grain strength (render/grain.js)
  tileFace: '#ffffff',
  tileEdge: '#000000',
  gridLine: 'rgba(0, 0, 0, 0.55)',
  wallFace: '#404040',
  glyph: '#000000',
  voidFace: '#000000',
  ink: '#000000',
  inkSoft: '#222222',
  accent: '#0050c8',
  danger: '#b00000',
  uiSurface: '#ffffff',
  uiBorder: '#000000',
  accentUi: '#0050c8', // primary buttons, focus rings (3:1 on background)
  onAccent: '#ffffff', // text on accentUi (4.5:1)
};

// Shop palettes (Phase 7b). Same rules as the rest: tile symbols carry
// meaning, so color is never the only cue.
const KRAFT = {
  id: 'kraft',
  name: 'Kraft',
  scheme: 'light',
  background: '#c9a77c',
  backgroundAccent: '#bd9a6d',
  boardEdge: '#8f6d45',
  shadow: 'rgba(60, 35, 10, 0.3)',
  grain: 1.2, // paper grain strength (render/grain.js)
  tileFace: '#e8d3b0',
  tileEdge: '#b8996c',
  gridLine: 'rgba(80, 50, 20, 0.16)',
  wallFace: '#6e5233',
  glyph: '#2e2014',
  voidFace: '#2a1f17',
  ink: '#2e2014',
  inkSoft: '#4f3b27',
  accent: '#a8431f',
  danger: '#7e140c',
  uiSurface: 'rgba(232, 211, 176, 0.94)',
  uiBorder: '#9c7a50',
  accentUi: '#7d2d12', // primary buttons, focus rings (3:1 on background)
  onAccent: '#ffffff', // text on accentUi (4.5:1)
};

const BLUEPRINT = {
  id: 'blueprint',
  name: 'Blueprint',
  scheme: 'dark',
  background: '#123a6b',
  backgroundAccent: '#164378',
  boardEdge: '#0a2547',
  shadow: 'rgba(0, 10, 30, 0.45)',
  grain: 0.8, // paper grain strength (render/grain.js)
  tileFace: '#dce9f7',
  tileEdge: '#8fb0d6',
  gridLine: 'rgba(18, 58, 107, 0.2)',
  wallFace: '#3d6596',
  glyph: '#0d2b50',
  voidFace: '#06182e',
  ink: '#eef5ff',
  inkSoft: '#a9c4e6',
  accent: '#ffd166',
  danger: '#ff8a7d',
  uiSurface: 'rgba(16, 52, 96, 0.94)',
  uiBorder: '#4f7bb3',
  accentUi: '#ffd166', // primary buttons, focus rings (3:1 on background)
  onAccent: '#123a6b', // text on accentUi (4.5:1)
};

export const PALETTES = Object.freeze({
  [PAPER.id]: PAPER,
  [NIGHT_INK.id]: NIGHT_INK,
  [HIGH_CONTRAST.id]: HIGH_CONTRAST,
  [KRAFT.id]: KRAFT,
  [BLUEPRINT.id]: BLUEPRINT,
});

export const DEFAULT_PALETTE_ID = PAPER.id;

export function getPalette(id) {
  return PALETTES[id] || PALETTES[DEFAULT_PALETTE_ID];
}

/** camelCase token → --kebab-case CSS variable name. */
export function cssVarName(token) {
  return '--c-' + token.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}
