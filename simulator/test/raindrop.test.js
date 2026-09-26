// Tests for the Raindrop state machine (src/model/raindrop.js): issuance, rain rounds,
// events, compile/cursor semantics, scoresAt/nodeStats and scenario validation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS, EVENT_TYPES, applyEvent, compile, computeTrust, expandEvents, extendRain,
  initialState, issuance, nodeStats, rainRound, scoresAt, stateAt, validateScenario,
} from '../src/model/raindrop.js';
import { eigentrustStep, l1Distance } from '../src/model/eigentrust.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (v) => v.reduce((a, x) => a + x, 0);
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const balances = (s) => s.nodes.map((n) => n.balance);
const P = (patch = {}) => ({ ...DEFAULT_PARAMS, ...patch });

const adaBen = () => ({
  id: 'ada-ben',
  title: 'Ada endorses Ben',
  nodes: [{ id: 'ada', label: 'Ada', balance: 60 }, { id: 'ben', label: 'Ben', balance: 40 }],
  trust: {},
  events: [
    { type: 'rain', caption: 'pro-rata' },
    { type: 'endorse', from: 'ada', to: 'ben', caption: 'Ada endorses Ben' },
    { type: 'rain', rounds: 3, caption: 'Then it rains.', captionEach: 'again' },
  ],
});

// A scenario exercising every event type.
const kitchenSink = () => ({
  id: 'sink',
  title: 'Everything',
  params: { alpha: 0.4 },
  nodes: [
    { id: 'a', balance: 50 }, { id: 'b', balance: 30 }, { id: 'c', balance: 20, tone: 'rose' },
  ],
  trust: { a: { b: 1 }, b: { c: 2, a: 1 } },
  events: [
    { type: 'note', caption: 'hello' },
    { type: 'rain', rounds: 2 },
    { type: 'join', node: { id: 'd', label: 'Dee', balance: 0 }, endorse: { a: 1 }, endorsedBy: { c: 1 } },
    { type: 'rain' },
    { type: 'transfer', from: 'a', to: 'd', amount: 5 },
    { type: 'setTrust', from: 'a', to: { c: 1, d: 3 } },
    { type: 'revoke', from: 'b', to: 'c' },
    { type: 'endorse', from: 'd', to: 'b', weight: 0.5 },
    { type: 'batch', caption: 'batch', events: [
      { type: 'endorse', from: 'c', to: 'b', weight: 2 },
      { type: 'join', node: { id: 'e', balance: 10 } },
      { type: 'transfer', from: 'b', to: 'e', amount: 1 },
    ] },
    { type: 'rain', rounds: 3 },
  ],
});

function randomScenario(rand, id = 'rand') {
  const n = 2 + Math.floor(rand() * 10);
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const nodes = ids.map((nid) => ({ id: nid, balance: rand() < 0.2 ? 0 : Math.round(rand() * 1000) / 10 }));
  const trust = {};
  for (const a of ids) for (const b of ids) if (rand() < 0.25) (trust[a] ??= {})[b] = 0.1 + rand() * 3;
  const pick = () => ids[Math.floor(rand() * ids.length)];
  const events = [];
  let joined = 0;
  for (let k = 0; k < 25; k++) {
    const r = rand();
    if (r < 0.35) events.push({ type: 'rain', rounds: 1 + Math.floor(rand() * 3) });
    else if (r < 0.5) events.push({ type: 'endorse', from: pick(), to: pick(), weight: 0.1 + rand() * 4 });
    else if (r < 0.6) events.push({ type: 'revoke', from: pick(), to: pick() });
    else if (r < 0.7) events.push({ type: 'setTrust', from: pick(), to: rand() < 0.3 ? {} : { [pick()]: 1, [pick()]: 2 } });
    else if (r < 0.85) events.push({ type: 'transfer', from: pick(), to: pick(), amount: rand() * 200 + 0.01 });
    else {
      const nid = `j${joined++}`;
      events.push({ type: 'join', node: { id: nid, balance: rand() < 0.5 ? 0 : rand() * 20 }, endorse: { [pick()]: 1 }, endorsedBy: { [pick()]: 1 } });
      ids.push(nid);
    }
  }
  return { id, title: id, nodes, trust, events };
}

