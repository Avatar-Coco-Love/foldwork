// Screen definitions. Each is registered with the router in main.js.

import { el } from './dom.js';
import { createHud } from './hud.js';
import { createBoard } from '../core/board.js';
import { TILE } from '../core/tiles.js';
import { createRng, fork, nextInt, chance } from '../core/rng.js';
import { PALETTES } from '../render/palette.js';

export const titleScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    const paletteIds = Object.keys(PALETTES);
    const paletteBtn = el('button', { class: 'btn btn-secondary', type: 'button' });
    const syncPaletteLabel = () => {
      paletteBtn.textContent = `Palette: ${ctx.renderer.palette.name}`;
    };
    paletteBtn.addEventListener('click', () => {
      const i = paletteIds.indexOf(ctx.renderer.palette.id);
      ctx.setPalette(paletteIds[(i + 1) % paletteIds.length]);
      syncPaletteLabel();
    });
    syncPaletteLabel();

    root.append(
      el('div', { class: 'menu' },
        el('h1', { class: 'title', text: 'Foldwork' }),
        el('p', { class: 'subtitle', text: 'Fold the paper dungeon.' }),
        el('div', { class: 'menu-buttons' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.router.go('floor', { floor: 1 }) }, 'New Run'),
          paletteBtn,
        ),
      ),
    );
  },
};

export const floorScreen = {
  mount(root, ctx, params) {
    const size = clampSize(Number(params.size) || 5);
    const board = params.demo ? demoBoard(size, ctx.seed) : createBoard(size, size);
    ctx.renderer.setScene({ board });
    const hud = createHud(root, {
      floor: params.floor || 1,
      onMenu: () => ctx.router.go('title'),
    });
    return () => hud.destroy();
  },
};

function clampSize(n) {
  return Math.min(8, Math.max(5, Math.round(n)));
}

/** Dev-only seeded layout exercising every tile painter and layer stacking. */
function demoBoard(size, seed) {
  const rng = fork(createRng(seed), 'demo');
  const board = createBoard(size, size, () => {
    const roll = nextInt(rng, 0, 10);
    return roll === 0 ? TILE.WALL : roll === 1 ? TILE.VOID : TILE.FLOOR;
  });
  for (const cell of board.cells) {
    if (chance(rng, 0.15)) cell.layers.push({ ...cell.layers[0], tile: TILE.FLOOR });
  }
  return board;
}
