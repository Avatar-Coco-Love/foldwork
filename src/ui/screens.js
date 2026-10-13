// Screen definitions. Each is registered with the router in main.js.

import { el, svgIcon } from './dom.js';
import { createHud } from './hud.js';
import { createFoldInput } from './input.js';
import { dirToward } from './moveInput.js';
import { buildFoldPreview, slidePreview, bossForecast, buildHintMark } from '../render/preview.js';
import { createFxPlayer } from '../render/fx.js';
import { createPlayback, buildClips } from '../render/playback.js';
import {
  createFloorState, defaultStart, act, canUndo, foldCheck, playerOf, PLAYER_ID, DEFAULT_FOLD_CHARGES,
} from '../core/turn.js';
import { scatterEnemies } from '../core/enemies.js';
import { CREATURE_DEFS } from '../core/creatures.js';
import { SETTINGS_GROUPS, choicesFor, cycleOption, optionName } from './settings.js';
import { APP_VERSION, PROJECTS_URL } from '../config.js';
import { createBoard, findCreature } from '../core/board.js';
import { TILE } from '../core/tiles.js';
import { parseMap, DEV_MAPS } from '../core/maps.js';
import { generateFloor, templateFloors } from '../core/floors.js';
import { floorSetupFor, finishFloor, takeOffer, runTag, addHints } from '../core/run.js';
import { encodeAction } from '../core/replay.js';
import { resumeFloor, saveSummary, savedHints } from '../core/save.js';
import { lineKeys, nextStep } from '../core/hintLine.js';
import { stateKey } from '../core/solver.js';
import { createHintSearch } from './hintSearch.js';
import { shareGame, shareUrl } from './share.js';
import { relicDef } from '../core/relics.js';
import { SPIRIT_DEFS, spiritDef } from '../core/spirits.js';
import { HINTS, hintDef, hintsFor } from '../core/hints.js';
import { loadSeenHints, saveSeenHints } from './hintStore.js';
import { createFloorRecorder } from '../telemetry/floorRecorder.js';
import { createRng, fork, nextInt, chance } from '../core/rng.js';

/**
 * Title menu rows (OPEN-QUESTIONS "Menu redesign"): { id, label, show(c),
 * note(c), go(ctx, c) }, where c is { save, confirmNewRun }. The first row
 * shown is the primary button. Later phases add rows here (Daily Seed,
 * Unlocks, Stats & History).
 */
export const TITLE_ROWS = [
  {
    id: 'continue',
    label: 'Continue Run',
    show: (c) => !!c.save,
    note: (c) => saveText(c.save),
    go: (ctx) => ctx.continueRun(),
  },
  // With a saved run, New Run asks before it replaces it.
  { id: 'new-run', label: 'New Run', go: (ctx, c) => (c.save ? c.confirmNewRun() : startNewRun(ctx)) },
  { id: 'howto', label: 'How to Play', go: (ctx) => ctx.router.go('howto') },
  { id: 'settings', label: 'Settings', go: (ctx) => ctx.router.go('settings', { from: 'title' }) },
];

// Corner icons (24x24 line art). Back: an arrow out of a door frame.
// Share: a box with an arrow leaving it.
const ICON_BACK = ['M10 5H5v14h5', 'M20 12H9', 'M13 8l-4 4 4 4'];
const ICON_SHARE = ['M8 10H6v10h12V10h-2', 'M12 15V3', 'M8 7l4-4 4 4'];

export const titleScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    const save = ctx.savedRun();
    const c = { save, confirmNewRun };
    const rows = TITLE_ROWS.filter((r) => !r.show || r.show(c));
    const buttons = el('div', { class: 'menu-buttons' },
      rows.flatMap((r, i) => {
        const note = r.note && r.note(c);
        return [
          el('button', {
            class: `btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}`,
            type: 'button',
            'data-row': r.id,
            'aria-label': note ? `${r.label}. ${note}` : null,
            onclick: () => r.go(ctx, c),
          }, r.label),
          note ? el('p', { class: 'save-summary', text: note }) : null,
        ];
      }),
    );
    const menu = el('div', { class: 'menu title-menu' },
      el('div', { class: 'title-corners' },
        el('a', {
          class: 'btn icon-btn', href: PROJECTS_URL, 'aria-label': 'Back to Projects', title: 'Back to Projects',
        }, svgIcon(ICON_BACK)),
        shareGameButton(ctx),
      ),
      el('h1', { class: 'title', text: 'Foldwork' }),
      el('p', { class: 'subtitle', text: 'Fold the paper dungeon.' }),
      buttons,
    );
    root.append(menu);

    function confirmNewRun() {
      const keep = el('button', { class: 'btn btn-primary', type: 'button' }, 'Keep my run');
      const panel = el('div', { class: 'menu-buttons', role: 'alertdialog', 'aria-labelledby': 'confirm-new-run' },
        el('p', { class: 'save-summary', id: 'confirm-new-run', text: `Start a new run? Your run on floor ${save.run.floor} will be lost.` }),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => startNewRun(ctx) }, 'Start new run'),
        keep);
      keep.addEventListener('click', () => {
        panel.replaceWith(buttons);
        buttons.querySelector('.btn')?.focus({ preventScroll: true });
      });
      buttons.replaceWith(panel);
      keep.focus({ preventScroll: true });
    }
  },
};

