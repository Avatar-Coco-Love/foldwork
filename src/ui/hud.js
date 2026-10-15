// In-floor HUD. Two regions, placed by CSS: in portrait the status bar sits
// above the board and the action bar below; in landscape both stack in the
// side panel. The relic tray (Phase 4a) lists the run's relics on the line
// under the meters (in portrait it gives way to the fold text while that
// shows); Phase 4b adds the offers screen where they are chosen.
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

export function createHud(root, {
  floor, lastFloor = null, onMenu, onUndo, onCancel, onWait, onHint = null, onConfirmFold = null, onPocket = null,
  onReserve = null,
}) {
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
    ),
    relics.node,
    message,
  );
  const undoBtn = el('button', {
    class: 'btn', type: 'button', onclick: onUndo, disabled: true, 'aria-keyshortcuts': 'U Z', 'aria-label': 'Undo fold',
  }, 'Undo');
  const waitBtn = el('button', {
    class: 'btn', type: 'button', onclick: onWait, 'aria-keyshortcuts': 'Space',
  }, 'Wait');
  // Shown only while a fold is being previewed (tap with a second finger);
  // it takes Wait's place, since waiting mid-gesture makes no sense.
  const cancelBtn = el('button', {
    class: 'btn hud-cancel', type: 'button', onclick: onCancel, hidden: true, 'aria-keyshortcuts': 'Escape',
  }, 'Cancel');
  // Tap-to-confirm (Settings): plays the held fold. Takes Hint's place.
  const foldBtn = el('button', {
    class: 'btn btn-primary hud-confirm', type: 'button', onclick: () => onConfirmFold && onConfirmFold(), hidden: true,
    'aria-keyshortcuts': 'Enter',
  }, 'Fold');
  const hintBtn = onHint && el('button', {
    class: 'btn', type: 'button', onclick: onHint, 'aria-keyshortcuts': 'H',
  }, 'Hint');
  // Pocket Fold's mode toggle (P): pressed, it folds one lane only. The
  // check mark says so without color.
  const pocketBtn = onPocket && el('button', {
    class: 'btn hud-pocket', type: 'button', onclick: onPocket, 'aria-pressed': 'false', 'aria-keyshortcuts': 'P',
    title: 'Pocket Fold: fold only the row or column your drag starts in',
  }, 'Pocket');
  const actions = el('div', { class: 'hud-actions' },
    undoBtn,
    waitBtn,
    cancelBtn,
    foldBtn,
    pocketBtn,
    hintBtn,
    // Opens the pause menu (Resume, Restart Floor, Settings, …).
    el('button', {
      class: 'btn', type: 'button', onclick: onMenu, 'aria-keyshortcuts': 'Escape', 'aria-haspopup': 'dialog',
    }, 'Menu'),
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

  // The hint card sits above the action bar in portrait; report its height
  // (plus its gap) so the board moves up instead of being covered. In
  // landscape the card is in the side panel and layout.js ignores this.
  let reserved = 0;
  function report(height) {
    const bottom = height > 0 ? Math.ceil(height) + 8 : 0;
    if (bottom === reserved) return;
    reserved = bottom;
    onReserve?.({ bottom });
  }
  const sizer = onReserve && typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => report(hintCard ? hintCard.getBoundingClientRect().height : 0))
    : null;

  function show(node, onEscape) {
    overlay?.remove();
    overlay = node;
    // A peek leaves the board in view; the hint card waits under it.
    hud.classList.toggle('hud-peeking', node.classList.contains('hud-peek'));
    if (onEscape) {
      node.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onEscape();
      });
    }
    root.append(node);
  }

  function syncMessage() {
    const shown = foldText || note;
    message.textContent = shown ? shown.text : '';
    message.toggleAttribute('data-invalid', !!shown && shown.invalid);
    // Portrait: the relic row and this text share the bar's second line.
    status.toggleAttribute('data-message', !!shown);
  }

  return {
    setUndoEnabled(value) {
      undoBtn.disabled = !value;
    },
    /** Pocket mode on or off (the button exists only with Pocket Fold). */
    setPocket(on) {
      if (!pocketBtn) return;
      pocketBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      pocketBtn.classList.toggle('btn-primary', !!on);
      pocketBtn.textContent = on ? 'Pocket ✓' : 'Pocket';
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
    /** Whether a held fold waits for the Fold button (tap-to-confirm). */
    setFoldPending(on) {
      foldBtn.hidden = !on;
      if (hintBtn) hintBtn.hidden = !!on;
      if (on) foldBtn.focus({ preventScroll: true });
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
    /**
     * A panel over the board: end of floor, the pause menu, or a question
     * (Restart Floor). actions: [{ label, onclick, primary }]. `onEscape`
     * lets Esc close it.
     */
    showOutcome({ title, text = '', actions: buttons, onEscape = null }) {
      const btns = buttons.map((b) => el('button', {
        class: b.primary ? 'btn btn-primary' : 'btn', type: 'button', onclick: b.onclick,
      }, b.label));
      show(el('div', { class: 'menu hud-outcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'outcome-title' },
        el('div', { class: 'panel' },
          el('h2', { class: 'outcome-title', id: 'outcome-title', text: title }),
          text ? el('p', { class: 'subtitle', text }) : null,
          el('div', { class: 'menu-buttons' }, btns),
        ),
      ), onEscape);
      btns[0]?.focus({ preventScroll: true });
    },
    /**
     * A full screen over the board (Settings, How to Play from the pause
     * menu): `node` is a `.menu` built by the screen. Focuses its first
     * button.
     */
    showSheet(node, { onEscape = null } = {}) {
      node.classList.add('hud-sheet');
      node.setAttribute('role', 'dialog');
      node.setAttribute('aria-modal', 'true');
      show(node, onEscape);
      node.querySelector('button')?.focus({ preventScroll: true });
    },
    /**
     * A look at the board (fold history peek): the title and text take the
     * status bar's place and the buttons the action bar's (in landscape,
     * the side panel), so the board stays in view. Modal like a panel:
     * `onEscape` lets Esc (and the phone Back button) close it.
     */
    showPeek({ title, text = '', actions: buttons, onEscape = null }) {
      const btns = buttons.map((b) => el('button', {
        class: b.primary ? 'btn btn-primary' : 'btn', type: 'button', onclick: b.onclick,
      }, b.label));
      show(el('div', { class: 'hud-peek', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'peek-title' },
        el('div', { class: 'hud-peek-head' },
          el('strong', { class: 'hud-peek-title', id: 'peek-title', text: title }),
          text ? el('span', { class: 'hud-peek-text', text }) : null,
        ),
        el('div', { class: 'hud-peek-actions' }, btns),
      ), onEscape);
      btns[0]?.focus({ preventScroll: true });
    },
    hideOutcome() {
      overlay?.remove();
      overlay = null;
      hud.classList.remove('hud-peeking');
    },
    /** Whether a panel or sheet is over the board. */
    get overlayShown() {
      return !!overlay;
    },
    /**
     * Tutorial hint card (docs/04): non-blocking, so play continues while
     * it shows. "Got it" calls onDismiss. Replaces any card shown.
     */
    showHint({ title, text, onDismiss, actions: extra = [] }) {
      hintCard?.remove();
      hintCard = el('aside', { class: 'hud-hint', role: 'note', 'aria-live': 'polite', 'aria-label': `Hint: ${title}` },
        el('div', { class: 'hud-hint-body' },
          el('strong', { class: 'hud-hint-title', text: title }),
          el('span', { text }),
        ),
        el('div', { class: 'hud-hint-actions' },
          ...extra.map((b) => el('button', { class: 'btn', type: 'button', onclick: b.onclick }, b.label)),
          el('button', { class: 'btn', type: 'button', onclick: onDismiss }, 'Got it'),
        ),
      );
      hud.insertBefore(hintCard, actions);
      sizer?.disconnect();
      sizer?.observe(hintCard);
    },
    hideHint() {
      hintCard?.remove();
      hintCard = null;
      sizer?.disconnect();
      report(0);
    },
    destroy() {
      clearTimeout(noteTimer);
      sizer?.disconnect();
      report(0);
      overlay?.remove();
      hintCard?.remove();
      hud.remove();
    },
  };
}
