// In-floor HUD. Two regions, placed by CSS: in portrait the status bar sits
// above the board and the action bar below; in landscape both stack in the
// side panel. Later phases add the relic tray.
//
// Meters use shape as well as color: a filled heart / charge is one left, a
// hollow outline is one spent. Each meter also has a text label for screen
// readers.

import { el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.2 0 3.6 1.3 5.4 3.3 1.8-2 3.2-3.3 5.4-3.3 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';
// A sheet with a folded corner.
const CHARGE = 'M4 3h11l5 5v13H4zM15 3v5h5';

function icon(path, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

function createMeter(cls, path, label) {
  const node = el('span', { class: `hud-meter ${cls}`, role: 'img' });
  let shown = '';
  return {
    node,
    set(value, max) {
      const key = `${value}/${max}`;
      if (key === shown) return;
      shown = key;
      node.replaceChildren();
      for (let i = 0; i < max; i++) {
        node.append(icon(path, i < value ? 'hud-icon' : 'hud-icon hud-icon-spent'));
      }
      node.setAttribute('aria-label', `${label} ${value} of ${max}`);
      node.title = `${label}: ${value} / ${max}`;
    },
  };
}

export function createHud(root, { floor, onMenu, onUndo, onCancel, onWait }) {
  const hp = createMeter('hud-hp', HEART, 'HP');
  const charges = createMeter('hud-charges', CHARGE, 'Fold charges');
  const message = el('span', { class: 'hud-fold', 'aria-live': 'polite' });
  const status = el('div', { class: 'hud-status', role: 'status' },
    el('div', { class: 'hud-meters' },
      el('span', { class: 'hud-floor', text: `Floor ${floor}` }),
      hp.node,
      charges.node,
    ),
    message,
  );
  const undoBtn = el('button', {
    class: 'btn', type: 'button', onclick: onUndo, disabled: true, 'aria-keyshortcuts': 'U Z',
  }, 'Undo Fold');
  const waitBtn = el('button', {
    class: 'btn', type: 'button', onclick: onWait, 'aria-keyshortcuts': 'Space',
  }, 'Wait');
  // Shown only while a fold is being previewed (tap with a second finger);
  // it takes Wait's place, since waiting mid-gesture makes no sense.
  const cancelBtn = el('button', {
    class: 'btn hud-cancel', type: 'button', onclick: onCancel, hidden: true, 'aria-keyshortcuts': 'Escape',
  }, 'Cancel');
  const actions = el('div', { class: 'hud-actions' },
    undoBtn,
    waitBtn,
    cancelBtn,
    el('button', { class: 'btn', type: 'button', onclick: onMenu, 'aria-label': 'Menu' }, 'Menu'),
  );
  // Pointer-down (not click) so a second finger can cancel mid-drag.
  cancelBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onCancel();
  });
  const hud = el('div', { class: 'hud' }, status, actions);
  root.append(hud);

  let foldText = null;
  let note = null; // transient message, e.g. why a move was refused
  let noteTimer = 0;
  let overlay = null;

  function syncMessage() {
    const text = foldText ? foldText.text : note;
    message.textContent = text || '';
    message.toggleAttribute('data-invalid', !!(foldText ? foldText.invalid : note));
  }

  return {
    setUndoEnabled(value) {
      undoBtn.disabled = !value;
    },
    setHp(value, max) {
      hp.set(value, max);
    },
    setCharges(value, max) {
      charges.set(value, max);
    },
    /** Preview summary text, or null when no fold is being previewed. */
    setFoldStatus(text, invalid = false) {
      foldText = text == null ? null : { text, invalid };
      cancelBtn.hidden = text == null;
      waitBtn.hidden = text != null;
      syncMessage();
    },
    /** Short-lived notice (cleared after `ms`, or by the next notice). */
    notify(text, ms = 1800) {
      clearTimeout(noteTimer);
      note = text;
      syncMessage();
      noteTimer = setTimeout(() => {
        note = null;
        syncMessage();
      }, ms);
    },
    /** End-of-floor panel. actions: [{ label, onclick, primary }]. */
    showOutcome({ title, text, actions: buttons }) {
      overlay?.remove();
      const btns = buttons.map((b) => el('button', {
        class: b.primary ? 'btn btn-primary' : 'btn', type: 'button', onclick: b.onclick,
      }, b.label));
      overlay = el('div', { class: 'menu hud-outcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'outcome-title' },
        el('div', { class: 'panel' },
          el('h2', { class: 'outcome-title', id: 'outcome-title', text: title }),
          el('p', { class: 'subtitle', text }),
          el('div', { class: 'menu-buttons' }, btns),
        ),
      );
      root.append(overlay);
      btns[0]?.focus();
    },
    destroy() {
      clearTimeout(noteTimer);
      overlay?.remove();
      hud.remove();
    },
  };
}
