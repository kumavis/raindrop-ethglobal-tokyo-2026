// Scenario picker (grouped by the scenario's first tag) and the "What to watch" card
// that introduces a scenario after it loads.

import { fill, h, setText } from './dom.js';
import { icon } from './icons.js';
import { panel } from './widgets.js';

export const GROUPS = [
  { tag: 'basics', label: 'Basics', blurb: 'How rain and endorsements work' },
  { tag: 'dynamics', label: 'Dynamics', blurb: 'Networks that change over time' },
  { tag: 'attacks', label: 'Attacks & limits', blurb: 'Sybils, collusion and edge cases' },
  { tag: 'sandbox', label: 'Sandbox', blurb: 'Open-ended networks to play with' },
];

export function groupScenarios(scenarios) {
  const known = new Map(GROUPS.map((g) => [g.tag, { ...g, items: [] }]));
  const other = { tag: 'other', label: 'More', blurb: '', items: [] };
  for (const s of scenarios) (known.get(s.tags?.[0]) ?? other).items.push(s);
  return [...known.values(), other].filter((g) => g.items.length);
}

export function createPicker(ctx) {
  const { app } = ctx;
  const p = panel(ctx, { name: 'picker', title: 'Scenarios', eyebrow: 'Choose a network' });
  p.el.setAttribute('role', 'dialog');
  const list = h('div.sc-list');
  p.body.append(list);
  const items = new Map();

  function render() {
    items.clear();
    let n = 0;
    fill(list, groupScenarios(app.scenarios).map((g) => h('div.sc-group-block', {},
      h('div.sc-group-head', {}, h('span.eyebrow', { text: g.label }), g.blurb ? h('span.sc-group-blurb', { text: g.blurb }) : null),
      g.items.map((s) => {
        n += 1;
        const btn = h('button.sc-item', {
          type: 'button',
          'data-tag': g.tag,
          onclick: () => {
            ctx.close('picker');
            if (app.scenario?.id === s.id) return;
            app.loadScenario(s.id);
          },
        },
        h('span.sc-num', { text: String(n).padStart(2, '0') }),
        h('span.sc-item-text', {}, h('span.sc-item-title', { text: s.title }), s.summary ? h('span.sc-item-sum', { text: s.summary }) : null),
        icon('check', 'sc-check'));
        items.set(s.id, btn);
        return btn;
      }))));
    mark();
  }
  function mark() {
    for (const [id, btn] of items) {
      btn.classList.toggle('active', id === app.scenario?.id);
      btn.setAttribute('aria-current', id === app.scenario?.id ? 'true' : 'false');
    }
  }
  render();
  app.on('scenario', mark);

  return {
    el: p.el,
    onOpen() {
      const item = items.get(app.scenario?.id);
      item?.scrollIntoView({ block: 'nearest' });
      item?.focus({ preventScroll: true });
    },
  };
}

/** Strips a leading "What to watch:" since the card's eyebrow already says it. */
const cleanDescription = (d) => {
  const s = (d ?? '').replace(/^\s*what to watch\s*[:—-]\s*/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function createInfo(ctx) {
  const { app } = ctx;
  const title = h('h2.info-title');
  const text = h('p.info-text');
  const tags = h('div.info-tags');
  // On short phones the description is clamped (CSS) so the graph fits below the card;
  // "More" expands it. The button only shows while the clamp actually hides text.
  const more = h('button.btn.info-more', {
    type: 'button',
    'aria-expanded': 'false',
    onclick: () => {
      const expanded = el.classList.toggle('expanded');
      more.setAttribute('aria-expanded', String(expanded));
      setText(more, expanded ? 'Less' : 'More');
    },
  }, 'More');
  const el = h('section.card.info-card', { 'aria-label': 'What to watch', 'data-panel': 'info' },
    h('div.info-head', {},
      h('div.eyebrow.eyebrow-amber', { text: 'What to watch' }),
      h('button.btn.icon-btn.panel-close', { type: 'button', 'aria-label': 'Dismiss', title: 'Dismiss (Esc)', onclick: () => ctx.close('info') }, icon('close'))),
    title, text,
    h('div.info-foot', {}, tags, more,
      h('button.btn.primary-soft.info-go', {
        type: 'button',
        onclick: () => { ctx.close('info'); if (!ctx.player.playing) ctx.player.play(); },
      }, icon('play'), h('span', { text: 'Play' }))));

  const clipped = () => el.classList.contains('expanded') || text.scrollHeight > text.clientHeight + 1;
  const moreBelow = () => text.classList.toggle('more-below', text.scrollTop + text.clientHeight < text.scrollHeight - 2);
  new ResizeObserver(() => { el.classList.toggle('clipped', clipped()); moreBelow(); }).observe(text);
  text.addEventListener('scroll', moreBelow, { passive: true });

  app.on('scenario', (s) => {
    el.classList.remove('expanded');
    more.setAttribute('aria-expanded', 'false');
    setText(more, 'More');
    setText(title, s.title);
    setText(text, cleanDescription(s.description) || s.summary || '');
    text.scrollTop = 0;
    el.classList.toggle('clipped', clipped());
    moreBelow();
    const group = GROUPS.find((g) => g.tag === s.tags?.[0]);
    fill(tags, group ? h('span.tag', { text: group.label }) : null,
      h('span.tag.tag-muted', { text: `${s.nodes.length} accounts` }));
  });
  return { el };
}
