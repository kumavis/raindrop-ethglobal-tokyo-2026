// Parameters drawer (desktop) / sheet (mobile): every protocol parameter plus view
// options, each with one line of help. Slider drags are debounced into app.setParams.

import { debounce, h } from './dom.js';
import { icon } from './icons.js';
import { fmtSci } from './format.js';
import { DEFAULT_PARAMS } from '../model/raindrop.js';
import { linear, logScale, panel, powScale, segmented, sliderRow, switchRow } from './widgets.js';

const trimNum = (v, d) => String(+v.toFixed(d));
// α = 0 has no unique fixed point (the result would depend on g₀ and the iteration cap).
const MIN_ALPHA = 0.01;

export function createParams(ctx) {
  const { app } = ctx;
  const resetBtn = h('button.btn.ghost.small.reset-btn', {
    type: 'button', title: 'Reset parameters to this scenario\'s defaults',
    onclick: () => app.resetParams(),
  }, icon('reset'), h('span', { text: 'Reset' }));
  const p = panel(ctx, { name: 'params', title: 'Parameters', eyebrow: 'Protocol & view' });
  p.el.setAttribute('role', 'complementary');

  // Accumulate a patch and flush it after the drag pauses; recompiling is cheap but not free.
  let pending = {};
  const flush = debounce(() => {
    const patch = pending;
    pending = {};
    if (Object.keys(patch).length) app.setParams(patch);
  }, 60);
  const queue = (patch) => { Object.assign(pending, patch); flush(); };
  const commit = (patch) => { Object.assign(pending, patch); flush.flush(); };

  const alpha = sliderRow({
    label: 'α  pre-trust weight',
    help: 'Share of each account\'s weight anchored to its balance. Lower α gives endorsements more power. '
      + 'Minimum 0.01: at α = 0 there is no unique fixed point (paper §7).',
    scale: linear(0, 1), min: MIN_ALPHA, max: 1,
    snap: (v) => Math.max(MIN_ALPHA, Math.round(v * 100) / 100),
    format: (v) => v.toFixed(2),
    onInput: (v) => queue({ alpha: v }), onCommit: (v) => commit({ alpha: v }),
  });

  const issuanceMode = segmented([
    { value: 'percent', label: '% of supply' },
    { value: 'fixed', label: 'Fixed amount' },
  ], (v) => { commit({ issuanceMode: v }); syncIssuance(); }, { cls: 'segc-full', label: 'Issuance mode' });
  const issuancePct = sliderRow({
    label: 'Mint per round',
    scale: linear(0, 50), min: 0, max: 50,
    snap: (v) => Math.round(v * 2) / 2,
    format: (v) => `${trimNum(v, 1)}%`,
    parse: (s) => parseFloat(s.replace('%', '')),
    onInput: (v) => queue({ issuancePercent: v }), onCommit: (v) => commit({ issuancePercent: v }),
  });
  const issuanceFixed = sliderRow({
    label: 'Mint per round',
    scale: powScale(0, 1000, 2.5), min: 0, max: 1000,
    snap: (v) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)),
    format: (v) => trimNum(v, 1),
    onInput: (v) => queue({ issuanceFixed: v }), onCommit: (v) => commit({ issuanceFixed: v }),
  });
  const issuanceHelp = h('p.help');
  const issuance = h('div.row.issuance-row', {},
    h('div.row-head', {}, h('span.row-label', { text: 'Issuance' })),
    issuanceMode.el, issuancePct.el, issuanceFixed.el, issuanceHelp);
  function syncIssuance() {
    const fixed = app.params.issuanceMode === 'fixed';
    issuancePct.el.hidden = fixed;
    issuanceFixed.el.hidden = !fixed;
    issuanceHelp.textContent = fixed
      ? 'Each round mints the same number of tokens, so inflation falls as supply grows.'
      : 'Each round mints this share of the current supply: steady inflation, compounding growth.';
  }

  const epsilon = sliderRow({
    label: 'ε  convergence threshold',
    help: 'EigenTrust stops once an iteration moves the scores by less than ε (L1 distance).',
    scale: logScale(1e-10, 1e-1), min: 1e-10, max: 1e-1,
    snap: (v) => +v.toPrecision(1),
    format: (v) => fmtSci(v),
    parse: (s) => parseFloat(s),
    onInput: (v) => queue({ epsilon: v }), onCommit: (v) => commit({ epsilon: v }),
  });

  const maxIter = sliderRow({
    label: 'Max iterations',
    help: 'Hard cap on EigenTrust iterations per round, even if it has not converged yet.',
    scale: logScale(1, 500), min: 1, max: 500,
    snap: (v) => Math.round(v),
    format: (v) => String(v),
    inputMode: 'numeric',
    onInput: (v) => queue({ maxIterations: v }), onCommit: (v) => commit({ maxIterations: v }),
  });

  const g0 = segmented([
    { value: 'pretrust', label: 'Pre-trust b' },
    { value: 'uniform', label: 'Uniform' },
  ], (v) => commit({ g0: v }), { cls: 'segc-full', label: 'Starting vector' });
  const g0Row = h('div.row', {},
    h('div.row-head', {}, h('span.row-label', { text: 'Starting vector g₀' })),
    g0.el,
    h('p.help', { text: 'Where power iteration starts. For any α > 0 the fixed point is the same; only the path to it changes.' }));

  // ---- view options ----
  const sizeBy = segmented([
    { value: 'balance', label: 'Balance' },
    { value: 'share', label: 'Share of supply' },
  ], (v) => app.setView({ sizeBy: v }), { cls: 'segc-full', label: 'Node size' });
  const sizeRow = h('div.row', {},
    h('div.row-head', {}, h('span.row-label', { text: 'Node size' })),
    sizeBy.el,
    h('p.help', { text: 'Balance: disks grow as it rains. Share: disk area is each account\'s fraction of supply.' }));
  const halos = switchRow({ label: 'Trust halos', help: 'Halo area = trust score × supply. Bigger than the disk means gaining share.', onChange: (v) => app.setView({ showHalos: v }) });
  const labels = switchRow({ label: 'Labels', help: 'Names and balances under every node.', onChange: (v) => app.setView({ showLabels: v }) });
  const keep = switchRow({ label: 'Keep raining', help: 'After the script ends, keep playing extra rain rounds.', onChange: (v) => app.setView({ keepRaining: v }) });

  const section = (title, ...rows) => h('div.section', {}, h('div.section-head', {}, h('span.eyebrow', { text: title })), ...rows);
  const shortcuts = h('details.shortcuts', {},
    h('summary', {}, icon('keyboard'), h('span', { text: 'Keyboard shortcuts' })),
    h('dl', {}, [
      ['Space / K', 'Play / pause'], ['← →', 'Step back / forward'], ['Home', 'Restart'],
      ['E', 'EigenTrust step-by-step / instant'], ['+ −', 'Speed'], ['F', 'Fit graph'],
      ['P', 'Parameters'], ['S', 'Scenarios'], ['L', 'Legend'], ['Esc', 'Close / deselect'],
    ].map(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })])));

  p.body.append(
    section('Raindrop', alpha.el, issuance),
    section('EigenTrust', epsilon.el, maxIter.el, g0Row),
    section('View', sizeRow, halos.el, labels.el, keep.el),
    h('div.params-foot', {}, resetBtn, h('span.modified', { text: 'Modified from scenario defaults' })),
    shortcuts);

  function sync() {
    const pr = app.params;
    alpha.set(pr.alpha);
    issuanceMode.set(pr.issuanceMode);
    issuancePct.set(pr.issuancePercent);
    issuanceFixed.set(pr.issuanceFixed);
    epsilon.set(pr.epsilon);
    maxIter.set(pr.maxIterations);
    g0.set(pr.g0);
    syncIssuance();
    const defaults = { ...DEFAULT_PARAMS, ...app.scenario?.params };
    const modified = Object.keys(DEFAULT_PARAMS).some((k) => defaults[k] !== pr[k]);
    p.el.classList.toggle('is-modified', modified);
  }
  function syncView() {
    const v = app.view;
    sizeBy.set(v.sizeBy);
    halos.set(v.showHalos);
    labels.set(v.showLabels);
    keep.set(v.keepRaining);
  }
  app.on('params', sync);
  app.on('scenario', sync);
  app.on('view', syncView);
  syncView();

  return { el: p.el };
}
