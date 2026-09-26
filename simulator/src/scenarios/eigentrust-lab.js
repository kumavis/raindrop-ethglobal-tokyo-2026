// Dynamics 9: slow EigenTrust on purpose. A low α makes the power iteration take many
// steps, so the step-by-step mode shows the inner loop converging.
export default {
  id: 'eigentrust-lab',
  title: 'EigenTrust up close',
  summary: 'A cycle and a branch, slowed down so you can watch it converge.',
  description: 'What to watch: each rain runs EigenTrust by power iteration: start from balances (g₀ = b), then repeat g ← αb + (1−α)Cᵀg. '
    + 'Trust sloshes around the Ada–Ben–Cleo cycle and leaks down the branch to Dev; the residual ‖Δ‖₁ shrinks by a factor of at most (1−α) each step and '
    + 'the run stops once it drops below ε. Here α = 0.15, so it takes dozens of iterations. Try ε = 1e-2 or max iterations = 3 and see the halos stop early, '
    + 'or switch the starting vector to uniform.',
  tags: ['dynamics'],
  params: { alpha: 0.15 },
  layout: 'fixed',
  nodes: [
    { id: 'fern', label: 'Fern', balance: 20, x: -1, y: 0.1 },
    { id: 'ada', label: 'Ada', balance: 40, x: -0.35, y: 0.1 },
    { id: 'ben', label: 'Ben', balance: 10, x: 0.05, y: -0.5 },
    { id: 'cleo', label: 'Cleo', balance: 10, x: 0.3, y: 0.3 },
    { id: 'dev', label: 'Dev', balance: 20, x: 0.95, y: 0.3 },
  ],
  trust: {
    fern: { ada: 1 },
    ada: { ben: 1 },
    ben: { cleo: 1 },
    cleo: { ada: 1, dev: 1 },
  },
  events: [
    { type: 'note', caption: 'A cycle, a feeder and a branch. α = 0.15.' },
    { type: 'rain', caption: 'Watch the power iteration settle.' },
    { type: 'rain', caption: 'Same graph, new balances: it runs again.' },
    { type: 'endorse', from: 'dev', to: 'fern', caption: 'Dev endorses Fern. A second loop closes.' },
    { type: 'rain', rounds: 2, caption: 'A new graph, a new fixed point.', captionEach: 'Same graph again: the same fixed point, reached again.' },
  ],
};