describe('issuance', () => {
  test('percent of current supply', () => {
    assert.equal(issuance(200, P({ issuanceMode: 'percent', issuancePercent: 10 })), 20);
    assert.equal(issuance(0, P({ issuanceMode: 'percent', issuancePercent: 10 })), 0);
  });
  test('fixed amount ignores supply', () => {
    assert.equal(issuance(200, P({ issuanceMode: 'fixed', issuanceFixed: 7 })), 7);
    assert.equal(issuance(0, P({ issuanceMode: 'fixed', issuanceFixed: 7 })), 7);
  });
  test('never negative, never NaN', () => {
    assert.equal(issuance(100, P({ issuancePercent: -5 })), 0);
    assert.equal(issuance(100, P({ issuanceMode: 'fixed', issuanceFixed: -5 })), 0);
    assert.equal(issuance(100, P({ issuancePercent: NaN })), 0);
    assert.equal(issuance(100, P({ issuanceMode: 'fixed', issuanceFixed: undefined })), 0);
    assert.equal(issuance(NaN, P()), 0);
  });
  test('unknown mode falls back to percent', () => {
    assert.equal(issuance(100, P({ issuanceMode: 'bogus', issuancePercent: 3 })), 3);
  });
});

describe('initialState', () => {
  test('clones nodes and trust, sums supply, normalizes node fields', () => {
    const sc = adaBen();
    sc.trust = { ada: { ben: 1 } };
    const s = initialState(sc);
    assert.equal(s.round, 0);
    assert.equal(s.supply, 100);
    assert.equal(s.minted, 0);
    assert.deepEqual(s.received, { ada: 0, ben: 0 });
    assert.deepEqual(s.nodes[0], { id: 'ada', label: 'Ada', balance: 60, tone: null, x: null, y: null, note: null, joinedStep: -1 });
    s.trust.ada.ben = 99;
    s.nodes[0].balance = 1;
    assert.equal(sc.trust.ada.ben, 1);
    assert.equal(sc.nodes[0].balance, 60);
  });
  test('label defaults to id, negative/missing balances clamp to 0', () => {
    const s = initialState({ nodes: [{ id: 'x', balance: -3 }, { id: 'y' }] });
    assert.deepEqual(balances(s), [0, 0]);
    assert.equal(s.nodes[0].label, 'x');
  });
});

describe('rainRound', () => {
  test('two nodes, Ada → Ben: rain splits α·b_A / 1 − α·b_A', () => {
    const sc = adaBen();
    sc.trust = { ada: { ben: 1 } };
    const s0 = initialState(sc);
    const { state, detail } = rainRound(s0, P({ alpha: 0.5, issuancePercent: 10 }));
    close(detail.minted, 10);
    close(detail.rain[0], 0.5 * 0.6 * 10);
    close(detail.rain[1], (1 - 0.5 * 0.6) * 10);
    assert.deepEqual(balances(state), [63, 47]);
    assert.equal(state.round, 1);
    assert.equal(state.supply, 110);
    assert.equal(state.minted, 10);
    assert.deepEqual(state.lastRain, { ada: 3, ben: 7 });
    assert.deepEqual(state.received, { ada: 3, ben: 7 });
    assert.deepEqual(balances(s0), [60, 40], 'input state untouched');
  });
  test('detail carries the full EigenTrust run', () => {
    const { detail } = rainRound(initialState(adaBen()), P());
    for (const k of ['ids', 'b', 'rows', 'alpha', 'g', 'iterations', 'residuals', 'converged', 'minted', 'rain']) assert.ok(k in detail, k);
    assert.deepEqual(detail.ids, ['ada', 'ben']);
  });
  test('α = 1 ⇒ rain is exactly pro-rata (like a stock split)', () => {
    const sc = adaBen();
    sc.trust = { ada: { ben: 1 } };
    const { state } = rainRound(initialState(sc), P({ alpha: 1 }));
    close(state.nodes[0].balance / state.supply, 0.6, 1e-12);
  });
  test('zero supply: percent mints nothing, fixed rains uniformly', () => {
    const s0 = initialState({ nodes: [{ id: 'a', balance: 0 }, { id: 'b', balance: 0 }], trust: {} });
    const pct = rainRound(s0, P());
    assert.equal(pct.detail.minted, 0);
    assert.deepEqual(balances(pct.state), [0, 0]);
    const fixed = rainRound(s0, P({ issuanceMode: 'fixed', issuanceFixed: 10 }));
    assert.deepEqual(balances(fixed.state), [5, 5]);
    assert.equal(fixed.state.supply, 10);
  });
  test('empty network rains nothing and does not crash', () => {
    const { state, detail } = rainRound(initialState({ nodes: [] }), P({ issuanceMode: 'fixed' }));
    assert.equal(state.round, 1);
    assert.deepEqual(detail.rain, []);
  });
  test("g0 'uniform' vs 'pretrust' give the same rain for α > 0", () => {
    const rand = rng(21);
    for (let t = 0; t < 20; t++) {
      const sc = randomScenario(rand);
      const s0 = initialState(sc);
      const base = { alpha: 0.05 + rand() * 0.9, epsilon: 1e-12, maxIterations: 10000 };
      const a = rainRound(s0, P({ ...base, g0: 'pretrust' })).detail.rain;
      const b = rainRound(s0, P({ ...base, g0: 'uniform' })).detail.rain;
      a.forEach((x, i) => close(x, b[i], 1e-8));
    }
  });
});

