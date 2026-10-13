// Screen definitions. Each is registered with the router in main.js.

import { el } from './dom.js';
import { createHud } from './hud.js';
import { createFoldInput } from './input.js';
import { dirToward } from './moveInput.js';
import { buildFoldPreview, slidePreview, bossForecast } from '../render/preview.js';
import { createFxPlayer } from '../render/fx.js';
import { createPlayback, buildClips } from '../render/playback.js';
import {
  createFloorState, defaultStart, act, canUndo, foldCheck, playerOf, PLAYER_ID, DEFAULT_FOLD_CHARGES,
} from '../core/turn.js';
import { scatterEnemies } from '../core/enemies.js';
import { CREATURE_DEFS } from '../core/creatures.js';
import { ANIM_SPEEDS, MOTION_MODES, TELEMETRY_MODES, cycleOption, optionName } from './settings.js';
import { createBoard, findCreature } from '../core/board.js';
import { TILE } from '../core/tiles.js';
import { parseMap, DEV_MAPS } from '../core/maps.js';
import { generateFloor, templateFloors } from '../core/floors.js';
import { floorSetupFor, finishFloor, takeOffer, runTag } from '../core/run.js';
import { relicDef } from '../core/relics.js';
import { SPIRIT_DEFS, spiritDef } from '../core/spirits.js';
import { HINTS, hintDef, hintsFor } from '../core/hints.js';
import { loadSeenHints, saveSeenHints } from './hintStore.js';
import { createFloorRecorder } from '../telemetry/floorRecorder.js';
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

    const shareBtn = el('button', { class: 'btn btn-secondary', type: 'button' });
    const syncShareLabel = () => {
      shareBtn.textContent = `Share play data: ${optionName(TELEMETRY_MODES, ctx.settings.telemetry)}`;
    };
    shareBtn.addEventListener('click', () => {
      ctx.updateSettings({ telemetry: cycleOption(TELEMETRY_MODES, ctx.settings.telemetry) });
      syncShareLabel();
    });
    syncShareLabel();
    // Hidden until collection is switched on (config TELEMETRY.collect).
    shareBtn.hidden = !ctx.telemetryOffered;

    root.append(
      el('div', { class: 'menu' },
        el('h1', { class: 'title', text: 'Foldwork' }),
        el('p', { class: 'subtitle', text: 'Fold the paper dungeon.' }),
        el('div', { class: 'menu-buttons' },
          el('button', {
            class: 'btn btn-primary',
            type: 'button',
            onclick: () => startNewRun(ctx),
          }, 'New Run'),
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.router.go('howto') }, 'How to Play'),
          paletteBtn,
          speedBtn,
          motionBtn,
          shareBtn,
        ),
      ),
    );
  },
};

/** How to Play (docs/04): every tutorial hint, re-viewable any time. */
export const howToScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    const items = Object.values(HINTS).map((h) => el('li', {}, el('strong', { text: h.title }), h.text));
    const reset = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Show hints again in play');
    reset.addEventListener('click', () => {
      saveSeenHints(new Set());
      reset.textContent = 'Hints will show again';
      reset.disabled = true;
    });
    root.append(
      el('div', { class: 'menu howto' },
        el('h2', { class: 'outcome-title', text: 'How to Play' }),
        el('p', { class: 'subtitle', text: 'Reach the stairs on each floor. Folds cost charges; moves are free.' }),
        el('ul', { class: 'howto-list' }, items),
        el('div', { class: 'menu-buttons' },
          reset,
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.router.go('title') }, 'Back'),
        ),
      ),
    );
    root.querySelector('.btn-primary')?.focus({ preventScroll: true });
  },
};

/**
 * New Run: end any run in progress and pick a spirit; the spirit select
 * screen starts the run on its first floor.
 */
function startNewRun(ctx) {
  ctx.endRun('abandoned');
  ctx.router.go('spirit');
}

/**
 * Spirit select (docs/04 screen 2): one card per spirit with its HP and
 * perk. Picking one starts the run as that spirit on floor 1. Number keys
 * pick too. Unlock costs arrive with Phase 7; until then all are open.
 */
