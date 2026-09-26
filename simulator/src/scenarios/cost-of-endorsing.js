// Attacks & limits 11: endorsing has an opportunity cost (paper §8, adversarial review §1).
// An endorser passes on (1 − α) of their own share; a non-endorser keeps all of it.
export default {
  id: 'cost-of-endorsing',
  title: 'The cost of endorsing',
  summary: 'Twin holders: one endorses, one doesn’t.',
  description: 'What to watch: Ada and Ben start identical. Ada endorses Cy and passes on (1−α) of her weight, so her halo shrinks to α of her disk; '
    + 'Ben endorses no one and keeps all of his, so his share never moves. Round after round Ada’s share of supply falls behind Ben’s. '
    + 'Tap Ada and Ben to compare their share sparklines, and drag α toward 1 to shrink the cost (and Cy’s funding with it).',
  tags: ['attacks'],
  layout: 'fixed',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 40, x: -0.6, y: -0.35, note: 'endorses' },
    { id: 'ben', label: 'Ben', balance: 40, x: -0.6, y: 0.35, note: 'endorses no one' },
    { id: 'cy', label: 'Cy', balance: 20, tone: 'violet', x: 0.6, y: -0.35, note: 'a contributor' },
  ],
  trust: {},
  events: [
    { type: 'note', caption: 'Ada and Ben hold the same stake.' },
    { type: 'rain', caption: 'Same stake, same rain.' },
    { type: 'endorse', from: 'ada', to: 'cy', caption: 'Ada endorses Cy. Ben endorses no one.' },
    { type: 'rain', rounds: 8, caption: 'Ada’s share slips. Ben’s holds.', captionEach: 'Ada’s share slips again. Ben’s stays at 40%.' },
  ],
};