describe('applyEvent', () => {
  const s0 = () => initialState({ nodes: [{ id: 'a', balance: 10 }, { id: 'b', balance: 5 }, { id: 'c', balance: 0 }], trust: { a: { b: 1 } } });
  test('endorse adds/overwrites an edge (default weight 1)', () => {
    let { state } = applyEvent(s0(), { type: 'endorse', from: 'b', to: 'c' }, P());
    assert.deepEqual(state.trust.b, { c: 1 });
    ({ state } = applyEvent(state, { type: 'endorse', from: 'b', to: 'c', weight: 3 }, P()));
    assert.deepEqual(state.trust.b, { c: 3 });
  });
  test('endorse with an unknown node is skipped', () => {
    const { state, detail } = applyEvent(s0(), { type: 'endorse', from: 'a', to: 'zz' }, P());
    assert.equal(detail.skipped, true);
    assert.deepEqual(state.trust, { a: { b: 1 } });
  });
  test('revoke removes the edge and prunes the empty row', () => {
    const { state } = applyEvent(s0(), { type: 'revoke', from: 'a', to: 'b' }, P());
    assert.deepEqual(state.trust, {});
    assert.doesNotThrow(() => applyEvent(s0(), { type: 'revoke', from: 'zz', to: 'b' }, P()));
  });
  test('setTrust replaces the whole row; {} clears it', () => {
    let { state } = applyEvent(s0(), { type: 'setTrust', from: 'a', to: { c: 2, a: 1 } }, P());
    assert.deepEqual(state.trust.a, { c: 2, a: 1 });
    ({ state } = applyEvent(state, { type: 'setTrust', from: 'a', to: {} }, P()));
    assert.equal(state.trust.a, undefined);
  });
  test('join adds a node, its endorsements and endorsers; supply includes its balance', () => {
    const { state } = applyEvent(s0(), { type: 'join', stepIndex: 4, node: { id: 'd', balance: 7 }, endorse: { a: 1 }, endorsedBy: { b: 2, zz: 1 } }, P());
    assert.equal(state.nodes.at(-1).id, 'd');
    assert.equal(state.nodes.at(-1).joinedStep, 4);
    assert.equal(state.supply, 22);
    assert.deepEqual(state.trust.d, { a: 1 });
    assert.deepEqual(state.trust.b, { d: 2 });
    assert.equal(state.trust.zz, undefined, 'unknown endorsers pruned');
    assert.equal(state.received.d, 0);
  });
  test('join of an existing id is skipped', () => {
    const { state, detail } = applyEvent(s0(), { type: 'join', node: { id: 'a', balance: 99 } }, P());
    assert.equal(detail.skipped, true);
    assert.equal(state.nodes.length, 3);
    assert.equal(state.supply, 15);
  });
  test('transfer conserves supply and clamps to the sender balance', () => {
    let { state, detail } = applyEvent(s0(), { type: 'transfer', from: 'a', to: 'c', amount: 4 }, P());
    assert.deepEqual(balances(state), [6, 5, 4]);
    assert.equal(detail.amount, 4);
    ({ state, detail } = applyEvent(state, { type: 'transfer', from: 'b', to: 'c', amount: 1000 }, P()));
    assert.deepEqual(balances(state), [6, 0, 9]);
    assert.equal(detail.amount, 5);
    assert.equal(state.supply, 15);
    ({ state, detail } = applyEvent(state, { type: 'transfer', from: 'b', to: 'c', amount: -3 }, P()));
    assert.deepEqual(balances(state), [6, 0, 9]);
    assert.equal(detail.amount, 0);
  });
  test('transfer to self is a no-op; unknown parties are skipped', () => {
    assert.deepEqual(balances(applyEvent(s0(), { type: 'transfer', from: 'a', to: 'a', amount: 3 }, P()).state), [10, 5, 0]);
    const r = applyEvent(s0(), { type: 'transfer', from: 'a', to: 'zz', amount: 3 }, P());
    assert.deepEqual(r.detail, { skipped: true, amount: 0 });
  });
  test('batch applies sub-events in order and reports each detail', () => {
    const { state, detail } = applyEvent(s0(), { type: 'batch', stepIndex: 2, events: [
      { type: 'join', node: { id: 'd', balance: 1 } },
      { type: 'endorse', from: 'd', to: 'a' },
      { type: 'transfer', from: 'a', to: 'd', amount: 2 },
    ] }, P());
    assert.equal(detail.details.length, 3);
    assert.deepEqual(state.trust.d, { a: 1 });
    assert.equal(state.nodes.find((n) => n.id === 'd').balance, 3);
    assert.equal(state.nodes.find((n) => n.id === 'd').joinedStep, 2);
  });
  test('note changes nothing', () => {
    const before = s0();
    const { state } = applyEvent(before, { type: 'note', caption: 'x' }, P());
    assert.deepEqual(state, before);
    assert.notEqual(state, before);
  });
  test('unknown event type throws', () => {
    assert.throws(() => applyEvent(s0(), { type: 'explode' }, P()), /unknown event type/);
  });
  test('non-positive weights are pruned from state', () => {
    const { state } = applyEvent(s0(), { type: 'setTrust', from: 'b', to: { a: 0, c: -1 } }, P());
    assert.equal(state.trust.b, undefined);
  });
});

