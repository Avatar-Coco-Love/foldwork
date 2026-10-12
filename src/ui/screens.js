// Screen definitions. Each is registered with the router in main.js.

import { el } from './dom.js';
import { createHud } from './hud.js';
import { createFoldInput } from './input.js';
import { dirToward } from './moveInput.js';
import { buildFoldPreview } from '../render/preview.js';
import { createFxPlayer } from '../render/fx.js';
import { createPlayback, buildClips } from '../render/playback.js';
import {
  createFloorState, defaultStart, act, canUndo, foldCheck, playerOf, PLAYER_ID, DEFAULT_FOLD_CHARGES,
} from '../core/turn.js';
import { scatterEnemies } from '../core/enemies.js';
import { CREATURE_DEFS } from '../core/creatures.js';
import { ANIM_SPEEDS, MOTION_MODES, cycleOption, optionName } from './settings.js';
import { createBoard, findCreature } from '../core/board.js';
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

    // Animation options (Phase 7 moves these to a full settings screen).
    const speedBtn = el('button', { class: 'btn btn-secondary', type: 'button' });
    const motionBtn = el('button', { class: 'btn btn-secondary', type: 'button' });
    const syncMotionLabels = () => {
      speedBtn.textContent = `Animation: ${optionName(ANIM_SPEEDS, ctx.settings.animSpeed)}`;
      motionBtn.textContent = `Reduced motion: ${optionName(MOTION_MODES, ctx.settings.reducedMotion)}`;
    };
    speedBtn.addEventListener('click', () => {
      ctx.updateSettings({ animSpeed: cycleOption(ANIM_SPEEDS, ctx.settings.animSpeed) });
      syncMotionLabels();
    });
    motionBtn.addEventListener('click', () => {
      ctx.updateSettings({ reducedMotion: cycleOption(MOTION_MODES, ctx.settings.reducedMotion) });
      syncMotionLabels();
    });
    syncMotionLabels();

    root.append(
      el('div', { class: 'menu' },
        el('h1', { class: 'title', text: 'Foldwork' }),
        el('p', { class: 'subtitle', text: 'Fold the paper dungeon.' }),
        el('div', { class: 'menu-buttons' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.router.go('floor', { floor: 1 }) }, 'New Run'),
          paletteBtn,
          speedBtn,
          motionBtn,
        ),
      ),
    );
  },
};

