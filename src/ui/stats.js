// Stats & History (docs/04 screen 9, Phase 7e): totals, best run, runs by
// spirit, recent runs and the daily history, laid out from
// core/stats.js statsView(). Read only; Back (or Esc) returns to the title.

import { el } from './dom.js';
import { statsView } from '../core/stats.js';

/** One section: label / value rows, then a list of entries. */
function section(s) {
  const rows = s.rows || [];
  const items = s.items || [];
  return el('section', { class: 'settings-group stats-section', 'aria-labelledby': `stats-${s.id}` },
    el('h3', { class: 'settings-heading', id: `stats-${s.id}`, text: s.title }),
    rows.length
      ? el('dl', { class: 'summary-rows' }, rows.map((r) => el('div', { class: 'summary-row' },
        el('dt', { text: r.label }),
        el('dd', { text: r.value }))))
      : null,
    items.length
      ? el('ul', { class: 'stats-list' }, items.map((it) => el('li', { class: 'stats-item' },
        el('strong', { text: it.title }),
        el('span', { class: 'setting-note', text: it.text }))))
      : null,
    !rows.length && !items.length ? el('p', { class: 'settings-about', text: s.empty }) : null);
}

export const statsScreen = {
  mount(root, ctx) {
    ctx.renderer.setScene(null);
    const back = () => ctx.router.go('title');
    const view = statsView(ctx.meta, Date.now());
    root.append(el('div', { class: 'menu settings stats' },
      el('h2', { class: 'outcome-title', text: 'Stats & History' }),
      view.empty ? el('p', { class: 'subtitle', text: 'Finish a run to start your record.' }) : null,
      view.note ? el('p', { class: 'settings-about', text: view.note }) : null,
      el('div', { class: 'settings-groups' }, view.sections.map(section)),
      el('div', { class: 'menu-buttons' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: back }, 'Back'))));
    root.querySelector('.btn-primary')?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },
};
