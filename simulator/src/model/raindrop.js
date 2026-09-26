// The Raindrop protocol as a pure state machine.
//
// A scenario is an initial network plus a timeline of events. `compile` replays the
// timeline into a list of steps, each holding the state before and after it; rain
// steps also hold the full EigenTrust run that decided where the rain fell. From
// Raindrop's point of view that run is one instantaneous event (paper §4.2).
//
// Changing a parameter never mutates anything: recompile and the whole history is
// re-derived, so the view can jump to any step.

import { eigentrust, pretrustVector, trustMatrix } from './eigentrust.js';

export const DEFAULT_PARAMS = Object.freeze({
  alpha: 0.5, // share of each account's weight anchored to its balance (§7)
  issuanceMode: 'percent', // 'percent' of current supply, or a 'fixed' amount per round
  issuancePercent: 10,
  issuanceFixed: 10,
  epsilon: 1e-6, // L1 convergence threshold for EigenTrust
  maxIterations: 100,
  g0: 'pretrust', // EigenTrust starting vector: 'pretrust' (b) or 'uniform'
});

export const EVENT_TYPES = ['rain', 'endorse', 'revoke', 'setTrust', 'join', 'transfer', 'note', 'batch'];

/** Tokens minted in a round with the given supply. */
export function issuance(supply, params) {
  const amount = params.issuanceMode === 'fixed'
    ? params.issuanceFixed
    : (supply * params.issuancePercent) / 100;
  return Math.max(0, Number.isFinite(amount) ? amount : 0);
}

const cloneTrust = (trust) =>
  Object.fromEntries(Object.entries(trust ?? {}).map(([from, row]) => [from, { ...row }]));

const cloneState = (s) => ({
  ...s,
  nodes: s.nodes.map((n) => ({ ...n })),
  trust: cloneTrust(s.trust),
  received: { ...s.received },
  lastRain: { ...s.lastRain },
});

function makeNode(n, joinedStep) {
  return {
    id: n.id,
    label: n.label ?? n.id,
    balance: Math.max(0, n.balance ?? 0),
    tone: n.tone ?? null,
    x: n.x ?? null,
    y: n.y ?? null,
    note: n.note ?? null,
    joinedStep,
  };
}

const supplyOf = (nodes) => nodes.reduce((a, n) => a + n.balance, 0);

/** The network before any event runs. */
export function initialState(scenario) {
  const nodes = scenario.nodes.map((n) => makeNode(n, -1));
  return {
    round: 0,
    nodes,
    trust: cloneTrust(scenario.trust),
    supply: supplyOf(nodes),
    minted: 0,
    received: Object.fromEntries(nodes.map((n) => [n.id, 0])),
    lastRain: {},
  };
}

/** The EigenTrust run for a state: what the next rain would use. */
export function computeTrust(state, params) {
  const ids = state.nodes.map((n) => n.id);
  const b = pretrustVector(state.nodes.map((n) => n.balance));
  const rows = trustMatrix(ids, state.trust);
  const g0 = params.g0 === 'uniform' && ids.length ? ids.map(() => 1 / ids.length) : b;
  // Out-of-range or blank α would make g negative or NaN and poison every balance.
  const alpha = Number.isFinite(params.alpha) ? Math.min(1, Math.max(0, params.alpha)) : DEFAULT_PARAMS.alpha;
  const run = eigentrust({
    b,
    rows,
    alpha,
    epsilon: params.epsilon,
    maxIterations: params.maxIterations,
    g0,
  });
  return { ids, b, rows, alpha, ...run };
}

/** One round: compute trust, mint, and rain it out in proportion to g. */
export function rainRound(state, params) {
  const trust = computeTrust(state, params);
  const minted = issuance(state.supply, params);
  const rain = trust.g.map((x) => x * minted);
  const next = cloneState(state);
  next.round += 1;
  next.lastRain = {};
  next.nodes.forEach((n, i) => {
    n.balance += rain[i];
    next.received[n.id] = (next.received[n.id] ?? 0) + rain[i];
    next.lastRain[n.id] = rain[i];
  });
  next.supply = state.supply + minted;
  next.minted = state.minted + minted;
  return { state: next, detail: { ...trust, minted, rain } };
}

