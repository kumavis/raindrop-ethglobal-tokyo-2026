// Tests for the pure EigenTrust module (src/model/eigentrust.js) against paper §4.2:
// g = α b + (1 − α) Cᵀ g, b = relative balances, C row-normalized endorsements with an
// implicit self-loop for accounts that endorse no one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  eigentrust, eigentrustStep, l1Distance, pretrustVector, stepFlows, trustMatrix,
} from '../src/model/eigentrust.js';

// Deterministic PRNG (mulberry32) so property tests are reproducible.
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

function randomGraph(rand, n, density = 0.3) {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const balances = ids.map(() => (rand() < 0.15 ? 0 : rand() * 100));
  const trust = {};
  for (const a of ids) {
    if (rand() < 0.2) continue; // some accounts endorse no one
    for (const b of ids) if (rand() < density) (trust[a] ??= {})[b] = rand() * 5 + 0.01;
  }
  return { ids, balances, trust };
}

const sum = (v) => v.reduce((a, x) => a + x, 0);
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a} (tol ${tol})`);
const closeVec = (a, b, tol = 1e-9) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => close(x, b[i], tol, `[${i}]`));
};

function run(ids, balances, trust, alpha, opts = {}) {
  const b = pretrustVector(balances);
  const rows = trustMatrix(ids, trust);
  return { b, rows, ...eigentrust({ b, rows, alpha, epsilon: 1e-13, maxIterations: 5000, ...opts }) };
}

describe('pretrustVector', () => {
  test('relative balances sum to 1', () => {
    closeVec(pretrustVector([60, 40]), [0.6, 0.4]);
    closeVec(pretrustVector([1, 1, 2]), [0.25, 0.25, 0.5]);
  });
  test('empty → empty', () => assert.deepEqual(pretrustVector([]), []));
  test('all-zero network is uniform', () => closeVec(pretrustVector([0, 0, 0, 0]), [0.25, 0.25, 0.25, 0.25]));
  test('negative balances count as zero', () => closeVec(pretrustVector([-5, 3, 1]), [0, 0.75, 0.25]));
  test('zero-balance account gets zero pre-trust', () => closeVec(pretrustVector([0, 10]), [0, 1]));
});

describe('trustMatrix', () => {
  const ids = ['a', 'b', 'c'];
  test('rows are normalized (C_ij = w_ij / Σ_k w_ik)', () => {
    const rows = trustMatrix(ids, { a: { b: 1, c: 3 } });
    assert.equal(rows[0].self, false);
    assert.deepEqual(rows[0].out.map((e) => [e.j, e.c]), [[1, 0.25], [2, 0.75]]);
    assert.deepEqual(rows[0].out.map((e) => e.w), [1, 3]);
  });
  test('an account with no endorsements keeps its own weight (C_ii = 1)', () => {
    const rows = trustMatrix(ids, { a: { b: 1 } });
    assert.equal(rows[1].self, true);
    assert.deepEqual(rows[1].out, [{ j: 1, w: 0, c: 1 }]);
    assert.equal(rows[2].self, true);
  });
  test('explicit self-endorsement is an ordinary entry', () => {
    const rows = trustMatrix(ids, { a: { a: 1, b: 1 } });
    assert.equal(rows[0].self, false);
    assert.deepEqual(rows[0].out.map((e) => [e.j, e.c]), [[0, 0.5], [1, 0.5]]);
    const only = trustMatrix(ids, { a: { a: 2 } });
    assert.equal(only[0].self, false);
    assert.deepEqual(only[0].out.map((e) => [e.j, e.c]), [[0, 1]]);
  });
  test('row normalization discards intensity: a lone 0.0001 endorsement carries 100%', () => {
    const rows = trustMatrix(ids, { a: { b: 0.0001 } });
    assert.equal(rows[0].out.length, 1);
    assert.equal(rows[0].out[0].c, 1);
  });
  test('unknown targets, zero, negative, NaN and infinite weights are ignored', () => {
    const rows = trustMatrix(ids, { a: { zz: 5, b: 0, c: -1 }, b: { a: NaN, c: Infinity }, c: { a: 2, b: '3' } });
    assert.equal(rows[0].self, true, 'a has no valid endorsement');
    assert.equal(rows[1].self, true, 'b has no valid endorsement');
    // Numeric strings pass `> 0` and Number.isFinite rejects them: '3' is ignored.
    assert.deepEqual(rows[2].out.map((e) => [e.j, e.c]), [[0, 1]]);
  });
  test('rows from unknown accounts are ignored; null/undefined trust is fine', () => {
    assert.ok(trustMatrix(ids, { zz: { a: 1 } }).every((r) => r.self));
    assert.ok(trustMatrix(ids, undefined).every((r) => r.self));
    assert.ok(trustMatrix(ids, null).every((r) => r.self));
  });
  test('out entries are sorted by target index, independent of key order', () => {
    const rows = trustMatrix(ids, { a: { c: 1, b: 1 } });
    assert.deepEqual(rows[0].out.map((e) => e.j), [1, 2]);
  });
  test('every row is stochastic', () => {
    const rand = rng(7);
    for (let t = 0; t < 30; t++) {
      const { ids: gi, trust } = randomGraph(rand, 3 + Math.floor(rand() * 20));
      for (const row of trustMatrix(gi, trust)) close(sum(row.out.map((e) => e.c)), 1, 1e-12);
    }
  });
});

describe('eigentrustStep / stepFlows', () => {
  test('step preserves total mass when Σb = Σg = 1', () => {
    const rand = rng(11);
    for (let t = 0; t < 30; t++) {
      const { ids, balances, trust } = randomGraph(rand, 2 + Math.floor(rand() * 15));
      const b = pretrustVector(balances);
      const rows = trustMatrix(ids, trust);
      const alpha = rand();
      close(sum(eigentrustStep(b, b, rows, alpha)), 1, 1e-12);
    }
  });
  test('stepFlows splits the step exactly: anchor + edge amounts reproduce eigentrustStep', () => {
    const rand = rng(12);
    for (let t = 0; t < 20; t++) {
      const { ids, balances, trust } = randomGraph(rand, 2 + Math.floor(rand() * 12));
      const b = pretrustVector(balances);
      const rows = trustMatrix(ids, trust);
      const alpha = rand();
      const g = eigentrustStep(b, b, rows, alpha);
      const { anchor, edges } = stepFlows(g, b, rows, alpha);
      const rebuilt = anchor.slice();
      for (const { j, amount } of edges) rebuilt[j] += amount;
      closeVec(rebuilt, eigentrustStep(g, b, rows, alpha), 1e-12);
      closeVec(anchor, b.map((x) => alpha * x), 0);
    }
  });
  test('stepFlows includes implicit self-loops', () => {
    const rows = trustMatrix(['a', 'b'], { a: { b: 1 } });
    const { edges } = stepFlows([0.5, 0.5], [0.5, 0.5], rows, 0.5);
    assert.deepEqual(edges, [{ i: 0, j: 1, amount: 0.25 }, { i: 1, j: 1, amount: 0.25 }]);
  });
  test('l1Distance', () => {
    assert.equal(l1Distance([1, 2, 3], [1, 0, 4]), 3);
    assert.equal(l1Distance([], []), 0);
  });
});

describe('eigentrust: closed forms', () => {
  test('two nodes, Ada → Ben: g_A = α·b_A, g_B = 1 − α·b_A', () => {
    for (const alpha of [0, 0.05, 0.25, 0.5, 0.85, 1]) {
      for (const [A, B] of [[60, 40], [1, 99], [50, 50], [100, 0]]) {
        const { b, g, converged } = run(['ada', 'ben'], [A, B], { ada: { ben: 1 } }, alpha);
        assert.ok(converged, `converged at α=${alpha}`);
        close(g[0], alpha * b[0], 1e-10, `g_A α=${alpha}`);
        close(g[1], 1 - alpha * b[0], 1e-10, `g_B α=${alpha}`);
      }
    }
  });
  test('chain a → b → c (c is a sink): trust decays by (1 − α) per hop', () => {
    const alpha = 0.3;
    const { b, g } = run(['a', 'b', 'c'], [50, 30, 20], { a: { b: 1 }, b: { c: 1 } }, alpha);
    const gA = alpha * b[0];
    const gB = alpha * b[1] + (1 - alpha) * gA;
    close(g[0], gA, 1e-10);
    close(g[1], gB, 1e-10);
    close(g[2], 1 - gA - gB, 1e-10);
  });
  test('long chain: what the head passes on reaches hop k scaled by (1 − α)^k', () => {
    // Only the head holds balance; everyone else has b = 0.
    const n = 8;
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const trust = Object.fromEntries(ids.slice(0, -1).map((id, i) => [id, { [ids[i + 1]]: 1 }]));
    const balances = ids.map((_, i) => (i === 0 ? 1 : 0));
    const alpha = 0.4;
    const { g } = run(ids, balances, trust, alpha);
    for (let k = 0; k < n - 1; k++) close(g[k], alpha * (1 - alpha) ** k, 1e-10, `hop ${k}`);
    close(g[n - 1], (1 - alpha) ** (n - 1), 1e-10, 'sink');
  });
  test('mutual endorsement of two accounts behaves like two self-trusting accounts (g = b)', () => {
    const { b, g } = run(['a', 'b'], [70, 30], { a: { b: 1 }, b: { a: 1 } }, 0.5);
    // Fixed point: g_a = .5·.7 + .5·g_b, g_b = .5·.3 + .5·g_a → g_a = (.35 + .075)/.75
    close(g[0], (0.35 + 0.075) / 0.75, 1e-10);
    close(g[1], 1 - g[0], 1e-10);
    assert.notDeepEqual(g, b);
  });
  test('no endorsements at all ⇒ g = b (pro-rata) for any α', () => {
    for (const alpha of [0, 0.3, 1]) {
      const { b, g } = run(['a', 'b', 'c'], [5, 3, 2], {}, alpha);
      closeVec(g, b, 1e-12);
    }
  });
  test('α = 1 ⇒ g = b regardless of endorsements', () => {
    const rand = rng(3);
    for (let t = 0; t < 20; t++) {
      const { ids, balances, trust } = randomGraph(rand, 2 + Math.floor(rand() * 15));
      const { b, g } = run(ids, balances, trust, 1);
      closeVec(g, b, 1e-12);
    }
  });
  test('dangling account keeps its own weight: sink collects everything it is sent', () => {
    // a endorses b; b endorses no one. With α = 0, all trust ends at b.
    const { g } = run(['a', 'b'], [50, 50], { a: { b: 1 } }, 0);
    closeVec(g, [0, 1], 1e-12);
  });
  test('explicit self-endorsement keeps weight like no endorsement', () => {
    const alpha = 0.4;
    const implicit = run(['a', 'b'], [60, 40], {}, alpha).g;
    const explicit = run(['a', 'b'], [60, 40], { a: { a: 1 }, b: { b: 3 } }, alpha).g;
    closeVec(explicit, implicit, 1e-12);
    // half to self, half to b: g_a = α b_a + (1−α)·½·g_a
    const half = run(['a', 'b'], [60, 40], { a: { a: 1, b: 1 } }, alpha).g;
    close(half[0], (alpha * 0.6) / (1 - (1 - alpha) / 2), 1e-10);
  });
  test('row normalization: 0.0001 alone routes the whole outflow', () => {
    const tiny = run(['a', 'b'], [60, 40], { a: { b: 0.0001 } }, 0.5).g;
    const big = run(['a', 'b'], [60, 40], { a: { b: 1e6 } }, 0.5).g;
    closeVec(tiny, big, 1e-12);
  });
  test('sybil split: the α·b pre-trust mass of a holder is invariant under splitting', () => {
    const alpha = 0.5;
    // Whole: s holds 40 and endorses no one; h (honest) holds 60 and endorses s.
    const whole = run(['h', 's'], [60, 40], { h: { s: 1 } }, alpha);
    // Split s into 4 sybils of 10 each, all endorsing no one; h endorses all equally.
    const ids = ['h', 's1', 's2', 's3', 's4'];
    const split = run(ids, [60, 10, 10, 10, 10], { h: { s1: 1, s2: 1, s3: 1, s4: 1 } }, alpha);
    close(sum(split.b.slice(1)), whole.b[1], 1e-12, 'pre-trust mass');
    close(sum(split.g.slice(1)), whole.g[1], 1e-10, 'total trust');
    close(split.g[0], whole.g[0], 1e-10, 'honest trust');
    // Without endorsements from others, splitting gains nothing.
    const alone = run(['h', 's'], [60, 40], {}, alpha).g;
    const aloneSplit = run(ids, [60, 10, 10, 10, 10], {}, alpha).g;
    close(sum(aloneSplit.slice(1)), alone[1], 1e-12);
    // Sybils endorsing each other in a ring also keep exactly their mass.
    const ring = run(ids, [60, 10, 10, 10, 10], { s1: { s2: 1 }, s2: { s3: 1 }, s3: { s4: 1 }, s4: { s1: 1 } }, alpha).g;
    close(sum(ring.slice(1)), alone[1], 1e-10);
  });
});

describe('eigentrust: invariants on random graphs', () => {
  test('Σg = 1 and g ≥ 0 for α ∈ [0, 1], every iterate', () => {
    const rand = rng(42);
    for (let t = 0; t < 60; t++) {
      const { ids, balances, trust } = randomGraph(rand, 1 + Math.floor(rand() * 30), rand() * 0.6);
      const alpha = t % 10 === 0 ? 0 : t % 10 === 1 ? 1 : rand();
      const { iterations } = run(ids, balances, trust, alpha, { maxIterations: 200, epsilon: 1e-9 });
      for (const it of iterations) {
        close(sum(it), 1, 1e-9);
        assert.ok(it.every((x) => x >= 0 && Number.isFinite(x)));
      }
    }
  });
  test('fixed-point residual at convergence: ‖g − (αb + (1−α)Cᵀg)‖₁ < (1 − α)·ε', () => {
    const rand = rng(99);
    for (let t = 0; t < 40; t++) {
      const { ids, balances, trust } = randomGraph(rand, 2 + Math.floor(rand() * 25));
      const alpha = 0.05 + rand() * 0.95;
      const epsilon = 10 ** -(3 + Math.floor(rand() * 8));
      const b = pretrustVector(balances);
      const rows = trustMatrix(ids, trust);
      const res = eigentrust({ b, rows, alpha, epsilon, maxIterations: 10000 });
      assert.ok(res.converged);
      const fp = l1Distance(res.g, eigentrustStep(res.g, b, rows, alpha));
      assert.ok(fp <= (1 - alpha) * epsilon + 1e-15, `fp residual ${fp} vs ε ${epsilon}`);
      assert.ok(res.residuals.at(-1) < epsilon);
      assert.ok(res.residuals.slice(0, -1).every((r) => r >= epsilon), 'stops at the first residual under ε');
    }
  });
  test('residuals contract by at least (1 − α) per step', () => {
    const rand = rng(5);
    for (let t = 0; t < 20; t++) {
      const { ids, balances, trust } = randomGraph(rand, 5 + Math.floor(rand() * 15));
      const alpha = 0.1 + rand() * 0.8;
      const { residuals } = run(ids, balances, trust, alpha, { epsilon: 1e-12 });
      for (let k = 1; k < residuals.length; k++) assert.ok(residuals[k] <= (1 - alpha) * residuals[k - 1] + 1e-15);
    }
  });
  test("g0 'uniform' vs b converge to the same fixed point for α > 0", () => {
    const rand = rng(8);
    for (let t = 0; t < 30; t++) {
      const { ids, balances, trust } = randomGraph(rand, 2 + Math.floor(rand() * 20));
      const alpha = 0.05 + rand() * 0.95;
      const b = pretrustVector(balances);
      const rows = trustMatrix(ids, trust);
      const opts = { b, rows, alpha, epsilon: 1e-13, maxIterations: 20000 };
      const fromB = eigentrust(opts);
      const fromU = eigentrust({ ...opts, g0: ids.map(() => 1 / ids.length) });
      closeVec(fromU.g, fromB.g, 1e-10);
    }
  });
  test('iterations/residuals bookkeeping', () => {
    const b = [0.6, 0.4];
    const rows = trustMatrix(['a', 'b'], { a: { b: 1 } });
    const res = eigentrust({ b, rows, alpha: 0.5 });
    assert.equal(res.iterations.length, res.residuals.length + 1);
    assert.deepEqual(res.iterations[0], b);
    assert.notEqual(res.iterations[0], b, 'starting vector is a copy');
    assert.equal(res.g, res.iterations.at(-1));
    res.residuals.forEach((r, k) => close(r, l1Distance(res.iterations[k + 1], res.iterations[k]), 0));
  });
  test('does not mutate its inputs', () => {
    const b = [0.6, 0.4];
    const g0 = [0.5, 0.5];
    const rows = trustMatrix(['a', 'b'], { a: { b: 1 } });
    const snap = JSON.stringify(rows);
    eigentrust({ b, rows, alpha: 0.3, g0 });
    assert.deepEqual(b, [0.6, 0.4]);
    assert.deepEqual(g0, [0.5, 0.5]);
    assert.equal(JSON.stringify(rows), snap);
  });
});

describe('eigentrust: edge cases', () => {
  const b = [0.6, 0.4];
  const rows = trustMatrix(['a', 'b'], { a: { b: 1 } });
  test('empty graph converges immediately', () => {
    const res = eigentrust({ b: [], rows: [], alpha: 0.5 });
    assert.deepEqual(res, { g: [], iterations: [[]], residuals: [], converged: true });
  });
  test('maxIterations 0 returns the starting vector, not converged', () => {
    const res = eigentrust({ b, rows, alpha: 0.5, maxIterations: 0 });
    assert.deepEqual(res.g, b);
    assert.equal(res.converged, false);
    assert.equal(res.residuals.length, 0);
  });
  test('maxIterations 1 runs exactly one step', () => {
    const res = eigentrust({ b, rows, alpha: 0.5, maxIterations: 1 });
    assert.equal(res.residuals.length, 1);
    closeVec(res.g, eigentrustStep(b, b, rows, 0.5));
    close(sum(res.g), 1, 1e-12);
  });
  test('epsilon 0 runs to maxIterations and stays finite', () => {
    const res = eigentrust({ b, rows, alpha: 0.5, epsilon: 0, maxIterations: 300 });
    assert.equal(res.residuals.length, 300);
    assert.equal(res.converged, false);
    closeVec(res.g, [0.3, 0.7], 1e-12);
  });
  test('α = 0 on a 2-cycle oscillates forever: not converged, but Σg = 1', () => {
    const cyc = trustMatrix(['a', 'b'], { a: { b: 1 }, b: { a: 1 } });
    const res = eigentrust({ b, rows: cyc, alpha: 0, maxIterations: 51 });
    assert.equal(res.converged, false);
    closeVec(res.g, [0.4, 0.6], 1e-12);
    close(sum(res.g), 1, 1e-12);
  });
  test('huge graph (2000 nodes, sparse) stays normalized and converges', () => {
    const rand = rng(2000);
    const n = 2000;
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const trust = {};
    for (let i = 0; i < n; i++) {
      if (rand() < 0.1) continue;
      for (let k = 0; k < 3; k++) (trust[ids[i]] ??= {})[ids[Math.floor(rand() * n)]] = 1 + rand();
    }
    const bal = ids.map(() => rand() * 1000);
    const res = run(ids, bal, trust, 0.15, { epsilon: 1e-9, maxIterations: 500 });
    assert.ok(res.converged);
    close(sum(res.g), 1, 1e-9);
  });
});