/** One line about a saved run, for the title screen. */
function saveText(save) {
  const sum = saveSummary(save);
  const parts = [`Floor ${sum.floor} of ${sum.lastFloor}`];
  if (sum.spirit) parts.push(spiritDef(sum.spirit).name);
  parts.push(`${sum.hp}/${sum.maxHp} HP`);
  if (sum.relics) parts.push(`${sum.relics} relic${sum.relics === 1 ? '' : 's'}`);
  if (sum.offer) parts.push('relic choice waiting');
  return parts.join(' · ');
}

/**
 * Share Foldwork (title corner icon): the system share sheet, else the
 * link is copied ("Link copied" by the icon). When neither works, the
 * link shows in a box by the icon to copy by hand.
 */
function shareGameButton(ctx) {
  const btn = el('button', {
    class: 'btn icon-btn', type: 'button', 'aria-label': 'Share Foldwork', title: 'Share Foldwork',
  }, svgIcon(ICON_SHARE));
  const toast = el('span', { class: 'share-toast', role: 'status', hidden: true });
  const wrap = el('span', { class: 'share-wrap' }, btn, toast);
  let reset = 0;
  btn.addEventListener('click', async () => {
    const url = shareUrl();
    const result = await shareGame(url);
    ctx.telemetry.track('share', { result });
    if (result === 'copied') {
      toast.replaceChildren('Link copied');
      toast.hidden = false;
      clearTimeout(reset);
      reset = setTimeout(() => {
        toast.hidden = true;
      }, 2000);
    } else if (result === 'manual' && !wrap.querySelector('.share-link')) {
      const field = el('input', {
        class: 'share-link', type: 'text', readonly: true, value: url, 'aria-label': 'Link to Foldwork',
      });
      field.addEventListener('focus', () => field.select());
      clearTimeout(reset);
      toast.replaceChildren(field);
      toast.hidden = false;
      field.focus();
    }
  });
  return wrap;
}

/**
 * How to Play (docs/04): every tutorial hint, re-viewable any time. A
 * screen from the title, a sheet over the board from the pause menu.
 */
function howToPanel(onBack) {
  const items = Object.values(HINTS).map((h) => el('li', {}, el('strong', { text: h.title }), h.text));
  return el('div', { class: 'menu howto' },
    el('h2', { class: 'outcome-title', text: 'How to Play' }),
    el('p', { class: 'subtitle', text: 'Reach the stairs on each floor. Folds cost charges; moves are free.' }),
    el('ul', { class: 'howto-list' }, items),
    el('div', { class: 'menu-buttons' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onBack }, 'Back'),
    ),
  );
}

export const howToScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    root.append(howToPanel(() => ctx.router.go('title')));
    root.querySelector('.btn-primary')?.focus({ preventScroll: true });
    return escapeTo(() => ctx.router.go('title'));
  },
};

