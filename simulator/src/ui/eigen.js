// EigenTrust panel: the inner loop made visible. Hidden until opened from the (i) next to
// the Step-by-step | Instant toggle. During a rain step it shows the update rule, the
// current phase, iteration k / K, the L1 residual against ε, a log-scale residual
// sparkline and whether the run converged; between rains, EigenTrust on the current graph
// (what a rain now would use).

import { h, setAttr, setClass, setStyle, setText } from './dom.js';
import { icon } from './icons.js';
import { fmtSci } from './format.js';
import { scoresAt } from '../model/raindrop.js';
import { logSpark } from './widgets.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function createEigen(ctx) {
  const { app, player } = ctx;

  const modeTag = h('span.et-mode');
  const closeBtn = h('button.btn.icon-btn.et-close', {
    type: 'button', 'aria-label': 'Close', title: 'Close', onclick: () => ctx.close('eigen'),
  }, icon('close'));

  const alphaA = h('span.et-a');
  const alphaB = h('span.et-a');
  const formula = h('div.et-formula', {},
    h('span.et-g', { text: 'g' }), h('span.et-op', { text: ' ← ' }),
    h('span.et-term.t-anchor', {}, alphaA, h('span.et-b', { text: 'b' })),
    h('span.et-op', { text: ' + ' }),
    h('span.et-term.t-flow', {}, alphaB, h('span.et-c', {}, 'C', h('sup', { text: 'T' })), h('span.et-g', { text: 'g' })));
  const legendLine = h('div.et-key', {},
    h('span', {}, h('i.k-anchor'), 'α·b anchored to balances'),
    h('span', {}, h('i.k-flow'), '(1−α)·Cᵀg flows along endorsements'));

  const phase = h('div.et-phase');
  const iterK = h('span.et-k');
  const iterBar = h('div.et-progress', {}, h('i'));
  const residual = h('span.et-res');
  const eps = h('span.et-eps');
  const status = h('span.et-status', { title: 'Stopped at max iterations before ‖Δ‖₁ fell below ε' });

  const svg = svgEl('svg', { class: 'et-spark' });
  const epsLine = svgEl('line', { class: 'eps', x1: 0 });
  const pathAll = svgEl('path', { class: 'all' });
  const pathDone = svgEl('path', { class: 'done' });
  const dot = svgEl('circle', { class: 'dot', r: 3.5 });
  svg.append(epsLine, pathAll, pathDone, dot);
  const clip = svgEl('clipPath', { id: 'et-clip' });
  const clipRect = svgEl('rect', { x: 0, y: 0, height: 200, width: 0 });
  clip.append(clipRect);
  const defs = svgEl('defs');
  defs.append(clip);
  svg.prepend(defs);
  pathDone.setAttribute('clip-path', 'url(#et-clip)');
  const sparkWrap = h('div.et-spark-wrap', {}, h('div.et-axis', {}, h('span', { text: 'residual ‖Δ‖₁ (log scale)' }), h('span.et-eps-label', { text: '- - ε' })), svg);
  // A one-iteration run with Δ = 0 has no curve to draw, so say why instead.
  const fixedNote = h('p.et-fixed');

  // One-line result, shown in instant mode in place of the per-iteration rows.
  const summary = h('div.et-summary', {}, h('span.et-dot'), h('span.et-sum-text'));
  const sumText = summary.querySelector('.et-sum-text');

  const details = h('div.et-details', {},
    formula, legendLine, phase,
    h('div.et-iter', {}, h('span.et-lbl', { text: 'Iteration' }), iterK, iterBar),
    h('div.et-resrow', {}, h('span.et-lbl.et-sym', { text: '‖Δ‖₁' }), residual, h('span.et-vs', { text: 'vs' }), h('span.et-lbl.et-sym', { text: 'ε' }), eps, status),
    sparkWrap, fixedNote);

  const el = h('section.card.eigen', { 'aria-label': 'EigenTrust', 'data-panel': 'eigen' },
    h('div.et-head', {}, h('span.eyebrow', {}, 'EigenTrust'), modeTag, h('span.grow'), closeBtn),
    details, summary);

  let runKey = '';
  let run = null; // { residuals, K, converged, preview }
  let frameKey = '';

  function currentRun() {
    const step = player.step;
    if (step?.type === 'rain') return { detail: step.detail, preview: false, key: `${ctx.version}|${step.index}` };
    return { detail: scoresAt(app.compiled, player.cursor), preview: true, key: `${ctx.version}|p${player.cursor}` };
  }

  // The sparkline is drawn in CSS pixels (viewBox = its box) so dots stay round at any width.
  let sparkW = 0;
  let resized = false;
  new ResizeObserver(() => {
    if (sparkWrap.clientWidth && sparkWrap.clientWidth !== sparkW) resized = true;
  }).observe(sparkWrap);
  function buildRun(r) {
    const res = r.detail.residuals;
    const K = res.length;
    const epsV = app.params.epsilon;
    const SW = (sparkW = sparkWrap.clientWidth || 276);
    const SH = ctx.mobile ? 46 : 60;
    svg.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
    svg.style.height = `${SH}px`;
    epsLine.setAttribute('x2', SW);
    const geo = K ? logSpark(res, { w: SW, h: SH, pad: 6, extra: [epsV] }) : null;
    pathAll.setAttribute('d', geo?.d ?? '');
    pathDone.setAttribute('d', geo?.d ?? '');
    const ey = geo ? geo.y(epsV) : SH - 6;
    epsLine.setAttribute('y1', ey);
    epsLine.setAttribute('y2', ey);
    return { res, K, converged: r.detail.converged, preview: r.preview, points: geo?.points ?? [], fixed: K === 1 && res[0] === 0 };
  }

  function update() {
    if (!ctx.isOpen('eigen')) return;
    const r = currentRun();
    // rebuild on a new run, or when the sparkline box was resized (mobile expand, rotation)
    if (r.key !== runKey || resized) {
      resized = false;
      runKey = r.key;
      run = buildRun(r);
      frameKey = '';
    }
    const instant = app.view.eigenMode === 'instant';
    const idle = player.phase?.name === 'idle';
    let k = r.preview ? run.K : player.iteration ?? 0;
    if (instant && !idle) k = run.K;
    const done = k >= run.K;
    const fk = `${runKey}|${k}|${instant}|${player.phase?.label}|${app.params.alpha}|${app.params.epsilon}|${r.preview}|${idle}|${idle && player.playing}`;
    if (fk === frameKey) return;
    frameKey = fk;

    setText(modeTag, r.preview ? 'Current graph' : instant ? 'Instant' : 'Step-by-step');
    setClass(el, 'instant', instant);
    setClass(el, 'preview', r.preview);
    const a = app.params.alpha;
    setText(alphaA, a.toFixed(2));
    setText(alphaB, (1 - a).toFixed(2));

    let label;
    // Between rains the panel shows EigenTrust on the graph as it stands; a trust change
    // or a newcomer before the next rain would still change it.
    if (r.preview) label = 'If it rained now, on the current graph';
    else if (idle && instant) label = `Ready: one instantaneous calculation (${run.K} iteration${run.K === 1 ? '' : 's'})`;
    else if (idle) label = player.playing ? 'Starting…' : 'Ready: press play or → to iterate';
    // "Iteration k / K" is already on its own row, so say what the step computes instead
    else if (player.phase?.name === 'iterate') label = `g${sub(k)} = αb + (1−α)Cᵀg${sub(k - 1)}`;
    else label = player.phase?.label || '';
    setText(phase, label);

    setText(iterK, `${k} / ${run.K}`);
    setStyle(iterBar.firstChild, 'width', `${run.K ? (k / run.K) * 100 : 100}%`);
    const res = k > 0 ? run.res[k - 1] : null;
    setText(residual, res === null ? '—' : fmtSci(res));
    setText(eps, fmtSci(app.params.epsilon));
    setClass(residual, 'ok', res !== null && res < app.params.epsilon);

    const verdict = done ? (run.converged ? 'converged' : 'maxed') : 'running';
    setAttr(status, 'data-state', verdict);
    setText(status, done ? (run.converged ? '✓ converged' : 'max reached') : '');
    setClass(status, 'show', done);
    const fixedShown = run.fixed && k > 0;
    setClass(el, 'fixed-point', fixedShown);
    setText(fixedNote, fixedShown
      ? (app.params.g0 === 'pretrust'
        ? 'Already at the fixed point: no trust flows along endorsements yet, so g = b and the first step changes nothing (Δ = 0).'
        : 'Already at the fixed point: the first step changes nothing (Δ = 0).')
      : '');

    // sparkline: reveal the run up to iteration k
    const pts = run.points;
    const pk = k > 0 ? pts[k - 1] : null;
    clipRect.setAttribute('width', pk ? String(pk.x + 1) : '0');
    setAttr(dot, 'cx', pk ? pk.x.toFixed(1) : '-10');
    setAttr(dot, 'cy', pk ? pk.y.toFixed(1) : '-10');

    const its = `${run.K} iteration${run.K === 1 ? '' : 's'}`;
    // (the summary shows only in instant mode during a rain: ready, or already done)
    const tail = idle && instant && !r.preview
      ? `ready: ${its} in one go`
      : run.converged ? `converged in ${its}` : `stopped at ${run.K} (max)`;
    setText(sumText, tail);
    setAttr(summary, 'data-state', verdict);
  }

  return { el, update };
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).replace(/\d/g, (d) => SUB[d]);

