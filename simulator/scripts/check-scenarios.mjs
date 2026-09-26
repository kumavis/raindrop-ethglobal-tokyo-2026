// Validates, compiles and summarizes every prebuilt scenario, then checks each scenario's
// pedagogical claim numerically. Exits 1 if anything fails.
//
//   node scripts/check-scenarios.mjs            summary + checks
//   node scripts/check-scenarios.mjs --quiet    failures only
//   node scripts/check-scenarios.mjs <id>...    only these scenarios
import { SCENARIOS } from '../src/scenarios/index.js';
import { compile, DEFAULT_PARAMS, scoresAt, stateAt, validateScenario } from '../src/model/raindrop.js';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const only = args.filter((a) => !a.startsWith('--'));

// ---------- helpers ----------

const shareOf = (state, id) => {
  const n = state.nodes.find((x) => x.id === id);
  return n && state.supply > 0 ? n.balance / state.supply : 0;
};
const groupShare = (state, ids) => ids.reduce((a, id) => a + shareOf(state, id), 0);
const balanceOf = (state, id) => state.nodes.find((x) => x.id === id)?.balance ?? 0;
const rains = (c) => c.steps.filter((s) => s.type === 'rain');
const g = (d, id) => (d.ids.includes(id) ? d.g[d.ids.indexOf(id)] : 0);
const b = (d, id) => (d.ids.includes(id) ? d.b[d.ids.indexOf(id)] : 0);
const gSum = (d, ids) => ids.reduce((a, id) => a + g(d, id), 0);
const bSum = (d, ids) => ids.reduce((a, id) => a + b(d, id), 0);
/** Index of the first step matching `pred` (throws if none, so claims can't silently pass). */
const find = (c, pred, from = 0) => {
  const k = c.steps.findIndex((s, i) => i >= from && pred(s));
  if (k < 0) throw new Error('expected step not found');
  return k;
};
const byCaption = (c, text) => find(c, (s) => (s.caption ?? '').includes(text));
const rainsAfter = (c, k) => c.steps.filter((s) => s.type === 'rain' && s.index > k);
const rainsBefore = (c, k) => c.steps.filter((s) => s.type === 'rain' && s.index < k);
const last = (xs) => xs[xs.length - 1];
const states = (c) => [c.initial, ...c.steps.map((s) => s.after)];
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function makeT(id) {
  const failures = [];
  const passes = [];
  const t = {
    ok(cond, msg) { (cond ? passes : failures).push(msg); },
    close(a, bb, tol, msg) { t.ok(Math.abs(a - bb) <= tol, `${msg} (${a} vs ${bb}, tol ${tol})`); },
    gt(a, bb, msg) { t.ok(a > bb, `${msg} (${a.toFixed?.(6) ?? a} > ${bb.toFixed?.(6) ?? bb})`); },
  };
  return { t, failures, passes, id };
}

// ---------- pedagogical claims, one per scenario ----------

