// Color palettes. Each palette defines the same token set; renderers and CSS
// read tokens by name, never raw colors. Tile types also get distinct symbols
// (drawn by the renderer), so color is never the only cue. `glyph` is ink
// that reads on a tile face in every palette (tile symbols, keys).

const PAPER = {
  id: 'paper',
  name: 'Paper',
  scheme: 'light',
  background: '#e9e2d3',
  backgroundAccent: '#ded5c2',
  boardEdge: '#c9bea8',
  shadow: 'rgba(60, 45, 25, 0.22)',
  tileFace: '#fbf8f1',
  tileEdge: '#d8cfbd',
  gridLine: 'rgba(90, 75, 55, 0.12)',
  wallFace: '#8c8070',
  glyph: '#3a3229',
  voidFace: '#2e2a33',
  ink: '#3a3229',
  inkSoft: '#6d6253',
  accent: '#d9734e',
  danger: '#c0392b',
  uiSurface: 'rgba(251, 248, 241, 0.92)',
  uiBorder: '#cfc4ae',
};

const NIGHT_INK = {
  id: 'night-ink',
  name: 'Night Ink',
  scheme: 'dark',
  background: '#1b1d26',
  backgroundAccent: '#22252f',
  boardEdge: '#0f1016',
  shadow: 'rgba(0, 0, 0, 0.45)',
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
};

const HIGH_CONTRAST = {
  id: 'high-contrast',
  name: 'High Contrast',
  scheme: 'light',
  background: '#ffffff',
  backgroundAccent: '#f0f0f0',
  boardEdge: '#000000',
  shadow: 'rgba(0, 0, 0, 0.35)',
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
};

export const PALETTES = Object.freeze({
  [PAPER.id]: PAPER,
  [NIGHT_INK.id]: NIGHT_INK,
  [HIGH_CONTRAST.id]: HIGH_CONTRAST,
});

export const DEFAULT_PALETTE_ID = PAPER.id;

export function getPalette(id) {
  return PALETTES[id] || PALETTES[DEFAULT_PALETTE_ID];
}

/** camelCase token → --kebab-case CSS variable name. */
export function cssVarName(token) {
  return '--c-' + token.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}
