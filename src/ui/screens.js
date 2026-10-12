// Screen definitions. Each is registered with the router in main.js.

import { el } from './dom.js';
import { createHud } from './hud.js';
import { createFoldInput } from './input.js';
import { foldWithUndo, unfold } from '../core/fold.js';
import { buildFoldPreview } from '../render/preview.js';
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
    // Floor session state. Phase 2a moves this into the turn engine (charges,
    // and undo only until the player's next action).
    const state = {
      board: params.demo ? demoBoard(size, ctx.seed) : createBoard(size, size),
      undo: null, // snapshot of the latest fold, if it can still be undone
      preview: null,
    };
    const canvas = ctx.renderer.canvas;

    const sync = () => {
      ctx.renderer.setScene({ board: state.board, preview: state.preview });
      hud.setUndoEnabled(!!state.undo);
      const pv = state.preview;
      hud.setFoldStatus(pv ? foldStatusText(pv) : null, pv && !pv.ok);
    };

    const hud = createHud(root, {
      floor: params.floor || 1,
      onMenu: () => ctx.router.go('title'),
      onUndo: () => undo(),
      onCancel: () => input.cancel(),
    });

    function undo() {
      if (!state.undo) return;
      state.board = unfold(state.undo);
      state.undo = null;
      sync();
    }

    const input = createFoldInput({
      canvas,
      getLayout: () => ctx.renderer.layout,
      getBoard: () => state.board,
      onPreview(crease) {
        state.preview = crease ? buildFoldPreview(state.board, crease) : null;
        sync();
      },
      onConfirm(crease) {
        const pv = buildFoldPreview(state.board, crease);
        if (!pv || !pv.ok) return false;
        const result = foldWithUndo(state.board, crease);
        state.board = result.board;
        state.undo = result.undo;
        state.preview = null;
        sync();
        return true;
      },
      onInvalid() {
        canvas.classList.remove('shake');
        void canvas.offsetWidth; // restart the animation
        canvas.classList.add('shake');
      },
      onUndo: undo,
    });

    sync();
    return () => {
      input.destroy();
      hud.destroy();
      canvas.classList.remove('shake');
    };
  },
};

function foldStatusText(pv) {
  if (!pv.ok) {
    const n = pv.reasons.filter((r) => r.code === 'stack-overflow').length;
    return `Too tall: ${n} stack${n === 1 ? '' : 's'} over ${pv.reasons[0]?.max ?? 3}`;
  }
  return 'Ready to fold';
}

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
