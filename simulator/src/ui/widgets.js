// Reusable UI widgets: segmented control with a sliding pill, switch, slider rows with
// custom value mappings (linear / log), panels that double as mobile bottom sheets,
// and a log-scale sparkline path builder.

import { h, setAttr, setStyle } from './dom.js';
import { icon } from './icons.js';

/** Segmented control. options: [{ value, label, title? }] */
export function segmented(options, onChange, { cls = '', label } = {}) {
  let current;
  const buttons = options.map((o) => h('button.segc-opt', {
    type: 'button',
    role: 'radio',
    title: o.title,
    onclick: () => {
      if (o.value === current) return;
      set(o.value);
      onChange(o.value);
    },
  }, h('span.segc-long', { text: o.label }), o.short ? h('span.segc-short', { text: o.short }) : null));
  const el = h(`div.segc${cls ? '.' + cls : ''}`, { role: 'radiogroup', 'aria-label': label, style: { '--n': options.length } },
    h('span.segc-pill', { 'aria-hidden': 'true' }), buttons);
  // arrow keys move the selection, as in a native radio group
  el.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const k = buttons.indexOf(e.target);
    if (!dir || k < 0) return;
    e.preventDefault();
    const b = buttons[(k + dir + buttons.length) % buttons.length];
    b.focus();
    b.click();
  });
  function set(value) {
    current = value;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setStyle(el, '--i', String(i));
    buttons.forEach((b, k) => setAttr(b, 'aria-checked', k === i ? 'true' : 'false'));
  }
  return { el, set, get value() { return current; } };
}

/** On/off switch rendered as a labelled row. */
export function switchRow({ label, help, onChange }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label.row.switch-row', {},
    h('span.row-main', {}, h('span.row-label', { text: label }), help ? h('span.help', { text: help }) : null),
    h('span.switch', {}, input, h('span.switch-track', { 'aria-hidden': 'true' }, h('span.switch-thumb'))));
  return { el, set(v) { input.checked = !!v; } };
}

export const linear = (min, max) => ({ to: (v) => (v - min) / (max - min), from: (p) => min + p * (max - min) });
export const logScale = (min, max) => ({
  to: (v) => (Math.log(Math.max(min, v)) - Math.log(min)) / (Math.log(max) - Math.log(min)),
  from: (p) => Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))),
});
export const powScale = (min, max, k = 2) => ({
  to: (v) => ((Math.max(min, v) - min) / (max - min)) ** (1 / k),
  from: (p) => min + (max - min) * p ** k,
});

/**
 * Slider + numeric field. `scale` maps value ↔ [0, 1]; `snap` rounds a raw value;
 * `format` renders it; `parse` reads the field (defaults to Number).
 */
export function sliderRow({ label, help, scale, snap = (v) => v, format = String, parse = Number, min, max, onInput, onCommit, inputMode = 'decimal' }) {
  const STEPS = 1000;
  const range = h('input.range', { type: 'range', min: 0, max: STEPS, step: 1, 'aria-label': label });
  const field = h('input.num', { type: 'text', inputmode: inputMode, spellcheck: 'false', autocomplete: 'off', 'aria-label': `${label} value` });
  let value;
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const paint = () => {
    const p = Math.min(1, Math.max(0, scale.to(value)));
    range.value = String(Math.round(p * STEPS));
    range.style.setProperty('--p', `${(p * 100).toFixed(2)}%`);
  };
  const set = (v, { fromField = false } = {}) => {
    value = v;
    paint();
    if (!fromField && document.activeElement !== field) field.value = format(v);
  };
  range.addEventListener('input', () => {
    const v = clamp(snap(scale.from(+range.value / STEPS)));
    value = v;
    field.value = format(v);
    range.style.setProperty('--p', `${(+range.value / 10).toFixed(2)}%`);
    onInput?.(v);
  });
  range.addEventListener('change', () => onCommit?.(value));
  const commitField = () => {
    const raw = parse(field.value.trim());
    if (!Number.isFinite(raw)) { field.value = format(value); return; }
    const v = clamp(snap(raw));
    set(v);
    field.value = format(v);
    onCommit?.(v);
  };
  field.addEventListener('change', commitField);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commitField(); field.blur(); }
    if (e.key === 'Escape') { field.value = format(value); field.blur(); }
  });
  field.addEventListener('blur', () => { field.value = format(value); });
  const el = h('div.row.slider-row', {},
    h('div.row-head', {}, h('label.row-label', { text: label }), field),
    range,
    help ? h('p.help', { text: help }) : null);
  return { el, set, get value() { return value; } };
}

