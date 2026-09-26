// Top bar: brand wordmark, scenario button (opens the picker), "what to watch" button,
// HUD stats (round, supply, last mint, α) and the legend / parameters toggles.

import { h, setClass, setText } from './dom.js';
import { dropMark, icon } from './icons.js';
import { fmtNum, lastRainBefore, stateAt } from './format.js';

const RAINING = new Set(['rain', 'settle']);

export function createTopbar(ctx) {
  const { app, player } = ctx;

  const brand = h('div.brand', { title: 'Raindrop Simulator' },
    dropMark('drop'),
    h('span.brand-word', { text: 'Raindrop' }),
    h('span.brand-sub', { text: 'Simulator' }));

  const title = h('span.sc-title');
  const scenarioBtn = h('button.btn.scenario-btn', {
    type: 'button', 'aria-haspopup': 'dialog', title: 'Choose a scenario (S)',
    onclick: () => ctx.toggle('picker'),
  }, h('span.sc-text', {}, h('span.sc-eyebrow', { text: 'Scenario' }), title), icon('chevronDown', 'chev'));

  const infoBtn = h('button.btn.icon-btn.info-btn', {
    type: 'button', title: 'What to watch', 'aria-label': 'What to watch in this scenario',
    onclick: () => ctx.toggle('info'),
  }, icon('info'));

  const stat = (key, label, title) => {
    const v = h('span.stat-v');
    const el = h(`div.stat.stat-${key}`, { title }, h('span.stat-k', { text: label }), v);
    return { el, v };
  };
  const round = stat('round', 'Round', 'Rain rounds so far');
  const supply = stat('supply', 'Supply', 'Total tokens in the network');
  const mint = stat('mint', 'Last mint', 'Tokens minted by the most recent rain (ΔS)');
  const alpha = stat('alpha', 'α', 'Pre-trust weight α (anchor to balances)');
  const hud = h('div.hud', { role: 'status', 'aria-live': 'off' }, round.el, supply.el, mint.el, alpha.el);

  const legendBtn = h('button.btn.ghost.legend-btn', {
    type: 'button', title: 'Legend (L)', onclick: () => ctx.toggle('legend'),
  }, icon('legend'), h('span.btn-label', { text: 'Legend' }));
  const paramsBtn = h('button.btn.ghost.params-btn', {
    type: 'button', title: 'Parameters (P)', onclick: () => ctx.toggle('params'),
  }, icon('sliders'), h('span.btn-label', { text: 'Parameters' }));

  const el = h('header.topbar', {},
    h('div.tb-left', {}, brand, h('div.sc-group', {}, scenarioBtn, infoBtn)),
    hud,
    h('div.tb-right', {}, legendBtn, paramsBtn));

  app.on('scenario', (s) => {
    setText(title, s.title);
    scenarioBtn.title = `${s.title}: choose a scenario (S)`;
  });

  let key = '';
  function update() {
    const c = app.compiled;
    if (!c) return;
    const cursor = player.cursor;
    const step = player.step;
    const phase = player.phase?.name ?? 'idle';
    const raining = step?.type === 'rain' && player.time > 0;
    const inRain = raining && RAINING.has(phase);
    const k = `${ctx.version}|${cursor}|${raining}|${inRain ? phase : ''}`;
    const st = stateAt(c, cursor);

    // supply rises as the rain is credited, so during a rain it is the sum of the balances
    // on the canvas this frame (the same numbers the disks and labels show)
    const s = inRain ? player.frame().supply : st.supply;
    setText(supply.v, fmtNum(s));
    setClass(supply.el, 'live', inRain);
    if (k === key) return;
    key = k;

    setText(round.v, String(raining ? step.after.round : st.round));
    const last = inRain ? step : lastRainBefore(c, cursor);
    setText(mint.v, last ? '+' + fmtNum(last.detail.minted) : '—');
    setClass(mint.el, 'live', inRain);
    setText(alpha.v, app.params.alpha.toFixed(2));
  }

  return { el, update, hud, scenarioBtn, paramsBtn, legendBtn, infoBtn };
}