describe('expandEvents', () => {
  test('rain rounds: n expands into n single rounds with `of` and captions', () => {
    const out = expandEvents([{ type: 'rain', rounds: 3, caption: 'first', captionEach: 'each' }]);
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((e) => e.of), [{ k: 1, n: 3 }, { k: 2, n: 3 }, { k: 3, n: 3 }]);
    assert.deepEqual(out.map((e) => e.caption), ['first', 'each', 'each']);
    assert.ok(out.every((e) => e.rounds === 1));
  });
  test('captionEach defaults to null for later rounds', () => {
    const out = expandEvents([{ type: 'rain', rounds: 2, caption: 'c' }]);
    assert.deepEqual(out.map((e) => e.caption), ['c', null]);
  });
  test('single rain and other events pass through unchanged (same objects)', () => {
    const r = { type: 'rain', caption: 'x' };
    const e = { type: 'endorse', from: 'a', to: 'b' };
    const out = expandEvents([r, e]);
    assert.equal(out[0], r);
    assert.equal(out[1], e);
    assert.equal(out[0].of, undefined);
  });
  test('undefined/empty events', () => {
    assert.deepEqual(expandEvents(undefined), []);
    assert.deepEqual(expandEvents([]), []);
  });
});

describe('compile', () => {
  test('steps, cursor convention and captions', () => {
    const c = compile(adaBen());
    assert.equal(c.steps.length, 5);
    assert.equal(c.scriptLength, 5);
    assert.deepEqual(c.steps.map((s) => s.type), ['rain', 'endorse', 'rain', 'rain', 'rain']);
    assert.deepEqual(c.steps.map((s) => s.index), [0, 1, 2, 3, 4]);
    assert.deepEqual(c.steps.map((s) => s.caption), ['pro-rata', 'Ada endorses Ben', 'Then it rains.', 'again', 'again']);
    assert.ok(c.steps.every((s) => s.extra === false));
    assert.equal(stateAt(c, 0), c.initial);
    for (let k = 0; k < c.steps.length; k++) {
      assert.equal(c.steps[k].before, stateAt(c, k), `steps[${k}].before is stateAt(${k})`);
      assert.equal(c.steps[k].after, stateAt(c, k + 1));
    }
    assert.equal(stateAt(c, 5).round, 4);
  });
  test('stateAt clamps out-of-range cursors', () => {
    const c = compile(adaBen());
    assert.equal(stateAt(c, -3), c.initial);
    assert.equal(stateAt(c, 999), c.steps.at(-1).after);
  });
  test('params merge: DEFAULT_PARAMS < scenario.params < explicit', () => {
    const sc = { ...adaBen(), params: { alpha: 0.2, issuancePercent: 5 } };
    const c = compile(sc, { issuancePercent: 7 });
    assert.equal(c.params.alpha, 0.2);
    assert.equal(c.params.issuancePercent, 7);
    assert.equal(c.params.epsilon, DEFAULT_PARAMS.epsilon);
  });
  test('first rain is pro-rata; after the endorsement Ben gains share', () => {
    const c = compile(adaBen(), { alpha: 0.5 });
    const s1 = stateAt(c, 1);
    close(s1.nodes[0].balance / s1.supply, 0.6, 1e-12);
    const s5 = stateAt(c, 5);
    assert.ok(s5.nodes[1].balance / s5.supply > 0.4);
  });
  test('does not mutate the scenario or DEFAULT_PARAMS', () => {
    const sc = kitchenSink();
    const snap = JSON.stringify(sc);
    const defaults = JSON.stringify(DEFAULT_PARAMS);
    const c = compile(sc, { alpha: 0.3 }, { extraRounds: 3 });
    extendRain(c, 2);
    scoresAt(c, 3);
    nodeStats(c, c.steps.length, 'a');
    assert.equal(JSON.stringify(sc), snap);
    assert.equal(JSON.stringify(DEFAULT_PARAMS), defaults);
    assert.ok(Object.isFrozen(DEFAULT_PARAMS));
  });
  test('steps never share mutable state with each other', () => {
    const c = compile(kitchenSink());
    const snaps = c.steps.map((s) => JSON.stringify(s.after));
    // Mutating one step's after must not affect any other step.
    c.steps[0].after.nodes[0].balance = -1;
    c.steps[0].after.trust.a = { zz: 1 };
    c.steps.slice(1).forEach((s, k) => assert.equal(JSON.stringify(s.after), snaps[k + 1]));
    assert.notEqual(JSON.stringify(c.initial), JSON.stringify(c.steps[0].after));
  });
  test('kitchen sink: every event type compiles, joinedStep is the step index', () => {
    const c = compile(kitchenSink());
    const types = new Set(c.steps.map((s) => s.type));
    for (const t of EVENT_TYPES) assert.ok(types.has(t), t);
    const joinStep = c.steps.find((s) => s.type === 'join');
    assert.equal(stateAt(c, c.steps.length).nodes.find((n) => n.id === 'd').joinedStep, joinStep.index);
    const batchStep = c.steps.find((s) => s.type === 'batch');
    assert.equal(stateAt(c, c.steps.length).nodes.find((n) => n.id === 'e').joinedStep, batchStep.index);
    assert.equal(c.params.alpha, 0.4);
  });
  test('empty events compile to zero steps', () => {
    const c = compile({ id: 'e', title: 'e', nodes: [{ id: 'a', balance: 1 }], events: [] });
    assert.equal(c.steps.length, 0);
    assert.equal(stateAt(c, 0), c.initial);
    assert.equal(scoresAt(c, 0).g.length, 1);
  });
});

