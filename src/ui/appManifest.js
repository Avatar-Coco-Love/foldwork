// Home-screen install: the web app manifest and Apple touch icon, built at
// startup. The icons are drawn in code (render/appIcon.js) to PNG data
// URLs, and the manifest itself is a data URL, so the game ships no image
// or manifest files. A data-URL manifest can't resolve relative addresses,
// so start_url, scope and id are absolute (the page's folder).

import { drawAppIcon } from '../render/appIcon.js';
import { getPalette, DEFAULT_PALETTE_ID } from '../render/palette.js';

/** Manifest icon sizes (px); each is also drawn maskable at 512. */
export const ICON_SIZES = Object.freeze([192, 512]);
export const MASKABLE_SIZE = 512;
/** iOS ignores manifest icons and reads this one (180px is its largest). */
export const APPLE_ICON_SIZE = 180;
/** The installed app's splash and title-bar colour (matches index.html). */
export const THEME_COLOR = '#efe8da';

/** The folder a page address sits in: 'https://x.io/foldwork/?a=1' -> '.../foldwork/'. */
export function appBase(href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/[^/]*$/, '');
  return url.href;
}

/**
 * The manifest as plain data. `base`: the app's folder (appBase).
 * `icons`: [{ src, size, maskable }].
 */
export function buildManifest({ base, icons, background }) {
  return {
    id: base,
    name: 'Foldwork',
    short_name: 'Foldwork',
    description: 'Fold the paper dungeon floor to solve puzzles and defeat enemies.',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'any',
    background_color: background,
    theme_color: THEME_COLOR,
    categories: ['games'],
    icons: icons.map(({ src, size, maskable }) => ({
      src,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: maskable ? 'maskable' : 'any',
    })),
  };
}

/** A manifest object as a `<link rel="manifest">` address. */
export function manifestHref(manifest) {
  return `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;
}

function iconUrl(doc, size, palette, maskable) {
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  drawAppIcon(canvas.getContext('2d'), size, palette, { maskable });
  return canvas.toDataURL('image/png');
}

function addLink(doc, rel, href, sizes) {
  const link = doc.createElement('link');
  link.rel = rel;
  link.href = href;
  if (sizes) link.setAttribute('sizes', sizes);
  doc.head.append(link);
}

/**
 * Adds the manifest and Apple touch icon to the page. The installed icon
 * is always the Paper palette (the player's palette can change later).
 * Never throws: without it the game still plays, it just can't install.
 */
export function installAppManifest(doc = document, href = location.href) {
  try {
    const palette = getPalette(DEFAULT_PALETTE_ID);
    const icons = [
      ...ICON_SIZES.map((size) => ({ size, maskable: false })),
      { size: MASKABLE_SIZE, maskable: true },
    ].map((icon) => ({ ...icon, src: iconUrl(doc, icon.size, palette, icon.maskable) }));
    const manifest = buildManifest({ base: appBase(href), icons, background: palette.background });
    addLink(doc, 'manifest', manifestHref(manifest));
    addLink(doc, 'apple-touch-icon', iconUrl(doc, APPLE_ICON_SIZE, palette, false), `${APPLE_ICON_SIZE}x${APPLE_ICON_SIZE}`);
  } catch {
    // No canvas or no head: the game runs without the install option.
  }
}
