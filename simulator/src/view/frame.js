// Builds one animation frame from (compiled, cursor, time): what every node, edge,
// particle, ripple and coin looks like, independent of where nodes sit on screen.
//
// Everything here is a pure function of its inputs, so the player can seek anywhere,
// forwards or backwards, and get the same picture.

import { scoresAt, stateAt } from '../model/raindrop.js';
import { stepFlows } from '../model/eigentrust.js';
import { clamp, easeInOut, easeOut, easeOutBack, hashString, lerp } from './theme.js';
import { phaseAt } from './timeline.js';

const FLOW_FADE = 0.35; // seconds the iteration's particles take to fade once the rain starts

// ---- cached derived data (keys are immutable model objects) ----

const scoreMaps = new WeakMap();
function scoreMap(scores) {
  let m = scoreMaps.get(scores);
  if (!m) {
    m = new Map(scores.ids.map((id, i) => [id, scores.g[i]]));
    scoreMaps.set(scores, m);
  }
  return m;
}

const edgeMaps = new WeakMap();
/** Row-normalized edges of a state, keyed 'from>to', plus the set of accounts endorsing no one. */
function edgesOf(state) {
  let m = edgeMaps.get(state);
  if (!m) {
    const edges = new Map();
    const ids = new Set(state.nodes.map((n) => n.id));
    const outgoing = new Set();
    for (const [from, row] of Object.entries(state.trust)) {
      if (!ids.has(from)) continue;
      let total = 0;
      for (const [to, w] of Object.entries(row)) if (ids.has(to) && w > 0) total += w;
      if (!(total > 0)) continue;
      outgoing.add(from);
      for (const [to, w] of Object.entries(row)) {
        if (ids.has(to) && w > 0) edges.set(`${from}>${to}`, { from, to, c: w / total });
      }
    }
    const selfIds = new Set([...ids].filter((id) => !outgoing.has(id)));
    m = { edges, selfIds };
    edgeMaps.set(state, m);
  }
  return m;
}

const flowCache = new WeakMap();
function iterationFlows(step, k) {
  let byK = flowCache.get(step);
  if (!byK) flowCache.set(step, (byK = new Map()));
  let f = byK.get(k);
  if (!f) {
    const { ids, b, rows, alpha, iterations } = step.detail;
    const raw = stepFlows(iterations[k - 1], b, rows, alpha);
    f = {
      edges: raw.edges.filter((e) => e.amount > 1e-5).map((e) => ({ from: ids[e.i], to: ids[e.j], amount: e.amount })),
      anchor: new Map(ids.map((id, i) => [id, raw.anchor[i]])),
    };
    byK.set(k, f);
  }
  return f;
}

// Accounts whose trust row changes in this step (they get the amber pulse).
function eventSources(event) {
  switch (event.type) {
    case 'endorse':
    case 'revoke':
    case 'setTrust':
      return [event.from];
    case 'join':
      return Object.keys(event.endorsedBy ?? {});
    case 'batch':
      return event.events.flatMap(eventSources);
    default:
      return [];
  }
}

function coinPlan(amount, supply) {
  const n = Math.round(clamp(6 + (supply > 0 ? (amount / supply) * 80 : 6), 6, 16));
  const coins = [];
  for (let k = 0; k < n; k++) coins.push({ depart: 0.05 + (k / n) * 0.55, flight: 0.55, k });
  return coins;
}

function coinProgress(coins, t, arrive) {
  let s = 0;
  for (const c of coins) s += clamp((t - c.depart - (arrive ? c.flight : 0)) / 0.12);
  return s / coins.length;
}

/**
 * @returns frame: {
 *   empty, cursor, time, step, phase, phaseP, mode, supply, showSelf,
 *   nodes: [{ id, label, tone, balance, score, stableScore, appear, newTag, pulse, self, hint, gain }],
 *   edges: [{ key, from, to, c, grow, alpha, hot }],
 *   flows, coins, flash,
 *   groups?: [{ id, label, tone, ids, supplyShare, rainShare, rain: { credited, total, minted } | null }]
 * }
 */