const hasNode = (s, id) => s.nodes.some((n) => n.id === id);

// Applies a non-rain event to a (cloned, mutable) state. Returns detail for the view.
function mutate(s, e) {
  switch (e.type) {
    case 'endorse': {
      if (!hasNode(s, e.from) || !hasNode(s, e.to)) return { skipped: true };
      (s.trust[e.from] ??= {})[e.to] = e.weight ?? 1;
      return {};
    }
    case 'revoke': {
      if (s.trust[e.from]) delete s.trust[e.from][e.to];
      return {};
    }
    case 'setTrust': {
      s.trust[e.from] = { ...(e.to ?? {}) };
      return {};
    }
    case 'join': {
      if (hasNode(s, e.node.id)) return { skipped: true };
      s.nodes.push(makeNode(e.node, e.stepIndex));
      s.received[e.node.id] = 0;
      if (e.endorse) s.trust[e.node.id] = { ...e.endorse };
      for (const [from, w] of Object.entries(e.endorsedBy ?? {})) (s.trust[from] ??= {})[e.node.id] = w;
      s.supply = supplyOf(s.nodes);
      return {};
    }
    case 'transfer': {
      const from = s.nodes.find((n) => n.id === e.from);
      const to = s.nodes.find((n) => n.id === e.to);
      if (!from || !to) return { skipped: true, amount: 0 };
      const amount = Math.max(0, Math.min(Number.isFinite(e.amount) ? e.amount : 0, from.balance));
      from.balance -= amount;
      to.balance += amount;
      return { amount };
    }
    case 'batch': {
      const details = e.events.map((sub) => mutate(s, { ...sub, stepIndex: e.stepIndex }));
      return { details };
    }
    case 'note':
      return {};
    default:
      throw new Error(`unknown event type: ${e.type}`);
  }
}

/** Applies one event (never `rain` with rounds > 1; `compile` expands those). */
export function applyEvent(state, event, params) {
  if (event.type === 'rain') return rainRound(state, params);
  const next = cloneState(state);
  const detail = mutate(next, event);
  next.trust = pruneTrust(next);
  return { state: next, detail };
}

// Drops empty rows and edges that point at unknown nodes, so the state stays tidy.
function pruneTrust(s) {
  const ids = new Set(s.nodes.map((n) => n.id));
  const out = {};
  for (const [from, row] of Object.entries(s.trust)) {
    if (!ids.has(from)) continue;
    const kept = Object.fromEntries(Object.entries(row).filter(([to, w]) => ids.has(to) && w > 0));
    if (Object.keys(kept).length) out[from] = kept;
  }
  return out;
}

function makeStep(index, event, before, params, extra = false) {
  const { state: after, detail } = applyEvent(before, { ...event, stepIndex: index }, params);
  return { index, type: event.type, event, caption: event.caption ?? null, extra, before, after, detail };
}

/** Expands `rain` events with `rounds: n` into n single-round events. */
export function expandEvents(events) {
  const out = [];
  for (const e of events ?? []) {
    if (e.type === 'rain' && (e.rounds ?? 1) > 1) {
      const n = e.rounds;
      for (let k = 0; k < n; k++) out.push({ ...e, rounds: 1, of: { k: k + 1, n }, caption: k ? e.captionEach ?? null : e.caption });
    } else {
      out.push(e);
    }
  }
  return out;
}

/**
 * Replays a scenario's timeline.
 *
 * @param {object} scenario
 * @param {object} params merged over DEFAULT_PARAMS
 * @param {{ extraRounds?: number }} [opts] rain rounds appended after the script
 * @returns {{ scenario, params, initial, steps, scriptLength, scores: (cursor: number) => object }}
 *
 * Cursor convention: cursor c (0 ≤ c ≤ steps.length) means steps[0..c-1] have run.
 * `stateAt(compiled, c)` is the network at that point, and step c (if any) is next.
 */