export const floorScreen = {
  mount(root, ctx, params) {
    const size = clampSize(Number(params.size) || 5);
    const board = params.demo ? demoBoard(size, ctx.seed) : createBoard(size, size);
    const charges = Number.isInteger(params.charges) ? params.charges : DEFAULT_FOLD_CHARGES;
    // Dev floors scatter Scrap Mites (default 2, ?mites=) until the Phase 3b
    // templates place enemies on anchors.
    const mites = Number.isInteger(params.mites) ? params.mites : DEV_MITES;
    const start = defaultStart(board);
    const enemies = scatterEnemies(board, fork(createRng(ctx.seed), 'enemies'), { kind: 'mite', count: mites, avoid: start });
    let state = createFloorState({ board, player: start, enemies, charges });
    let shownBoard = state.board; // what the renderer shows (lags during playback)
    let preview = null;
    let queued = null; // one action pressed during playback (docs/04 input buffer)

    const canvas = ctx.renderer.canvas;
    const fx = createFxPlayer({ onChange: () => ctx.renderer.invalidate() });
    ctx.renderer.setFx(fx);
    const playback = createPlayback({
      fx,
      show(b) {
        shownBoard = b;
        sync();
      },
    });

    const sync = () => {
      ctx.renderer.setScene({ board: shownBoard, preview });
      const me = playerOf(state);
      hud.setHp(me ? me.hp : 0, me ? me.maxHp : CREATURE_DEFS.player.hp);
      hud.setCharges(state.charges, state.maxCharges);
      hud.setUndoEnabled(canUndo(state));
      hud.setFoldStatus(preview ? foldStatusText(preview) : null, !!preview && (!preview.ok || preview.player === 'drop'));
    };

    const hud = createHud(root, {
      floor: params.floor || 1,
      onMenu: () => ctx.router.go('title'),
      onUndo: () => dispatch({ type: 'undo' }),
      onWait: () => dispatch({ type: 'wait' }),
      onCancel: () => input.cancel(),
    });

    // Runs one action through the turn engine, then plays its events back.
    // Logic is final before playback starts; input pressed meanwhile is
    // buffered (one action, the latest wins) and runs when playback ends.
    function dispatch(action) {
      if (state.status !== 'playing') return;
      if (playback.busy) {
        queued = action;
        return;
      }
      const before = state;
      const result = act(state, action, { snapshots: true });
      if (!result.ok) {
        refuse(result.reason);
        return;
      }
      state = result.state;
      preview = null;
      input.setBusy(true);
      playback.play(buildClips(before.board, result.events, ctx.motion()), state.board, settle);
    }

    function settle() {
      input.setBusy(false);
      sync();
      if (state.status !== 'playing') {
        queued = null;
        endFloor();
        return;
      }
      const next = queued;
      queued = null;
      if (next) dispatch(next);
    }

    function refuse(reason) {
      const text = REFUSALS[reason];
      if (text) hud.notify(text);
      if (reason === 'no-charges' || reason === 'invalid-fold') {
        fx.playShake({ reducedMotion: ctx.motion().reducedMotion });
      }
    }

    function endFloor() {
      input.setEnabled(false);
      const cause = state.outcome && state.outcome.cause;
      hud.showOutcome({
        title: 'Torn',
        text: cause === 'fall' ? 'You fell through the paper.' : 'Out of HP.',
        actions: [
          { label: 'Retry', primary: true, onclick: () => ctx.router.go('floor', params) },
          { label: 'Menu', onclick: () => ctx.router.go('title') },
        ],
      });
    }

    const input = createFoldInput({
      canvas,
      getLayout: () => ctx.renderer.layout,
      getBoard: () => state.board,
      onPreview(crease) {
        preview = crease ? foldPreview(state, crease) : null;
        sync();
      },
      onConfirm(crease) {
        const pv = foldPreview(state, crease);
        if (!pv || !pv.ok) {
          if (pv && pv.reasons[0]?.code === 'no-charges') hud.notify(REFUSALS['no-charges']);
          return false;
        }
        preview = null;
        dispatch({ type: 'fold', fold: crease });
        return true;
      },
      onInvalid() {
        fx.playShake({ reducedMotion: ctx.motion().reducedMotion });
      },
      onUndo: () => dispatch({ type: 'undo' }),
      onWait: () => dispatch({ type: 'wait' }),
      onMove: (dir) => dispatch({ type: 'move', dir }),
      onTap(cell) {
        // Tap an adjacent tile to step (or bump) there. Measured from where
        // the player will be once any running playback is done.
        const me = findCreature(state.board, PLAYER_ID);
        const dir = me && dirToward(me, cell);
        if (dir) dispatch({ type: 'move', dir });
      },
    });

    sync();
    return () => {
      playback.finish();
      fx.destroy();
      ctx.renderer.setFx(null);
      input.destroy();
      hud.destroy();
    };
  },
};

/** Why an action was refused, for the HUD (null = say nothing). */
const REFUSALS = {
  blocked: 'A wall blocks the way.',
  edge: null,
  pinned: 'Pinned under paper. Undo the fold to get free.',
  'no-charges': 'No fold charges left.',
  'no-undo': 'Nothing to undo.',
  'invalid-fold': null,
};

/** Fold preview for the HUD and board, including the charge check. */
function foldPreview(state, crease) {
  const pv = buildFoldPreview(state.board, crease);
  if (!pv) return null;
  const check = foldCheck(state, crease);
  return check.ok === pv.ok ? pv : { ...pv, ok: check.ok, reasons: check.reasons };
}

function foldStatusText(pv) {
  if (!pv.ok) {
    if (pv.reasons[0]?.code === 'no-charges') return 'No fold charges left';
    const n = pv.reasons.filter((r) => r.code === 'stack-overflow').length;
    return `Too tall: ${n} stack${n === 1 ? '' : 's'} over ${pv.reasons[0]?.max ?? 3}`;
  }
  if (pv.player === 'drop') return 'Warning: a void lands on you';
  if (pv.player === 'pin') return 'Warning: this pins you';
  return 'Ready to fold';
}

const DEV_MITES = 2;

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