const CLAIMS = {
  'first-drop'(c, t) {
    const a = c.params.alpha;
    const [first, ...later] = rains(c);
    for (const id of first.detail.ids) t.close(g(first.detail, id), b(first.detail, id), 1e-12, `no endorsements: g = b for ${id} (pro-rata)`);
    const e = byCaption(c, 'Ada endorses Ben');
    t.close(balanceOf(c.steps[e].after, 'ada'), balanceOf(c.steps[e].before, 'ada'), 0, 'Ada keeps her coins when she endorses');
    for (const r of later) {
      t.close(g(r.detail, 'ada'), a * b(r.detail, 'ada'), 1e-9, `round ${r.after.round}: g_Ada = α·b_Ada`);
      t.gt(g(r.detail, 'ben'), b(r.detail, 'ben'), `round ${r.after.round}: Ben's halo exceeds his disk`);
    }
    const cs = states(c);
    t.gt(shareOf(last(cs), 'ben'), shareOf(c.initial, 'ben'), 'Ben ends with a larger share');
  },

  'trust-flows'(c, t) {
    const a = c.params.alpha;
    const chain = ['ada', 'ben', 'cleo', 'dev', 'fern'];
    const r = rainsAfter(c, byCaption(c, 'Dev endorses Fern'))[0];
    const d = r.detail;
    for (let k = 1; k < chain.length; k++) {
      t.gt(g(d, chain[k]), g(d, chain[k - 1]), `trust grows down the chain: ${chain[k]} > ${chain[k - 1]}`);
      if (k < chain.length - 1) t.close(g(d, chain[k]), a * b(d, chain[k]) + (1 - a) * g(d, chain[k - 1]), 1e-6, `${chain[k]} = α·b + (1−α)·g_prev`);
    }
    t.close(g(d, 'ada'), a * b(d, 'ada'), 1e-9, 'head of the chain keeps only α·b');
    t.gt(g(d, 'fern'), 1.8 * b(d, 'fern'), 'trust pools at the end: g_Fern > 1.8·b_Fern');
    t.ok(d.residuals.length >= chain.length, `EigenTrust needs ≥ ${chain.length} iterations (${d.residuals.length})`);
    t.ok(rains(c)[0].detail.residuals.length === 1, 'pro-rata rain converges in one iteration');
  },

  everyone(c, t) {
    const all = rainsAfter(c, byCaption(c, 'Now everyone endorses'));
    const rowsSelf = all[0].detail.rows.filter((row) => row.self).length;
    t.ok(rowsSelf === 0, 'after the batch, every account endorses someone');
    // Changing minds moves the rain: Ada's new pick Ivo gains.
    const k = byCaption(c, 'Ada backs Ivo');
    t.gt(g(scoresAt(c, k + 1), 'ivo'), g(scoresAt(c, k), 'ivo'), 'Ada’s move raises Ivo’s score at once');
    const before = last(rainsBefore(c, k)).detail;
    const after = rainsAfter(c, k)[0].detail;
    const moved = before.ids.reduce((a, id) => a + Math.abs(g(after, id) - g(before, id)), 0);
    t.gt(moved, 0.05, 'the next rain follows the changed graph (‖Δg‖₁ > 0.05)');
    const j = byCaption(c, 'Fern endorses Juno');
    for (const r of rainsAfter(c, j)) {
      t.gt(g(r.detail, 'juno'), b(r.detail, 'juno'), `round ${r.after.round}: Juno is found (g > b)`);
      t.gt(g(r.detail, 'kai'), b(r.detail, 'kai'), `round ${r.after.round}: Kai is found (g > b)`);
    }
    const end = last(states(c));
    t.ok(end.nodes.length === 10, 'ten accounts at the end, like the film');
    t.gt(shareOf(end, 'cleo'), shareOf(c.initial, 'cleo') * 1.2, 'Cleo, where trust pools, grows her share by > 20%');
  },

  newcomer(c, t) {
    const endorse = byCaption(c, 'Cleo endorses Juno');
    const nobody = rainsAfter(c, byCaption(c, 'Juno joins'))[0];
    t.ok(nobody.index < endorse, 'a rain happens before anyone endorses Juno');
    t.close(nobody.after.lastRain.juno, 0, 0, 'no endorsements, no balance: not a drop for Juno');
    let prev = 0;
    for (const r of rainsAfter(c, endorse)) {
      t.gt(r.after.lastRain.juno, 0, `round ${r.after.round}: the rain finds Juno`);
      const s = shareOf(r.after, 'juno');
      t.gt(s, prev, `round ${r.after.round}: Juno's share grows`);
      prev = s;
    }
  },

  hub(c, t, recompile) {
    const a = c.params.alpha;
    const all = rainsAfter(c, byCaption(c, 'Everyone endorses Mo'));
    for (const r of all) {
      t.close(g(r.detail, 'mo'), 1 - a * (1 - b(r.detail, 'mo')), 1e-9, `round ${r.after.round}: g_Mo = 1 − α(1 − b_Mo)`);
      t.gt(shareOf(r.after, 'mo'), shareOf(r.before, 'mo'), `round ${r.after.round}: Mo's share grows`);
    }
    t.gt(g(all[0].detail, 'mo'), 0.5, 'Mo captures most of the rain');
    const low = last(rainsAfter(recompile({ alpha: 0.2 }), 0)).detail;
    t.gt(g(low, 'mo'), 0.8, 'at α = 0.2 Mo gets over 80% of the rain');
  },

  'change-mind'(c, t) {
    const k = byCaption(c, 'Ada moves');
    const before = last(rainsBefore(c, k)).detail;
    const after = rainsAfter(c, k)[0].detail;
    t.gt(g(before, 'rio'), 3 * b(before, 'rio'), 'while backed, Rio’s halo is > 3× his disk');
    t.gt(g(after, 'sol'), g(before, 'sol') * 2, 'the very next rain after Ada moves favors Sol');
    t.gt(g(before, 'rio') - g(after, 'rio'), 0, 'and Rio’s score drops');
    for (const r of rainsAfter(c, byCaption(c, 'Cleo drops Rio'))) {
      t.close(g(r.detail, 'rio'), b(r.detail, 'rio'), 1e-9, `round ${r.after.round}: unendorsed Rio is back to pro-rata`);
      t.gt(g(r.detail, 'sol'), b(r.detail, 'sol'), `round ${r.after.round}: Sol gains`);
    }
  },

  'three-ways'(c, t) {
    const e = byCaption(c, 'Ada vouches');
    t.close(balanceOf(c.steps[e].after, 'ada'), balanceOf(c.steps[e].before, 'ada'), 0, 'endorsing costs Ada no tokens');
    const gift = byCaption(c, 'Ben sends Kai');
    t.close(balanceOf(c.steps[gift].before, 'ben') - balanceOf(c.steps[gift].after, 'ben'), 5, 1e-12, 'a gift comes out of Ben’s wallet');
    const buy = byCaption(c, 'Lu buys');
    t.close(balanceOf(c.steps[buy].before, 'dev') - balanceOf(c.steps[buy].after, 'dev'), 5, 1e-12, 'Lu’s tokens come from the seller, Dev');
    for (const r of rainsAfter(c, buy)) {
      t.gt(g(r.detail, 'juno'), b(r.detail, 'juno'), `round ${r.after.round}: endorsed Juno gains share (g > b)`);
      t.close(g(r.detail, 'kai'), b(r.detail, 'kai'), 1e-9, `round ${r.after.round}: Kai gets exactly his baseline share`);
      t.close(g(r.detail, 'lu'), b(r.detail, 'lu'), 1e-9, `round ${r.after.round}: Lu gets exactly her baseline share`);
    }
    const end = last(states(c));
    for (const id of ['juno', 'kai', 'lu']) t.gt(end.received[id], 0, `${id} received rain`);
  },

  'two-communities'(c, t, recompile) {
    const r = last(rains(c)).detail;
    t.gt(g(r, 'bo'), 2 * b(r, 'bo'), 'the bridge’s halo is > 2× its disk');
    t.gt(shareOf(last(states(c)), 'bo'), 2 * shareOf(c.initial, 'bo'), 'Bo more than doubles his share');
    const lo = shareOf(last(states(recompile({ alpha: 0.2 }))), 'bo');
    const hi = shareOf(last(states(recompile({ alpha: 0.8 }))), 'bo');
    t.gt(lo, hi * 1.5, `α sensitivity: Bo ends with ${pct(lo)} at α=0.2 vs ${pct(hi)} at α=0.8`);
  },

  'eigentrust-lab'(c, t, recompile) {
    const a = c.params.alpha;
    t.ok(a === 0.15, 'scenario runs at α = 0.15');
    for (const r of rains(c)) {
      const res = r.detail.residuals;
      t.ok(res.length >= 30, `round ${r.after.round}: slow on purpose (${res.length} iterations)`);
      t.ok(r.detail.converged, `round ${r.after.round}: converges within max iterations`);
      t.ok(res.every((x, k) => !k || x <= (1 - a) * res[k - 1] * (1 + 1e-9) + 1e-15), `round ${r.after.round}: residual shrinks by ≥ (1−α) per step`);
    }
    const coarse = rains(recompile({ epsilon: 1e-2 }));
    t.ok(coarse.every((r) => r.detail.residuals.length < 20), 'ε = 1e-2 stops much earlier');
    const capped = rains(recompile({ maxIterations: 3 }));
    t.ok(capped.every((r) => r.detail.residuals.length === 3 && !r.detail.converged), 'max iterations = 3 stops before converging');
    const uniform = last(rains(recompile({ g0: 'uniform' }))).detail;
    const ref = last(rains(c)).detail;
    t.ok(uniform.g.every((x, k) => Math.abs(x - ref.g[k]) < 1e-5), 'uniform start reaches the same fixed point');
  },

  'sybil-split'(c, t, recompile) {
    for (const alpha of [c.params.alpha, 0.1, 0.9]) {
      const cc = alpha === c.params.alpha ? c : recompile({ alpha });
      const group = last(states(cc)).nodes.filter((n) => n.id.startsWith('eve')).map((n) => n.id);
      for (const s of states(cc)) t.close(groupShare(s, group), 0.4, 1e-9, `α=${alpha} round ${s.round}: Eve's group holds 40% of supply`);
      for (const r of rains(cc)) t.close(gSum(r.detail, group), bSum(r.detail, group), 1e-9, `α=${alpha} round ${r.after.round}: group rain share = group balance share`);
      const split = byCaption(cc, 'Eve splits');
      const pre = last(rainsBefore(cc, split));
      const post = rainsAfter(cc, split)[0];
      t.close(gSum(post.detail, group) , gSum(pre.detail, group), 1e-9, `α=${alpha}: rain share before vs after the split`);
    }
    t.ok(last(states(c)).nodes.filter((n) => n.id.startsWith('eve') && n.balance > 0).length === 8, 'Eve ends up as eight funded accounts');
  },

  'cost-of-endorsing'(c, t) {
    const e = byCaption(c, 'Ada endorses Cy');
    for (const s of states(c)) t.close(shareOf(s, 'ben'), 0.4, 1e-9, `round ${s.round}: Ben (endorses no one) keeps 40%`);
    let prev = shareOf(c.steps[e].after, 'ada');
    for (const r of rainsAfter(c, e)) {
      t.close(g(r.detail, 'ada'), c.params.alpha * b(r.detail, 'ada'), 1e-9, `round ${r.after.round}: Ada keeps only α of her weight`);
      const s = shareOf(r.after, 'ada');
      t.gt(prev, s, `round ${r.after.round}: Ada's share slips`);
      prev = s;
    }
    const end = last(states(c));
    t.gt(shareOf(end, 'ben') - shareOf(end, 'ada'), 0.05, 'the twins end > 5 points apart');
  },

  'trust-sink'(c, t, recompile) {
    const ring = ['rex', 'ras', 'rue'];
    t.close(groupShare(c.initial, ring), shareOf(c.initial, 'cora'), 1e-12, 'Cora and the ring start with equal stakes');
    const k = byCaption(c, 'Ada backs Cora');
    for (const r of rainsAfter(c, k)) {
      t.gt(gSum(r.detail, ring), 1.5 * g(r.detail, 'cora'), `round ${r.after.round}: the ring keeps far more trust than Cora`);
    }
    const end = last(states(c));
    t.gt(groupShare(end, ring), shareOf(end, 'cora') * 1.5, 'the ring ends with a much larger share than Cora');
    t.gt(groupShare(end, ring), groupShare(c.initial, ring), 'the ring’s share grows');
    const gap = (cc) => {
      const s = last(states(cc));
      return groupShare(s, ring) - shareOf(s, 'cora');
    };
    t.gt(gap(recompile({ alpha: 0.2 })), gap(c), 'lower α makes the sink stronger');
  },

  'sybil-endorsements'(c, t) {
    const group = ['mal', 'f1', 'f2', 'f3', 'f4'];
    const real = ['ana', 'bo'];
    const grow = byCaption(c, 'The list grows');
    const fix = byCaption(c, 'Hal checks');
    const before = last(rainsBefore(c, grow)).detail;
    const flood = rainsAfter(c, grow).filter((r) => r.index < fix);
    t.ok(c.steps[grow].before.nodes.filter((n) => group.includes(n.id) && n.id !== 'mal').every((n) => n.balance === 0), 'the fake projects hold nothing');
    t.close(gSum(before, group), bSum(before, group), 1e-9, 'before the flood Mal gets only his baseline');
    for (const r of flood) {
      t.gt(gSum(r.detail, group) - bSum(r.detail, group), 0.05, `round ${r.after.round}: Mal's group gains > 5 points over its baseline`);
      t.gt(gSum(before, real), gSum(r.detail, real), `round ${r.after.round}: real contributors lose trust to the fakes`);
    }
    for (const r of rainsAfter(c, fix)) t.close(gSum(r.detail, group), bSum(r.detail, group), 1e-9, `round ${r.after.round}: after the fix Mal is back to baseline`);
  },

  'rich-get-richer'(c, t) {
    const stop = byCaption(c, 'Rio stops');
    const atStop = c.steps[stop].after;
    t.gt(shareOf(atStop, 'rio'), 2.5 * shareOf(c.initial, 'rio'), `Rio grows from ${pct(shareOf(c.initial, 'rio'))} to ${pct(shareOf(atStop, 'rio'))}`);
    for (const r of rainsAfter(c, stop)) t.close(shareOf(r.after, 'rio'), shareOf(atStop, 'rio'), 1e-9, `round ${r.after.round}: Rio's share holds`);
    const end = last(states(c));
    t.gt(shareOf(end, 'rio'), shareOf(end, 'nia'), 'Nia, now endorsed by everyone, still trails Rio');
  },

  async 'random-community'(c, t) {
    const again = (await import(`../src/scenarios/random-community.js?again=${Date.now()}`)).default;
    t.ok(JSON.stringify(again) === JSON.stringify(c.scenario), 'the generator is deterministic');
    const end = last(states(c));
    t.ok(end.nodes.length === 36, `36 accounts at the end (${end.nodes.length})`);
    t.ok(c.initial.nodes.length === 32, '32 founders');
    const star = c.scenario.meta.star;
    t.gt(shareOf(end, star), shareOf(c.initial, star) * 1.5, `the best-endorsed founder (${star}) grows its share by > 50%`);
    for (const n of end.nodes.filter((x) => x.joinedStep >= 0)) t.gt(end.received[n.id], 0, `newcomer ${n.id} is found by the rain`);
    const top = (s) => s.nodes.map((n) => n.balance / s.supply).sort((x, y) => y - x).slice(0, 5).reduce((x, y) => x + y, 0);
    t.gt(top(end), top(c.initial), 'rain concentrates: the top five hold more at the end');
  },

  'empty-canvas'(c, t) {
    for (const s of states(c)) for (const n of c.initial.nodes) t.close(shareOf(s, n.id), shareOf(c.initial, n.id), 1e-12, `round ${s.round}: ${n.id}'s share is unchanged`);
    for (const r of rains(c)) t.ok(r.detail.residuals.length === 1, `round ${r.after.round}: EigenTrust is trivial (1 iteration)`);
    t.gt(last(states(c)).supply, c.initial.supply * 1.5, 'yet everyone’s balance grows');
  },
};

