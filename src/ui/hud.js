// In-floor HUD. Two regions, placed by CSS: in portrait the status bar sits
// above the board and the action bar below; in landscape both stack in the
// side panel. Later phases fill in HP, charges, relics, undo and wait.

import { el } from './dom.js';

export function createHud(root, { floor, onMenu }) {
  const status = el('div', { class: 'hud-status', role: 'status' },
    el('span', { class: 'hud-floor', text: `Floor ${floor}` }),
  );
  const actions = el('div', { class: 'hud-actions' },
    el('button', { class: 'btn', type: 'button', onclick: onMenu, 'aria-label': 'Menu' }, 'Menu'),
  );
  const hud = el('div', { class: 'hud' }, status, actions);
  root.append(hud);
  return {
    destroy() {
      hud.remove();
    },
  };
}