export function compile(scenario, params = {}, { extraRounds = 0 } = {}) {
  const p = { ...DEFAULT_PARAMS, ...scenario.params, ...params };
  const initial = initialState(scenario);
  const events = expandEvents(scenario.events);
  const steps = [];
  let s = initial;
  for (const e of events) {
    const step = makeStep(steps.length, e, s, p);
    steps.push(step);
    s = step.after;
  }
  const compiled = { scenario, params: p, initial, steps, scriptLength: steps.length, _scores: new Map() };
  if (extraRounds > 0) extendRain(compiled, extraRounds);
  return compiled;
}

/** Appends rain rounds after the script (mutates `compiled`). Returns it. */
export function extendRain(compiled, n = 1) {
  for (let k = 0; k < n; k++) {
    const before = stateAt(compiled, compiled.steps.length);
    compiled.steps.push(makeStep(compiled.steps.length, { type: 'rain' }, before, compiled.params, true));
  }
  return compiled;
}

// Cursors are step boundaries: floor fractions, treat NaN as 0.
const clampCursor = (compiled, cursor) => Math.max(0, Math.min(Math.floor(cursor) || 0, compiled.steps.length));

export function stateAt(compiled, cursor) {
  const c = clampCursor(compiled, cursor);
  return c === 0 ? compiled.initial : compiled.steps[c - 1].after;
}

/**
 * The trust scores the next rain would use, for the network at `cursor`.
 * For a rain step this equals that step's `detail`. Memoized per cursor.
 */
export function scoresAt(compiled, cursor) {
  const c = clampCursor(compiled, cursor);
  const next = compiled.steps[c];
  if (next?.type === 'rain') return next.detail;
  if (!compiled._scores.has(c)) compiled._scores.set(c, computeTrust(stateAt(compiled, c), compiled.params));
  return compiled._scores.get(c);
}

/** Everything the inspector shows about one node at `cursor`, or null if it isn't there yet. */
export function nodeStats(compiled, cursor, id) {
  const state = stateAt(compiled, cursor);
  const i = state.nodes.findIndex((n) => n.id === id);
  if (i < 0) return null;
  const node = state.nodes[i];
  const scores = scoresAt(compiled, cursor);
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const idx = new Map(scores.ids.map((nid, k) => [nid, k]));
  const row = scores.rows[i];
  const outgoing = row.self ? [] : row.out.map(({ j, w, c }) => ({ id: scores.ids[j], label: byId.get(scores.ids[j]).label, weight: w, share: c }));
  const incoming = [];
  scores.rows.forEach((r, k) => {
    if (r.self) return;
    for (const { j, w, c } of r.out) {
      if (j === i && k !== i) incoming.push({ id: scores.ids[k], label: byId.get(scores.ids[k]).label, weight: w, share: c });
    }
  });
  const share = scores.b[idx.get(id)];
  const trust = scores.g[idx.get(id)];
  // What the next rain actually pays: trust or join steps may change the graph before it,
  // so read the first rain at or after the cursor. With none left, an extra round would
  // rain on this very state.
  let nextRainStep = null;
  for (let c = clampCursor(compiled, cursor); c < compiled.steps.length && !nextRainStep; c++) {
    if (compiled.steps[c].type === 'rain') nextRainStep = compiled.steps[c];
  }
  const ahead = nextRainStep ? nextRainStep.detail.ids.indexOf(id) : -1;
  const nextRain = ahead >= 0 ? nextRainStep.detail.rain[ahead] : trust * issuance(state.supply, compiled.params);
  const history = [];
  for (let c = 0; c <= cursor && c <= compiled.steps.length; c++) {
    const st = stateAt(compiled, c);
    const n = st.nodes.find((x) => x.id === id);
    if (n) history.push({ cursor: c, round: st.round, balance: n.balance, share: st.supply > 0 ? n.balance / st.supply : 0 });
  }
  return {
    node,
    balance: node.balance,
    share,
    trust,
    gain: trust - share, // > 0: this account's share of supply grows next round
    nextRain,
    nextRainIndex: nextRainStep?.index ?? null, // null: an extra round after the script
    lastRain: state.lastRain[id] ?? 0,
    received: state.received[id] ?? 0,
    keepsOwnWeight: row.self,
    outgoing,
    incoming,
    history,
  };
}

