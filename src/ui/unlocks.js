// Unlocks shop (docs/04 screen 6, Phase 7b): spend paper scraps on
// spirits, relics and palettes. The shop is built from core/unlocks.js
// shopCatalog(), so new content (or a new kind of unlock) shows up here
// without changes; CARDS only says how each kind's card looks, and a
// kind without an entry gets the plain card (glyph, name, text).
//
// Buying takes two presses (Buy, then Confirm), since scraps never come
// back. Locked, affordable and owned items say so in words and marks, not
// color alone. Back (or Esc) returns to where the shop was opened: the
// title, the spirit select (a locked spirit) or the run summary.

import { el } from './dom.js';
import { shopCatalog } from '../core/unlocks.js';
import { RARITY_NAMES, GROUP_NAMES } from '../core/relics.js';
import { scrapsText } from './screens.js';

/**
 * How each kind's card looks: glyph(def) → the symbol by the name (or
 * null), body(def) → nodes after the name, label(def) → what the card
 * says to screen readers about its contents.
 */
const PLAIN_CARD = {
  glyph: (def) => (typeof def.glyph === 'string' ? def.glyph : null),
  body: (def) => (def.text ? [el('span', { class: 'offer-text', text: def.text })] : []),
  label: (def) => def.text || '',
};
const CARDS = {
  spirit: {
    ...PLAIN_CARD,
    body: (def) => [
      el('span', { class: 'offer-tags', text: `${def.hp} HP` }),
      el('span', { class: 'offer-text', text: def.perk }),
    ],
    label: (def) => `${def.hp} HP. ${def.perk}`,
  },
  relic: {
    ...PLAIN_CARD,
    body: (def) => [
      el('span', { class: 'offer-tags', text: `${RARITY_NAMES[def.rarity] || def.rarity} · ${GROUP_NAMES[def.group] || def.group}` }),
      el('span', { class: 'offer-text', text: def.text }),
    ],
    label: (def) => `${RARITY_NAMES[def.rarity] || ''} ${GROUP_NAMES[def.group] || ''} relic. ${def.text}`,
  },
  // A palette's `glyph` is a color token, not a symbol.
  palette: { glyph: () => null, body: (def) => [paletteSwatch(def)], label: () => 'Color palette.' },
};

/** A strip of a palette's colors, with a tile and its symbol ink. */
function paletteSwatch(p) {
  const chip = (color, extra = '') => el('span', { class: 'swatch-chip', style: `background:${color};${extra}` });
  return el('span', { class: 'palette-swatch', 'aria-hidden': 'true', style: `background:${p.background};border-color:${p.boardEdge}` },
    el('span', { class: 'swatch-tile', style: `background:${p.tileFace};color:${p.glyph};border-color:${p.tileEdge}`, text: '✦' }),
    chip(p.wallFace),
    chip(p.voidFace),
    chip(p.accent));
}