describe('invariants over random scenarios', () => {
  test('Σrain = minted; supply += ΔS exactly; Σbalances = supply; balances ≥ 0; transfers conserve', () => {
    const rand = rng(1234);
    for (let t = 0; t < 40; t++) {
      const sc = randomScenario(rand, `r${t}`);
      assert.deepEqual(validateScenario(sc), [], `random scenario ${t} is valid`);
      const params = {
        alpha: [0, 1, rand()][t % 3],
        issuanceMode: rand() < 0.5 ? 'percent' : 'fixed',
        issuancePercent: rand() * 50,
        issuanceFixed: rand() * 1000,
        g0: rand() < 0.5 ? 'pretrust' : 'uniform',
        maxIterations: 1 + Math.floor(rand() * 200),
      };
      const c = compile(sc, params, { extraRounds: 2 });
      for (const step of c.steps) {
        const { before, after, detail } = step;
        assert.ok(after.nodes.every((n) => n.balance >= 0 && Number.isFinite(n.balance)), 'balances finite and ≥ 0');
        close(sum(balances(after)), after.supply, 1e-6 * Math.max(1, after.supply), 'Σbalances = supply');
        if (step.type === 'rain') {
          const expected = issuance(before.supply, c.params);
          assert.equal(detail.minted, expected);
          assert.equal(after.supply, before.supply + detail.minted, 'supply += ΔS');
          assert.equal(after.minted, before.minted + detail.minted);
          close(sum(detail.rain), detail.minted, 1e-9 * Math.max(1, detail.minted), 'Σrain = minted');
          close(sum(detail.g), 1, 1e-9, 'Σg = 1');
          assert.ok(detail.g.every((x) => x >= 0));
          assert.equal(after.round, before.round + 1);
          after.nodes.forEach((n, i) => close(n.balance, before.nodes[i].balance + detail.rain[i], 1e-12 * Math.max(1, n.balance)));
        } else {
          assert.equal(after.round, before.round);
          assert.equal(after.minted, before.minted);
        }
        if (step.type === 'transfer') {
          assert.equal(after.supply, before.supply, 'transfer conserves supply');
          close(sum(balances(after)), sum(balances(before)), 1e-9);
        }
        if (step.type === 'join' && !detail.skipped) {
          close(after.supply - before.supply, after.nodes.at(-1).balance, 1e-9);
        }
      }
    }
  });
});

