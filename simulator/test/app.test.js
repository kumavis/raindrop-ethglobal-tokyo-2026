// Tests for the observable app store (src/app.js) and a sanity pass over the shipped
// scenario library (every scenario validates and compiles with the protocol invariants).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, DEFAULT_VIEW, MAX_EXTRA_ROUNDS } from '../src/app.js';
import { DEFAULT_PARAMS, compile, issuance, stateAt, validateScenario } from '../src/model/raindrop.js';
import { SCENARIOS } from '../src/scenarios/index.js';

const one = {
  id: 'one', title: 'One',
  params: { alpha: 0.3, issuancePercent: 5 },
  nodes: [{ id: 'a', balance: 60 }, { id: 'b', balance: 40 }],
  trust: { a: { b: 1 } },
  events: [{ type: 'rain', rounds: 2 }, { type: 'endorse', from: 'b', to: 'a' }, { type: 'rain' }],
};
const two = {
  id: 'two', title: 'Two',
  nodes: [{ id: 'x', balance: 1 }],
  events: [{ type: 'note', caption: 'hi' }],
};

// Records every event the app emits, in order.
function record(app) {
  const log = [];
  for (const type of ['scenario', 'params', 'compiled', 'view', 'select']) app.on(type, (d) => log.push([type, d]));
  return log;
}

describe('createApp', () => {
  test('initial state', () => {
    const app = createApp({ scenarios: [one, two] });
    assert.equal(app.scenario, null);
    assert.equal(app.compiled, null);
    assert.equal(app.selectedId, null);
    assert.deepEqual(app.params, { ...DEFAULT_PARAMS });
    assert.deepEqual(app.view, { ...DEFAULT_VIEW });
    assert.notEqual(app.view, DEFAULT_VIEW, 'view is a copy');
    assert.deepEqual(app.scenarios, [one, two]);
    assert.ok(Object.isFrozen(DEFAULT_VIEW));
  });
  test('defaults to the shipped library', () => {
    assert.equal(createApp().scenarios, SCENARIOS);
  });
});

describe('loadScenario', () => {
  test('by id: merges scenario params, compiles, clears selection, emits in order', () => {
    const app = createApp({ scenarios: [one, two] });
    app.loadScenario('two');
    app.select('x');
    const log = record(app);
    app.loadScenario('one');
    assert.equal(app.scenario, one);
    assert.deepEqual(app.params, { ...DEFAULT_PARAMS, alpha: 0.3, issuancePercent: 5 });
    assert.equal(app.compiled.scenario, one);
    assert.equal(app.compiled.steps.length, 4);
    assert.equal(app.selectedId, null);
    assert.deepEqual(log, [['scenario', one], ['select', null], ['compiled', { reason: 'scenario' }]]);
  });
  test('unknown id falls back to the first scenario', () => {
    const app = createApp({ scenarios: [one, two] });
    app.loadScenario('nope');
    assert.equal(app.scenario, one);
  });
  test('accepts a scenario object', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario(two);
    assert.equal(app.scenario, two);
    assert.equal(app.compiled.steps.length, 1);
  });
  test('resets params changed on the previous scenario and drops extra rounds', () => {
    const app = createApp({ scenarios: [one, two] });
    app.loadScenario('one');
    app.setParams({ alpha: 0.9, epsilon: 1e-3 });
    app.extendRain(3);
    app.loadScenario('one');
    assert.equal(app.params.alpha, 0.3);
    assert.equal(app.params.epsilon, DEFAULT_PARAMS.epsilon);
    assert.equal(app.compiled.steps.length, app.compiled.scriptLength);
  });
  test('does not mutate the scenario', () => {
    const snap = JSON.stringify(one);
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    app.setParams({ alpha: 0.1 });
    app.extendRain(5);
    assert.equal(JSON.stringify(one), snap);
  });
});

describe('setParams / resetParams', () => {
  test('recompiles with the patch and emits params then compiled', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    const prev = app.compiled;
    const log = record(app);
    app.setParams({ alpha: 1 });
    assert.notEqual(app.compiled, prev);
    assert.equal(app.params.alpha, 1);
    assert.equal(app.compiled.params.alpha, 1);
    assert.equal(app.params.issuancePercent, 5, 'other params kept');
    assert.deepEqual(log, [['params', { alpha: 1 }], ['compiled', { reason: 'params' }]]);
    // α = 1 ⇒ pro-rata: a keeps its 60% share.
    const end = stateAt(app.compiled, app.compiled.steps.length);
    assert.ok(Math.abs(end.nodes[0].balance / end.supply - 0.6) < 1e-12);
  });
  test('keeps extra rounds across recompiles', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    app.extendRain(4);
    app.setParams({ issuanceMode: 'fixed', issuanceFixed: 3 });
    assert.equal(app.compiled.steps.length, app.compiled.scriptLength + 4);
    assert.ok(app.compiled.steps.slice(-4).every((s) => s.extra && s.type === 'rain'));
    assert.ok(app.compiled.steps.filter((s) => s.type === 'rain').every((s) => s.detail.minted === 3));
  });
  test('resetParams restores the scenario defaults and keeps extra rounds', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    app.setParams({ alpha: 0.9, g0: 'uniform', maxIterations: 3 });
    app.extendRain(2);
    const log = record(app);
    app.resetParams();
    assert.deepEqual(app.params, { ...DEFAULT_PARAMS, ...one.params });
    assert.equal(app.compiled.steps.length, app.compiled.scriptLength + 2);
    assert.deepEqual(log.map(([t]) => t), ['params', 'compiled']);
  });
});