/** Problems with a scenario definition, as human-readable strings (empty if valid). */
export function validateScenario(scenario) {
  const errors = [];
  const where = (k, e) => `event ${k} (${e.type})`;
  if (!scenario.id) errors.push('missing id');
  if (!scenario.title) errors.push('missing title');
  if (!Array.isArray(scenario.nodes)) errors.push('missing nodes');
  const ids = new Set();
  for (const n of scenario.nodes ?? []) {
    if (!n.id) errors.push('node without id');
    if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
    if (!(n.balance >= 0)) errors.push(`node ${n.id}: balance must be ≥ 0`);
  }
  const known = new Set(ids);
  const checkRow = (k, from, row) => {
    for (const [to, w] of Object.entries(row ?? {})) {
      if (!known.has(to)) errors.push(`${k}: ${from} endorses unknown node ${to}`);
      if (!(w > 0)) errors.push(`${k}: ${from} → ${to} weight must be > 0`);
    }
  };
  for (const [from, row] of Object.entries(scenario.trust ?? {})) {
    if (!known.has(from)) errors.push(`trust: unknown node ${from}`);
    checkRow('trust', from, row);
  }
  const need = (k, e, ...keys) => keys.forEach((key) => {
    if (!known.has(e[key])) errors.push(`${where(k, e)}: unknown node ${e[key]}`);
  });
  const check = (e, k) => {
    if (!EVENT_TYPES.includes(e.type)) return errors.push(`event ${k}: unknown type ${e.type}`);
    switch (e.type) {
      case 'rain':
        if (e.rounds !== undefined && !(Number.isInteger(e.rounds) && e.rounds >= 1)) errors.push(`${where(k, e)}: rounds must be a positive integer`);
        break;
      case 'endorse':
        need(k, e, 'from', 'to');
        if (e.weight !== undefined && !(e.weight > 0)) errors.push(`${where(k, e)}: weight must be > 0`);
        break;
      case 'revoke':
        need(k, e, 'from', 'to');
        break;
      case 'setTrust':
        need(k, e, 'from');
        checkRow(where(k, e), e.from, e.to);
        break;
      case 'join':
        if (!e.node?.id) errors.push(`${where(k, e)}: node needs an id`);
        else if (known.has(e.node.id)) errors.push(`${where(k, e)}: ${e.node.id} already exists`);
        else known.add(e.node.id);
        if (e.node && !((e.node.balance ?? 0) >= 0)) errors.push(`${where(k, e)}: balance must be ≥ 0`);
        checkRow(where(k, e), e.node?.id, e.endorse);
        for (const from of Object.keys(e.endorsedBy ?? {})) if (!known.has(from)) errors.push(`${where(k, e)}: unknown endorser ${from}`);
        break;
      case 'transfer':
        need(k, e, 'from', 'to');
        if (!(e.amount > 0)) errors.push(`${where(k, e)}: amount must be > 0`);
        break;
      case 'batch':
        if (!Array.isArray(e.events) || !e.events.length) errors.push(`${where(k, e)}: needs events`);
        else e.events.forEach((sub) => (sub.type === 'rain' || sub.type === 'batch'
          ? errors.push(`${where(k, e)}: cannot contain ${sub.type}`)
          : check(sub, k)));
        break;
      case 'note':
        if (!e.caption) errors.push(`${where(k, e)}: note needs a caption`);
        break;
    }
  };
  (scenario.events ?? []).forEach(check);
  // Optional groups (drawn with a running total): members may join during the timeline.
  if (scenario.groups !== undefined && !Array.isArray(scenario.groups)) errors.push('groups must be an array');
  const groupIds = new Set();
  for (const grp of Array.isArray(scenario.groups) ? scenario.groups : []) {
    if (!grp?.id) errors.push('group without id');
    else if (groupIds.has(grp.id)) errors.push(`duplicate group id: ${grp.id}`);
    groupIds.add(grp?.id);
    if (!Array.isArray(grp?.members) || !grp.members.length) errors.push(`group ${grp?.id}: needs members`);
    else for (const m of grp.members) if (!known.has(m)) errors.push(`group ${grp.id}: unknown member ${m}`);
  }
  return errors;
}
