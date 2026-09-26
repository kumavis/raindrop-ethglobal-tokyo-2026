// Inspector for the selected account: balance, share b_i vs trust g_i (gain / dilution),
// what the next rain pays it, endorsement lists (clickable) and a share-of-supply sparkline.
// Describes the step that is playing: once a step's change is on screen (a newcomer
// appearing, an edge growing, the rain settling) it shows the state after that step.
// Re-rendered only when the selection, that position or the compiled timeline changes;
// during a rain the balance alone follows the growing disk, frame by frame.

import { fill, h, setText } from './dom.js';
import { fmtNum, fmtPct, fmtPts } from './format.js';
import { nodeStats } from '../model/raindrop.js';
import { linSpark, panel } from './widgets.js';

const TONES = new Set(['rain', 'amber', 'mint', 'rose', 'gold', 'violet']);

export function createInspector(ctx) {
  const { app, player } = ctx;
  const p = panel(ctx, { name: 'inspector', title: '', eyebrow: 'Account' });
  const swatch = h('span.swatch');
  p.titleEl.prepend(swatch);
  const titleText = h('span.title-text');
  p.titleEl.append(titleText);

  // The timeline position the panel describes: the step playing counts as done once its
  // change is visible (any time into a trust / join / transfer step, or a rain's settle).
  function viewCursor() {
    const c = player.cursor;
    const step = player.step;
    if (!step || !(player.time > 0)) return c;
    if (step.type !== 'rain') return c + 1;
    return player.phase?.name === 'settle' ? c + 1 : c;
  }

  let key = '';
  let big = null; // the hero balance, updated live while the rain is credited
  function render() {
    const id = app.selectedId;
    if (!id || !app.compiled) return;
    const cursor = viewCursor();
    const k = `${ctx.version}|${cursor}|${id}`;
    if (k !== key) build(id, cursor, k);
    if (big) {
      const ph = player.phase?.name;
      const live = player.step?.type === 'rain' && ph === 'rain' && cursor === player.cursor;
      const n = live ? player.frame().nodes.find((x) => x.id === id) : null;
      setText(big.el, fmtNum(n ? n.balance : big.balance));
    }
  }

  function build(id, cursor, k) {
    key = k;
    big = null;
    const s = nodeStats(app.compiled, cursor, id);
    const node = s?.node ?? findNode(id);
    titleText.textContent = node?.label ?? id;
    swatch.className = `swatch tone-${TONES.has(node?.tone) ? node.tone : 'paper'}`;
    if (!s) {
      fill(p.body, h('p.muted-note', { text: 'This account has not joined the network yet at this point in the timeline.' }));
      return;
    }
    const bigEl = h('span.ins-big', { text: fmtNum(s.balance) });
    big = { el: bigEl, balance: s.balance };
    const gainCls = s.gain > 1e-9 ? 'up' : s.gain < -1e-9 ? 'down' : 'flat';
    const hist = s.history.map((x) => x.share);
    // Autoscale to the history (at least one percentage point tall) so a drift of a point or
    // two is visible; the start → now label keeps the scale honest.
    let lo = hist.length ? Math.min(...hist) : 0;
    let hi = hist.length ? Math.max(...hist) : 0;
    const padV = Math.max(0.01 - (hi - lo), 0) / 2 + (hi - lo) * 0.15;
    lo = Math.max(0, lo - padV);
    hi += padV;
    const spark = hist.length ? linSpark(hist, { w: 240, h: 44, pad: 0, min: lo, max: hi }) : null;

    const endorse = (list, dir) => (list.length
      ? h('ul.links', {}, list.map((e) => h('li', {},
        h('button.link', { type: 'button', onclick: () => app.select(e.id), title: `Inspect ${e.label}` },
          h('span.link-dir', { text: dir === 'out' ? '→' : '←' }),
          h('span.link-name', { text: e.label }),
          h('span.link-bar', {}, h('i', { style: { width: `${Math.max(3, e.share * 100)}%` } })),
          h('span.link-pct', { text: fmtPct(e.share).replace(/\.0%$/, '%') })))))
      : null);

    fill(p.body,
      h('div.ins-hero', {},
        h('div.ins-bal', {}, bigEl, h('span.ins-unit', { text: 'tokens' })),
        h('div.ins-gain', { 'data-dir': gainCls, title: 'Trust score gᵢ minus share of supply bᵢ, in percentage points: > 0 means this account gains share next round' },
          h('span.arrow', { text: gainCls === 'up' ? '▲' : gainCls === 'down' ? '▼' : '■' }),
          h('span', { text: gainCls === 'flat' ? 'holds share' : `${fmtPts(s.gain)} ${gainCls === 'up' ? 'gain' : 'dilution'}` }))),
      h('dl.ins-grid', {},
        stat('Share of supply', 'bᵢ', fmtPct(s.share), 'Balance ÷ total supply: the pre-trust'),
        stat('Trust score', 'gᵢ', fmtPct(s.trust), 'EigenTrust score on the current graph: the fraction of the rain this account would get if it rained now'),
        stat('Next rain', '', '+' + fmtNum(s.nextRain), s.nextRainIndex === null
          ? 'gᵢ × the mint of an extra round on the current graph'
          : 'What the next rain pays this account, after any trust changes or newcomers before it'),
        stat('Received so far', '', fmtNum(s.received), 'Total rain received up to now'),
      ),
      s.keepsOwnWeight ? h('p.keeps', {}, h('b', { text: 'Keeps its own weight.' }), ' Endorses no one, so its trust loops back to itself.') : null,
      s.keepsOwnWeight ? null : section('Endorses', s.outgoing.length, endorse(s.outgoing, 'out'), 'No one'),
      section(`Endorsed by`, s.incoming.length, endorse(s.incoming, 'in'), 'No one yet'),
      spark ? h('div.ins-spark', {},
        h('div.section-head', {}, h('span.eyebrow', { text: 'Share over time' }), h('span.ins-spark-v', { text: hist.length > 1 ? `${fmtPct(hist[0])} → ${fmtPct(hist.at(-1))}` : fmtPct(hist.at(-1)) })),
        sparkSVG(spark)) : null,
      node.note ? h('p.ins-note', { text: node.note }) : null);
  }

  function findNode(id) {
    for (const st of app.compiled.steps) {
      const n = st.after.nodes.find((x) => x.id === id);
      if (n) return n;
    }
    return null;
  }

  app.on('select', () => { key = ''; render(); });
  app.on('compiled', () => { key = ''; });

  return { el: p.el, update: render };
}

function stat(label, sym, value, title) {
  return h('div.ins-stat', { title },
    h('dt', {}, label, sym ? h('span.sym', { text: ' ' + sym }) : null),
    h('dd', { text: value }));
}

function section(title, count, list, empty) {
  return h('div.ins-section', {},
    h('div.section-head', {}, h('span.eyebrow', { text: title }), count ? h('span.count', { text: String(count) }) : null),
    list ?? (empty ? h('p.empty', { text: empty }) : null));
}

function sparkSVG({ line, area, last }) {
  const wrap = h('div.spark');
  wrap.innerHTML = `<div class="spark-in"><svg viewBox="0 0 240 44" preserveAspectRatio="none"><path class="area" d="${area}"/><path class="line" d="${line}"/></svg><i class="spark-dot" style="left:${((last[0] / 240) * 100).toFixed(2)}%;top:${((last[1] / 44) * 100).toFixed(2)}%"></i></div>`;
  return wrap;
}