export const unlocksScreen = {
  mount(root, ctx, params) {
    ctx.renderer.setScene(null);
    const back = () => {
      if (params.from === 'spirit') ctx.router.go('spirit', params.back || {});
      else if (params.from === 'summary' && ctx.lastRun) ctx.router.go('summary');
      else ctx.router.go('title');
    };
    let pending = null; // 'kind:id' waiting for Confirm
    let said = '';

    const bank = el('p', { class: 'shop-bank' });
    const status = el('p', { class: 'code-status', role: 'status' });
    const sections = el('div', { class: 'shop-sections' });
    const panel = el('div', { class: 'menu offer shop' },
      el('h2', { class: 'outcome-title', text: 'Unlocks' }),
      el('p', { class: 'subtitle', text: 'Spend paper scraps from your runs. Unlocks add variety, never raw power.' }),
      bank,
      status,
      sections,
      el('div', { class: 'menu-buttons' },
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: back }, 'Back')),
    );
    root.append(panel);
    render(params.focus || null);

    function render(focusKey) {
      bank.textContent = ctx.unlockOpts.all ? 'Dev: everything unlocked' : `You have ${scrapsText(ctx.meta.scraps)}`;
      status.textContent = said;
      const catalog = shopCatalog(ctx.meta, ctx.unlockOpts);
      sections.replaceChildren(...catalog.map((section) => el('section', {
        class: 'shop-section', 'aria-labelledby': `shop-${section.kind}`,
      },
      el('h3', { class: 'settings-heading', id: `shop-${section.kind}`, text: section.title }),
      el('div', { class: 'offer-cards', role: 'group', 'aria-labelledby': `shop-${section.kind}` },
        section.items.map(card)))));
      const target = focusKey && sections.querySelector(`[data-item="${focusKey}"]`);
      if (target) target.focus({ preventScroll: false });
      else if (!root.contains(document.activeElement) || document.activeElement === document.body) {
        (sections.querySelector('.offer-card') || panel.querySelector('.btn'))?.focus({ preventScroll: true });
      }
    }

    function card(item) {
      const key = `${item.kind}:${item.id}`;
      const { def } = item;
      const action = actionFor(item, key);
      const look = CARDS[item.kind] || PLAIN_CARD;
      const glyph = look.glyph(def);
      const rarity = item.kind === 'relic' && def.rarity ? ` rarity-${def.rarity}` : '';
      return el('button', {
        class: `offer-card shop-card state-${item.state}${pending === key ? ' is-pending' : ''}${rarity}`,
        type: 'button',
        'data-item': key,
        'aria-disabled': action.disabled ? 'true' : null,
        'aria-label': `${def.name}. ${look.label(def)} ${action.label}`,
        onclick: () => press(item, key),
      },
      glyph ? el('span', { class: 'offer-glyph', 'aria-hidden': 'true', text: glyph }) : null,
      el('strong', { class: 'offer-name', text: def.name }),
      look.body(def),
      el('span', { class: `shop-action action-${action.kind}`, 'aria-hidden': 'true', text: action.text }));
    }

    /** The card's button line: { kind, text, label, disabled }. */
    function actionFor(item, key) {
      if (item.state === 'owned') {
        if (item.kind === 'palette') {
          const using = ctx.settings.palette === item.id;
          return using
            ? { kind: 'owned', text: '✓ In use', label: 'Owned, in use.', disabled: true }
            : { kind: 'use', text: 'Use', label: 'Owned. Press to use it.' };
        }
        return { kind: 'owned', text: '✓ Owned', label: 'Owned.', disabled: true };
      }
      if (item.state === 'reward') {
        const how = item.def.unlockText || 'Earned in play.';
        return { kind: 'reward', text: `🔒 ${how}`, label: `Locked. ${how}`, disabled: true };
      }
      if (item.state === 'short') {
        return {
          kind: 'short',
          text: `🔒 ${item.cost} · need ${item.short} more`,
          label: `Locked. Costs ${scrapsText(item.cost)}; you need ${item.short} more.`,
          disabled: true,
        };
      }
      if (pending === key) {
        return { kind: 'confirm', text: `Confirm · ${item.cost}`, label: `Press again to spend ${scrapsText(item.cost)}.` };
      }
      return { kind: 'buy', text: `Buy · ${item.cost}`, label: `Costs ${scrapsText(item.cost)}. Press to buy.` };
    }

    function press(item, key) {
      if (item.state === 'owned' && item.kind === 'palette' && ctx.settings.palette !== item.id) {
        ctx.updateSettings({ palette: item.id });
        pending = null;
        said = `${item.def.name} palette in use.`;
      } else if (item.state === 'buy' && pending !== key) {
        pending = key;
        said = `Press ${item.def.name} again to spend ${scrapsText(item.cost)}.`;
      } else if (item.state === 'buy') {
        const result = ctx.buy(item.kind, item.id);
        pending = null;
        said = result.ok
          ? `Unlocked ${item.def.name}. ${scrapsText(ctx.meta.scraps)} left.${item.kind === 'palette' ? ' Press it to use it.' : ''}`
          : 'That couldn\'t be bought.';
      } else {
        pending = null;
        said = '';
      }
      render(key);
    }

    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (pending) {
        const key = pending;
        pending = null;
        said = 'Cancelled.';
        render(key);
      } else {
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};