describe('extendRain / stateAt / scoresAt', () => {
  test('extendRain appends extra rain rounds continuing from the end', () => {
    const c = compile(adaBen());
    const end = stateAt(c, c.steps.length);
    assert.equal(extendRain(c, 2), c);
    assert.equal(c.steps.length, 7);
    assert.equal(c.scriptLength, 5);
    assert.ok(c.steps.slice(5).every((s) => s.extra && s.type === 'rain' && s.caption === null));
    assert.equal(c.steps[5].before, end);
    assert.equal(c.steps[5].index, 5);
    assert.equal(stateAt(c, 7).round, end.round + 2);
  });
  test('compile({ extraRounds }) equals compile + extendRain', () => {
    const a = compile(kitchenSink(), {}, { extraRounds: 3 });
    const b = extendRain(compile(kitchenSink()), 3);
    assert.equal(a.steps.length, b.steps.length);
    assert.deepEqual(balances(stateAt(a, a.steps.length)), balances(stateAt(b, b.steps.length)));
  });
  test('scoresAt(c) is steps[c].detail for rain steps, computeTrust(stateAt(c)) otherwise', () => {
    const c = compile(kitchenSink(), {}, { extraRounds: 1 });
    for (let k = 0; k <= c.steps.length; k++) {
      const s = scoresAt(c, k);
      if (c.steps[k]?.type === 'rain') {
        assert.equal(s, c.steps[k].detail);
      } else {
        const expected = computeTrust(stateAt(c, k), c.params);
        assert.deepEqual(s.g, expected.g);
        assert.deepEqual(s.ids, expected.ids);
        assert.equal(scoresAt(c, k), s, 'memoized');
      }
      assert.deepEqual(s.ids, stateAt(c, k).nodes.map((n) => n.id), 'ids line up with the state at cursor');
    }
  });
  test('scoresAt at the end switches to the extended rain detail after extendRain', () => {
    const c = compile(adaBen());
    const endBefore = scoresAt(c, c.steps.length);
    extendRain(c, 1);
    const endAfter = scoresAt(c, c.steps.length - 1);
    assert.equal(endAfter, c.steps.at(-1).detail);
    assert.deepEqual(endAfter.g, endBefore.g);
  });
  test('scoresAt clamps the cursor', () => {
    const c = compile(adaBen());
    assert.equal(scoresAt(c, -5), c.steps[0].detail);
    assert.deepEqual(scoresAt(c, 1e9).g, scoresAt(c, c.steps.length).g);
  });
  test('rain detail satisfies the fixed-point equation at convergence', () => {
    const c = compile(kitchenSink(), { epsilon: 1e-9 });
    for (const step of c.steps.filter((s) => s.type === 'rain')) {
      const { g, b, rows, alpha, converged } = step.detail;
      assert.ok(converged);
      assert.ok(l1Distance(g, eigentrustStep(g, b, rows, alpha)) < 1e-9);
    }
  });
});

describe('nodeStats', () => {
  test('in/out lists, share, trust, gain, next rain, keepsOwnWeight', () => {
    const c = compile(kitchenSink());
    const cursor = 3; // after note + 2 rains: trust a→b, b→{a,c}
    const scores = scoresAt(c, cursor);
    const state = stateAt(c, cursor);
    const b = nodeStats(c, cursor, 'b');
    assert.equal(b.node.id, 'b');
    assert.equal(b.balance, state.nodes[1].balance);
    assert.deepEqual(b.outgoing.map((o) => [o.id, o.weight, o.share]), [['a', 1, 1 / 3], ['c', 2, 2 / 3]]);
    assert.deepEqual(b.incoming.map((o) => [o.id, o.weight, o.share]), [['a', 1, 1]]);
    assert.equal(b.share, scores.b[1]);
    assert.equal(b.trust, scores.g[1]);
    close(b.gain, scores.g[1] - scores.b[1], 0);
    // the next rain comes after Dee joins, so it is not scores × mint on this graph
    assert.equal(c.steps[3].type, 'join');
    assert.equal(b.nextRainIndex, 4);
    close(b.nextRain, c.steps[4].detail.rain[c.steps[4].detail.ids.indexOf('b')], 1e-12);
    assert.ok(Math.abs(b.nextRain - scores.g[1] * issuance(state.supply, c.params)) > 1e-6);
    assert.equal(b.keepsOwnWeight, false);
    const cc = nodeStats(c, cursor, 'c');
    assert.equal(cc.keepsOwnWeight, true);
    assert.deepEqual(cc.outgoing, []);
    assert.deepEqual(cc.incoming.map((o) => o.id), ['b']);
    assert.equal(cc.received, state.received.c);
    assert.equal(cc.lastRain, state.lastRain.c);
  });
  test('next rain: this cursor\'s rain step, or an extra round at the end', () => {
    const c = compile(kitchenSink());
    const atRain = nodeStats(c, 1, 'a');
    assert.equal(atRain.nextRainIndex, 1);
    close(atRain.nextRain, c.steps[1].detail.rain[0], 1e-12);
    const end = c.steps.length;
    const last = nodeStats(c, end, 'a');
    assert.equal(last.nextRainIndex, null);
    const sc = scoresAt(c, end);
    close(last.nextRain, sc.g[sc.ids.indexOf('a')] * issuance(stateAt(c, end).supply, c.params), 1e-12);
  });
  test('explicit self-endorsement shows in outgoing but not incoming', () => {
    const sc = { id: 's', title: 's', nodes: [{ id: 'a', balance: 1 }, { id: 'b', balance: 1 }], trust: { a: { a: 1, b: 1 } }, events: [] };
    const s = nodeStats(compile(sc), 0, 'a');
    assert.deepEqual(s.outgoing.map((o) => o.id), ['a', 'b']);
    assert.deepEqual(s.incoming, []);
    assert.equal(s.keepsOwnWeight, false);
  });
  test('null before a node joins; history starts at its join', () => {
    const c = compile(kitchenSink());
    const join = c.steps.find((s) => s.type === 'join').index;
    assert.equal(nodeStats(c, join, 'd'), null);
    const s = nodeStats(c, c.steps.length, 'd');
    assert.ok(s);
    assert.equal(s.history[0].cursor, join + 1);
    assert.equal(s.history.at(-1).cursor, c.steps.length);
    assert.equal(nodeStats(c, 0, 'nobody'), null);
  });
  test('history tracks balance and share per cursor', () => {
    const c = compile(adaBen());
    const s = nodeStats(c, 3, 'ben');
    assert.deepEqual(s.history.map((h) => h.cursor), [0, 1, 2, 3]);
    s.history.forEach((h) => {
      const st = stateAt(c, h.cursor);
      assert.equal(h.balance, st.nodes[1].balance);
      close(h.share, st.nodes[1].balance / st.supply, 1e-15);
      assert.equal(h.round, st.round);
    });
  });
  test('zero-supply history share is 0, not NaN', () => {
    const sc = { id: 'z', title: 'z', nodes: [{ id: 'a', balance: 0 }], events: [{ type: 'rain' }] };
    const s = nodeStats(compile(sc), 1, 'a');
    assert.ok(s.history.every((h) => h.share === 0));
  });
});