// ---------- generic checks ----------

const GROUP_IDS = ['basics', 'dynamics', 'attacks', 'sandbox']; // picker order
const walk = (events, fn) => events.forEach((e) => (e.type === 'batch' ? (fn(e), walk(e.events, fn)) : fn(e)));
const PARAM_SWEEP = [
  { alpha: 0.05 }, { alpha: 0.95 }, { issuanceMode: 'fixed', issuanceFixed: 25 }, { issuancePercent: 50 },
  { g0: 'uniform' }, { epsilon: 1e-10, maxIterations: 500 },
];

function generic(s, c, t) {
  t.ok((s.description ?? '').startsWith('What to watch:'), 'description starts with "What to watch:"');
  t.ok(s.summary && s.summary.length <= 70, 'summary present and ≤ 70 chars');
  t.ok(GROUP_IDS.includes(s.tags?.[0]), `first tag is a picker group (${s.tags?.[0]})`);
  t.ok(/^[a-z0-9-]+$/.test(s.id), 'id is url-safe');
  t.ok(c.initial.supply >= 90 && c.initial.supply <= 110, `initial supply ≈ 100 (${c.initial.supply.toFixed(2)})`);
  walk(s.events, (e) => { if (e.caption) t.ok(e.caption.length <= 64, `caption ≤ 64 chars: "${e.caption}"`); });
  const noted = s.events.filter((e) => e.type === 'note' || e.type === 'batch' || e.caption);
  t.ok(noted.length === s.events.length || s.events.every((e) => e.type === 'rain' || e.caption), 'every non-rain event has a caption');
  if (s.layout === 'fixed') {
    const all = [...s.nodes];
    walk(s.events, (e) => { if (e.type === 'join') all.push(e.node); });
    for (const n of all) t.ok(Math.abs(n.x) <= 1.05 && Math.abs(n.y) <= 1.05, `fixed layout: ${n.id} has x/y hints in [-1, 1]`);
  }
  // Tokens enter only through issuance (paper §3.7, §4.3): newcomers join empty and buy in.
  walk(s.events, (e) => { if (e.type === 'join') t.ok(!(e.node.balance > 0), `${e.node.id} joins with 0 tokens (no supply outside the rain)`); });
  for (const step of c.steps) {
    if (step.type !== 'rain') t.close(step.after.supply, step.before.supply, 1e-9, `step ${step.index} (${step.type}) leaves supply unchanged`);
    const skipped = step.detail?.skipped || step.detail?.details?.some((d) => d.skipped);
    t.ok(!skipped, `step ${step.index} (${step.type}) was applied`);
    if (step.type === 'rain') {
      const sum = step.detail.g.reduce((x, y) => x + y, 0);
      t.close(sum, 1, 1e-9, `step ${step.index}: trust scores sum to 1`);
      t.ok(step.detail.converged, `step ${step.index}: EigenTrust converged`);
    }
  }
  for (const p of PARAM_SWEEP) {
    const cc = compile(s, p);
    const ok = rains(cc).every((r) => Math.abs(r.detail.g.reduce((x, y) => x + y, 0) - 1) < 1e-9 && r.after.supply > 0);
    t.ok(ok, `compiles cleanly with ${JSON.stringify(p)}`);
  }
}

