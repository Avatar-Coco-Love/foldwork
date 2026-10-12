// In-floor HUD. Two regions, placed by CSS: in portrait the status bar sits
// above the board and the action bar below; in landscape both stack in the
// side panel. The relic tray (Phase 4a) lists the run's relics after the
// meters; Phase 4b adds the offers screen where they are chosen.
//
// Meters use shape as well as color: a filled heart / charge is one left, a
// hollow outline is one spent. Each meter also has a text label for screen
// readers.

import { el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.2 0 3.6 1.3 5.4 3.3 1.8-2 3.2-3.3 5.4-3.3 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';
// A sheet with a folded corner.
const CHARGE = 'M4 3h11l5 5v13H4zM15 3v5h5';
// A key: ring bow on the left, shaft and two teeth to the right.
const KEY = 'M7.5 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 3.2-2H15v2.5h2.5V13.5H19v2h2v-4H10.7a3.5 3.5 0 0 0-3.2-3z';

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

// Carried keys: one icon and a count, hidden while none are carried.
function createCounter(cls, path, label) {
  const count = el('span', { class: 'hud-count' });
  const node = el('span', { class: `hud-meter ${cls}`, role: 'img', hidden: true }, icon(path, 'hud-icon'), count);
  return {
    node,
    set(value) {
      node.hidden = value <= 0;
      count.textContent = `×${value}`;
      node.setAttribute('aria-label', `${label}: ${value}`);
      node.title = `${label}: ${value}`;
    },
  };
}

// The run's relics: a small chip per relic showing its glyph. Names and
// effects are in each chip's tooltip and in one screen-reader label.
function createRelicTray() {
  const node = el('span', { class: 'hud-relics', role: 'img', hidden: true });
  let shown = '';
  return {
    node,
    set(relics) {
      const key = relics.map((r) => r.id).join();
      if (key === shown) return;
      shown = key;
      node.hidden = relics.length === 0;
      node.replaceChildren(...relics.map((r) => el('span', { class: 'hud-relic', title: `${r.name}: ${r.text}`, text: r.glyph })));
      node.setAttribute('aria-label', `Relics: ${relics.map((r) => `${r.name} (${r.text})`).join(', ')}`);
    },
  };
}

export function createHud(root, { floor, lastFloor = null, onMenu, onUndo, onCancel, onWait }) {
  const hp = createMeter('hud-hp', HEART, 'HP');
  const charges = createMeter('hud-charges', CHARGE, 'Fold charges');
  const keys = createCounter('hud-keys', KEY, 'Keys');
  const relics = createRelicTray();
  const message = el('span', { class: 'hud-fold', 'aria-live': 'polite' });
  const status = el('div', { class: 'hud-status', role: 'status' },
    el('div', { class: 'hud-meters' },
      el('span', {
        class: 'hud-floor',
        text: lastFloor ? `Floor ${floor}/${lastFloor}` : `Floor ${floor}`,
        'aria-label': lastFloor ? `Floor ${floor} of ${lastFloor}` : `Floor ${floor}`,
      }),
      hp.node,
      charges.node,
      keys.node,
      relics.node,
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
  let note = null; // transient { text, invalid }, e.g. why a move was refused
  let noteTimer = 0;
  let overlay = null;
  let hintCard = null;

  function syncMessage() {
    const shown = foldText || note;
    message.textContent = shown ? shown.text : '';
    message.toggleAttribute('data-invalid', !!shown && shown.invalid);
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
    setKeys(value) {
      keys.set(value);
    },
    /** Relic defs ({ id, name, text, glyph }) the run holds. */
    setRelics(list) {
      relics.set(list);
    },
    /** Preview summary text, or null when no fold is being previewed. */
    setFoldStatus(text, invalid = false) {
      foldText = text == null ? null : { text, invalid };
      cancelBtn.hidden = text == null;
      waitBtn.hidden = text != null;
      syncMessage();
    },
    /**
     * Short-lived notice (cleared after `ms`, or by the next notice). Shown
     * as a refusal unless `info` is set.
     */
    notify(text, { ms = 1800, info = false } = {}) {
      clearTimeout(noteTimer);
      note = { text, invalid: !info };
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
    /**
     * Tutorial hint card (docs/04): non-blocking, so play continues while
     * it shows. "Got it" calls onDismiss. Replaces any card shown.
     */
    showHint({ title, text, onDismiss }) {
      hintCard?.remove();
      hintCard = el('aside', { class: 'hud-hint', role: 'note', 'aria-live': 'polite', 'aria-label': `Hint: ${title}` },
        el('div', { class: 'hud-hint-body' },
          el('strong', { class: 'hud-hint-title', text: title }),
          el('span', { text }),
        ),
        el('button', { class: 'btn', type: 'button', onclick: onDismiss }, 'Got it'),
      );
      hud.insertBefore(hintCard, actions);
    },
    hideHint() {
      hintCard?.remove();
      hintCard = null;
    },
    destroy() {
      clearTimeout(noteTimer);
      overlay?.remove();
      hintCard?.remove();
      hud.remove();
    },
  };
}