describe('extendRain', () => {
  test('appends rounds and emits compiled/extend without replacing compiled', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    const compiled = app.compiled;
    const log = record(app);
    assert.equal(app.extendRain(2), true);
    assert.equal(app.compiled, compiled, 'same object, extended in place');
    assert.equal(compiled.steps.length, compiled.scriptLength + 2);
    assert.deepEqual(log, [['compiled', { reason: 'extend' }]]);
    assert.equal(app.extendRain(), true);
    assert.equal(compiled.steps.length, compiled.scriptLength + 3);
  });
  test(`caps at MAX_EXTRA_ROUNDS (${MAX_EXTRA_ROUNDS}) and then returns false without emitting`, () => {
    const app = createApp({ scenarios: [two] });
    app.loadScenario('two');
    assert.equal(app.extendRain(MAX_EXTRA_ROUNDS - 1), true);
    assert.equal(app.extendRain(10), true, 'partial room is filled');
    assert.equal(app.compiled.steps.length - app.compiled.scriptLength, MAX_EXTRA_ROUNDS);
    const log = record(app);
    assert.equal(app.extendRain(1), false);
    assert.deepEqual(log, []);
    assert.equal(app.compiled.steps.length - app.compiled.scriptLength, MAX_EXTRA_ROUNDS);
  });
});

describe('setView / select / on', () => {
  test('setView merges and emits the patch', () => {
    const app = createApp({ scenarios: [one] });
    const log = record(app);
    app.setView({ eigenMode: 'instant', speed: 2 });
    assert.equal(app.view.eigenMode, 'instant');
    assert.equal(app.view.speed, 2);
    assert.equal(app.view.showHalos, true);
    assert.deepEqual(log, [['view', { eigenMode: 'instant', speed: 2 }]]);
  });
  test('select emits only on change; null/undefined deselect', () => {
    const app = createApp({ scenarios: [one] });
    app.loadScenario('one');
    const log = record(app);
    app.select('a');
    app.select('a');
    app.select('b');
    app.select(null);
    app.select(null);
    assert.equal(app.selectedId, null);
    assert.deepEqual(log, [['select', 'a'], ['select', 'b'], ['select', null]]);
    app.select('a');
    app.select(undefined);
    assert.equal(app.selectedId, null);
  });
  test('on returns an unsubscribe function', () => {
    const app = createApp({ scenarios: [one] });
    let n = 0;
    const off = app.on('view', () => n++);
    app.setView({ speed: 2 });
    off();
    app.setView({ speed: 4 });
    assert.equal(n, 1);
  });
  test('unsubscribing during an emit does not skip other listeners', () => {
    const app = createApp({ scenarios: [one] });
    const seen = [];
    const off = app.on('view', () => { seen.push(1); off(); });
    app.on('view', () => seen.push(2));
    app.setView({ speed: 2 });
    app.setView({ speed: 3 });
    assert.deepEqual(seen, [1, 2, 2]);
  });
  test('select(undefined) with nothing selected emits no select event', () => {
    const app = createApp({ scenarios: [one] });
    const log = record(app);
    app.select(undefined);
    assert.deepEqual(log, []);
  });
});

describe('shipped scenario library', () => {
  test('ids are unique and url-safe; every scenario has a picker group', () => {
    const ids = SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of SCENARIOS) {
      assert.match(s.id, /^[a-z0-9-]+$/);
      assert.ok(['basics', 'dynamics', 'attacks', 'sandbox'].includes(s.tags?.[0]), `${s.id} tag ${s.tags?.[0]}`);
      assert.ok(s.summary, `${s.id} summary`);
    }
  });
  for (const s of SCENARIOS) {
    test(`${s.id}: validates and compiles with protocol invariants`, () => {
      assert.deepEqual(validateScenario(s), []);
      const c = compile(s, {}, { extraRounds: 2 });
      for (const step of c.steps) {
        const { before, after } = step;
        assert.ok(after.nodes.every((n) => Number.isFinite(n.balance) && n.balance >= 0));
        const total = after.nodes.reduce((a, n) => a + n.balance, 0);
        assert.ok(Math.abs(total - after.supply) <= 1e-9 * Math.max(1, after.supply));
        if (step.type === 'rain') {
          assert.equal(step.detail.minted, issuance(before.supply, c.params));
          assert.ok(Math.abs(step.detail.g.reduce((a, x) => a + x, 0) - 1) < 1e-9);
        }
      }
      const app = createApp();
      app.loadScenario(s.id);
      assert.equal(app.scenario, s);
    });
  }
});
