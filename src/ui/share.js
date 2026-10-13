// Share the game (title screen). Phones and most desktop browsers open
// the system share sheet; elsewhere the link is copied to the clipboard.
// When neither works, the caller shows the link for the player to copy.

export const SHARE_TEXT = 'Foldwork: a free paper-folding roguelike you play in the browser. Fold the dungeon floor to solve puzzles and beat enemies.';

/**
 * The address to share: the live site named in the link-preview tags
 * (index.html og:url), else this page without its query string (dev
 * params stay private).
 */
export function shareUrl(doc = document, loc = location) {
  const meta = doc.querySelector('meta[property="og:url"]');
  return (meta && meta.getAttribute('content')) || `${loc.origin}${loc.pathname}`;
}

/**
 * Share `url`. Resolves to how it went: 'shared', 'copied', 'cancelled'
 * (the player closed the share sheet) or 'manual' (nothing worked; show
 * the link).
 */
export async function shareGame(url, nav = navigator) {
  const data = { title: 'Foldwork', text: SHARE_TEXT, url };
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Not allowed here (no user gesture, a blocked frame): try copying.
    }
  }
  try {
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    // Clipboard blocked: fall through to showing the link.
  }
  return 'manual';
}
