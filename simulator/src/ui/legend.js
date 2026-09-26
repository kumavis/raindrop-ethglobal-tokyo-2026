// Legend (how to read the graph and the timeline colors) and the zoom buttons.

import { h } from './dom.js';
import { icon } from './icons.js';
import { panel } from './widgets.js';

const G = {
  disk: '<circle cx="16" cy="16" r="8" fill="#EAF2F8"/>',
  halo: '<circle cx="16" cy="16" r="13" fill="rgba(47,140,255,.18)" stroke="rgba(47,140,255,.7)" stroke-width="1.5"/><circle cx="16" cy="16" r="7" fill="#EAF2F8"/>',
  diluted: '<circle cx="16" cy="16" r="12" fill="#EAF2F8"/><circle cx="16" cy="16" r="7" fill="none" stroke="#2F8CFF" stroke-width="1.6" stroke-dasharray="4 3"/>',
  edge: '<path d="M4 22 Q16 6 27 16" fill="none" stroke="rgba(234,242,248,.6)" stroke-width="2"/><path d="M27 16l-6.2-.6 3.1-4.6z" fill="rgba(234,242,248,.8)"/>',
  ripple: '<circle cx="16" cy="16" r="6" fill="#EAF2F8"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="#5FB0FF" stroke-width="1.4" opacity=".75"/><circle cx="16" cy="16" r="13.5" fill="none" stroke="#5FB0FF" stroke-width="1.2" opacity=".35"/>',
  flow: '<circle cx="7" cy="16" r="2.4" fill="#CFE6FF"/><circle cx="15" cy="16" r="3" fill="#CFE6FF" opacity=".85"/><circle cx="24" cy="16" r="2" fill="#CFE6FF" opacity=".6"/>',
  ring: '<circle cx="16" cy="16" r="7" fill="#EAF2F8"/><circle cx="16" cy="16" r="11" fill="none" stroke="#FFB547" stroke-width="2"/>',
  newbie: '<circle cx="16" cy="16" r="6" fill="none" stroke="#EAF2F8" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 3.4"/>',
  anchor: '<circle cx="16" cy="16" r="12" fill="#EAF2F8"/><circle cx="16" cy="16" r="7" fill="rgba(255,181,71,.55)" stroke="#FFB547" stroke-width="1.2"/>',
  self: '<circle cx="12" cy="19" r="8" fill="#EAF2F8"/><path d="M17.2 11.6 A5.5 5.5 0 1 1 22.6 17.4" fill="none" stroke="rgba(234,242,248,.75)" stroke-width="1.6"/><path d="M22.6 17.4l-3.6 .9 1.6-3.4z" fill="rgba(234,242,248,.85)"/>',
  group: '<rect x="3" y="7" width="26" height="18" rx="7" fill="none" stroke="rgba(234,242,248,.45)" stroke-width="1.3" stroke-dasharray="3 2.5"/><circle cx="11" cy="16" r="3.5" fill="#FF6B81"/><circle cx="21" cy="16" r="3.5" fill="#FF6B81"/>',
};
const glyph = (k) => h('span.glyph', { html: `<svg viewBox="0 0 32 32" aria-hidden="true">${G[k]}</svg>` });

export function createLegend(ctx) {
  const p = panel(ctx, { name: 'legend', title: 'How to read it', eyebrow: 'Legend' });
  const row = (g, title, text) => h('li', {}, glyph(g), h('span', {}, h('b', { text: title }), ' ', text));
  p.body.append(
    h('ul.legend-list', {},
      row('disk', 'Disk area = balance.', 'Tints mark roles.'),
      row('halo', 'Halo area = trust × supply.', 'Bigger than the disk ⇒ gaining share.'),
      row('diluted', 'Dashed ring inside the disk', '= trust below share ⇒ diluted.'),
      row('edge', 'Arrow = endorsement.', 'Width = share of the endorser\'s trust.'),
      row('self', 'Small loop = endorses no one:', 'keeps its own weight.'),
      row('flow', 'Glowing dots = EigenTrust flow', '(1−α)·Cᵀg along arrows, each iteration.'),
      row('anchor', 'Amber core = α·b,', 'the part of trust anchored to balance.'),
      row('ripple', 'Ripples = rain:', 'new tokens, credited in proportion to trust.'),
      row('newbie', 'Dotted outline = empty account.', ''),
      row('group', 'Dashed box = a group\'s totals:', 'its share of supply and of the rain.'),
      row('ring', 'Amber ring = trust change or selection.', '')),
    h('div.section-head', {}, h('span.eyebrow', { text: 'Timeline' })),
    h('ul.legend-kinds', {},
      [['rain', 'Rain round'], ['trust', 'Trust change'], ['join', 'Newcomer'], ['transfer', 'Transfer'], ['note', 'Note'], ['extra', 'Extra round']]
        .map(([k, t]) => h('li', {}, h(`i.seg.k-${k === 'extra' ? 'rain.extra' : k}`), t))));
  return { el: p.el };
}

export function createZoom(ctx) {
  const { stage } = ctx;
  const b = (name, label, onclick, cls = '') => h(`button.btn.icon-btn${cls}`, { type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
  const el = h('div.zoom', { role: 'group', 'aria-label': 'Zoom' },
    b('plus', 'Zoom in', () => stage.zoomBy(1.25), '.z-in'),
    b('minus', 'Zoom out', () => stage.zoomBy(0.8), '.z-out'),
    b('fit', 'Fit to screen', () => stage.fit({ animate: true }), '.z-fit'));
  return { el };
}
