// Send Feedback / Report a Bug (9j): a kind (Bug, Idea, Something else),
// one message box and a privacy note. Sending queues a `feedback` event
// through ctx.sendFeedback (main.js; data built by telemetry/feedback.js),
// so it is kept offline and sent once back online, with Share play data
// on or off. A screen from the title's Settings, a sheet over the board
// from the pause menu or Settings in a run (`context`: the floor it was
// sent from).

import { el } from './dom.js';
import { FEEDBACK_KINDS, FEEDBACK_MAX } from '../telemetry/feedback.js';

/** What the player sees after Send. */
export const FEEDBACK_SAID = Object.freeze({
  online: 'Thanks! Your note is on its way.',
  offline: 'Thanks! You\'re offline, so it will send by itself next time you\'re online.',
  off: 'Feedback is turned off in this session (?telemetry=off), so nothing was sent.',
});

export const FEEDBACK_NOTE = 'Sent anonymously, even with Share play data off. Please don\'t include your name or contact details. Your note also carries the game version, your screen size and input type, and the floor, layout and spirit you\'re on.';

// An unsent draft, kept while this page is open (closing the form, or a
// look at Privacy, doesn't lose it). Cleared by sending.
let draft = { kind: null, text: '' };

/** What the form says after Send returned `result` (ctx.sendFeedback). */
export function saidAfterSend(result) {
  if (!result.queued) return FEEDBACK_SAID.off;
  return result.online ? FEEDBACK_SAID.online : FEEDBACK_SAID.offline;
}

/**
 * The form. opts: { onBack, onPrivacy, from: 'settings' | 'pause',
 * context: telemetry/feedback.js feedbackContext() or null }.
 */
export function feedbackPanel(ctx, {
  onBack, onPrivacy, from = 'settings', context = null,
}) {
  const kindButtons = FEEDBACK_KINDS.map((k) => {
    const btn = el('button', {
      class: 'btn feedback-kind', type: 'button', role: 'radio', 'data-kind': k.id,
      onclick: () => pick(k.id),
    });
    btn.dataset.name = k.name;
    return btn;
  });
  const kinds = el('div', { class: 'feedback-kinds', role: 'radiogroup', 'aria-labelledby': 'feedback-kind-label' }, kindButtons);
  const text = el('textarea', {
    class: 'share-link feedback-text', id: 'feedback-text', maxlength: FEEDBACK_MAX, rows: 5,
    autocomplete: 'off', placeholder: 'What happened, or what would you like?',
    'aria-describedby': 'feedback-note',
  });
  text.value = draft.text;
  const count = el('span', { class: 'setting-note feedback-count', 'aria-live': 'off' });
  const error = el('p', { class: 'code-error', role: 'alert' });
  const syncCount = () => {
    count.textContent = `${text.value.length} / ${FEEDBACK_MAX}`;
  };
  text.addEventListener('input', () => {
    draft.text = text.value;
    syncCount();
    if (text.value.trim() && draft.kind) error.textContent = '';
  });
  syncCount();

  const form = el('div', { class: 'menu-buttons code-block feedback-form' },
    el('p', { class: 'subtitle', text: 'Found a bug, or have an idea? Tell the developer.' }),
    el('span', { class: 'settings-heading', id: 'feedback-kind-label', text: 'Kind' }),
    kinds,
    el('label', { class: 'settings-heading', for: 'feedback-text', text: 'Your message' }),
    text,
    count,
    el('p', { class: 'settings-about feedback-note', id: 'feedback-note', text: FEEDBACK_NOTE }),
    el('button', { class: 'btn btn-secondary', type: 'button', 'data-setting': 'privacy', onclick: onPrivacy }, 'Privacy: what\'s sent'),
    error,
    el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'send', onclick: send }, 'Send'),
  );
  const back = el('button', { class: 'btn btn-secondary', type: 'button', onclick: onBack }, 'Back');
  const panel = el('div', { class: 'menu settings feedback' },
    el('h2', { class: 'outcome-title', text: 'Send feedback' }),
    form,
    el('div', { class: 'menu-buttons' }, back));
  syncKinds();
  return panel;

  function pick(id) {
    draft.kind = id;
    syncKinds();
    error.textContent = '';
    if (!text.value.trim()) text.focus({ preventScroll: true });
  }

  // The chosen kind reads by its mark and aria-checked, not only color.
  function syncKinds() {
    for (const btn of kindButtons) {
      const on = btn.dataset.kind === draft.kind;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.classList.toggle('btn-primary', on);
      btn.textContent = on ? `✓ ${btn.dataset.name}` : btn.dataset.name;
    }
  }

  function send() {
    if (!draft.kind) {
      error.textContent = 'Pick Bug, Idea or Something else first.';
      kindButtons[0].focus({ preventScroll: true });
      return;
    }
    const result = ctx.sendFeedback({
      kind: draft.kind, text: text.value, from, context,
    });
    if (!result) {
      error.textContent = 'Write a message first.';
      text.focus({ preventScroll: true });
      return;
    }
    if (result.queued) draft = { kind: null, text: '' };
    const done = el('div', { class: 'menu-buttons code-block feedback-sent' },
      el('p', { class: 'code-status', role: 'status', text: saidAfterSend(result) }));
    form.replaceWith(done);
    back.classList.replace('btn-secondary', 'btn-primary');
    back.focus({ preventScroll: true });
  }
}

/**
 * Screen (title's Settings > About). Back returns to Settings (whose Back
 * goes to `settingsFrom`); Privacy opens over it and comes back here.
 */
export const feedbackScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    const back = () => ctx.router.go('settings', { from: params.settingsFrom });
    root.append(feedbackPanel(ctx, {
      onBack: back,
      onPrivacy: () => ctx.router.go('privacy', { from: 'feedback', settingsFrom: params.settingsFrom }),
    }));
    root.querySelector('.feedback-kind')?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};