describe('validateScenario', () => {
  const ok = () => ({
    id: 'ok', title: 'OK',
    nodes: [{ id: 'a', balance: 1 }, { id: 'b', balance: 0 }],
    trust: { a: { b: 1 } },
    events: [{ type: 'rain', rounds: 2 }],
  });
  const errs = (patch) => validateScenario({ ...ok(), ...patch });
  const has = (list, re) => assert.ok(list.some((e) => re.test(e)), `expected ${re} in ${JSON.stringify(list)}`);

  test('valid scenario has no errors', () => {
    assert.deepEqual(validateScenario(ok()), []);
    assert.deepEqual(validateScenario(kitchenSink()), []);
    assert.deepEqual(validateScenario(adaBen()), []);
  });
  test('groups: members must exist (joiners count), ids unique', () => {
    assert.deepEqual(errs({ groups: [{ id: 'g', members: ['a', 'b'] }] }), []);
    assert.deepEqual(errs({ groups: [{ id: 'g', members: ['a', 'n'] }], events: [{ type: 'join', node: { id: 'n', balance: 0 } }] }), []);
    has(errs({ groups: [{ id: 'g', members: ['a', 'zz'] }] }), /group g: unknown member zz/);
    has(errs({ groups: [{ id: 'g', members: [] }] }), /group g: needs members/);
    has(errs({ groups: [{ id: 'g', members: ['a'] }, { id: 'g', members: ['b'] }] }), /duplicate group id: g/);
    has(errs({ groups: {} }), /groups must be an array/);
  });
  test('missing id / title', () => {
    has(errs({ id: '' }), /missing id/);
    has(errs({ title: undefined }), /missing title/);
  });
  test('node errors: no id, duplicate id, bad balance', () => {
    has(errs({ nodes: [{ balance: 1 }] }), /node without id/);
    has(errs({ nodes: [{ id: 'a', balance: 1 }, { id: 'a', balance: 2 }] }), /duplicate node id: a/);
    has(errs({ nodes: [{ id: 'a', balance: -1 }, { id: 'b', balance: 0 }] }), /node a: balance/);
    has(errs({ nodes: [{ id: 'a' }, { id: 'b', balance: 0 }] }), /node a: balance/);
    has(errs({ nodes: [{ id: 'a', balance: NaN }, { id: 'b', balance: 0 }] }), /node a: balance/);
  });
  test('initial trust errors: unknown from, unknown to, bad weight', () => {
    has(errs({ trust: { zz: { a: 1 } } }), /trust: unknown node zz/);
    has(errs({ trust: { a: { zz: 1 } } }), /a endorses unknown node zz/);
    has(errs({ trust: { a: { b: 0 } } }), /a → b weight must be > 0/);
    has(errs({ trust: { a: { b: -2 } } }), /weight must be > 0/);
  });
  test('event errors', () => {
    const e = (...events) => errs({ events });
    has(e({ type: 'boom' }), /unknown type boom/);
    has(e({ type: 'rain', rounds: 0 }), /rounds must be a positive integer/);
    has(e({ type: 'rain', rounds: 1.5 }), /rounds must be a positive integer/);
    has(e({ type: 'endorse', from: 'a', to: 'zz' }), /unknown node zz/);
    has(e({ type: 'endorse', from: 'a', to: 'b', weight: 0 }), /weight must be > 0/);
    has(e({ type: 'revoke', from: 'zz', to: 'b' }), /unknown node zz/);
    has(e({ type: 'setTrust', from: 'zz', to: {} }), /unknown node zz/);
    has(e({ type: 'setTrust', from: 'a', to: { zz: 1 } }), /endorses unknown node zz/);
    has(e({ type: 'join', node: {} }), /node needs an id/);
    has(e({ type: 'join', node: { id: 'a' } }), /a already exists/);
    has(e({ type: 'join', node: { id: 'c', balance: -1 } }), /balance must be ≥ 0/);
    has(e({ type: 'join', node: { id: 'c' }, endorse: { zz: 1 } }), /c endorses unknown node zz/);
    has(e({ type: 'join', node: { id: 'c' }, endorsedBy: { zz: 1 } }), /unknown endorser zz/);
    has(e({ type: 'transfer', from: 'a', to: 'b', amount: 0 }), /amount must be > 0/);
    has(e({ type: 'transfer', from: 'a', to: 'b' }), /amount must be > 0/);
    has(e({ type: 'transfer', from: 'a', to: 'zz', amount: 1 }), /unknown node zz/);
    has(e({ type: 'batch', events: [] }), /needs events/);
    has(e({ type: 'batch' }), /needs events/);
    has(e({ type: 'batch', events: [{ type: 'rain' }] }), /cannot contain rain/);
    has(e({ type: 'batch', events: [{ type: 'batch', events: [{ type: 'note', caption: 'x' }] }] }), /cannot contain batch/);
    has(e({ type: 'batch', events: [{ type: 'endorse', from: 'a', to: 'zz' }] }), /unknown node zz/);
    has(e({ type: 'note' }), /note needs a caption/);
  });
  test('nodes that join become known to later events (and not earlier ones)', () => {
    assert.deepEqual(errs({ events: [{ type: 'join', node: { id: 'c' } }, { type: 'endorse', from: 'c', to: 'a' }] }), []);
    has(errs({ events: [{ type: 'endorse', from: 'c', to: 'a' }, { type: 'join', node: { id: 'c' } }] }), /unknown node c/);
    assert.deepEqual(errs({ events: [{ type: 'batch', events: [{ type: 'join', node: { id: 'c' } }, { type: 'endorse', from: 'a', to: 'c' }] }] }), []);
  });
});

