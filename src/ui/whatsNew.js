// What's new (8f): every release from core/changelog.js, newest first. A
// screen from the title (its row shows while there is something new) or
// Settings (tap the version); a sheet over the board from the pause menu's
// Settings. Opening it marks everything seen, saved in localStorage under
// `foldwork.seenVersion` (guarded, as in hintStore.js).

import { el } from './dom.js';
import { CHANGELOG, LATEST_VERSION, compareVersions, dateText } from '../core/changelog.js';

export const SEEN_VERSION_KEY = 'foldwork.seenVersion';

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** The saved version, or null. */
export function loadSeenVersion(storage = defaultStorage()) {
  try {
    return (storage && storage.getItem(SEEN_VERSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveSeenVersion(version, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SEEN_VERSION_KEY, version);
    return true;
  } catch {
    return false;
  }
}

/**
 * The page. Entries newer than `seen` carry a "New" tag (a word, not only
 * a color).
 */
export function whatsNewPanel(onBack, seen = LATEST_VERSION) {
  const entry = (e) => {
    const fresh = compareVersions(e.version, seen) > 0;
    return el('section', { class: 'settings-group whats-new-entry', 'aria-labelledby': `v-${e.version}` },
      el('h3', { class: 'settings-heading', id: `v-${e.version}` },
        fresh ? el('span', { class: 'new-tag', text: 'New' }) : null,
        `${e.version} · ${dateText(e.date)}`),
      el('strong', { class: 'whats-new-title', text: e.title }),
      el('ul', { class: 'whats-new-notes' }, e.notes.map((n) => el('li', { text: n }))));
  };
  return el('div', { class: 'menu settings whats-new' },
    el('h2', { class: 'outcome-title', text: 'What\'s New' }),
    el('p', { class: 'subtitle', text: `Foldwork version ${LATEST_VERSION}` }),
    el('div', { class: 'settings-groups' }, CHANGELOG.map(entry)),
    el('div', { class: 'menu-buttons' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onBack }, 'Back')));
}

export const whatsNewScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    // From Settings, back to Settings (and its own Back to where it came from).
    const back = () => (params.from === 'settings'
      ? ctx.router.go('settings', { from: params.settingsFrom })
      : ctx.router.go('title'));
    root.append(whatsNewPanel(back, ctx.seenVersion));
    ctx.markWhatsNewSeen();
    root.querySelector('.btn-primary')?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};
