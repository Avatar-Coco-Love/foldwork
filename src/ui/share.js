// Share the game (title screen), or a challenge: a link that starts a run
// on the sharer's seed (pause menu, playtest P6). Phones and most desktop
// browsers open the system share sheet; elsewhere the link is copied to
// the clipboard. When neither works, the caller shows the link to copy.
//
// Only a title and the link are shared: Chrome on Android joins any text
// with the url into one plain-text share (the sheet then says "Sharing
// text"). Link previews take the blurb from index.html's og:description.

import { isCodeSeed } from '../core/saveCode.js';

/**
 * The address to share: the live site named in the link-preview tags
 * (index.html og:url), else this page without its query string (dev
 * params stay private).
 */
export function shareUrl(doc = document, loc = location) {
  const meta = doc.querySelector('meta[property="og:url"]');
  return (meta && meta.getAttribute('content')) || `${loc.origin}${loc.pathname}`;
}

/** The query parameter a challenge link carries the run seed in. */
export const CHALLENGE_PARAM = 'challenge';

/** A link that challenges a friend to the run seed `seed`. */
export function challengeUrl(seed, base = shareUrl()) {
  const url = new URL(base);
  url.searchParams.set(CHALLENGE_PARAM, seed);
  return url.href;
}

/** The seed a page's query `params` challenge the player to, or null. */
export function challengeSeed(params) {
  const seed = params && params[CHALLENGE_PARAM];
  return isCodeSeed(seed) ? seed : null;
}

/** What navigator.share is given. */
export function shareData(url, title = 'Foldwork') {
  return { title, url };
}

/**
 * Share `url` (under `title`, default 'Foldwork'). Resolves to how it went: 'shared', 'copied', 'cancelled'
 * (the player closed the share sheet) or 'manual' (nothing worked; show
 * the link).
 */
export async function shareGame(url, nav = navigator, title = undefined) {
  const data = shareData(url, title);
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