export const spiritScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    const spirits = Object.values(SPIRIT_DEFS);
    const choose = (id, index) => {
      ctx.startRun({ spirit: id });
      ctx.telemetry.track('spirit.pick', { ...runTag(ctx.run), index, offered: spirits.map((d) => d.id) });
      ctx.router.go('floor', { floor: ctx.run.floor });
    };
    const cards = spirits.map((def, i) => el('button', {
      class: 'offer-card spirit-card',
      type: 'button',
      'aria-label': `${i + 1}: ${def.name}. ${def.hp} HP. ${def.perk}`,
      onclick: () => choose(def.id, i),
    },
    el('span', { class: 'offer-key', 'aria-hidden': 'true', text: String(i + 1) }),
    el('span', { class: 'offer-glyph', 'aria-hidden': 'true', text: def.glyph }),
    el('strong', { class: 'offer-name', text: def.name }),
    el('span', { class: 'offer-tags', text: `${def.hp} HP` }),
    el('span', { class: 'spirit-hearts', 'aria-hidden': 'true', text: '♥'.repeat(def.hp) }),
    el('span', { class: 'offer-text', text: def.perk })));

    root.append(
      el('div', { class: 'menu offer' },
        el('h2', { class: 'outcome-title', text: 'Choose your spirit' }),
        el('p', { class: 'subtitle', text: 'It sets your HP and gives one perk for the whole run.' }),
        el('div', { class: 'offer-cards', role: 'group', 'aria-label': 'Spirits' }, cards),
        el('div', { class: 'menu-buttons' },
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.router.go('title') }, 'Back')),
      ),
    );
    cards[0]?.focus({ preventScroll: true });

    const onKey = (e) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= spirits.length && !e.repeat) {
        e.preventDefault();
        choose(spirits[n - 1].id, n - 1);
      } else if (e.key === 'Escape') {
        ctx.router.go('title');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};