// ---------- summary ----------

function summarize(s, c) {
  const end = stateAt(c, c.steps.length);
  const iters = rains(c).map((r) => r.detail.residuals.length);
  const lines = [`\n${s.tags[0].toUpperCase().padEnd(9)} ${s.id} — ${s.title}`];
  lines.push(`  steps ${c.steps.length}, rounds ${end.round}, supply ${c.initial.supply.toFixed(1)} → ${end.supply.toFixed(1)}, accounts ${c.initial.nodes.length} → ${end.nodes.length}`);
  lines.push(`  iterations per rain: ${iters.join(' ')}`);
  const rows = end.nodes
    .map((n) => ({ id: n.id, from: shareOf(c.initial, n.id), to: n.balance / end.supply }))
    .sort((x, y) => y.to - x.to);
  const shown = rows.length > 12 ? rows.slice(0, 10) : rows;
  const cells = shown.map((r) => `${r.id} ${pct(r.from)}→${pct(r.to)}`);
  for (let k = 0; k < cells.length; k += 4) lines.push(`  ${cells.slice(k, k + 4).map((x) => x.padEnd(24)).join('')}`);
  if (shown.length < rows.length) lines.push(`  … ${rows.length - shown.length} more`);
  return lines.join('\n');
}

// ---------- run ----------

