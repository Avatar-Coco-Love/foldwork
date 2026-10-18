// Privacy (Settings > Data, 9j; OPEN-QUESTIONS "Offline: does feedback
// follow 'Share play data'?"): what Foldwork keeps, sends and doesn't, in
// plain words. A screen from the title's Settings, a sheet over the board
// in a run. The text is data (PRIVACY_SECTIONS); when telemetry or
// feedback start sending something new, say so here in the same PR
// (docs/07-telemetry.md "Privacy" points here).

import { el } from './dom.js';

export const PRIVACY_SECTIONS = Object.freeze([
  {
    id: 'short',
    title: 'In short',
    paras: [
      'Foldwork has no accounts and no ads, and never asks for your name or email. What it sends is anonymous and goes only to the developer, to find bugs and make the game better. It is never sold.',
    ],
  },
  {
    id: 'play-data',
    title: 'Play data',
    paras: [
      'While Settings › Data › Share play data is on (it starts on), Foldwork sends how play goes: floors started and finished, the moves and folds on each floor, hints, relic and spirit picks, settings changes, and errors.',
      'Once a visit it also sends your device type: screen size, touch or mouse, language, and display preferences such as reduced motion or dark mode. Not your browser\'s name, your time zone or your location.',
      'Events carry random ids made on this device (one for the device, one per visit, one per run). They aren\'t linked to you, to any account or to other sites.',
      'Turn Share play data off and nothing more is recorded; play data not yet sent is deleted.',
    ],
  },
  {
    id: 'feedback',
    title: 'Feedback',
    paras: [
      'Send feedback (Settings › About, or the pause menu) sends a note only when you press Send, even with Share play data off.',
      'A note carries your message and its kind (bug, idea or something else), the game version, your screen size and input type, and, sent from a floor, which floor, layout and spirit you were on. With Share play data on it also carries this device\'s random id, so a bug can be matched to the floor where it happened; with it off, it doesn\'t.',
      'Please don\'t write your name or other personal details. Email addresses are removed before sending. Notes are anonymous, so there is no reply.',
    ],
  },
  {
    id: 'offline',
    title: 'Offline',
    paras: [
      'With no connection, play data and feedback wait on this device and are sent by themselves once you are back online.',
    ],
  },
  {
    id: 'where',
    title: 'Where it goes',
    paras: [
      'Everything is sent to a private Google Sheet kept by Foldwork\'s developer, through Google Apps Script. Google runs that service and handles the connection like any web request; Foldwork itself doesn\'t record your IP address.',
    ],
  },
  {
    id: 'device',
    title: 'On this device',
    paras: [
      'Your runs, progress, settings and anything waiting to be sent are kept in this browser\'s storage, not online. Settings › Data › Reset progress erases your progress (from the title screen); clearing this site\'s data in your browser erases everything.',
      'If what Foldwork sends ever changes, What\'s New will say so.',
    ],
  },
]);

/** The page; Back runs `onBack`. */
export function privacyPanel(onBack) {
  const section = (s) => el('section', { class: 'settings-group', 'aria-labelledby': `privacy-${s.id}` },
    el('h3', { class: 'settings-heading', id: `privacy-${s.id}`, text: s.title }),
    s.paras.map((p) => el('p', { class: 'settings-about', text: p })));
  return el('div', { class: 'menu settings privacy' },
    el('h2', { class: 'outcome-title', text: 'Privacy' }),
    el('div', { class: 'settings-groups' }, PRIVACY_SECTIONS.map(section)),
    el('div', { class: 'menu-buttons' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onBack }, 'Back')));
}

/**
 * Screen (title's Settings): `from` 'feedback' returns to the feedback
 * form, else to Settings (whose Back goes to `settingsFrom`).
 */
export const privacyScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    const back = () => (params.from === 'feedback'
      ? ctx.router.go('feedback', { settingsFrom: params.settingsFrom })
      : ctx.router.go('settings', { from: params.settingsFrom }));
    root.append(privacyPanel(back));
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
