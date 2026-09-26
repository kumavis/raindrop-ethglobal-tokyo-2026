// Basics 2: a chain of endorsements. Trust is transitive and pools where it stops.
export default {
  id: 'trust-flows',
  title: 'Trust flows through',
  summary: 'A chain of five: trust pools at the end.',
  description: 'What to watch: each account keeps α of its own balance weight and passes (1−α) of its score on to the one it endorses, so trust moves down the chain '
    + 'and pools at Fern, who endorses no one and keeps her weight. In step-by-step mode a dip travels left to right, one hop per iteration: each halo shrinks as its trust moves on, and only Fern’s grows. '
    + 'Try α = 0.2 to make the pool deeper, or α = 0.9 to keep everyone close to pro-rata.',
  tags: ['basics'],
  layout: 'fixed',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 20, x: -1, y: 0 },
    { id: 'ben', label: 'Ben', balance: 20, x: -0.5, y: 0 },
    { id: 'cleo', label: 'Cleo', balance: 20, x: 0, y: 0 },
    { id: 'dev', label: 'Dev', balance: 20, x: 0.5, y: 0 },
    { id: 'fern', label: 'Fern', balance: 20, x: 1, y: 0 },
  ],
  trust: {},
  events: [
    { type: 'note', caption: 'Five equal holders in a row.' },
    { type: 'rain', caption: 'No endorsements: everyone gets the same.' },
    { type: 'endorse', from: 'ada', to: 'ben', caption: 'Ada endorses Ben.' },
    { type: 'endorse', from: 'ben', to: 'cleo', caption: 'Ben endorses Cleo. Ada’s trust flows on.' },
    { type: 'endorse', from: 'cleo', to: 'dev', caption: 'Cleo endorses Dev.' },
    { type: 'endorse', from: 'dev', to: 'fern', caption: 'Dev endorses Fern. Fern endorses no one.' },
    { type: 'rain', caption: 'Scores settle where trust pools.' },
    { type: 'rain', rounds: 3, caption: 'Every round, the end of the chain gains.', captionEach: 'Fern, at the end of the chain, gains again.' },
  ],
};