let failed = 0;
const seen = new Set();
for (const s of SCENARIOS) {
  if (seen.has(s.id)) { console.log(`FAIL duplicate scenario id ${s.id}`); failed++; }
  seen.add(s.id);
}
const order = SCENARIOS.map((s) => GROUP_IDS.indexOf(s.tags?.[0]));
if (order.some((x, k) => k && x < order[k - 1])) { console.log('FAIL SCENARIOS are not ordered by picker group'); failed++; }

for (const s of SCENARIOS.filter((x) => !only.length || only.includes(x.id))) {
  const errors = validateScenario(s);
  if (errors.length) {
    console.log(`\nFAIL ${s.id}: invalid scenario\n  ${errors.join('\n  ')}`);
    failed++;
    continue;
  }
  const c = compile(s, {});
  const recompile = (p) => compile(s, p);
  const { t, failures, passes } = makeT(s.id);
  try {
    generic(s, c, t);
    if (!CLAIMS[s.id]) t.ok(false, 'no pedagogical claim registered for this scenario');
    else await CLAIMS[s.id](c, t, recompile);
  } catch (err) {
    failures.push(`threw: ${err.stack}`);
  }
  if (!quiet) console.log(summarize(s, c));
  if (!quiet || failures.length) console.log(`  ${failures.length ? 'FAIL' : 'ok'}: ${passes.length} checks passed, ${failures.length} failed`);
  for (const f of failures) console.log(`    ✗ ${f}`);
  failed += failures.length;
}

console.log(failed ? `\n${failed} failure(s)` : `\nall ${SCENARIOS.length} scenarios ok (defaults: ${JSON.stringify(DEFAULT_PARAMS)})`);
process.exit(failed ? 1 : 0);