// Robustness findings from the audit (out-of-domain inputs), now fixed in src/model/raindrop.js.
describe('audit: out-of-domain inputs', () => {
  const two = () => ({
    id: 't', title: 't',
    nodes: [{ id: 'a', balance: 60 }, { id: 'b', balance: 40 }],
    trust: { a: { b: 1 } },
    events: [{ type: 'rain' }],
  });
  test('α that is NaN/undefined (e.g. an empty numeric input) falls back to the default', () => {
    for (const alpha of [NaN, undefined, '']) {
      const c = compile(two(), { alpha });
      assert.ok(balances(stateAt(c, 1)).every(Number.isFinite), `alpha=${String(alpha)}`);
    }
  });
  test('α outside [0, 1] is clamped, so trust stays non-negative', () => {
    const c = compile(two(), { alpha: -0.2 });
    assert.ok(scoresAt(c, 0).g.every((x) => x >= 0), 'g ≥ 0');
    assert.ok(stateAt(c, 1).nodes[0].balance >= 60, 'rain never takes tokens away');
    const hi = compile(two(), { alpha: 1.5 });
    assert.ok(hi.steps[0].detail.g.every((x) => x >= 0 && x <= 1));
  });
  test('a transfer with a NaN amount moves nothing', () => {
    const { state } = applyEvent(initialState(two()), { type: 'transfer', from: 'a', to: 'b', amount: NaN }, P());
    assert.deepEqual(balances(state), [60, 40]);
  });
  test('stateAt/scoresAt floor fractional cursors and treat NaN as 0', () => {
    const c = compile(two());
    assert.doesNotThrow(() => stateAt(c, 0.5));
    assert.doesNotThrow(() => stateAt(c, NaN));
    assert.doesNotThrow(() => scoresAt(c, 0.5));
    assert.equal(stateAt(c, 0.5), c.initial);
  });
  test('validateScenario rejects a scenario without nodes', () => {
    const sc = { id: 'x', title: 'x', events: [] };
    const errors = validateScenario(sc);
    if (!errors.length) assert.doesNotThrow(() => compile(sc));
  });
});