/**
 * A panel that is a floating card/drawer on desktop and a bottom sheet on mobile.
 * `ctx.close(name)` is called by its close button and by dragging the handle down.
 */
export function panel(ctx, { name, title, eyebrow, cls = '', actions = [] }) {
  const titleEl = h('h2.panel-title', { text: title ?? '' });
  const eyebrowEl = eyebrow ? h('div.eyebrow', { text: eyebrow }) : null;
  const close = h('button.btn.icon-btn.panel-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => ctx.close(name) }, icon('close'));
  const handle = h('div.sheet-handle', { 'aria-hidden': 'true' }, h('span'));
  const head = h('div.panel-head', {}, h('div.panel-titles', {}, eyebrowEl, titleEl), ...actions, close);
  const body = h('div.panel-body');
  const el = h(`section.panel.panel-${name}${cls ? '.' + cls : ''}`, { 'aria-label': title || name, 'data-panel': name }, handle, head, body);
  sheetDrag(ctx, el, [handle, head], () => ctx.close(name));
  return { el, body, head, titleEl, eyebrowEl };
}

// Drag a bottom sheet down by its handle/header to dismiss it (mobile only).
function sheetDrag(ctx, el, grips, onDismiss) {
  let start = null;
  const onDown = (e) => {
    if (!ctx.mobile || e.target.closest('button, input, a, select')) return;
    start = { y: e.clientY, t: performance.now(), id: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    el.classList.add('dragging');
  };
  const onMove = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dy = Math.max(0, e.clientY - start.y);
    el.style.setProperty('--drag', `${dy}px`);
  };
  const onUp = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dy = e.clientY - start.y;
    const v = dy / Math.max(1, performance.now() - start.t);
    start = null;
    el.classList.remove('dragging');
    el.style.removeProperty('--drag');
    if (dy > 90 || (dy > 24 && v > 0.6)) onDismiss();
  };
  for (const g of grips) {
    g.addEventListener('pointerdown', onDown);
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
    g.addEventListener('pointercancel', onUp);
  }
}

/**
 * Sparkline geometry for a series on a log10 scale.
 * Returns { d, points: [{x, y}], y(v) } for an SVG of size w × h (with padding).
 */
export function logSpark(values, { w, h: ht, pad = 4, floor = 1e-16, extra = [] }) {
  const logs = values.map((v) => Math.log10(Math.max(floor, v)));
  const all = logs.concat(extra.map((v) => Math.log10(Math.max(floor, v))));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (!Number.isFinite(lo)) { lo = -6; hi = 0; }
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const n = values.length;
  const x = (i) => pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
  const y = (v) => pad + (1 - (Math.log10(Math.max(floor, v)) - lo) / (hi - lo)) * (ht - 2 * pad);
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
  return { d, points, y };
}

/** Linear sparkline (area + line) for a series of numbers. */
export function linSpark(values, { w, h: ht, pad = 3, min, max }) {
  const lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (hi - lo < 1e-12) hi = lo + 1;
  const n = values.length;
  const x = (i) => pad + (n <= 1 ? (w - 2 * pad) : (i / (n - 1)) * (w - 2 * pad));
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (ht - 2 * pad);
  const pts = values.map((v, i) => [x(i), y(v)]);
  if (n === 1) pts.unshift([pad, pts[0][1]]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
  const area = `${line}L${pts.at(-1)[0].toFixed(1)} ${ht - pad}L${pts[0][0].toFixed(1)} ${ht - pad}Z`;
  return { line, area, last: pts.at(-1) };
}
