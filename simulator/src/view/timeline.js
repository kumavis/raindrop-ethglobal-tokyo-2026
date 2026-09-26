// Phase timing for one compiled step: how long each beat of its animation lasts.
//
// A rain step in 'step' mode walks EigenTrust one iteration at a time; in 'instant'
// mode the whole run is a single flash. Everything else is one 'event' phase.

import { fmtNum } from '../format.js';

const EVENT_DURATION = { endorse: 1.0, revoke: 1.0, setTrust: 1.0, batch: 1.0, join: 1.1, transfer: 1.3, note: 2.6 };
const EVENT_LABEL = {
  endorse: 'Endorsement',
  revoke: 'Revocation',
  setTrust: 'Trust change',
  batch: 'Trust changes',
  join: 'Newcomer joins',
  transfer: 'Transfer',
  note: 'Note',
};

// Long runs (α near 0, tiny ε) would take minutes at 0.16 s per iteration, so
// iterations past FAST_AFTER share a fixed budget instead.
const FAST_AFTER = 24;
const FAST_BUDGET = 2.4;
// A rain right after another rain runs on the same graph, so its inner loop looks just
// like the one before: walk it faster (every iteration is still a stop for → / ←).
const REPEAT_BUDGET = 1.2;
const REPEAT_PRETRUST = 0.35;

export function iterationDuration(k, K) {
  if (k <= FAST_AFTER || K <= FAST_AFTER) return Math.max(0.16, 0.85 * 0.8 ** (k - 1));
  return Math.min(0.16, FAST_BUDGET / (K - FAST_AFTER));
}

/**
 * [{ name, label, start, end, iteration? }] for a step, in seconds at speed 1.
 * `repeat`: the previous step was a rain too (same graph), so the loop is quicker.
 */
export function phasesFor(step, mode, params, { repeat = false } = {}) {
  if (!step) return [];
  const out = [];
  let t = 0;
  const push = (name, label, d, extra) => {
    out.push({ name, label, start: t, end: t + d, ...extra });
    t += d;
  };
  if (step.type !== 'rain') {
    push('event', EVENT_LABEL[step.type] ?? step.type, EVENT_DURATION[step.type] ?? 1);
    return out;
  }
  const { residuals, converged, minted } = step.detail;
  const K = residuals.length;
  const rainLabel = `Mint +${fmtNum(minted)} · credited in proportion to trust`;
  if (mode === 'step') {
    const g0 = params?.g0 === 'uniform' ? 'uniform' : 'b (balances)';
    push('pretrust', `Start: g₀ = ${g0}`, repeat ? REPEAT_PRETRUST : 0.7, { iteration: 0 });
    const cap = repeat ? REPEAT_BUDGET / K : Infinity;
    for (let k = 1; k <= K; k++) push('iterate', `Iteration ${k} / ${K}`, Math.min(cap, iterationDuration(k, K)), { iteration: k });
    push('rain', rainLabel, 1.3);
    push('settle', 'Settle', 0.4);
  } else {
    const how = converged ? `converged in ${K} iteration${K === 1 ? '' : 's'}` : `stopped at ${K} iterations`;
    push('solve', `EigenTrust: ${how}`, 0.45);
    push('rain', rainLabel, 1.0);
    push('settle', 'Settle', 0.3);
  }
  return out;
}

export const durationOf = (phases) => (phases.length ? phases[phases.length - 1].end : 0);

/** Interior stop points for step-by-step navigation (end of pre-trust and of each iteration). */
export function stopPoints(phases, mode) {
  if (mode !== 'step') return [];
  return phases.filter((p) => p.name === 'pretrust' || p.name === 'iterate').map((p) => p.end);
}

export const IDLE = Object.freeze({ name: 'idle', label: '', start: 0, end: 0 });

/** The phase that `time` falls in: (start, end], so a paused stop shows the beat it just finished. */
export function phaseAt(phases, time) {
  if (!(time > 0) || !phases.length) return IDLE;
  for (const p of phases) if (time <= p.end + 1e-9) return p;
  return phases[phases.length - 1];
}