export const floorScreen = {
  mount(root, ctx, params) {
    const floorNo = params.floor || 1;
    if (!ctx.run) ctx.startRun();
    const run = ctx.run;
    const { setup: base, info } = floorSetup(floorNo, params, ctx.seed);
    // A template floor at the run's floor is part of the run: its result
    // moves the run on. Dev floors get the run's relics and HP but leave
    // the run alone.
    const inRun = info.source === 'template' && run.floor === floorNo;
    const setup = floorSetupFor(run, base);
    let state = createFloorState(setup);
    let shownBoard = state.board; // what the renderer shows (lags during playback)
    let preview = null;
    let queued = null; // one action pressed during playback (docs/04 input buffer)

    // Telemetry: the action log replays this floor exactly (core/replay.js),
    // given the seed and the floor description in floor.start.
    const recorder = createFloorRecorder();
    const floorTag = {
      floor: floorNo,
      seed: ctx.seed,
      source: info.source,
      templateId: info.templateId || null,
      variant: info.variant || null,
      // What the floor started with, so replays rebuild it exactly.
      loadout: {
        spirit: run.spirit, relics: run.relics.slice(), hp: setup.hp, maxHp: setup.maxHp, landings: setup.landings,
      },
      ...(info.overrides ? { overrides: info.overrides } : {}),
    };
    let reported = false;
    ctx.telemetry.track('floor.start', {
      ...floorTag,
      map: info.map || null,
      attempt: info.attempt ?? null,
      checked: info.checked || null,
      size: state.board.w,
      charges: state.maxCharges,
      enemies: setup.enemies.map((e) => ({ kind: e.kind, col: e.col, row: e.row })),
    });

    // Tutorial hints: one card at a time, each shown once per player.
    const seenHints = loadSeenHints();
    const hintQueue = [];
    let hintShown = null;

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
      hud.setKeys(state.keys);
      hud.setRelics(relicList);
      hud.setUndoEnabled(canUndo(state));
      hud.setFoldStatus(preview ? foldStatusText(preview) : null, !!preview && foldStatusWarns(preview));
    };

    // The tray shows the spirit first, then the relics.
    const relicList = run.relics.map(relicDef);
    if (run.spirit) {
      const sp = spiritDef(run.spirit);
      relicList.unshift({ id: `spirit-${sp.id}`, name: `${sp.name} (spirit)`, text: sp.perk, glyph: sp.glyph });
    }
    const hud = createHud(root, {
      floor: floorNo,
      lastFloor: inRun ? run.lastFloor : null,
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
      const src = ctx.inputSource();
      if (!result.ok) {
        recorder.action(action, src, { ok: false, reason: result.reason });
        refuse(result.reason);
        return;
      }
      recorder.action(action, src, { ok: true, tookTurn: action.type !== 'undo' });
      state = result.state;
      preview = null;
      announce(result.events);
      queueHints({ type: 'events', events: result.events });
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
      queueHints({ type: 'refuse', reason });
      const text = REFUSALS[reason];
      if (text) hud.notify(text);
      if (reason === 'no-charges' || reason === 'invalid-fold') {
        fx.playShake({ reducedMotion: ctx.motion().reducedMotion });
      }
    }

    // Short HUD notes for environment events (the board shows them too).
    function announce(events) {
      for (const ev of events) {
        const text = NOTICES[ev.type] && NOTICES[ev.type](ev);
        if (text) hud.notify(text, { info: true });
      }
    }

    // Hints from a newer trigger replace the card on screen (and anything
    // still queued): the latest one is about what just happened.
    function queueHints(trigger) {
      const ids = hintsFor(info.hints, trigger, seenHints, PLAYER_ID).filter((id) => id !== hintShown);
      if (!ids.length) return;
      if (hintShown && trigger.type !== 'start') dismissHint('replaced');
      hintQueue.length = 0;
      hintQueue.push(...ids);
      showNextHint();
    }

    let hintShownAt = 0;
    function dismissHint(by) {
      ctx.telemetry.track('hint.dismiss', { ...floorTag, id: hintShown, by, ms: recorder.elapsed() - hintShownAt });
      hud.hideHint();
      hintShown = null;
    }

    function showNextHint() {
      if (hintShown || !hintQueue.length) return;
      const id = hintQueue.shift();
      const def = hintDef(id);
      hintShown = id;
      seenHints.add(id); // shown once, even if never dismissed
      saveSeenHints(seenHints);
      recorder.hintShown();
      hintShownAt = recorder.elapsed();
      ctx.telemetry.track('hint.show', { ...floorTag, id, turn: state.turn });
      hud.showHint({
        title: def.title,
        text: def.text,
        onDismiss() {
          dismissHint('player');
          showNextHint();
        },
      });
    }

    /** floor.end, once per floor: won, lost, or abandoned (left mid-floor). */
    function report(outcome) {
      if (reported) return;
      reported = true;
      const me = playerOf(state);
      ctx.telemetry.track('floor.end', {
        ...floorTag,
        outcome,
        cause: (state.outcome && state.outcome.cause) || null,
        turn: state.turn,
        chargesLeft: state.charges,
        keys: state.keys,
        hp: me ? me.hp : 0,
        ...recorder.summary(),
      });
      ctx.telemetry.flush(); // a floor is a natural checkpoint
    }

    function endFloor() {
      input.setEnabled(false);
      hud.hideHint();
      const cause = state.outcome && state.outcome.cause;
      report(state.status === 'won' ? 'won' : 'lost');
      if (inRun) {
        ctx.run = finishFloor(run, state);
        // Cleared with more to come: the relic offer replaces the panel.
        if (ctx.run.offer) ctx.router.go('offer', params);
        else hud.showOutcome(runPanel(ctx, ctx.run, floorNo, cause, params));
        return;
      }
      if (state.status === 'won') {
        hud.showOutcome(devVictoryPanel(ctx, params));
        return;
      }
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
      foldOptions: () => ({ diagonal: !!state.rules.diagonal }),
      onPreview(crease) {
        recorder.preview(crease);
        preview = crease ? foldPreview(state, crease) : null;
        sync();
      },
      onConfirm(crease) {
        const pv = foldPreview(state, crease);
        recorder.foldAttempt();
        if (!pv || !pv.ok) {
          const reason = pv ? pv.reasons[0]?.code || 'invalid-fold' : 'invalid-fold';
          recorder.action({ type: 'fold', fold: crease }, ctx.inputSource(), { ok: false, reason });
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
    queueHints({ type: 'start' });
    return () => {
      report('abandoned');
      // Leaving mid-floor ends the run (until Phase 7 saves runs to resume).
      if (inRun && state.status === 'playing' && ctx.run === run) ctx.endRun('abandoned');
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
  locked: 'Locked. Find a key, or fold one onto the lock.',
  'gate-closed': 'The gate is shut. Something must hold its plate.',
  edge: null,
  pinned: 'Pinned under paper. Undo the fold to get free.',
  'no-charges': 'No fold charges left.',
  'no-diagonal': 'Diagonal creases are locked.',
  'no-undo': 'Nothing to undo.',
  'invalid-fold': null,
};

/** HUD notes per event type (null = say nothing). */
const NOTICES = {
  pickup: () => 'Got a key.',
  unlock: (ev) => (ev.by === 'fold' ? 'The key opens the lock.' : ev.by === 'master-key' ? 'Master Key: the lock opens.' : 'Unlocked.'),
  gate: (ev) => (ev.open ? 'A gate opens.' : 'A gate closes.'),
  refund: () => 'Recycled Crease: charge refunded.',
  block: (ev) => (ev.id !== PLAYER_ID ? null : BLOCK_NOTES[ev.by] || null),
  catch: () => 'Soft Landing: you catch yourself at the edge.',
  swat: () => 'The Crane\'s fold swats you aside.',
  fizzle: () => 'The Crane\'s fold fizzles.',
  flee: () => 'The Crane takes flight.',
};

const BLOCK_NOTES = {
  guard: 'Folded Shield: hit negated.',
  ward: 'Laminate: hit ignored.',
  wax: 'Wax Coat: the sting slides off.',
};

/** Fold preview for the HUD and board, including the charge check. */
function foldPreview(state, crease) {
  const pv = buildFoldPreview(state.board, crease);
  if (!pv) return null;
  const check = foldCheck(state, crease);
  const slides = check.ok ? slidePreview(state, crease) : [];
  const boss = check.ok ? bossForecast(state, { type: 'fold', fold: crease }) : null;
  return { ...pv, ok: check.ok, reasons: check.ok === pv.ok ? pv.reasons : check.reasons, slides, boss };
}

/** What the Crane's fold will then do (bossForecast), for the fold status. */
const BOSS_FORECAST = {
  dropped: 'drops the Crane through a void',
  pinned: 'pins the Crane, cancelling its fold',
  swat: 'the Crane\'s fold will swat you',
  fizzle: 'the Crane\'s fold will fizzle',
  miss: 'the Crane\'s fold will miss you',
};

function foldStatusText(pv) {
  const text = baseFoldStatus(pv);
  const boss = pv.ok && BOSS_FORECAST[pv.boss];
  return boss ? `${text}; ${boss}` : text;
}

/** Whether the fold status reads as a warning. */
function foldStatusWarns(pv) {
  return !pv.ok || pv.player === 'drop' || pv.boss === 'swat';
}

function baseFoldStatus(pv) {
  if (!pv.ok) {
    if (pv.reasons[0]?.code === 'no-charges') return 'No fold charges left';
    if (pv.reasons.some((r) => r.code === 'heavy')) return 'Too heavy: a Card Brute can\'t be pinned';
    const n = pv.reasons.filter((r) => r.code === 'stack-overflow').length;
    return `Too tall: ${n} stack${n === 1 ? '' : 's'} over ${pv.reasons[0]?.max ?? 3}`;
  }
  if (pv.player === 'drop') return 'Warning: a void lands on you';
  if (pv.player === 'pin') return 'Warning: this pins you';
  if (pv.unlocks) return pv.unlocks > 1 ? `Ready: opens ${pv.unlocks} locks` : 'Ready: opens a lock';
  return 'Ready to fold';
}

const DEV_MITES = 2;

/**
 * The floor to play: a seeded template floor (core/floors.js), unless a dev
 * param (`?map=`, `?size=`, `?demo=1`) asks for a dev floor. Returns
 * { setup, info }: createFloorState() options and a plain description
 * (info.source is 'template' or 'dev').
 */
function floorSetup(floorNo, params, seed) {
  if (params.map || params.size || params.demo || !templateFloors().includes(floorNo)) {
    return { setup: devFloor(params, seed), info: { source: 'dev', map: params.map || (params.size || params.demo ? 'open' : 'sandbox'), hints: [] } };
  }
  const { setup, info } = generateFloor(floorNo, seed);
  // Dev overrides change the floor, so telemetry flags them (replays skip).
  const overrides = {};
  if (Number.isInteger(params.charges)) overrides.charges = params.charges;
  if (Number.isInteger(params.mites)) overrides.mites = params.mites;
  const charges = overrides.charges ?? setup.charges;
  const enemies = overrides.mites != null ? setup.enemies.slice(0, overrides.mites) : setup.enemies;
  const tagged = Object.keys(overrides).length ? { overrides } : {};
  return { setup: { ...setup, charges, enemies }, info: { ...info, ...tagged, source: 'template' } };
}

/** Dev floors (?map=, ?size=, ?demo=1): play again or leave. */
function devVictoryPanel(ctx, params) {
  return {
    title: 'Floor cleared',
    text: 'You found the way out.',
    actions: [
      { label: 'Play again', primary: true, onclick: () => ctx.router.go('floor', params) },
      { label: 'Menu', onclick: () => ctx.router.go('title') },
    ],
  };
}

const RARITY_NAMES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };
const GROUP_NAMES = { fold: 'Fold', defense: 'Defense', utility: 'Utility' };

/**
 * Relic choice (docs/04 screen 4), between run floors: one card per relic
 * offered, plus a rest card on REST_FLOORS. Picking one takes it and starts
 * the next floor. Number keys pick too. Rarity and group are written out
 * (not shown by color alone).
 */
export const offerScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    const run = ctx.run;
    if (!run || !run.offer) {
      root.append(el('div', { class: 'menu' },
        el('p', { class: 'subtitle', text: 'No relic offer is waiting.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.router.go('title') }, 'Menu')));
      return undefined;
    }
    const { offer } = run;
    ctx.telemetry.track('relic.offer', { ...runTag(run), cleared: offer.floor, offered: offer.relics.slice(), rest: offer.rest });

    const choose = (choice, index) => {
      const next = takeOffer(ctx.run, choice);
      if (next === ctx.run) return;
      ctx.telemetry.track('relic.pick', { ...runTag(next), cleared: offer.floor, pick: choice, index, offered: offer.relics.slice() });
      ctx.run = next;
      ctx.router.go('floor', { ...params, floor: next.floor });
    };

    const choices = offer.relics.map((id) => {
      const def = relicDef(id);
      return {
        id,
        rarity: def.rarity,
        label: `${def.name}. ${RARITY_NAMES[def.rarity]} ${GROUP_NAMES[def.group]} relic. ${def.text}`,
        body: [
          el('span', { class: 'offer-glyph', 'aria-hidden': 'true', text: def.glyph }),
          el('strong', { class: 'offer-name', text: def.name }),
          el('span', { class: 'offer-tags', text: `${RARITY_NAMES[def.rarity]} · ${GROUP_NAMES[def.group]}` }),
          el('span', { class: 'offer-text', text: def.text }),
        ],
      };
    });
    if (offer.rest) {
      const full = run.hp >= run.maxHp;
      choices.push({
        id: 'rest',
        rarity: 'rest',
        label: `Rest. Heal 1 HP.${full ? ' Your HP is full.' : ''}`,
        body: [
          el('span', { class: 'offer-glyph', 'aria-hidden': 'true', text: '☾' }),
          el('strong', { class: 'offer-name', text: 'Rest' }),
          el('span', { class: 'offer-tags', text: 'Instead of a relic' }),
          el('span', { class: 'offer-text', text: full ? 'Heal 1 HP (your HP is full).' : 'Heal 1 HP.' }),
        ],
      });
    }
    const cards = choices.map((c, i) => el('button', {
      class: `offer-card rarity-${c.rarity}`, type: 'button', 'aria-label': `${i + 1}: ${c.label}`, onclick: () => choose(c.id, i),
    }, el('span', { class: 'offer-key', 'aria-hidden': 'true', text: String(i + 1) }), ...c.body));

    const empty = !choices.length;
    root.append(
      el('div', { class: 'menu offer' },
        el('h2', { class: 'outcome-title', text: `Floor ${offer.floor} cleared` }),
        el('p', { class: 'subtitle', text: empty
          ? `No relics left to offer. HP ${run.hp}/${run.maxHp}.`
          : `Choose ${choices.length > 1 ? 'one' : 'it'} to take to floor ${run.floor}. HP ${run.hp}/${run.maxHp}.` }),
        el('div', { class: 'offer-cards', role: 'group', 'aria-label': 'Relic choices' }, cards),
        el('div', { class: 'menu-buttons' },
          empty ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => choose(null, -1) }, 'Next floor') : null,
          el('button', {
            class: 'btn btn-secondary',
            type: 'button',
            onclick: () => {
              ctx.endRun('abandoned');
              ctx.router.go('title');
            },
          }, 'Menu'),
        ),
      ),
    );
    (cards[0] || root.querySelector('.btn-primary'))?.focus({ preventScroll: true });

    const onKey = (e) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length && !e.repeat) {
        e.preventDefault();
        choose(choices[n - 1].id, n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};

/**
 * End-of-floor panel for a run floor, given the run after finishFloor():
 * on to the next floor, the run won, or the run lost. Ends the run (and
 * reports run.end) when it is over.
 */
function runPanel(ctx, run, floorNo, cause, params) {
  const menu = { label: 'Menu', onclick: () => ctx.router.go('title') };
  const newRun = { label: 'New run', primary: true, onclick: () => startNewRun(ctx) };
  const relics = run.relics.length ? ` Relics: ${run.relics.map((id) => relicDef(id).name).join(', ')}.` : '';
  if (run.status === 'playing') {
    return {
      title: `Floor ${floorNo} cleared`,
      text: `The stairs fold down to floor ${run.floor}. HP ${run.hp}/${run.maxHp}.${relics}`,
      actions: [{ label: 'Next floor', primary: true, onclick: () => ctx.router.go('floor', { ...params, floor: run.floor }) }, menu],
    };
  }
  ctx.endRun(run.status);
  if (run.status === 'won') {
    // 6c replaces this with the full run summary.
    if (cause === 'boss') {
      return {
        title: 'The Crane falls',
        text: `You folded the Great Crane out of the sky with ${run.hp}/${run.maxHp} HP left. The run is won.${relics}`,
        actions: [newRun, menu],
      };
    }
    return {
      title: 'Run complete',
      text: `You cleared all ${run.lastFloor} floors.`,
      actions: [newRun, menu],
    };
  }
  return {
    title: 'Torn',
    text: `${cause === 'fall' ? 'You fell through the paper' : 'Out of HP'} on floor ${floorNo}. The run is over.`,
    actions: [newRun, menu],
  };
}

/**
 * createFloorState() options for a dev floor.
 * `?size=` or `?demo=1` gives the old open board with scattered Mites (no
 * exit); otherwise a hand-made map from DEV_MAPS (`?map=`, default sandbox).
 * `?charges=` and `?mites=` override either.
 */
function devFloor(params, seed) {
  const charges = Number.isInteger(params.charges) ? params.charges : null;
  if (!params.size && !params.demo) {
    const map = DEV_MAPS[params.map] || DEV_MAPS.sandbox;
    const parsed = parseMap(map.rows);
    const enemies = Number.isInteger(params.mites) ? parsed.enemies.slice(0, params.mites) : parsed.enemies;
    return { ...parsed, enemies, charges: charges ?? map.charges };
  }
  const size = clampSize(Number(params.size) || 5);
  const board = params.demo ? demoBoard(size, seed) : createBoard(size, size);
  const mites = Number.isInteger(params.mites) ? params.mites : DEV_MITES;
  const player = defaultStart(board);
  const enemies = scatterEnemies(board, fork(createRng(seed), 'enemies'), { kind: 'mite', count: mites, avoid: player });
  return { board, player, enemies, charges: charges ?? DEFAULT_FOLD_CHARGES };
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
