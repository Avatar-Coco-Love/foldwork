// In-floor HUD. Two regions, placed by CSS: in portrait the status bar sits
// above the board and the action bar below; in landscape both stack in the
// side panel. Later phases fill in HP, charges, relics and wait.

import { el } from './dom.js';

export function createHud(root, { floor, onMenu, onUndo, onCancel }) {
  const foldStatus = el('span', { class: 'hud-fold', 'aria-live': 'polite' });
  const status = el('div', { class: 'hud-status', role: 'status' },
    el('span', { class: 'hud-floor', text: `Floor ${floor}` }),
    foldStatus,
  );
  const undoBtn = el('button', {
    class: 'btn', type: 'button', onclick: onUndo, disabled: true, 'aria-keyshortcuts': 'U Z',
  }, 'Undo Fold');
  // Shown only while a fold is being previewed (tap with a second finger).
  const cancelBtn = el('button', {
    class: 'btn hud-cancel', type: 'button', onclick: onCancel, hidden: true, 'aria-keyshortcuts': 'Escape',
  }, 'Cancel');
  const actions = el('div', { class: 'hud-actions' },
    undoBtn,
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
  return {
    setUndoEnabled(value) {
      undoBtn.disabled = !value;
    },
    /** Preview summary text, or null when no fold is being previewed. */
    setFoldStatus(text, invalid = false) {
      foldStatus.textContent = text || '';
      foldStatus.toggleAttribute('data-invalid', !!invalid);
      cancelBtn.hidden = text == null;
    },
    destroy() {
      hud.remove();
    },
  };
}