/** Esc runs `back` (screens with a Back button). Returns the cleanup. */
function escapeTo(back) {
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    back();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** About (Settings): who made it. */
const CREDITS = 'Made by Cody Joshua Clements, built with Claude. Every picture is drawn in code, so there are no image files.';

/**
 * Settings (OPEN-QUESTIONS "Menu redesign"), built from SETTINGS_GROUPS
 * (ui/settings.js). Choices apply at once. A screen from the title, a
 * sheet over the board from the pause menu; Back returns there.
 */
function settingsPanel(ctx, onBack) {
  const actions = {
    resetHints(btn) {
      saveSeenHints(new Set());
      btn.querySelector('.setting-label').textContent = 'Tutorial hints will show again';
      btn.disabled = true;
    },
  };
  const row = (r) => {
    const label = el('span', { class: 'setting-label', text: r.label });
    const note = r.note ? el('span', { class: 'setting-note', text: r.note }) : null;
    if (r.action) {
      const btn = el('button', { class: 'btn setting-row', type: 'button', 'data-setting': r.id }, el('span', { class: 'setting-text' }, label, note));
      btn.addEventListener('click', () => actions[r.action](btn));
      return btn;
    }
    const list = choicesFor(r.key);
    const value = el('span', { class: 'setting-value' });
    const btn = el('button', { class: 'btn setting-row', type: 'button', 'data-setting': r.id },
      el('span', { class: 'setting-text' }, label, note), value);
    const syncValue = () => {
      const name = optionName(list, ctx.settings[r.key]);
      value.textContent = name;
      btn.setAttribute('aria-label', `${r.label}: ${name}`);
    };
    btn.addEventListener('click', () => {
      ctx.updateSettings({ [r.key]: cycleOption(list, ctx.settings[r.key]) });
      syncValue();
    });
    syncValue();
    return btn;
  };
  const group = (id, title, children) => el('section', { class: 'settings-group', 'aria-labelledby': `settings-${id}` },
    el('h3', { class: 'settings-heading', id: `settings-${id}`, text: title }),
    children);
  const groups = SETTINGS_GROUPS.map((g) => {
    const rows = g.rows.filter((r) => !r.show || r.show(ctx));
    return rows.length ? group(g.id, g.title, rows.map(row)) : null;
  });
  return el('div', { class: 'menu settings' },
    el('h2', { class: 'outcome-title', text: 'Settings' }),
    el('div', { class: 'settings-groups' },
      groups,
      group('about', 'About', [
        el('p', { class: 'settings-about', text: `Foldwork version ${APP_VERSION}` }),
        el('p', { class: 'settings-about', text: CREDITS }),
      ]),
    ),
    el('div', { class: 'menu-buttons' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onBack }, 'Back')),
  );
}

export const settingsScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    const back = () => ctx.router.go(params.from || 'title');
    root.append(settingsPanel(ctx, back));
    root.querySelector('.setting-row')?.focus({ preventScroll: true });
    return escapeTo(back);
  },
};

/**
 * New Run: pick a spirit. The spirit select screen ends any run still in
 * progress (or saved) and starts the new one on its first floor, so Back
 * from it keeps the old run.
 */
