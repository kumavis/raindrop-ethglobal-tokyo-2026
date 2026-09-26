// EigenTrust over the Raindrop endorsement graph.
//
// Notation follows the paper (§4.2):
//   b  pre-trust vector: relative balances, b_i = B_i / Σ_k B_k
//   C  row-stochastic endorsement matrix, C_ij = w_ij / Σ_k w_ik
//      (an account with no endorsements keeps its own weight: C_ii = 1)
//   g  trust scores, the fixed point of  g = α b + (1 − α) Cᵀ g
//
// Everything here is pure and works on plain arrays indexed by node order.

/** Relative balances. Negative balances count as zero; an all-zero network is uniform. */
export function pretrustVector(balances) {
  const n = balances.length;
  if (!n) return [];
  let total = 0;
  for (const x of balances) total += Math.max(0, x);
  if (!(total > 0)) return balances.map(() => 1 / n);
  return balances.map((x) => Math.max(0, x) / total);
}

/**
 * Row-normalized endorsement matrix as sparse rows.
 *
 * @param {string[]} ids node ids, in index order
 * @param {Record<string, Record<string, number>>} trust raw weights w_ij by id
 * @returns {{ self: boolean, out: { j: number, w: number, c: number }[] }[]}
 *   `self` marks an account with no (valid) endorsements, which keeps its own
 *   weight via an implicit self-loop. An explicit self-endorsement is an
 *   ordinary entry and does not set `self`.
 */
export function trustMatrix(ids, trust) {
  const index = new Map(ids.map((id, i) => [id, i]));
  return ids.map((id, i) => {
    const entries = [];
    let total = 0;
    for (const [to, w] of Object.entries(trust?.[id] ?? {})) {
      const j = index.get(to);
      if (j === undefined || !(w > 0) || !Number.isFinite(w)) continue;
      entries.push({ j, w });
      total += w;
    }
    if (!entries.length) return { self: true, out: [{ j: i, w: 0, c: 1 }] };
    entries.sort((a, b) => a.j - b.j);
    return { self: false, out: entries.map(({ j, w }) => ({ j, w, c: w / total })) };
  });
}

/** One power-iteration step: α b + (1 − α) Cᵀ g. */
export function eigentrustStep(g, b, rows, alpha) {
  const n = g.length;
  const next = new Array(n);
  for (let i = 0; i < n; i++) next[i] = alpha * b[i];
  for (let i = 0; i < n; i++) {
    const m = (1 - alpha) * g[i];
    if (!m) continue;
    for (const { j, c } of rows[i].out) next[j] += m * c;
  }
  return next;
}

/**
 * Trust that moves during one step, split the way the formula reads:
 * each node keeps `anchor[i] = α b_i`, and `edges` carry (1 − α) g_i C_ij from i to j
 * (including implicit self-loops of accounts that endorse no one).
 */
export function stepFlows(g, b, rows, alpha) {
  const anchor = b.map((x) => alpha * x);
  const edges = [];
  rows.forEach((row, i) => {
    for (const { j, c } of row.out) edges.push({ i, j, amount: (1 - alpha) * g[i] * c });
  });
  return { anchor, edges };
}

export function l1Distance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

/**
 * Power iteration until successive vectors differ by less than `epsilon` (L1),
 * or `maxIterations` steps have run.
 *
 * @returns {{ g: number[], iterations: number[][], residuals: number[], converged: boolean }}
 *   `iterations[0]` is the starting vector and `iterations[k]` the vector after k steps;
 *   `residuals[k - 1]` is ‖iterations[k] − iterations[k − 1]‖₁. `g` is the last vector.
 */
export function eigentrust({ b, rows, alpha, epsilon = 1e-6, maxIterations = 100, g0 = b }) {
  let g = g0.slice();
  const iterations = [g];
  const residuals = [];
  let converged = !g.length;
  for (let k = 0; k < maxIterations && !converged; k++) {
    const next = eigentrustStep(g, b, rows, alpha);
    const r = l1Distance(next, g);
    iterations.push(next);
    residuals.push(r);
    g = next;
    converged = r < epsilon;
  }
  return { g, iterations, residuals, converged };
}
