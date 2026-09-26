// Bottom dock: film-style caption, the timeline scrubber (one colored segment per step,
// extra rain rounds hatched) and the transport controls, including the headline
// EigenTrust "Step-by-step | Instant" toggle.

import { h, setAttr, setClass, setHTML, setStyle, setText } from './dom.js';
import { icon, iconSVG } from './icons.js';
import { captionOf, KIND_LABEL, STEP_KIND, stepTitle } from './format.js';
import { segmented } from './widgets.js';
import { MAX_EXTRA_ROUNDS } from '../app.js';

export const SPEEDS = [0.5, 1, 2, 4];

export function createPlayback(ctx) {
  const { app, player } = ctx;

  // ---- caption ----
  // The chip names the step and, during a rain, where in the round we are: the inner
  // EigenTrust loop, then the rain (aria-hidden: it changes every iteration).
  const capKindText = h('span');
  const capPhase = h('span.cap-phase', { 'aria-hidden': 'true' });
  const capKind = h('span.cap-kind', {}, capKindText, capPhase);
  const capText = h('span.cap-text');
  const caption = h('div.caption', { 'aria-live': 'polite' }, h('p.cap-inner', {}, capKind, capText));

  // ---- scrubber ----
  const base = h('div.segs.segs-base');
  const lit = h('div.segs.segs-lit');
  const scriptEnd = h('div.script-end', { title: 'End of the scenario script; extra rain rounds follow' });
  const knob = h('div.knob');
  const tipTitle = h('span.tip-title');
  const tipText = h('span.tip-text');
  const tip = h('div.tip', { role: 'tooltip' }, tipTitle, tipText);
  const track = h('div.track', {}, base, lit, scriptEnd, knob);
  const scrub = h('div.scrub', {
    role: 'slider', tabindex: '0', 'aria-label': 'Timeline', 'aria-valuemin': '0',
  }, track, tip);
  const counter = h('span.counter');

  // ---- transport ----
  const btn = (name, label, key, onclick, cls = '') => h(`button.btn.icon-btn.tp-${name}${cls}`, { type: 'button', 'aria-label': label, title: `${label} (${key})`, onclick }, icon(name === 'play' ? 'play' : name));
  const restartBtn = btn('restart', 'Restart', 'Home', () => player.restart());
  const backBtn = btn('stepBack', 'Step back', '←', () => player.stepBack());
  const fwdBtn = btn('stepFwd', 'Step forward', '→', () => player.stepForward());
  const playBtn = h('button.btn.play-btn', { type: 'button', 'aria-label': 'Play', title: 'Play (Space)', onclick: () => ctx.togglePlay() });
  const speedBtn = h('button.btn.speed-btn', { type: 'button', title: 'Playback speed (+ / −)', onclick: () => ctx.cycleSpeed(1) });
  const mode = segmented([
    { value: 'step', label: 'Step-by-step', short: 'Steps', title: 'Animate each EigenTrust iteration (E)' },
    { value: 'instant', label: 'Instant', short: 'Instant', title: 'Compute EigenTrust in one go (E)' },
  ], (v) => app.setView({ eigenMode: v }), { cls: 'mode-seg', label: 'EigenTrust display' });
  const modeWrap = h('div.mode', {}, h('span.mode-label', {}, h('span.mode-et', { text: 'EigenTrust' })), mode.el);

  const controls = h('div.controls', {},
    h('div.transport', {}, restartBtn, backBtn, playBtn, fwdBtn, speedBtn),
    counter,
    modeWrap);
  const bar = h('div.bar', {}, h('div.scrub-row', {}, scrub), controls);
  const el = h('div.dock', {}, caption, bar);

  // ---- scrubber segments ----
  let segCount = 0;
  function segEl(step) {
    const kind = STEP_KIND[step.type] ?? 'note';
    return h(`i.seg.k-${kind}${step.extra ? '.extra' : ''}`);
  }
  function buildSegments(reset) {
    const steps = app.compiled?.steps ?? [];
    if (reset || steps.length < segCount) {
      base.replaceChildren();
      lit.replaceChildren();
      segCount = 0;
    }
    const fragA = document.createDocumentFragment();
    const fragB = document.createDocumentFragment();
    for (let i = segCount; i < steps.length; i++) {
      fragA.append(segEl(steps[i]));
      fragB.append(segEl(steps[i]));
    }
    base.append(fragA);
    lit.append(fragB);
    segCount = steps.length;
    const n = steps.length;
    track.style.setProperty('--gap', n > 90 ? '0px' : n > 40 ? '1px' : '2px');
    const script = app.compiled?.scriptLength ?? n;
    scriptEnd.hidden = !(n > script);
    scriptEnd.style.left = `${(script / Math.max(1, n)) * 100}%`;
    scrub.setAttribute('aria-valuemax', String(n));
    // reserve the widest "n / n" so the controls don't shift as the count grows
    counter.style.minWidth = `${String(n).length * 2 + 3}ch`;
  }
  app.on('compiled', ({ reason }) => buildSegments(reason !== 'extend'));

  // ---- scrubbing ----
  const fracAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
  };
  const cursorAt = (f) => {
    const n = app.compiled.steps.length;
    return f >= 0.998 ? n : Math.min(n - 1, Math.floor(f * n));
  };
  let drag = null;
  let hoverIdx = -1;
  function showTip(f, pinned) {
    const steps = app.compiled.steps;
    const n = steps.length;
    if (!n) return;
    const i = Math.min(n - 1, Math.floor(f * n));
    if (i !== hoverIdx) {
      hoverIdx = i;
      const s = steps[i];
      const kind = STEP_KIND[s.type] ?? 'note';
      tip.dataset.kind = kind;
      tipTitle.textContent = `${stepTitle(s)} · ${i + 1}/${n}`;
      // the title already names the round, so drop an auto caption's "Round N: " prefix
      tipText.textContent = captionOf(s).replace(/^Round \d+: (.)/, (_, c) => c.toUpperCase());
    }
    const w = scrub.getBoundingClientRect().width;
    const tw = tip.offsetWidth || 220;
    const x = Math.min(w - tw / 2, Math.max(tw / 2, f * w));
    tip.style.left = `${x}px`;
    tip.classList.add('show');
    tip.classList.toggle('pinned', !!pinned);
  }
  const hideTip = () => { tip.classList.remove('show'); hoverIdx = -1; };

  scrub.addEventListener('pointerdown', (e) => {
    if (!app.compiled?.steps.length) return;
    e.preventDefault();
    try { scrub.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    drag = { id: e.pointerId, wasPlaying: player.playing };
    player.pause();
    scrub.classList.add('dragging');
    const f = fracAt(e.clientX);
    player.seek(cursorAt(f));
    showTip(f, true);
  });
  scrub.addEventListener('pointermove', (e) => {
    const f = fracAt(e.clientX);
    if (drag && e.pointerId === drag.id) {
      const c = cursorAt(f);
      if (c !== player.cursor || player.time) player.seek(c);
      showTip(f, true);
    } else if (e.pointerType === 'mouse' && app.compiled?.steps.length) {
      showTip(f, false);
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.wasPlaying && !player.atEnd) player.play();
    drag = null;
    scrub.classList.remove('dragging');
    if (e.pointerType !== 'mouse') setTimeout(hideTip, 700);
  };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('pointerleave', (e) => { if (!drag && e.pointerType === 'mouse') hideTip(); });
  scrub.addEventListener('keydown', (e) => {
    const n = app.compiled?.steps.length ?? 0;
    if (e.key === 'End') { player.seek(n); e.preventDefault(); }
    if (e.key === 'PageDown') { player.seek(Math.min(n, player.cursor + 5)); e.preventDefault(); }
    if (e.key === 'PageUp') { player.seek(Math.max(0, player.cursor - 5)); e.preventDefault(); }
  });

  // ---- per-frame ----
  let capKey = '';
  function captionState() {
    const steps = app.compiled.steps;
    const c = player.cursor;
    // while a step plays (or is about to), show it; when parked at a boundary, the one that just ran
    const live = player.time > 0 || (player.playing && steps[c]);
    const s = live ? steps[c] : steps[c - 1] ?? null;
    // parked at the extra-round cap with 'Keep raining' on: say why nothing happens
    const capped = !live && player.atEnd && app.view.keepRaining && !app.canExtend;
    if (s) return { key: `s${s.index}|${ctx.version}|${capped}`, kind: STEP_KIND[s.type], step: s, capped };
    return { key: `start|${ctx.version}`, kind: 'start', step: null };
  }

  function update() {
    const c = app.compiled;
    if (!c) return;
    const n = c.steps.length;

    // caption
    const cap = captionState();
    if (cap.key !== capKey) {
      capKey = cap.key;
      capText.textContent = cap.capped ? `That’s ${MAX_EXTRA_ROUNDS} extra rounds, the limit. Press replay to start over.`
        : cap.step ? captionOf(cap.step)
        : app.compiled.steps.length ? 'Press play to run the scenario, or step through it one event at a time.' : 'Nothing to play.';
      caption.dataset.kind = cap.kind;
      const s = cap.step;
      capKindText.textContent = s ? (s.type === 'rain' ? `Round ${s.after.round}` : KIND_LABEL[STEP_KIND[s.type]]) : 'Ready';
      caption.firstChild.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: ctx.reducedMotion ? 1 : 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }

    setText(capPhase, cap.step ? phaseChip(cap.step) : '');

    // scrubber
    const p = Math.min(1, Math.max(0, player.progress || 0));
    const pct = `${(p * 100).toFixed(3)}%`;
    setStyle(lit, 'clip-path', `inset(0 calc(100% - ${pct}) 0 0)`);
    setStyle(knob, 'left', pct);
    setAttr(scrub, 'aria-valuenow', String(player.cursor));
    setAttr(scrub, 'aria-valuetext', n ? `Step ${Math.min(player.cursor + 1, n)} of ${n}` : 'Empty');
    setText(counter, n ? `${Math.min(player.cursor + (player.time > 0 ? 1 : 0), n)} / ${n}` : '0 / 0');

    // transport
    const ended = player.ended;
    const state = player.playing ? 'pause' : ended ? 'replay' : 'play';
    if (setPlay(state)) {
      playBtn.setAttribute('aria-label', state === 'pause' ? 'Pause' : state === 'replay' ? 'Replay' : 'Play');
      playBtn.title = `${playBtn.getAttribute('aria-label')} (Space)`;
    }
    setClass(playBtn, 'playing', player.playing);
    setAttr(backBtn, 'disabled', player.cursor === 0 && !player.time);
    setAttr(restartBtn, 'disabled', player.cursor === 0 && !player.time);
    setAttr(fwdBtn, 'disabled', ended);
    setText(speedBtn, `${app.view.speed}×`);
    if (mode.value !== app.view.eigenMode) mode.set(app.view.eigenMode);
    setClass(modeWrap, 'active-rain', player.step?.type === 'rain');
  }
  function phaseChip(s) {
    if (s.type !== 'rain' || s !== player.step || !(player.time > 0)) return '';
    const ph = player.phase;
    const K = s.detail.residuals.length;
    switch (ph.name) {
      case 'pretrust': return ` › EigenTrust 0/${K}`;
      case 'iterate': return ` › EigenTrust ${ph.iteration}/${K}`;
      case 'solve': return ' › EigenTrust (instant)';
      case 'rain': case 'settle': return ' › Rain';
      default: return '';
    }
  }

  let playState = '';
  function setPlay(state) {
    if (state === playState) return false;
    playState = state;
    setHTML(playBtn, iconSVG(state === 'pause' ? 'pause' : state === 'replay' ? 'replay' : 'play'));
    return true;
  }

  return { el, bar, caption, update };
}