function startNewRun(ctx) {
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
      ctx.abandonRun(); // the title screen already asked
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
  mount(root, ctx, routeParams) {
    // A save to continue from (Continue Run) applies to this mount only:
    // Retry and Next floor reuse params, and must start fresh. Restart
    // Floor remounts with the floor's Hint count so far.
    const { resume, restartHints, ...params } = routeParams;
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
    // Run floors are saved after every action (core/save.js): the floor is
    // rebuilt from the run seed and the accepted actions are replayed.
    // Floors changed by dev overrides can't be rebuilt, so aren't saved.
    const saving = inRun && !info.overrides;
    let actionLog = [];
    let restarted = false;
    if (saving && resume) {
      ({ state, actions: actionLog, restarted } = resumeFloor(resume, state, info));
    }
    // Continued from a save: the actions replayed first, so analysis can
    // replay this session's log after them (floor.start and floor.end).
    const resumeTag = actionLog.length ? { resumedFrom: actionLog.slice() } : {};
    // Hint button presses on this floor, kept through Restart Floor and saves.
    let hintCount = restartHints ?? (resume ? savedHints(resume, info) : 0);
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
      // Continued from a save: the actions replayed before this floor.end's
      // log, or that the save no longer matched and the floor started over.
      ...resumeTag,
      ...(restarted ? { restarted: true } : {}),
    });

    function persist() {
      if (!saving) return;
      if (state.status === 'playing') {
        ctx.saveRun({
          floor: floorNo, templateId: info.templateId, variant: info.variant, actions: actionLog, hints: hintCount,
        });
        return;
      }
      // Decided the moment the action lands, not after playback, so closing
      // the tab mid-animation can't undo a defeat (or lose a win).
      ctx.run = addHints(finishFloor(run, state), floorNo, hintCount);
      ctx.saveRun();
    }

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
      ctx.renderer.setScene({ board: shownBoard, preview, hint: hintMark });
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
      onMenu: () => openPause(),
      onUndo: () => dispatch({ type: 'undo' }),
      onWait: () => dispatch({ type: 'wait' }),
      onCancel: () => input.cancel(),
      onHint: () => askHint(),
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
      actionLog.push(encodeAction(action));
      persist();
      preview = null;
      clearHelp(); // a step shown was for the state before this action
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
      helpCard = false; // the tutorial card takes the card's place
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

    // Hint button (OPEN-QUESTIONS "Playtest round 1"): free and unlimited,
    // one level more per press. First the floor's written tip, then the
    // next step of a winning line from here (searched in a worker, and
    // reused while the player follows it), or word that the floor can't be
    // won from here. The boss floor is too big to search: tip only.
    const canSearch = info.search !== false;
    const search = createHintSearch();
    let hintLevel = 0; // highest level shown: 1 tip, 2 steps
    let line = null; // { keys, actions, clean }: the last line found
    let job = null; // { key, result, promise }: the latest search
    let hintMark = null; // the next step drawn on the board
    let helpCard = false; // the hint card shows a Hint button answer
    let gone = false;

    function askHint() {
      if (state.status !== 'playing') return;
      hintCount += 1;
      persist();
      const level = hintLevel === 0 && info.tip ? 1 : 2;
      hintLevel = Math.max(hintLevel, level);
      ctx.telemetry.track('hint.ask', { ...floorTag, level, count: hintCount, turn: state.turn });
      if (level === 1) {
        showHelp('Hint', info.tip, canSearch ? [{ label: 'Next step', onclick: askHint }] : []);
        if (canSearch) startSearch(); // ready by the time they ask for a step
      } else if (!canSearch) {
        showHelp('Hint', `${info.tip || ''} This floor is too big for step-by-step hints.`.trim());
      } else {
        showStep();
      }
    }

    function startSearch() {
      const key = stateKey(state);
      if (job && job.key === key) return job;
      const from = state;
      const j = { key, result: null, promise: null };
      j.promise = search.search({ ...from, undo: null }).then((result) => {
        if (!result) return null;
        j.result = result;
        if (result.status === 'line') line = { keys: lineKeys(from, result.actions), actions: result.actions, clean: result.clean };
        return result;
      });
      job = j;
      return j;
    }

    function showStep() {
      if (showLineStep()) return;
      const j = startSearch();
      if (j.result) {
        showOutcomeOf(j.result);
        return;
      }
      showHelp('Next step', 'Working it out…');
      j.promise.then((result) => {
        // Dropped if the player acted (or left) meanwhile.
        if (!result || gone || job !== j || stateKey(state) !== j.key) return;
        showOutcomeOf(result);
      });
    }

    /** Shows the next step of the known line, if the player is on it. */
    function showLineStep() {
      const step = nextStep(line, state);
      if (!step) return false;
      hintMark = buildHintMark(state.board, step);
      const cost = line.clean ? '' : ' Every winning line from here costs HP.';
      showHelp('Next step', `${STEP_TEXT[step.type](step)}${cost}`);
      sync();
      return true;
    }

    function showOutcomeOf(result) {
      if (result.status === 'line' && showLineStep()) return;
      const actions = [{ label: 'Restart floor', onclick: confirmRestart }];
      if (canUndo(state)) actions.unshift({ label: 'Undo', onclick: () => dispatch({ type: 'undo' }) });
      showHelp('Hint', result.status === 'stuck'
        ? 'This floor can\'t be won from here.'
        : 'No winning line turned up from here. Undo or Restart Floor may help.', actions);
    }

    function showHelp(title, text, actions = []) {
      if (hintShown) dismissHint('replaced');
      hintQueue.length = 0;
      helpCard = true;
      hud.showHint({ title, text, actions, onDismiss: clearHelp });
    }

    function clearHelp() {
      if (helpCard) hud.hideHint();
      helpCard = false;
      if (hintMark) {
        hintMark = null;
        sync();
      }
    }

    // Restart Floor: the floor as it started (its starting HP and charges;
    // the run only changes when a floor ends). Asks first, since it can't
    // be undone.
    let leaving = null; // floor.end outcome when this screen is left on purpose
    function confirmRestart() {
      if (state.status !== 'playing') return;
      input.cancel();
      input.setEnabled(false);
      const close = () => {
        hud.hideOutcome();
        input.setEnabled(true);
      };
      hud.showOutcome({
        title: 'Restart floor?',
        text: 'The floor starts over as it began, with the HP and fold charges you had then.',
        actions: [
          { label: 'Keep playing', primary: true, onclick: close },
          {
            label: 'Restart floor',
            onclick: () => {
              leaving = 'restart';
              ctx.router.go('floor', { ...params, restartHints: hintCount });
            },
          },
        ],
        onEscape: close,
      });
    }

    // Pause menu (HUD Menu button, or Esc): board input pauses while it,
    // or anything opened from it, is over the board. The run autosaves
    // after every action, so Save & Quit just leaves.
    let abandoning = false;
    function openPause() {
      if (state.status !== 'playing') return;
      input.cancel();
      input.setEnabled(false);
      const runFloor = inRun && floorNo === run.floor;
      hud.showOutcome({
        title: 'Paused',
        text: runFloor ? `Floor ${floorNo} of ${run.lastFloor}` : `Floor ${floorNo}`,
        actions: [
          { label: 'Resume', primary: true, onclick: resumePlay },
          { label: 'Restart Floor', onclick: confirmRestart },
          { label: 'How to Play', onclick: () => hud.showSheet(howToPanel(openPause), { onEscape: openPause }) },
          { label: 'Settings', onclick: openSettings },
          inRun ? { label: 'Abandon Run', onclick: confirmAbandon } : null,
          { label: saving ? 'Save & Quit to Title' : 'Quit to Title', onclick: () => ctx.router.go('title') },
        ].filter(Boolean),
        onEscape: resumePlay,
      });
    }

    function resumePlay() {
      hud.hideOutcome();
      input.setEnabled(true);
    }

    function openSettings() {
      const back = () => {
        // "Show tutorial hints again" may have cleared the seen list.
        seenHints.clear();
        for (const id of loadSeenHints()) seenHints.add(id);
        openPause();
      };
      hud.showSheet(settingsPanel(ctx, back), { onEscape: back });
    }

    function confirmAbandon() {
      hud.showOutcome({
        title: 'Abandon run?',
        text: 'The run ends here and its save is deleted. This can\'t be undone.',
        actions: [
          { label: 'Keep my run', primary: true, onclick: openPause },
          {
            label: 'Abandon run',
            onclick: () => {
              leaving = 'abandoned';
              abandoning = true;
              ctx.router.go('title');
            },
          },
        ],
        onEscape: openPause,
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
        ...resumeTag,
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
        if (!saving) ctx.run = addHints(finishFloor(run, state), floorNo, hintCount); // else persist() did
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
      onHint: () => askHint(),
      onRestart: () => confirmRestart(),
      onMove: (dir) => dispatch({ type: 'move', dir }),
      onTap(cell) {
        // Tap an adjacent tile to step (or bump) there. Measured from where
        // the player will be once any running playback is done.
        const me = findCreature(state.board, PLAYER_ID);
        const dir = me && dirToward(me, cell);
        if (dir) dispatch({ type: 'move', dir });
      },
    });

    // Esc opens the pause menu, once a fold preview has had its turn to
    // cancel (input.js marks the key handled). Open panels handle their
    // own Esc while focus is in them; this covers focus elsewhere.
    const onEscape = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat) return;
      if (hud.overlayShown) {
        if (state.status === 'playing') {
          e.preventDefault();
          openPause();
        }
        return;
      }
      if (state.status !== 'playing' || input.active) return;
      e.preventDefault();
      openPause();
    };
    window.addEventListener('keydown', onEscape);

    sync();
    persist();
    if (restartHints != null) hud.notify('Floor restarted.', { info: true });
    else if (actionLog.length) hud.notify('Run continued where you left off.', { info: true });
    else if (restarted) hud.notify('This floor changed in an update, so it starts over.', { info: true });
    queueHints({ type: 'start' });
    return () => {
      // Leaving a saved floor mid-play keeps the run: Continue Run on the
      // title screen picks it up. An unsaved one (dev overrides) ends it.
      const keep = saving && state.status === 'playing';
      report(leaving || (keep ? 'left' : 'abandoned'));
      gone = true;
      window.removeEventListener('keydown', onEscape);
      search.destroy();
      if ((abandoning || !keep) && inRun && state.status === 'playing' && ctx.run === run) ctx.endRun('abandoned');
      playback.finish();
      fx.destroy();
      ctx.renderer.setFx(null);
      input.destroy();
      hud.destroy();
    };
  },
};

/** The Hint button's words for a step (the board shows it too). */
const STEP_TEXT = {
  fold: () => 'Fold along the dashed line: drag across it the way the arrow points.',
  move: (a) => `Move ${a.dir} (follow the arrow).`,
  wait: () => 'Wait a turn (Wait, or Space).',
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
            // The run stays saved on this offer; Continue Run returns here.
            onclick: () => ctx.router.go('title'),
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