export function buildFrame(compiled, cursor, time, phases, view) {
  if (!compiled) return { empty: true, nodes: [], edges: [] };
  const steps = compiled.steps;
  const step = steps[cursor] ?? null;
  const before = stateAt(compiled, cursor);
  const after = step ? step.after : before;
  const phase = phaseAt(phases, time);
  const phaseP = phase.end > phase.start ? clamp((time - phase.start) / (phase.end - phase.start)) : 0;
  const idle = phase.name === 'idle';
  const sNow = scoreMap(scoresAt(compiled, cursor));
  const sNext = step ? scoreMap(scoresAt(compiled, cursor + 1)) : sNow;
  const type = step?.type ?? null;

  const eBefore = edgesOf(before);
  const eAfter = edgesOf(after);
  const beforeBal = new Map(before.nodes.map((n) => [n.id, n.balance]));
  const afterBal = new Map(after.nodes.map((n) => [n.id, n.balance]));

  const frame = {
    empty: false,
    cursor,
    time,
    step,
    phase,
    phaseP,
    mode: view.eigenMode,
    showSelf: false,
    flows: null,
    coins: null,
    flash: null,
    nodes: [],
    edges: [],
    supply: 0,
  };

  // Scores (halos) and balances per node, by phase.
  let scoreOf = (id) => sNow.get(id) ?? 0;
  let balanceOf = (id) => beforeBal.get(id) ?? afterBal.get(id) ?? 0;
  let gain = () => null;

  if (!idle && type !== 'rain') {
    const e = easeOut(phaseP);
    scoreOf = (id) => lerp(sNow.get(id) ?? 0, sNext.get(id) ?? 0, e);
    if (type === 'transfer' && step.detail.amount > 0) {
      const { from, to } = step.event;
      const amount = step.detail.amount;
      const coins = coinPlan(amount, before.supply);
      const out = coinProgress(coins, time, false);
      const inn = coinProgress(coins, time, true);
      balanceOf = (id) => (beforeBal.get(id) ?? 0) - (id === from ? amount * out : 0) + (id === to ? amount * inn : 0);
      frame.coins = { from, to, amount, t: time, list: coins };
    } else if (type === 'batch') {
      // A batch can move tokens (transfers, funded joins): ease every balance to its
      // after value so the step ends exactly on the next state.
      balanceOf = (id) => {
        const a = afterBal.get(id) ?? 0;
        return lerp(beforeBal.get(id) ?? a, a, e);
      };
    }
  } else if (!idle && type === 'rain') {
    const d = step.detail;
    const idx = new Map(d.ids.map((id, i) => [id, i]));
    const at = (vec, id) => vec[idx.get(id)] ?? 0;
    const name = phase.name;
    const rainPhase = phases.find((p) => p.name === 'rain');
    const tRain = time - rainPhase.start;
    if (name === 'pretrust') {
      const e = easeInOut(phaseP);
      scoreOf = (id) => lerp(sNow.get(id) ?? 0, at(d.iterations[0], id), e);
    } else if (name === 'iterate') {
      const k = phase.iteration;
      const e = easeInOut(phaseP);
      scoreOf = (id) => lerp(at(d.iterations[k - 1], id), at(d.iterations[k], id), e);
    } else if (name === 'settle') {
      const e = easeInOut(phaseP);
      scoreOf = (id) => lerp(at(d.g, id), sNext.get(id) ?? 0, e);
    } else {
      scoreOf = (id) => at(d.g, id);
    }

    // Step mode: the iteration's particles and α·b cores, fading out as the rain starts.
    const fadeP = name === 'rain' ? clamp(tRain / FLOW_FADE) : 0;
    if (view.eigenMode === 'step' && (name === 'pretrust' || name === 'iterate' || (name === 'rain' && fadeP < 1))) {
      frame.showSelf = true;
      const firstIter = phases.find((p) => p.name === 'iterate');
      if (firstIter && name !== 'pretrust') {
        const k = name === 'iterate' ? phase.iteration : d.residuals.length;
        const f = iterationFlows(step, k);
        frame.flows = {
          t: time - firstIter.start,
          alpha: name === 'rain' ? 1 - easeOut(fadeP) : clamp((time - firstIter.start) / 0.15),
          edges: f.edges,
          anchor: f.anchor,
          anchorPulse: name === 'iterate' ? 1 - easeOut(phaseP) : 0,
          anchorAlpha: 1 - fadeP,
        };
      } else if (name === 'pretrust') {
        frame.flows = { t: 0, alpha: 0, edges: [], anchor: iterationFlows(step, 1).anchor, anchorPulse: 0, anchorAlpha: easeOut(phaseP) };
      }
    }
    if (name === 'solve') frame.flash = { p: phaseP, alpha: Math.sin(Math.PI * phaseP) };

    // The rain: every balance grows by one eased fraction of its own share, so each share
    // moves straight from b_i toward g_i and the halo-vs-disk comparison never flips.
    if (name === 'rain' || name === 'settle') {
      const dur = rainPhase.end - rainPhase.start;
      const p = name === 'settle' ? 1 : clamp(tRain / dur);
      const grown = easeInOut(p);
      const settleP = name === 'settle' ? phaseP : 0;
      const gMax = Math.max(0, ...d.g);
      balanceOf = (id) => {
        const b = beforeBal.get(id);
        if (b === undefined || grown >= 1) return afterBal.get(id) ?? 0;
        return b + (afterBal.get(id) - b) * grown;
      };
      gain = (id) => {
        const i = idx.get(id);
        const amount = d.rain[i] ?? 0;
        if (!(amount > 0)) return null;
        // `strength`: this account's share of the rain against the biggest share (ripple size)
        return { amount, p, strength: gMax > 0 ? d.g[i] / gMax : 0, rise: clamp(tRain / (dur + 0.4)), alpha: clamp(tRain / 0.2) * (1 - settleP) };
      };
    }
  }

  // Nodes: everyone in `after` (a joining node exists for its whole join step).
  const sources = !idle && step && type !== 'rain' ? new Set(eventSources(step.event)) : null;
  const pulseQ = clamp(time / 0.9);
  let supply = 0;
  const selfIds = frame.showSelf ? eBefore.selfIds : null;
  for (const n of after.nodes) {
    const isNew = !beforeBal.has(n.id);
    const balance = balanceOf(n.id);
    // a newcomer isn't part of the network until its join step starts playing
    if (!(isNew && idle)) supply += balance;
    let appear = 1;
    if (isNew) appear = idle ? 0 : easeOutBack(clamp(time / 0.55));
    let newTag = 0;
    if (n.joinedStep >= 0) {
      const age = cursor - n.joinedStep;
      const dur = phases.length ? phases[phases.length - 1].end : 1;
      if (age === 0) newTag = clamp(time / 0.4);
      else if (age === 1) newTag = 1;
      else if (age === 2) newTag = 1 - clamp((time / dur - 0.6) / 0.4);
    }
    let pulse = null;
    if (sources?.has(n.id) && pulseQ < 1) pulse = { q: pulseQ, color: 'amber' };
    else if (isNew && !idle) pulse = { q: clamp(time / 1.1), color: 'mint' };
    else if (type === 'transfer' && !idle && (n.id === step.event.from || n.id === step.event.to)) {
      pulse = { q: clamp(time / 1.3), color: 'gold' };
    }
    frame.nodes.push({
      id: n.id,
      label: n.label,
      tone: n.tone,
      balance,
      score: scoreOf(n.id),
      stableScore: Math.max(sNow.get(n.id) ?? 0, sNext.get(n.id) ?? 0),
      appear,
      newTag,
      pulse,
      self: selfIds ? selfIds.has(n.id) : false,
      hint: n.x != null && n.y != null ? { x: n.x, y: n.y } : null,
      seed: hashString(n.id),
      gain: gain(n.id),
    });
  }
  frame.supply = supply;

  // Scenario groups (sybil clusters, rings): one running total per group, so a lesson
  // about a group's combined share can be read off the canvas instead of by adding up disks.
  const groups = compiled.scenario?.groups;
  if (groups?.length) {
    const byId = new Map(frame.nodes.map((n) => [n.id, n]));
    const raining = type === 'rain' && (phase.name === 'rain' || phase.name === 'settle');
    frame.groups = groups.map((grp) => {
      const members = grp.members.map((id) => byId.get(id)).filter((n) => n && n.appear > 0.3);
      let bal = 0;
      let score = 0;
      let credited = 0;
      let rain = 0;
      for (const n of members) {
        bal += n.balance;
        score += n.score;
        if (raining) {
          credited += n.balance - (beforeBal.get(n.id) ?? 0);
          rain += step.detail.rain[step.detail.ids.indexOf(n.id)] ?? 0;
        }
      }
      return {
        id: grp.id,
        label: grp.label ?? grp.id,
        tone: grp.tone ?? null,
        ids: members.map((n) => n.id),
        supplyShare: supply > 0 ? bal / supply : 0,
        rainShare: score,
        rain: raining ? { credited, total: rain, minted: step.detail.minted } : null,
      };
    }).filter((grp) => grp.ids.length);
  }

  // Edges: union of before/after; new ones draw in, removed ones retract, others morph.
  if (idle || type === 'rain' || type === 'note' || type === 'transfer') {
    for (const [key, e] of eBefore.edges) frame.edges.push({ key, ...e, grow: 1, alpha: 1, hot: 0 });
  } else {
    const joinDelay = type === 'join' ? 0.35 : 0;
    const t = time - joinDelay;
    const grow = easeOut(clamp(t / 0.65));
    const shrink = easeInOut(clamp(time / 0.85));
    const hot = time < 0.6 ? clamp(time / 0.15) : 1 - clamp((time - 0.6) / 0.4);
    const morph = easeOut(clamp(time / 0.7));
    for (const [key, e] of eAfter.edges) {
      const old = eBefore.edges.get(key);
      if (!old) frame.edges.push({ key, ...e, grow, alpha: 1, hot });
      else if (Math.abs(old.c - e.c) > 1e-9) frame.edges.push({ key, ...e, c: lerp(old.c, e.c, morph), grow: 1, alpha: 1, hot: hot * 0.7 });
      else frame.edges.push({ key, ...e, grow: 1, alpha: 1, hot: 0 });
    }
    for (const [key, e] of eBefore.edges) {
      if (!eAfter.edges.has(key)) frame.edges.push({ key, ...e, grow: 1 - shrink, alpha: 1 - shrink * 0.6, hot: 0.5 * (1 - shrink), removed: true });
    }
  }
  return frame;
}
